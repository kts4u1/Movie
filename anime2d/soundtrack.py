"""Original score + sound effects for AURORA BLADE (30 s), synced to anime2d/events.json.

    python3 anime2d/soundtrack.py  ->  output/aurora_blade_30s.wav
"""
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(ROOT, 'audio'))
import synth as S  # noqa: E402
from synth import SR, tt, noise, lp, hp, bp, svf, sine, saw, expdec, midi  # noqa: E402

EV = json.load(open(os.path.join(HERE, 'events.json')))
T = EV['T']
FL = EV['flurry']
DUR = T['end']
mx = S.Mix(DUR)
rng = np.random.default_rng(5)
N = mx.n
F2 = 2 / 24  # two frames


def place(bus, sig, t, pan=0.0, gain=1.0):
    mx.place(bus, sig, t, pan, gain)


# ------------------------------------------------------------------ extra voices
def caw(d=0.32, f0=420, gain=1.0):
    """a harsh crow call: jittery buzz through a moving formant"""
    t = tt(d)
    jit = 1 + 0.04 * np.sin(2 * np.pi * 31 * t) + 0.02 * rng.standard_normal(len(t))
    buzz = saw(f0 * (1 - 0.25 * t / d) * jit, d)
    form = svf(buzz + 0.6 * noise(d), 1200 + 600 * np.sin(np.pi * t / d), 3.0, 'bp')
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.6 * (0.6 + 0.4 * (np.sin(2 * np.pi * 9 * t) > 0))
    return form * env * gain * 0.5


def flaps(d, rate=9, gain=1.0):
    t = tt(d)
    s = bp(noise(d), 300, 2500) * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t)) ** 4
    return s * np.sin(np.pi * t / d) * gain


def laugh(d, rate=4.8, f0=150, gain=1.0):
    """low, breathy 'ha-ha' bursts from behind the mask"""
    out = np.zeros(int(d * SR))
    k, t0 = 0, 0.0
    while t0 < d - 0.15:
        bd = 0.14
        t = tt(bd)
        v = saw(f0 * (1 - 0.18 * t / bd) * (1 + 0.01 * np.sin(2 * np.pi * 6 * t)), bd) * 0.5 + noise(bd) * 0.6
        v = svf(v, 700 - 200 * t / bd, 2.5, 'bp') + svf(v, 1300, 4.0, 'bp') * 0.4
        v *= np.clip(t / 0.01, 0, 1) * np.exp(-t * 16) * (1 - 0.15 * k)
        i0 = int(t0 * SR)
        out[i0:i0 + len(v)] += v[: len(out) - i0]
        t0 += 1 / rate
        k += 1
    return out * gain


def gurgle(d, gain=1.0):
    t = tt(d)
    s = np.zeros_like(t)
    for _ in range(int(d * 18)):
        i0 = rng.integers(0, len(t) - int(0.06 * SR))
        tl = tt(0.06)
        s[i0:i0 + len(tl)] += np.sin(2 * np.pi * rng.uniform(90, 220) * tl * (1 + 2 * tl)) * np.exp(-tl * 50)
    return lp(s, 900) * gain


def sting(kind, gain=1.0):
    """technique-name hit: dark brass for Kokuya, bright bell + choir for Sera"""
    def mix_(*xs):
        n = max(len(x) for x in xs)
        return sum(np.pad(x, (0, n - len(x))) for x in xs)
    if kind == 'ink':
        return mix_(S.braam([26, 38, 39, 45], 1.2, 0.8 * gain, open_t=0.05, bright=2200), S.taiko(0.9 * gain, 46, 0.8))
    return mix_(S.taiko(0.8 * gain, 56, 0.6), S.bell(86, 1.4, 0.7 * gain), S.bell(93, 1.4, 0.5 * gain), S.choir([62, 69, 74, 81], 1.2, 1.1 * gain, attack=0.04, release=0.8))


def scrape(d, gain=1.0):
    t = tt(d)
    fc = 2600 + 700 * np.sin(2 * np.pi * 5 * t)
    return (svf(noise(d), fc, 7.0, 'bp') * 0.6 + S.ticks(d, 50, 0.3)) * gain


def koiguchi(gain=1.0):
    """the sharp click of the guard leaving (or meeting) the scabbard mouth"""
    t = tt(0.4)
    s = hp(noise(0.4), 2500) * np.exp(-t * 90) * 1.2
    for f, a in ((2950, 0.7), (4420, 0.5), (6100, 0.3)):
        s += a * np.sin(2 * np.pi * f * t) * np.exp(-t * 14)
    return s * gain * 0.5


def drag_out(d=0.3, gain=1.0):
    """blade sliding along the scabbard"""
    t = tt(d)
    return svf(noise(d), 3000 + 2500 * t / d, 5.0, 'bp') * np.sin(np.pi * t / d) * gain


# ------------------------------------------------------------------ ambience
tline = np.arange(N) / SR
wind = svf(noise(DUR), 320 + 220 * np.sin(2 * np.pi * 0.11 * tline) + 280 * np.exp(-((tline - 1.1) ** 2) / 0.15) + 260 * np.exp(-((tline - 5.0) ** 2) / 0.1), 1.3, 'bp') * 0.16
rustle = hp(noise(DUR), 3500) * (0.02 + 0.03 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * tline + 1)))
mx.bus('amb')[0] += wind + rustle
mx.bus('amb')[1] += wind + np.roll(rustle, 2400)

# ------------------------------------------------------------------ music
D3, A3, D4, Eb4, G4, A4, Bb4, D5, Eb5, G5, A5 = 50, 57, 62, 63, 67, 69, 70, 74, 75, 79, 81
# act 1: field, flute theme, koto
place('music', S.pad([38, 45], 6.4, gain=0.38, cutoff=420, attack=1.2, release=0.4), 0.0)
for (m, t0, d) in ((D5, 0.3, 0.9), (Eb5, 1.2, 0.3), (D5, 1.5, 0.35), (A4, 1.85, 0.6)):
    place('music', S.flute(m, d, 0.48, scoop=0.05), t0, pan=-0.1)
place('music', S.pluck(D3, 2.2, 0.75, bright=0.4), 0.05, pan=0.2)
place('music', S.pluck(A3, 1.6, 0.55, bright=0.4), 1.7, pan=-0.2)
# Kokuya rises: dissonant low swell, eye sting, card hit
place('music', S.pad([38, 39, 46], T['card2'] - T['s2'] + 0.3, gain=0.6, cutoff=650, attack=0.6, release=0.2), T['s2'])
place('music', S.riser(T['column'] - T['pool'], 0.35, 100, 1600), T['pool'])
place('music', S.taiko(1.0, 50, 0.7), T['rEye'])
place('music', sting('ink', 1.0), T['card2'])
# Sera's theme: bell + koto + shimmer, then her card hit
place('music', S.pad([43, 50, 55, 62], T['s4'] - T['s3'], gain=0.4, cutoff=1100, attack=0.5, release=0.3), T['s3'])
for i, m in enumerate([D4, G4, A4, D5]):
    place('music', S.pluck(m, 1.3, 0.5, bright=0.75), T['s3'] + 0.12 + i * 0.12, pan=(-1) ** i * 0.2)
place('music', S.flute(G5, 0.7, 0.35, scoop=0.03), T['headTurn'] + 0.1, pan=0.1)
place('music', S.shimmer(0.8, 0.9), T['headTurn'] + 0.2)
place('music', sting('aurora', 0.9), T['card3'])
# taunt + reply: low pulse, heartbeat, a held breath before the draw
place('music', S.pad([38, 39, 45], 1.15, gain=0.5, cutoff=550, attack=0.2, release=0.3), T['s4'])
for t0 in (T['s4'] + 0.1, T['s4'] + 0.55):
    place('music', S.taiko(0.45, 44, 0.35), t0)
place('music', S.pad([43, 50, 57, 62], 1.3, gain=0.42, cutoff=1000, attack=0.4, release=0.2), T['s5'])
place('music', S.shimmer(1.2, 0.6), T['s5'] + 0.1)
for t0 in (T['s6'] + 0.05, T['s6'] + 0.5):
    place('music', S.taiko(0.5, 44, 0.3), t0)
place('music', S.riser(T['s7'] - T['push'], 0.45, 300, 7000), T['push'])
# the fight: 150 bpm groove
BEAT = 0.4
RIFF = [D4, A4, Bb4, A4, D4, G4, A4, G4, D4, Eb4, G4, Eb4, D4, A4, D5, Bb4]


def groove(t0, t1, gain=1.0, riff=True, ostinato_shift=0):
    k, t = 0, t0
    while t < t1 - 1e-6:
        if k % 4 == 0:
            place('music', S.taiko(0.8 * gain if k % 8 == 0 else 0.55 * gain), t)
        if k % 4 == 2:
            place('music', S.tom(0.4 * gain, 150), t, pan=0.3)
        if k % 2 == 1:
            place('music', S.rim(0.22 * gain), t, pan=-0.3)
        if riff:
            place('music', S.pluck(RIFF[k % 16] + ostinato_shift, 0.5, 0.5 * gain, bright=0.75, buzz=0.3), t, pan=-0.2 if k % 2 else 0.2)
            if k % 4 == 0:
                place('music', S.pluck(RIFF[k % 16] - 24 + ostinato_shift, 0.6, 0.6 * gain, bright=0.3), t)
        t += BEAT / 4
        k += 1


place('music', S.taiko(1.2, 52, 0.7), T['s7'])
groove(T['s7'], T['clash1'] - 0.02, 0.9)
HIT1 = T['clash1'] + F2
place('music', S.taiko(1.5, 46, 0.9), HIT1)
place('music', S.braam([38, 45, 50, 53], 1.3, 0.7), HIT1)
groove(HIT1 + 0.5, T['s9'], 1.0)
for (ch, t0, t1) in (([38, 50, 53, 57], HIT1, 11.6), ([34, 46, 50, 53], 11.6, 12.3), ([31, 43, 50, 55], 12.3, 13.0)):
    place('music', S.pad(ch, t1 - t0 + 0.2, gain=0.42, cutoff=1300, attack=0.05, release=0.25), t0)
groove(T['s9'], T['s10'], 0.95, ostinato_shift=-2)
place('music', S.pad([34, 46, 53, 58], T['s10'] - T['s9'], gain=0.42, cutoff=1300, attack=0.1, release=0.2), T['s9'])
place('music', sting('ink', 0.8), EV['callouts'][0]['t'])
place('music', sting('aurora', 0.8), EV['callouts'][1]['t'])
# gather + slam
place('music', S.pad([26, 38, 39, 44], T['slam'] - T['s10'] + 0.1, gain=0.65, cutoff=700, attack=0.2, release=0.1), T['s10'])
for k in range(10):
    place('music', S.tom(0.15 + 0.4 * k / 9, 70 + k * 3), T['s10'] + 0.05 + k * 0.042)
place('music', S.taiko(1.5, 44, 1.0), T['slam'])
place('music', S.braam([26, 33, 38, 39], 1.1, 0.8, bright=1900), T['slam'])
# the moon clash
place('music', S.choir([62, 69, 74, 77], T['airClash'] - T['s11'] + 0.1, gain=1.0, attack=0.3, release=0.1), T['s11'])
place('music', S.reverse_swell(0.5, 0.35), T['airClash'] - 0.5)
AIR = T['airClash'] + F2
place('music', S.taiko(1.6, 44, 1.0), AIR)
place('music', S.braam([26, 38, 45, 50], 1.3, 0.8, open_t=0.05, bright=2800), AIR)
# defeat, heartbeat, the rival's footsteps
place('music', S.pad([26, 38, 39], T['s13'] - T['crash'], gain=0.45, cutoff=500, attack=0.5, release=0.4), T['crash'])
hb = T['crash'] + 0.6
while hb < T['rise']:
    place('music', S.taiko(0.45, 42, 0.3), hb)
    place('music', S.taiko(0.3, 42, 0.25), hb + 0.22)
    hb += 0.85
# power-up: rising choir, faster heartbeat
place('music', S.choir([62, 69, 74, 78, 81], T['s13b'] - T['rise'] + 0.3, gain=1.1, attack=0.6, release=0.2), T['rise'])
place('music', S.riser(T['s13b'] - T['rise'], 0.5, 200, 8000), T['rise'])
place('music', S.shimmer(T['s14'] - T['rise'], 1.2), T['rise'])
hb = T['rise']
gap = 0.5
while hb < T['s13b'] - 0.05:
    place('music', S.taiko(0.55, 44, 0.3), hb)
    hb += gap
    gap = max(gap * 0.82, 0.16)
place('music', sting('aurora', 1.2), EV['callouts'][3]['t'])
# the dragon + the final charge
place('music', sting('ink', 1.0), EV['callouts'][2]['t'])
for k in range(28):
    place('music', S.rim(0.12 + 0.35 * k / 27), T['s14'] + 0.15 + k * ((T['s15'] - T['s14'] - 0.2) / 28), pan=rng.uniform(-0.3, 0.3))
    if k % 4 == 0:
        place('music', S.tom(0.45, 90 + k * 2), T['s14'] + 0.15 + k * ((T['s15'] - T['s14'] - 0.2) / 28))
place('music', S.riser(T['s15'] - T['s14'], 0.45, 200, 9000), T['s14'])
# the cut
place('music', S.taiko(1.7, 44, 1.1), T['cut'])
place('music', S.braam([26, 38, 45, 50, 57], 2.0, 0.9, open_t=0.05, bright=3200), T['cut'])
# aftermath
place('music', S.pluck(D3, 2.4, 0.7, bright=0.35), 25.7, pan=-0.15)
place('music', S.pluck(A3, 2.0, 0.5, bright=0.35), 26.3, pan=0.15)
# resolution
ARP = [D4, G4, A4, D5, G5, A5]
for i, m in enumerate(ARP):
    place('music', S.pluck(m, 1.8, 0.5, bright=0.7), T['s18'] + 0.15 + i * 0.16, pan=(-1) ** i * 0.25)
place('music', S.pad([43, 50, 55, 59, 62], DUR - T['s18'], gain=0.5, cutoff=1500, attack=0.5, release=1.0), T['s18'])
place('music', S.flute(D5, 0.5, 0.42, scoop=0.04), 28.2, pan=-0.1)
place('music', S.flute(G5, 0.85, 0.42), 28.68, pan=-0.1)
place('music', S.shimmer(1.6, 0.8), 28.3)
place('music', S.taiko(0.9, 52, 0.9), T['title'])
place('music', S.pad([38, 45, 50, 57, 62, 66], DUR - T['title'], gain=0.6, cutoff=2200, attack=0.1, release=0.7), T['title'])
place('music', S.bell(86, 1.0, 0.6), T['title'])
for i, m in enumerate([D4, A4, D5]):
    place('music', S.pluck(m, 0.9, 0.55, bright=0.8), T['title'] + 0.05 + i * 0.12)

# ------------------------------------------------------------------ sound effects
# crows over the moon
for t0 in (0.55, 1.25, 1.95):
    place('sfx', caw(0.3, rng.uniform(380, 460), 0.5), t0, pan=rng.uniform(0.2, 0.7))
# ink pool, eruption, crows bursting out, the rise
place('sfx', gurgle(T['column'] - T['pool'] + 0.4, 0.8), T['pool'], pan=0.2)
place('sfx', S.boom(0.7, 2.0, 50), T['column'], pan=0.15)
place('sfx', S.splash(0.9, 0.9), T['column'], pan=0.15)
place('sfx', flaps(1.2, 11, 0.7), T['column'] + 0.05, pan=0.1)
for k in range(6):
    place('sfx', caw(0.28, rng.uniform(360, 520), 0.55), T['column'] + 0.1 + k * 0.11, pan=rng.uniform(-0.6, 0.7))
t_g = tt(0.6)
place('sfx', lp(saw(46 * (1 + 0.05 * np.sin(2 * np.pi * 9 * t_g)), 0.6), 500) * np.sin(np.pi * t_g / 0.6) * 0.5, T['riseA'], pan=0.2)
t_w = tt(0.5)
place('sfx', svf(noise(0.5), 400 + 1500 * np.exp(-t_w * 6), 0.8, 'lp') * np.clip(t_w / 0.03, 0, 1) * np.exp(-t_w * 4) * 1.2, T['rEye'], pan=0.2)
place('sfx', S.whoosh(0.3, 600, 4000, 0.7), T['card2'] - 0.1)
# Sera's glint + card
place('sfx', S.bell(98, 0.8, 0.3), T['headTurn'] + 0.44, pan=-0.2)
place('sfx', S.whoosh(0.3, 800, 5000, 0.7), T['card3'] - 0.1)
# the mask laughs
place('sfx', laugh(0.95, 4.8, 140, 0.45), T['s4'] + 0.05)
# the draw: thumb pushes the guard
place('sfx', koiguchi(1.0), T['push'])
place('sfx', drag_out(0.12, 0.4), T['push'] + 0.02)
place('sfx', S.bell(101, 0.9, 0.35), T['push'] + 0.05)
# dash
place('sfx', S.whoosh(0.5, 500, 3800, 0.9, body=0.5), T['s7'] - 0.04, pan=-0.3)
place('sfx', S.whoosh(0.45, 300, 2200, 0.9, body=0.9), T['s7'] + 0.04, pan=0.3)
for k in range(5):
    place('sfx', S.taiko(0.14, 80, 0.15, d=0.4), T['s7'] + 0.05 + k * 0.17, pan=(-1) ** k * 0.3)
# melee
place('sfx', S.metal_clash(1.0, 1.0, 1.6, 2.4), HIT1)
place('sfx', S.boom(0.5, 2.0, 55), HIT1)
gd = 0.42
fc = 3200 + 900 * np.sin(2 * np.pi * 3.1 * tt(gd)) + 500 * np.sin(2 * np.pi * 11 * tt(gd))
place('sfx', (svf(noise(gd), fc, 6.0, 'bp') * 0.5 + S.ticks(gd, 80, 0.5)) * np.sin(np.pi * tt(gd) / gd) ** 0.4 * 0.35, HIT1 + 0.12)
for sp in EV['sparks'][1:4]:
    place('sfx', S.metal_clash(0.25, rng.uniform(1.3, 1.6), 0.4, 0.8), sp['t'], pan=rng.uniform(-0.2, 0.2))
place('sfx', S.whoosh(0.3, 250, 1500, 0.9, body=1.0), T['hOver'] - 0.1, pan=0.2)
place('sfx', S.splash(0.6, 0.5), T['hOver'] + 0.06, pan=0.1)
place('sfx', S.whoosh(0.28, 700, 5200, 0.8, tone=0.35), T['hUp'] - 0.1, pan=-0.2)
place('sfx', S.metal_clash(0.8, 1.1, 0.9, 1.6), T['clash2'], pan=0.05)
place('sfx', S.whoosh(0.3, 250, 1700, 0.9, body=1.0), T['hSweep'] - 0.1, pan=0.2)
place('sfx', S.whoosh(0.34, 600, 5600, 0.9, tone=0.4), T['hSpin'] - 0.1, pan=-0.1)
place('sfx', S.metal_clash(0.95, 0.9, 1.2, 2.0), T['clash3'], pan=0.1)
place('sfx', S.boom(0.3, 1.2, 60), T['clash3'])
# crows vs. the flurry
place('sfx', S.whoosh(0.3, 300, 2000, 0.7, body=0.8), T['crows'] - 0.08, pan=0.4)
place('sfx', flaps(1.1, 13, 0.9), T['crows'] + 0.05, pan=0.1)
for k in range(8):
    place('sfx', caw(0.26, rng.uniform(380, 560), 0.45), T['crows'] + 0.1 + k * 0.09, pan=rng.uniform(-0.3, 0.5))
for i, f in enumerate(FL):
    place('sfx', S.whoosh(0.16, 900, 7000, 0.75, tone=0.3), f - 0.07, pan=-0.3 + 0.1 * (i % 3))
    place('sfx', S.splash(0.35, 0.45), f + 0.02, pan=-0.2)
    place('sfx', S.bell(96 + (i % 3) * 3, 0.5, 0.18), f, pan=-0.3)
# gather, slam, wave, leap
gt = tt(0.45)
place('sfx', svf(noise(0.45), 200 + 900 * gt / 0.45, 3.0, 'bp') * (gt / 0.45) ** 1.5 * (1 + 0.5 * np.sin(2 * np.pi * 14 * gt)) * 0.7, T['s10'] + 0.02, pan=0.3)
place('sfx', S.boom(0.9, 3.0, 46), T['slam'], pan=0.2)
place('sfx', S.splash(0.9, 0.9), T['slam'] + 0.02, pan=0.2)
wd = 1.0
wt = tt(wd)
wave = (lp(noise(wd), 500, 4) * 2.2 + bp(noise(wd), 500, 2600) * 0.6) * np.clip(wt / 0.12, 0, 1) * np.clip((wd - wt) / 0.45, 0, 1) * (1 + 0.3 * np.sin(2 * np.pi * 17 * wt))
pan_l = np.clip(0.75 - wt / wd * 1.2, 0.1, 1.0)
place('sfx', np.stack([wave * (1 - pan_l * 0.6), wave * pan_l]) * 0.55, T['slam'] + 0.03)
place('sfx', S.whoosh(0.5, 500, 4500, 0.8, tone=0.3), T['jump'] - 0.03, pan=-0.2)
# the moon clash + the fall
place('sfx', S.whoosh(0.6, 300, 3000, 0.7, tone=0.3), T['s11'] + 0.1, pan=-0.3)
place('sfx', S.whoosh(0.6, 250, 2200, 0.7, body=0.7), T['s11'] + 0.15, pan=0.3)
place('sfx', S.metal_clash(1.0, 0.85, 2.0, 2.6), AIR)
place('sfx', S.boom(0.6, 2.0, 50), AIR)
tf_ = tt(0.9)
place('sfx', svf(noise(0.9), 3000 * np.exp(-tf_ * 2.5) + 200, 1.5, 'bp') * np.sin(np.pi * tf_ / 0.9) * 0.8, AIR + 0.25, pan=-0.4)
# crash, landing, footsteps dragging the blade
place('sfx', S.boom(1.0, 2.5, 44), T['crash'], pan=-0.3)
place('sfx', lp(noise(0.6), 900) * expdec(0.6, 0.15) * 0.8, T['crash'], pan=-0.3)
place('sfx', S.taiko(0.5, 60, 0.3, d=0.7), T['rLand'], pan=0.3)
place('sfx', lp(noise(0.4), 700) * expdec(0.4, 0.1) * 0.5, T['rLand'], pan=0.3)
step = T['rLand'] + 0.6
while step < T['s13']:
    place('sfx', S.taiko(0.18, 70, 0.12, d=0.35), step, pan=0.25)
    step += 0.34
place('sfx', scrape(T['s13'] - T['rLand'] - 0.6, 0.18), T['rLand'] + 0.6, pan=0.25)
# power-up hum
pd = T['s14'] - T['rise']
pt = tt(pd)
place('sfx', lp(saw(98 * (1 + 0.3 * pt / pd), pd) + 0.6 * saw(147 * (1 + 0.3 * pt / pd), pd), 1500) * (pt / pd) ** 1.5 * 0.12, T['rise'])
place('sfx', S.whoosh(0.4, 900, 8000, 0.9, tone=0.4), T['s13b'] - 0.05)
# the dragon roars; the final charge
rd = T['s15'] - T['s14']
rt = tt(rd)
roar = (lp(saw(55 * (1 + 0.15 * np.sin(2 * np.pi * 7 * rt)), rd) + 0.8 * noise(rd), 700) * np.clip(rt / 0.2, 0, 1) * np.clip((rd - rt) / 0.2, 0, 1)) * 0.5
place('sfx', roar, T['s14'], pan=0.3)
place('sfx', S.whoosh(0.5, 400, 4000, 0.9, body=0.6), T['s15'] - 0.45, pan=-0.2)
# the cut
t_r = tt(2.6)
ring = np.zeros_like(t_r)
for f, a, dec in ((3520, 1.0, 1.3), (5280, 0.6, 0.9), (7040, 0.4, 0.6), (1760, 0.5, 1.5)):
    ring += a * np.sin(2 * np.pi * f * t_r) * np.exp(-t_r / dec)
place('sfx', S.whoosh(0.16, 2500, 11000, 1.0), T['s15'] - 0.02)
place('sfx', ring * 0.11, T['s15'] + 0.02)
place('sfx', S.metal_clash(0.9, 1.3, 1.4, 2.2), T['cut'])
place('sfx', S.boom(0.8, 2.4, 40), T['cut'])
# ink rain
place('sfx', S.ticks(1.4, 60, 0.15, 800, 4000), T['cut'] + 0.4)
# the mask cracks and splits
for i, dt in enumerate((0.0, 0.05, 0.09, 0.14, 0.18)):
    place('sfx', (hp(noise(0.08), 2500) * expdec(0.08, 0.012) + sine(1900 + i * 260, 0.08) * expdec(0.08, 0.02) * 0.5) * (0.4 + 0.1 * i), T['crack'] + dt, pan=rng.uniform(-0.2, 0.2))
place('sfx', S.shatter(1.4, 0.55), T['split'])
place('sfx', S.taiko(0.6, 70, 0.3, d=0.8), T['split'])
place('sfx', S.bell(89, 1.5, 0.4), T['split'])
# he scatters into crows; she flicks the blade clean and sheathes it
place('sfx', flaps(1.6, 10, 0.6), T['s18'] + 0.15, pan=-0.3)
for k in range(4):
    place('sfx', caw(0.3, rng.uniform(360, 480), 0.35), T['s18'] + 0.3 + k * 0.3, pan=rng.uniform(-0.6, 0.0))
place('sfx', S.whoosh(0.2, 1200, 7000, 0.6), T['flick'] - 0.06, pan=0.3)
place('sfx', drag_out(T['click'] - T['sheatheA'] - 0.06, 0.35), T['sheatheA'] + 0.06, pan=0.3)
place('sfx', koiguchi(1.2), T['click'], pan=0.3)

# ------------------------------------------------------------------ mix
music, sfx, amb = mx.bus('music'), mx.bus('sfx'), mx.bus('amb')
# dead air right before the big hits; a hush at the moment of the cut
duck_pts = [(0, 1)]
for h in (HIT1, AIR):
    duck_pts += [(h - F2 - 0.01, 1), (h - F2, 0.0), (h - 0.005, 0.0), (h, 1)]
duck_pts += [(T['s15'] - 0.01, 1), (T['s15'], 0.25), (T['cut'] - 0.005, 0.25), (T['cut'], 1), (DUR, 1)]
music *= mx.curve(duck_pts)
sfx *= mx.curve([(0, 1)] + [p for h in (HIT1, AIR) for p in ((h - F2 - 0.01, 1), (h - F2, 0.0), (h - 0.005, 0.0), (h, 1))] + [(DUR, 1)])
amb *= mx.curve([(0, 0), (0.5, 1), (T['s4'], 1), (T['s4'] + 0.05, 0.35), (T['s7'], 0.35), (T['s7'] + 0.1, 0.9), (T['s16'], 0.9), (T['s16'] + 0.3, 1.2), (DUR - 0.5, 1.0), (DUR, 0.2)])
wet = S.convolve(music * 0.4 + sfx * 0.28, S.reverb_ir(2.6, 0.6)) * 0.55
mix = music * 0.85 + sfx * 1.0 + amb * 0.9 + wet
mix *= mx.curve([(0, 0), (0.25, 1), (DUR - 0.45, 1), (DUR, 0)])
os.makedirs(os.path.join(ROOT, 'output'), exist_ok=True)
out = os.path.join(ROOT, 'output', 'aurora_blade_30s.wav')
rms = S.master(mix, out, drive=1.3)
print('wrote', out, f'{DUR:.1f}s rms {rms:.3f}')
