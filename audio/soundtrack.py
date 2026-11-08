"""Synthesizes the soundtrack (music + sound effects) for the 15 s fight, synced to
audio/events.json (dumped from the scene). Pure numpy/scipy, deterministic.

    python3 audio/soundtrack.py  ->  output/soundtrack.wav
"""
import json
import math
import os
import wave

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
DUR = 15.0
N = int(SR * DUR)
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
rng = np.random.default_rng(7)

EV = json.load(open(os.path.join(HERE, 'events.json')))['events']

# ------------------------------------------------------------------ buses (stereo)
music = np.zeros((2, N))
sfx = np.zeros((2, N))
amb = np.zeros((2, N))


def place(bus, sig, t, pan=0.0, gain=1.0):
    """Add a mono or stereo signal at time t (seconds) with equal-power pan."""
    sig = np.asarray(sig, dtype=np.float64)
    if sig.ndim == 1:
        a = (pan + 1) * math.pi / 4
        sig = np.stack([sig * math.cos(a), sig * math.sin(a)]) * math.sqrt(2)
    i0 = int(round(t * SR))
    s0 = max(0, -i0)
    i0 = max(0, i0)
    n = min(sig.shape[1] - s0, N - i0)
    if n <= 0:
        return
    bus[:, i0:i0 + n] += sig[:, s0:s0 + n] * gain


def tt(d):
    return np.arange(int(d * SR)) / SR


def noise(d):
    return rng.standard_normal(int(d * SR))


def sos_filter(x, kind, f, order=2):
    if kind == 'band':
        f = [max(20, f[0]), min(SR / 2 - 100, f[1])]
    else:
        f = min(max(f, 20), SR / 2 - 100)
    return sosfilt(butter(order, f, btype=kind, fs=SR, output='sos'), x)


def lp(x, f, o=2): return sos_filter(x, 'low', f, o)
def hp(x, f, o=2): return sos_filter(x, 'high', f, o)
def bp(x, lo, hi, o=2): return sos_filter(x, 'band', [lo, hi], o)


def svf(x, fc, q=0.8, mode='lp'):
    """Time-varying state variable filter; fc can be an array."""
    fc = np.broadcast_to(np.asarray(fc, dtype=np.float64), x.shape)
    g = np.tan(np.pi * np.clip(fc, 20, SR * 0.45) / SR)
    k = 1.0 / q
    a1 = 1 / (1 + g * (g + k))
    a2 = g * a1
    a3 = g * a2
    y = np.empty_like(x)
    ic1 = ic2 = 0.0
    xl = x.tolist(); a1l = a1.tolist(); a2l = a2.tolist(); a3l = a3.tolist()
    out = [0.0] * len(xl)
    for n in range(len(xl)):
        v3 = xl[n] - ic2
        v1 = a1l[n] * ic1 + a2l[n] * v3
        v2 = ic2 + a2l[n] * ic1 + a3l[n] * v3
        ic1 = 2 * v1 - ic1
        ic2 = 2 * v2 - ic2
        out[n] = v1 if mode == 'bp' else v2 if mode == 'lp' else xl[n] - k * v1 - v2
    y[:] = out
    return y


def saw(freq, d, detune=0.0, phase=0.0):
    t = tt(d)
    f = np.broadcast_to(freq, t.shape) * (1 + detune)
    ph = np.cumsum(f) / SR + phase
    return 2 * (ph % 1.0) - 1


def sine(freq, d):
    t = tt(d)
    f = np.broadcast_to(np.asarray(freq, dtype=np.float64), t.shape)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def expdec(d, tau, attack=0.002):
    t = tt(d)
    return (1 - np.exp(-t / max(attack, 1e-4))) * np.exp(-t / tau)


def midi(m): return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ instruments
def taiko(gain=1.0, f0=58, decay=0.55, d=1.4):
    t = tt(d)
    f = f0 * (1 + 1.6 * np.exp(-t * 28))
    body = sine(f, d) * np.exp(-t / decay)
    body += 0.35 * sine(f * 1.52, d) * np.exp(-t / (decay * 0.4))
    click = lp(noise(d), 900) * np.exp(-t * 60) * 0.8
    skin = bp(noise(d), 150, 600) * np.exp(-t * 14) * 0.5
    return np.tanh((body + click + skin) * 1.6) * gain


def tom(gain=1.0, f0=110, d=0.5):
    t = tt(d)
    f = f0 * (1 + 0.8 * np.exp(-t * 35))
    s = sine(f, d) * np.exp(-t * 9) + bp(noise(d), 200, 1500) * np.exp(-t * 30) * 0.4
    return s * gain


def snare(gain=1.0, d=0.35):
    t = tt(d)
    s = bp(noise(d), 1500, 7000) * np.exp(-t * 18) + sine(190 * (1 + 0.5 * np.exp(-t * 40)), d) * np.exp(-t * 25) * 0.5
    return s * gain


def braam(notes, d=2.5, gain=1.0, open_t=0.12, bright=2600):
    t = tt(d)
    sig = np.zeros_like(t)
    for m in notes:
        for det in (-0.006, 0.0, 0.007):
            sig += saw(midi(m), d, det, rng.random())
    sig /= len(notes) * 3
    cutoff = 180 + (bright - 180) * np.clip(t / open_t, 0, 1) * np.exp(-np.maximum(t - open_t, 0) * 1.1)
    sig = svf(sig, cutoff, 1.1, 'lp')
    env = np.clip(t / 0.02, 0, 1) * np.exp(-t / (d * 0.45))
    sub = sine(midi(min(notes) - 12), d) * np.exp(-t / (d * 0.5)) * 0.6
    return np.tanh((sig * 2.2 + sub) * env * 1.3) * gain


def pluck(m, d=0.16, gain=1.0, cutoff=2400):
    t = tt(d)
    s = saw(midi(m), d, -0.004) + saw(midi(m), d, 0.005, 0.3)
    s = lp(s, cutoff, 2) * np.exp(-t * 16) * np.clip(t / 0.004, 0, 1)
    return s * 0.5 * gain


def pad(notes, d, gain=1.0, cutoff=900, attack=0.8, release=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        for det in (-0.004, 0.003, 0.009):
            s += saw(midi(m), d, det, rng.random())
    s = lp(s / (len(notes) * 3), cutoff, 2)
    env = np.clip(t / attack, 0, 1) * np.clip((d - t) / release, 0, 1)
    return s * env * gain


def choir(notes, d, gain=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for m in notes:
        vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t + rng.random() * 6)
        f = midi(m) * vib
        for h, a in ((1, 1.0), (2, 0.5), (3, 0.3), (4, 0.18), (5, 0.1)):
            s += a * sine(f * h, d)
    s = bp(s, 300, 1400) + lp(s, 500) * 0.4
    env = np.clip(t / 0.5, 0, 1) * np.clip((d - t) / 0.6, 0, 1)
    return s * env * gain / len(notes) * 0.4


def riser(d, gain=1.0, f0=200, f1=4000):
    t = tt(d)
    u = t / d
    fc = f0 * (f1 / f0) ** (u ** 1.5)
    s = svf(noise(d), fc, 2.0, 'bp')
    tone = saw(80 * 2 ** (u * 2.5), d) * 0.15
    return (s + lp(tone, 2000)) * (u ** 2) * gain


def reverse_swell(d, gain=1.0):
    t = tt(d)
    u = t / d
    s = hp(noise(d), 3000) * u ** 3 + bp(noise(d), 400, 3000) * u ** 4 * 0.5
    return s * gain


# ------------------------------------------------------------------ sound effects
def whoosh(d=0.38, f0=500, f1=2400, gain=1.0, kind='A'):
    t = tt(d)
    u = t / d
    fc = f0 + (f1 - f0) * np.sin(np.pi * u) ** 1.5
    s = svf(noise(d), fc, 1.4, 'bp')
    env = np.sin(np.pi * np.clip(u, 0, 1)) ** 2
    out = s * env
    if kind == 'A':  # energy blade doppler hum
        out += lp(saw(110 * (1 + 0.6 * np.sin(np.pi * u)), d), 1800) * env * 0.35
    elif kind == 'B':  # fire roar
        out += lp(noise(d), 500) * env * 0.9
    return out * gain


def metal_clash(gain=1.0, pitch=1.0, decay=1.0, d=2.0, zap=True):
    t = tt(d)
    parts = [(520, 0.9, 0.9), (1180, 0.7, 0.7), (1790, 0.6, 0.55), (2610, 0.5, 0.4), (3850, 0.35, 0.3), (5230, 0.25, 0.22), (7100, 0.15, 0.15)]
    s = np.zeros_like(t)
    for f, a, dec in parts:
        f *= pitch * (1 + rng.uniform(-0.03, 0.03))
        s += a * np.sin(2 * np.pi * f * t + rng.random() * 6) * np.exp(-t / (dec * decay))
    s *= 0.35
    s += hp(noise(d), 2500) * np.exp(-t * 35 / decay) * 0.9
    s += sine(70 * pitch * (1 + 1.2 * np.exp(-t * 40)), d) * np.exp(-t * 9 / decay) * 0.9
    if zap:
        fm = np.sin(2 * np.pi * 37 * t) * 600
        z = np.sign(np.sin(2 * np.pi * np.cumsum(220 * pitch + fm) / SR)) * np.exp(-t * 14 / decay) * 0.18
        s += lp(z, 5000)
    return np.tanh(s * 1.4) * gain


def boom(gain=1.0, d=4.0, f0=48):
    t = tt(d)
    sub = sine(f0 * (1 + 2.0 * np.exp(-t * 12)), d) * np.exp(-t / 1.1)
    rumble = lp(noise(d), 260, 4) * np.exp(-t / 1.4) * 2.5
    crack = hp(noise(d), 1200) * np.exp(-t * 18) * 1.2
    mid = bp(noise(d), 200, 1200) * np.exp(-t * 4) * 0.8
    crackle = np.zeros_like(t)
    idx = rng.choice(len(t) // 2, 400)
    crackle[idx] = rng.uniform(-1, 1, 400) * np.exp(-t[idx] * 1.2)
    crackle = hp(crackle, 2000) * 2
    return np.tanh((sub * 1.6 + rumble + crack + mid + crackle) * 1.2) * gain


def thunder(gain=1.0, d=4.0):
    t = tt(d)
    crack = hp(noise(d), 800) * np.exp(-t * 9) * 1.4
    roll = lp(noise(d), 180, 4) * (np.exp(-t / 1.6) * (0.6 + 0.4 * np.sin(2 * np.pi * 1.3 * t) ** 2)) * 4
    return np.tanh(crack + roll) * gain


def ignite_blade(d=0.6):
    t = tt(d)
    f = 60 + 70 * np.clip(t / 0.25, 0, 1)
    hum = lp(saw(f, d) + 0.5 * saw(f * 2.01, d), 2500) * np.clip(t / 0.03, 0, 1) * 0.6
    psh = bp(noise(d), 2000, 9000) * np.exp(-t * 9) * 0.9
    snap = hp(noise(d), 4000) * np.exp(-t * 60) * 1.2
    return (hum * np.exp(-np.maximum(t - 0.3, 0) * 3) + psh + snap)


def fire_ignite(d=1.2):
    t = tt(d)
    whoomp = svf(noise(d), 400 + 1600 * np.exp(-t * 6), 0.8, "lp") * np.clip(t / 0.05, 0, 1) * np.exp(-t * 2.5) * 2.2
    return whoomp + bp(noise(d), 1500, 6000) * np.exp(-t * 6) * 0.5


def grind(d):
    t = tt(d)
    fc = 3200 + 900 * np.sin(2 * np.pi * 3.1 * t) + 500 * np.sin(2 * np.pi * 11 * t)
    s = svf(noise(d), fc, 6.0, 'bp') * 0.8
    ticks = np.zeros_like(t)
    idx = rng.choice(len(t), int(d * 90))
    ticks[idx] = rng.uniform(-1, 1, len(idx))
    ticks = hp(ticks, 3000) * 2.5
    buzz = lp(np.sign(np.sin(2 * np.pi * np.cumsum(95 + 15 * np.sin(2 * np.pi * 7 * t)) / SR)), 1600) * 0.12
    return s + ticks + buzz


def shatter(d=1.6):
    t = tt(d)
    s = np.zeros_like(t)
    for _ in range(60):
        t0 = rng.exponential(0.12)
        f = rng.uniform(2500, 9000)
        dec = rng.uniform(0.02, 0.15)
        i0 = int(t0 * SR)
        if i0 >= len(t):
            continue
        tl = t[: len(t) - i0]
        s[i0:] += np.sin(2 * np.pi * f * tl) * np.exp(-tl / dec) * rng.uniform(0.2, 0.6)
    s += hp(noise(d), 3000) * np.exp(-t * 7) * 0.6
    s += sine(90 * (1 + np.exp(-t * 20)), d) * np.exp(-t * 6) * 0.8
    return s


def crackle_bed(d, rate=60, gain=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    k = int(d * rate)
    idx = rng.choice(len(t), k)
    s[idx] = rng.uniform(-1, 1, k)
    s = bp(s, 800, 6000) * 3 + lp(noise(d), 300) * 0.8
    return s * gain


def hum(d, f=85, gain=1.0):
    t = tt(d)
    wob = 1 + 0.01 * np.sin(2 * np.pi * 4.5 * t)
    s = saw(f * wob, d) + 0.5 * saw(f * 2.003 * wob, d) + 0.3 * sine(f * 3 * wob, d)
    return lp(s, 900) * gain


# ================================================================== SCORE
CL = EV['clashes']
MISC = {}
for k, v in EV['misc'].items():
    MISC[k] = v if isinstance(v, (int, float)) else v.get('r', v.get('r0'))
T_BT0, T_BT1 = 10.45, 11.9   # bullet time window (for filtering)
T_SIL0, T_SIL1 = 13.12, 13.88  # silence beat after the final cross

# ---- ambience: rain + wind
rainL = hp(noise(DUR), 1800) * 0.05 + bp(noise(DUR), 300, 1500) * 0.03
rainR = hp(noise(DUR), 1800) * 0.05 + bp(noise(DUR), 300, 1500) * 0.03
drops = np.zeros(N)
idx = rng.choice(N, 2500)
drops[idx] = rng.uniform(-1, 1, 2500)
drops = bp(drops, 2000, 8000) * 0.25
wind = svf(noise(DUR), 300 + 200 * np.sin(2 * np.pi * 0.13 * np.arange(N) / SR), 1.2, 'bp') * 0.1
amb[0] += rainL + drops + wind
amb[1] += rainR + np.roll(drops, 1500) + wind

# ---- drone / pads
place(music, pad([38, 45, 50], 5.3, gain=0.5, cutoff=500, attack=2.5, release=0.6), 0.0)
place(music, sine(midi(26), DUR) * 0.25 * np.clip(np.arange(N) / SR / 3, 0, 1), 0.0)
prog = [([38, 50, 53, 57], 5.25), ([34, 46, 50, 53], 6.1), ([31, 43, 50, 55], 6.95), ([33, 45, 49, 52], 7.8), ([38, 50, 53, 57], 8.62)]
for i, (ch, t0) in enumerate(prog):
    t1 = prog[i + 1][1] if i + 1 < len(prog) else 9.05
    place(music, pad(ch, t1 - t0 + 0.4, gain=0.55, cutoff=1200, attack=0.15, release=0.4), t0)
place(music, pad([38, 45, 50, 53], 1.1, gain=0.5, cutoff=900, attack=0.3, release=0.5), 4.1)
place(music, pad([34, 46, 53, 58], 2.5, gain=0.45, cutoff=1000, attack=0.6, release=0.8), 9.2)
place(music, choir([62, 65, 69, 74], 1.7, gain=0.9), 10.4)
place(music, choir([58, 62, 65, 70], 0.9, gain=0.7), 11.9)
place(music, pad([33, 45, 52, 57, 61], 0.75, gain=0.55, cutoff=1500, attack=0.3, release=0.1), 12.4)

# ---- drums
for t0, g in ((0.22, 0.7), (0.85, 0.55), (1.62, 0.6), (1.98, 1.0)):
    place(music, taiko(g), t0)
# build to the first clash
for k in range(16):
    t0 = 3.0 + k * (1.05 / 16)
    place(music, snare(0.15 + 0.5 * k / 15), t0, pan=rng.uniform(-0.3, 0.3))
    if k % 4 == 0:
        place(music, tom(0.6, 95 + k * 4), t0)
place(music, taiko(1.3, 52, 0.8), 4.1)
place(music, taiko(0.6), 4.55)
place(music, taiko(0.7), 4.95)
# main groove (140 bpm) from 5.25 to 9.0
beat = 60 / 140
t0 = 5.25
k = 0
while t0 < 9.0:
    place(music, taiko(0.75 if k % 4 == 0 else 0.5), t0)
    place(music, tom(0.35, 160), t0 + beat / 2, pan=0.3)
    if k % 2 == 1:
        place(music, snare(0.3), t0, pan=-0.2)
    t0 += beat
    k += 1
# ostinato
pat = [50, 50, 57, 50, 53, 50, 57, 50, 50, 50, 58, 50, 55, 53, 57, 50]
t0 = 5.25
k = 0
while t0 < 9.0:
    shift = 0 if t0 < 6.95 else -2 if t0 < 7.8 else -1
    place(music, pluck(pat[k % 16] + shift, gain=0.55), t0, pan=-0.25 if k % 2 else 0.25)
    t0 += beat / 4
    k += 1
# build into the mid-air clash
for k in range(24):
    t0 = 9.45 + k * (0.95 / 24)
    place(music, snare(0.1 + 0.45 * k / 23), t0, pan=rng.uniform(-0.4, 0.4))
    if k % 3 == 0:
        place(music, tom(0.5, 90 + k * 3), t0)
place(music, riser(1.0, 0.35), 9.42)
place(music, riser(1.05, 0.3), 3.05)
# bullet time heartbeat
for t0 in (10.95, 11.2, 11.65, 11.9):
    place(music, taiko(0.55, 44, 0.4), t0)
place(music, taiko(1.0), 11.95)
place(music, tom(0.6, 120), 12.15)
place(music, tom(0.6, 100), 12.3)
# power-up roll
for k in range(20):
    t0 = 12.45 + k * (0.6 / 20)
    place(music, snare(0.1 + 0.5 * k / 19), t0, pan=rng.uniform(-0.3, 0.3))
place(music, riser(0.62, 0.45, 300, 6000), 12.45)
place(music, reverse_swell(0.6, 0.25), 12.48)
place(music, taiko(1.4, 50, 0.9), 13.09)
# braams
place(music, braam([38, 45, 50], 1.6, 0.6), 4.1)
place(music, braam([34, 41, 46, 50], 2.2, 0.75), 9.05)
place(music, braam([38, 45, 50, 53], 1.4, 0.55, bright=1800), 10.42)
place(music, braam([38, 45, 50, 53, 57], 0.6, 0.5), 13.09)
# finale
place(music, taiko(1.0), 13.9)
place(music, reverse_swell(0.35, 0.3), 13.95)
place(music, braam([26, 38, 45, 50, 53, 57], 1.8, 0.95, open_t=0.25, bright=3200), 14.3)
place(music, taiko(1.5, 46, 1.0), 14.3)
place(music, hp(noise(1.6), 5000) * expdec(1.6, 0.6, 0.01) * 0.25, 14.3)

# ---- sound effects
place(sfx, thunder(0.9), 0.24, pan=-0.5)
place(sfx, thunder(0.7), 12.64, pan=0.4)
# eyes + ignitions
place(sfx, (np.sin(2 * np.pi * 2490 * tt(1.2)) + 0.6 * np.sin(2 * np.pi * 3720 * tt(1.2))) * expdec(1.2, 0.35) * 0.18, MISC['eyesA'], pan=-0.3)
place(sfx, ignite_blade() * 0.8, MISC['igniteA'], pan=-0.3)
t_g = tt(1.2)
growl = (lp(saw(52 * (1 + 0.04 * np.sin(2 * np.pi * 9 * t_g)), 1.2), 600) + lp(noise(1.2), 400)) * np.sin(np.pi * np.clip(t_g / 1.2, 0, 1)) * 0.45
place(sfx, growl, MISC['eyesB'], pan=0.35)
place(sfx, fire_ignite() * 0.8, MISC['igniteB'], pan=0.35)
# continuous blade hum (A) and fire bed (B)
hA = hum(MISC['retract'] - MISC['igniteA'] + 0.3, 86, 0.06)
place(sfx, hA * np.clip(tt(len(hA) / SR) / 0.2, 0, 1), MISC['igniteA'] + 0.15, pan=-0.2)
fireB = crackle_bed(MISC['shatter'] - MISC['igniteB'], 70, 0.12)
place(sfx, fireB * np.clip(tt(len(fireB) / SR) / 0.3, 0, 1), MISC['igniteB'], pan=0.2)
# B's spin flourish: rotating whoosh
d = 0.7
tsp = tt(d)
spin = svf(noise(d), 700 + 900 * (0.5 + 0.5 * np.sin(2 * np.pi * 7.5 * tsp)), 1.6, 'bp') * np.sin(np.pi * tsp / d) * 0.8
spin += lp(noise(d), 450) * (0.5 + 0.5 * np.sin(2 * np.pi * 7.5 * tsp)) * 0.6
place(sfx, spin, 2.18, pan=0.35)
# whooshes (merge near-duplicates)
seen = []
for w in sorted(EV['whooshes'], key=lambda w: w['r']):
    if 2.15 < w['r'] < 2.9:
        continue
    who = w.get('who') or 'A'
    if any(abs(w['r'] - r) < 0.09 and wh == who for r, wh in seen):
        continue
    seen.append((w['r'], who))
    g = w['gain']
    slow = T_BT0 < w['r'] < T_BT1
    place(sfx, whoosh(0.32 if not slow else 0.9, 400 if who == 'A' else 300, 2600 if who == 'A' else 1600, g * 0.55, who), w['r'] - 0.16, pan=-0.35 if who == 'A' else 0.35)
# clashes
for c in CL:
    kind, r = c['kind'], c['r']
    if kind == 'air':
        place(sfx, metal_clash(1.0, pitch=0.5, decay=3.5, d=3.5), r)
        place(sfx, boom(0.5, 3.0, 40), r)
        place(sfx, reverse_swell(0.3, 0.3), r - 0.3)
    elif kind in ('big', 'heavy'):
        place(sfx, metal_clash(1.0, pitch=0.85 if kind == 'heavy' else 1.0, decay=1.6, d=2.5), r)
        place(sfx, boom(0.45, 2.0, 55), r)
    else:
        place(sfx, metal_clash(0.75 * max(c['intensity'], 0.5), pitch=rng.uniform(0.95, 1.15), decay=0.9, d=1.6), r, pan=rng.uniform(-0.25, 0.25))
# blade lock grind + bullet-time grind (pitched down)
place(sfx, grind(0.86) * 0.35 * np.sin(np.pi * np.clip(tt(0.86) / 0.86, 0, 1)) ** 0.3, 4.12)
gb = grind(1.45)
gb = lp(gb, 1500) * 0.4
place(sfx, gb * np.sin(np.pi * tt(1.45) / 1.45), 10.45)
# slam + fissure + crescent + explosion
place(sfx, boom(0.6, 2.5, 60), MISC['fissure'], pan=0.3)
t_f = tt(0.45)
fis = lp(noise(0.45), 700) * np.clip(t_f / 0.05, 0, 1) * 1.2 + crackle_bed(0.45, 300, 0.3)
place(sfx, fis, MISC['fissure'] + 0.02, pan=0.1)
place(sfx, whoosh(0.35, 800, 4500, 0.7, 'A'), MISC['crescent'] - 0.05, pan=-0.3)
place(sfx, boom(1.1, 4.5, 44), MISC['explosion'])
place(sfx, crackle_bed(2.5, 120, 0.25) * expdec(2.5, 0.9, 0.05), MISC['explosion'] + 0.05)
# landings / dust
for dd in EV['dust']:
    big = dd.get('big', False)
    pn = -0.3 if dd['who'] == 'A' else 0.3
    place(sfx, taiko(0.3 if big else 0.18, 70, 0.25, d=0.6), dd['r'], pan=pn)
    place(sfx, lp(noise(0.5), 600) * expdec(0.5, 0.12) * (0.3 if big else 0.15), dd['r'], pan=pn)
# final cross: piercing ring, then quiet
fc = MISC['finalCross']
ring = np.zeros(int(2.5 * SR))
t_r = tt(2.5)
for f, a, dec in ((3520, 1.0, 1.2), (5280, 0.6, 0.9), (7040, 0.4, 0.6), (1760, 0.5, 1.4)):
    ring += a * np.sin(2 * np.pi * f * t_r) * np.exp(-t_r / dec)
place(sfx, ring * 0.12, fc)
place(sfx, whoosh(0.25, 1500, 7000, 1.0, 'A'), fc - 0.12)
place(sfx, metal_clash(0.7, 1.3, 1.2, 2.0), fc)
place(sfx, boom(0.6, 1.6, 38), fc)
# shatter + dissolve + retract
place(sfx, shatter() * 0.6, MISC['shatter'], pan=-0.3)
d_dis = MISC['dissolve'] + 0.0
dis = crackle_bed(1.1, 160, 0.3) * np.sin(np.pi * tt(1.1) / 1.1) + svf(noise(1.1), 400 + 2500 * tt(1.1), 2.0, 'bp') * np.sin(np.pi * tt(1.1) / 1.1) * 0.5
place(sfx, dis, MISC['dissolve'], pan=-0.3)
t_rt = tt(0.45)
retr = lp(saw(130 * (1 - 0.6 * t_rt / 0.45), 0.45) + 0.5 * saw(262 * (1 - 0.6 * t_rt / 0.45), 0.45), 2200) * (1 - t_rt / 0.45) * 0.35
place(sfx, retr + bp(noise(0.45), 2000, 8000) * expdec(0.45, 0.08) * 0.4, MISC['retract'], pan=0.25)

# ================================================================== MIX
def gain_curve(points):
    """piecewise-linear gain over time from [(t, g), ...]"""
    t = np.arange(N) / SR
    xs, ys = zip(*points)
    return np.interp(t, xs, ys)


# bullet time + silence beat: muffle music/ambience, duck the bed
lp_curve = gain_curve([(0, 16000), (T_BT0 - 0.05, 16000), (T_BT0 + 0.1, 700), (T_BT1 - 0.1, 700), (T_BT1 + 0.15, 16000),
                       (T_SIL0, 16000), (T_SIL0 + 0.05, 900), (T_SIL1 - 0.1, 900), (T_SIL1 + 0.1, 16000), (DUR, 16000)])
for bus in (music, amb):
    for ch in range(2):
        bus[ch] = svf(bus[ch], lp_curve, 0.75, 'lp')
music *= gain_curve([(0, 1), (T_SIL0, 1), (T_SIL0 + 0.15, 0.12), (T_SIL1, 0.12), (T_SIL1 + 0.05, 1), (DUR, 1)])
sfx *= gain_curve([(0, 1), (T_SIL0 + 0.2, 1), (T_SIL0 + 0.45, 0.3), (T_SIL1 - 0.05, 0.3), (T_SIL1 + 0.02, 1), (DUR, 1)])
amb *= gain_curve([(0, 0.0), (0.3, 1), (T_BT0, 1), (T_BT0 + 0.1, 0.6), (T_BT1, 0.6), (T_BT1 + 0.2, 1), (DUR - 0.4, 1), (DUR, 0.3)])

# reverb (synthetic stereo hall)
d_ir = 2.4
t_ir = tt(d_ir)
ir = np.stack([lp(noise(d_ir), 6000) * np.exp(-t_ir / 0.55), lp(noise(d_ir), 6000) * np.exp(-t_ir / 0.55)])
ir[:, : int(0.012 * SR)] = 0
for ch in range(2):
    for _ in range(12):
        ir[ch, int(rng.uniform(0.012, 0.08) * SR)] += rng.uniform(-0.6, 0.6)
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
send = music * 0.35 + sfx * 0.25
wet = np.stack([fftconvolve(send[ch], ir[ch])[:N] for ch in range(2)]) * 0.55

mix = music * 0.8 + sfx * 1.0 + amb * 0.8 + wet
# fade out the end
mix *= gain_curve([(0, 1), (DUR - 0.35, 1), (DUR, 0)])
mix = hp(mix, 25)
peak = np.max(np.abs(mix))
mix = mix / peak * 1.25
mix = np.tanh(mix) * 0.92  # soft limiter
mix = mix / np.max(np.abs(mix)) * 0.95

os.makedirs(os.path.join(ROOT, 'output'), exist_ok=True)
out = os.path.join(ROOT, 'output', 'soundtrack.wav')
pcm = (np.clip(mix, -1, 1).T * 32767).astype(np.int16)
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('wrote', out, f'{DUR:.1f}s', 'rms', float(np.sqrt((mix ** 2).mean())))
