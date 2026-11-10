"""Small numpy/scipy synthesis toolkit shared by the soundtrack scripts."""
import math
import wave

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000


class Mix:
    """Stereo buses of a fixed duration."""

    def __init__(self, dur, seed=7):
        self.dur = dur
        self.n = int(SR * dur)
        self.rng = np.random.default_rng(seed)
        self.buses = {}

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = np.zeros((2, self.n))
        return self.buses[name]

    def place(self, name, sig, t, pan=0.0, gain=1.0):
        bus = self.bus(name)
        sig = np.asarray(sig, dtype=np.float64)
        if sig.ndim == 1:
            a = (pan + 1) * math.pi / 4
            sig = np.stack([sig * math.cos(a), sig * math.sin(a)]) * math.sqrt(2)
        i0 = int(round(t * SR))
        s0 = max(0, -i0)
        i0 = max(0, i0)
        n = min(sig.shape[1] - s0, self.n - i0)
        if n > 0:
            bus[:, i0:i0 + n] += sig[:, s0:s0 + n] * gain

    def curve(self, points):
        t = np.arange(self.n) / SR
        xs, ys = zip(*points)
        return np.interp(t, xs, ys)


_rng = np.random.default_rng(11)


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return _rng.standard_normal(int(d * SR))


def _sos(x, kind, f, order=2):
    if kind == 'band':
        f = [max(20, f[0]), min(SR / 2 - 100, f[1])]
    else:
        f = min(max(f, 20), SR / 2 - 100)
    return sosfilt(butter(order, f, btype=kind, fs=SR, output='sos'), x)


def lp(x, f, o=2): return _sos(x, 'low', f, o)
def hp(x, f, o=2): return _sos(x, 'high', f, o)
def bp(x, lo, hi, o=2): return _sos(x, 'band', [lo, hi], o)


def svf(x, fc, q=0.8, mode='lp'):
    """Time-varying state variable filter (fc may be an array)."""
    fc = np.broadcast_to(np.asarray(fc, dtype=np.float64), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    xl, a1l, a2l, a3l = x.tolist(), a1.tolist(), a2.tolist(), a3.tolist()
    out = [0.0] * len(xl)
    ic1 = ic2 = 0.0
    for n in range(len(xl)):
        v3 = xl[n] - ic2
        v1 = a1l[n] * ic1 + a2l[n] * v3
        v2 = ic2 + a2l[n] * ic1 + a3l[n] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[n] = v1 if mode == 'bp' else v2 if mode == 'lp' else xl[n] - k * v1 - v2
    return np.array(out)


def saw(freq, d, detune=0.0, phase=0.0):
    t = tt(d)
    f = np.broadcast_to(freq, t.shape) * (1 + detune)
    return 2 * ((np.cumsum(f) / SR + phase) % 1.0) - 1


def sine(freq, d):
    t = tt(d)
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), t.shape)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def expdec(d, tau, attack=0.002):
    t = tt(d)
    return (1 - np.exp(-t / max(attack, 1e-4))) * np.exp(-t / tau)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ percussion
def taiko(gain=1.0, f0=58, decay=0.55, d=1.4):
    t = tt(d)
    f = f0 * (1 + 1.6 * np.exp(-t * 28))
    body = sine(f, d) * np.exp(-t / decay) + 0.35 * sine(f * 1.52, d) * np.exp(-t / (decay * 0.4))
    click = lp(noise(d), 900) * np.exp(-t * 60) * 0.8
    skin = bp(noise(d), 150, 600) * np.exp(-t * 14) * 0.5
    return np.tanh((body + click + skin) * 1.6) * gain


def tom(gain=1.0, f0=110, d=0.5):
    t = tt(d)
    f = f0 * (1 + 0.8 * np.exp(-t * 35))
    return (sine(f, d) * np.exp(-t * 9) + bp(noise(d), 200, 1500) * np.exp(-t * 30) * 0.4) * gain


def rim(gain=1.0, d=0.2):
    """dry wooden stick click"""
    t = tt(d)
    return (bp(noise(d), 1800, 6000) * np.exp(-t * 70) + sine(820, d) * np.exp(-t * 60) * 0.6) * gain


# ------------------------------------------------------------------ tonal
def pluck(m, d=1.2, gain=1.0, bright=0.6, damp=0.996, buzz=0.0):
    """Karplus-Strong string, processed one period at a time."""
    f = midi(m)
    n = max(int(round(SR / f)), 2)
    periods = int(d * SR / n) + 1
    buf = _rng.uniform(-1, 1, n)
    buf = lp(np.tile(buf, 3), 1500 + 9000 * bright)[n:2 * n]
    out = np.empty(periods * n)
    for k in range(periods):
        out[k * n:(k + 1) * n] = buf
        buf = damp * 0.5 * (buf + np.roll(buf, 1))
    out = out[: int(d * SR)]
    if buzz:
        out = np.tanh(out * (1 + 6 * buzz)) / (1 + 2 * buzz)
    return out * expdec(len(out) / SR, d * 0.5, 0.001) * gain


def flute(m, d, gain=1.0, vib=5.0, scoop=0.0):
    t = tt(d)
    f = midi(m) * (1 + 0.006 * np.sin(2 * np.pi * vib * t) * np.clip(t / 0.4, 0, 1)) * (1 - scoop * np.exp(-t * 9))
    tone = sine(f, d) + 0.32 * sine(f * 2, d) + 0.1 * sine(f * 3, d)
    breath = bp(noise(d), midi(m) * 0.9, midi(m) * 3.2) * 0.5 + hp(noise(d), 5000) * 0.05
    env = np.clip(t / 0.09, 0, 1) * np.clip((d - t) / 0.25, 0, 1)
    return (tone * 0.5 + breath * (0.35 + 0.65 * np.exp(-t * 6))) * env * gain


def bell(m, d=2.0, gain=1.0):
    t = tt(d)
    f = midi(m)
    s = np.zeros_like(t)
    for ratio, a, dec in ((1, 1.0, 0.9), (2.76, 0.5, 0.5), (5.4, 0.3, 0.3), (8.93, 0.18, 0.18)):
        s += a * np.sin(2 * np.pi * f * ratio * t) * np.exp(-t / (dec * d * 0.6))
    return s * gain * 0.4


def pad(notes, d, gain=1.0, cutoff=900, attack=0.8, release=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        for det in (-0.004, 0.003, 0.009):
            s += saw(midi(m), d, det, _rng.random())
    s = lp(s / (len(notes) * 3), cutoff, 2)
    return s * np.clip(t / attack, 0, 1) * np.clip((d - t) / release, 0, 1) * gain


def choir(notes, d, gain=1.0, attack=0.5, release=0.6):
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        f = midi(m) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t + _rng.random() * 6))
        for h, a in ((1, 1.0), (2, 0.5), (3, 0.3), (4, 0.18), (5, 0.1)):
            s += a * sine(f * h, d)
    s = bp(s, 300, 1400) + lp(s, 500) * 0.4
    return s * np.clip(t / attack, 0, 1) * np.clip((d - t) / release, 0, 1) * gain / len(notes) * 0.4


def braam(notes, d=2.5, gain=1.0, open_t=0.12, bright=2600):
    t = tt(d)
    sig = np.zeros_like(t)
    for m in notes:
        for det in (-0.006, 0.0, 0.007):
            sig += saw(midi(m), d, det, _rng.random())
    sig /= len(notes) * 3
    cutoff = 180 + (bright - 180) * np.clip(t / open_t, 0, 1) * np.exp(-np.maximum(t - open_t, 0) * 1.1)
    sig = svf(sig, cutoff, 1.1, 'lp')
    env = np.clip(t / 0.02, 0, 1) * np.exp(-t / (d * 0.45))
    sub = sine(midi(min(notes) - 12), d) * np.exp(-t / (d * 0.5)) * 0.6
    return np.tanh((sig * 2.2 + sub) * env * 1.3) * gain


def shimmer(d, gain=1.0, notes=(86, 89, 93, 98, 101)):
    """glassy sparkle: slow-tremolo sine cluster with random twinkles"""
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        s += np.sin(2 * np.pi * midi(m) * t + _rng.random() * 6) * (0.5 + 0.5 * np.sin(2 * np.pi * _rng.uniform(1.5, 4) * t + _rng.random() * 6))
    for _ in range(int(d * 9)):
        t0 = _rng.uniform(0, d)
        i0 = int(t0 * SR)
        tl = t[: len(t) - i0]
        s[i0:] += np.sin(2 * np.pi * midi(int(_rng.choice(notes)) + 12) * tl) * np.exp(-tl * 14) * 0.9
    return s * np.clip(t / 0.4, 0, 1) * np.clip((d - t) / 0.4, 0, 1) * gain * 0.12


# ------------------------------------------------------------------ noise-based effects
def riser(d, gain=1.0, f0=200, f1=4000):
    t = tt(d)
    u = t / d
    s = svf(noise(d), f0 * (f1 / f0) ** (u ** 1.5), 2.0, 'bp')
    return (s + lp(saw(80 * 2 ** (u * 2.5), d) * 0.15, 2000)) * (u ** 2) * gain


def reverse_swell(d, gain=1.0):
    u = tt(d) / d
    return (hp(noise(d), 3000) * u ** 3 + bp(noise(d), 400, 3000) * u ** 4 * 0.5) * gain


def whoosh(d=0.38, f0=500, f1=2400, gain=1.0, body=0.0, tone=0.0):
    t = tt(d)
    u = t / d
    env = np.sin(np.pi * np.clip(u, 0, 1)) ** 2
    out = svf(noise(d), f0 + (f1 - f0) * np.sin(np.pi * u) ** 1.5, 1.4, 'bp') * env
    if body:
        out += lp(noise(d), 480) * env * body
    if tone:
        out += lp(saw(110 * (1 + 0.6 * np.sin(np.pi * u)), d), 1800) * env * tone
    return out * gain


def metal_clash(gain=1.0, pitch=1.0, decay=1.0, d=2.0):
    t = tt(d)
    s = np.zeros_like(t)
    for f, a, dec in ((520, 0.9, 0.9), (1180, 0.7, 0.7), (1790, 0.6, 0.55), (2610, 0.5, 0.4), (3850, 0.35, 0.3), (5230, 0.25, 0.22), (7100, 0.15, 0.15)):
        f *= pitch * (1 + _rng.uniform(-0.03, 0.03))
        s += a * np.sin(2 * np.pi * f * t + _rng.random() * 6) * np.exp(-t / (dec * decay))
    s *= 0.35
    s += hp(noise(d), 2500) * np.exp(-t * 35 / decay) * 0.9
    s += sine(70 * pitch * (1 + 1.2 * np.exp(-t * 40)), d) * np.exp(-t * 9 / decay) * 0.9
    return np.tanh(s * 1.4) * gain


def boom(gain=1.0, d=4.0, f0=48):
    t = tt(d)
    sub = sine(f0 * (1 + 2.0 * np.exp(-t * 12)), d) * np.exp(-t / 1.1)
    rumble = lp(noise(d), 260, 4) * np.exp(-t / 1.4) * 2.5
    crack = hp(noise(d), 1200) * np.exp(-t * 18) * 1.2
    mid = bp(noise(d), 200, 1200) * np.exp(-t * 4) * 0.8
    return np.tanh((sub * 1.6 + rumble + crack + mid) * 1.2) * gain


def splash(d=0.7, gain=1.0):
    """wet ink splat"""
    t = tt(d)
    s = lp(noise(d), 1400) * np.exp(-t * 9) + bp(noise(d), 600, 3000) * np.exp(-t * 22) * 0.8
    wob = 1 + 0.5 * np.sin(2 * np.pi * 23 * t)
    return s * wob * gain


def shatter(d=1.6, gain=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for _ in range(60):
        t0 = _rng.exponential(0.12)
        i0 = int(t0 * SR)
        if i0 >= len(t):
            continue
        tl = t[: len(t) - i0]
        s[i0:] += np.sin(2 * np.pi * _rng.uniform(2500, 9000) * tl) * np.exp(-tl / _rng.uniform(0.02, 0.15)) * _rng.uniform(0.2, 0.6)
    s += hp(noise(d), 3000) * np.exp(-t * 7) * 0.6
    return s * gain


def ticks(d, rate, gain=1.0, lo=2000, hi=9000):
    t = tt(d)
    s = np.zeros_like(t)
    k = max(int(d * rate), 1)
    idx = _rng.choice(len(t), k)
    s[idx] = _rng.uniform(-1, 1, k)
    return bp(s, lo, hi) * 3 * gain


# ------------------------------------------------------------------ master
def reverb_ir(d=2.4, tau=0.55):
    t = tt(d)
    ir = np.stack([lp(noise(d), 6000) * np.exp(-t / tau), lp(noise(d), 6000) * np.exp(-t / tau)])
    ir[:, : int(0.012 * SR)] = 0
    for ch in range(2):
        for _ in range(12):
            ir[ch, int(_rng.uniform(0.012, 0.08) * SR)] += _rng.uniform(-0.6, 0.6)
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True))


def convolve(sig, ir):
    return np.stack([fftconvolve(sig[ch], ir[ch])[: sig.shape[1]] for ch in range(2)])


def master(mix, path, drive=1.25):
    mix = hp(mix, 25)
    mix = np.tanh(mix / np.max(np.abs(mix)) * drive) * 0.92
    mix = mix / np.max(np.abs(mix)) * 0.95
    pcm = (np.clip(mix, -1, 1).T * 32767).astype(np.int16)
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    return float(np.sqrt((mix ** 2).mean()))
