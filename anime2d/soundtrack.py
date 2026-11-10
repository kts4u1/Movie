"""Original score + sound effects for AURORA BLADE, synced to anime2d/events.json.

    python3 anime2d/soundtrack.py  ->  output/aurora_blade.wav
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
DUR = T['end']
mx = S.Mix(DUR)
rng = np.random.default_rng(3)
N = mx.n

# ------------------------------------------------------------------ ambience: wind over tall grass
wind = svf(noise(DUR), 320 + 220 * np.sin(2 * np.pi * 0.11 * np.arange(N) / SR) + 260 * np.exp(-((np.arange(N) / SR - 0.8) ** 2) / 0.12), 1.3, 'bp') * 0.16
rustle = hp(noise(DUR), 3500) * (0.02 + 0.03 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.23 * np.arange(N) / SR + 1)) + 0.07 * np.exp(-((np.arange(N) / SR - 0.85) ** 2) / 0.1))
mx.bus('amb')[0] += wind + rustle
mx.bus('amb')[1] += wind + np.roll(rustle, 2400)

# ------------------------------------------------------------------ music
# in-scale on D: D Eb G A Bb
D3, Eb3, G3, A3, Bb3, D4, Eb4, G4, A4, Bb4, D5, Eb5, G5 = 50, 51, 55, 57, 58, 62, 63, 67, 69, 70, 74, 75, 79
# opening: drone + lone flute + two string notes
mx.place('music', S.pad([38, 45], 4.6, gain=0.4, cutoff=420, attack=1.2, release=0.5), 0.0)
mx.place('music', S.flute(D5, 1.35, 0.5, scoop=0.05), 0.25, pan=-0.1)
mx.place('music', S.flute(Eb5, 0.35, 0.4), 1.5, pan=-0.1)
mx.place('music', S.pluck(D3, 2.2, 0.8, bright=0.4), 0.05, pan=0.2)
mx.place('music', S.pluck(A3, 1.6, 0.6, bright=0.4), 1.75, pan=-0.2)
# her eyes open: a bright chime answer
mx.place('music', S.bell(86, 1.6, 0.5), T['eyesOpen'], pan=-0.2)
mx.place('music', S.pluck(D4, 1.4, 0.6, bright=0.8), T['eyesOpen'], pan=0.1)
mx.place('music', S.shimmer(0.8, 0.9), 2.3)
mx.place('music', S.bell(93, 1.2, 0.5), 2.5, pan=0.2)
# the mask: low minor-second threat
mx.place('music', S.pad([38, 39, 46], 0.95, gain=0.6, cutoff=600, attack=0.15, release=0.25), T['s3'])
mx.place('music', S.taiko(1.0, 50, 0.7), T['eyeIgnite'])
mx.place('music', S.braam([26, 38, 39], 0.9, 0.55, bright=1500), T['eyeIgnite'])
# stance: tension rises
mx.place('music', S.pad([38, 45, 50, 57], 1.0, gain=0.45, cutoff=1000, attack=0.4, release=0.15), T['s4'])
mx.place('music', S.riser(0.86, 0.3, 300, 5000), T['s4'] + 0.02)
for k in range(14):
    mx.place('music', S.rim(0.12 + 0.3 * k / 13), T['bladeIgnite'] + 0.05 + k * (0.42 / 14), pan=rng.uniform(-0.3, 0.3))
# dash + fight groove: 150 bpm
BEAT = 0.4
RIFF = [D4, A4, Bb4, A4, D4, G4, A4, G4, D4, Eb4, G4, Eb4, D4, A4, D5, Bb4]


def groove(t0, t1, gain=1.0, riff=True):
    k = 0
    t = t0
    while t < t1 - 1e-6:
        if k % 4 == 0:
            mx.place('music', S.taiko(0.8 * gain if k % 8 == 0 else 0.55 * gain), t)
        if k % 4 == 2:
            mx.place('music', S.tom(0.4 * gain, 150), t, pan=0.3)
        if k % 2 == 1:
            mx.place('music', S.rim(0.22 * gain), t, pan=-0.3)
        if riff:
            mx.place('music', S.pluck(RIFF[k % 16], 0.5, 0.5 * gain, bright=0.75, buzz=0.3), t, pan=-0.2 if k % 2 else 0.2)
            if k % 4 == 0:
                mx.place('music', S.pluck(RIFF[k % 16] - 24, 0.6, 0.6 * gain, bright=0.3), t)
        t += BEAT / 4
        k += 1


mx.place('music', S.taiko(1.2, 52, 0.7), T['s5a'])
groove(T['s5a'], T['clash1'] - 0.02, 0.9)
mx.place('music', S.pad([38, 50, 53, 57], T['clash1'] - T['s5a'], gain=0.4, cutoff=1300, attack=0.05, release=0.1), T['s5a'])
# the clash: two frames of silence, then the hit
HIT1 = T['clash1'] + 2 / 24
mx.place('music', S.taiko(1.5, 46, 0.9), HIT1)
mx.place('music', S.braam([38, 45, 50, 53], 1.3, 0.7), HIT1)
mx.place('music', S.pad([38, 45, 51], 0.5, gain=0.5, cutoff=800, attack=0.1, release=0.15), 5.55)
groove(6.0, 7.4, 1.0)
for (ch, t0, t1) in (([38, 50, 53, 57], 6.0, 6.45), ([34, 46, 50, 53], 6.45, 6.95), ([31, 43, 50, 55], 6.95, 7.4)):
    mx.place('music', S.pad(ch, t1 - t0 + 0.2, gain=0.42, cutoff=1300, attack=0.05, release=0.25), t0)
# ink gathers: everything drops to a dark swell
mx.place('music', S.pad([26, 38, 39, 44], 0.7, gain=0.7, cutoff=700, attack=0.3, release=0.1), T['s6b'])
mx.place('music', S.riser(0.55, 0.4, 120, 1800), T['s6b'] + 0.02)
for k in range(10):
    mx.place('music', S.tom(0.15 + 0.4 * k / 9, 70 + k * 3), 7.5 + k * 0.045)
mx.place('music', S.taiko(1.5, 44, 1.0), T['slam'])
mx.place('music', S.braam([26, 33, 38, 39], 1.2, 0.8, bright=1900), T['slam'])
groove(8.0 + BEAT / 2, 8.85, 0.8, riff=False)
mx.place('music', S.reverse_swell(0.45, 0.3), T['s8'] - 0.47)
# the moon: weightless
mx.place('music', S.choir([62, 69, 74, 77], 1.6, gain=1.0, attack=0.35, release=0.3), T['s8'])
mx.place('music', S.shimmer(1.45, 1.0), T['s8'] + 0.1)
mx.place('music', S.flute(A4 + 12, 0.9, 0.35, scoop=0.03), 9.25, pan=0.15)
mx.place('music', S.bell(98, 1.0, 0.5), 9.93)
mx.place('music', S.riser(0.2, 0.5, 800, 9000), 10.2)
# the cut
mx.place('music', S.taiko(1.6, 44, 1.1), T['cut'])
mx.place('music', S.braam([26, 38, 45, 50, 57], 1.8, 0.85, open_t=0.05, bright=3200), T['cut'])
# aftermath: one string note in the quiet, then a gentle resolution
mx.place('music', S.pluck(D3, 2.4, 0.7, bright=0.35), 11.45, pan=-0.15)
mx.place('music', S.pluck(A3, 2.0, 0.5, bright=0.35), 12.0, pan=0.15)
ARP = [D4, G4, A4, D5, G5, A4 + 12]
for i, m in enumerate(ARP):
    mx.place('music', S.pluck(m, 1.8, 0.5, bright=0.7), T['s12'] + 0.15 + i * 0.16, pan=(-1) ** i * 0.25)
mx.place('music', S.pad([43, 50, 55, 59, 62], 2.2, gain=0.5, cutoff=1500, attack=0.5, release=0.9), T['s12'])
mx.place('music', S.flute(D5, 0.55, 0.42, scoop=0.04), 13.2, pan=-0.1)
mx.place('music', S.flute(G5, 0.9, 0.42), 13.72, pan=-0.1)
mx.place('music', S.shimmer(1.6, 0.8), 13.3)
# title
mx.place('music', S.taiko(0.9, 52, 0.9), T['title'])
mx.place('music', S.pad([38, 45, 50, 57, 62, 66], 1.05, gain=0.6, cutoff=2200, attack=0.12, release=0.7), T['title'])
mx.place('music', S.bell(86, 1.0, 0.6), T['title'])
mx.place('music', S.pluck(D4, 1.0, 0.6, bright=0.8), T['title'] + 0.05)
mx.place('music', S.pluck(A4, 1.0, 0.5, bright=0.8), T['title'] + 0.17)
mx.place('music', S.pluck(D5, 1.0, 0.5, bright=0.8), T['title'] + 0.29)

# ------------------------------------------------------------------ sound effects
# mask ignition: fire whoomp + growl
t_g = tt(0.7)
mx.place('sfx', (svf(noise(0.7), 400 + 1600 * np.exp(-t_g * 6), 0.8, 'lp') * np.clip(t_g / 0.04, 0, 1) * np.exp(-t_g * 3.5) * 1.6), T['eyeIgnite'], pan=0.1)
mx.place('sfx', lp(saw(47 * (1 + 0.05 * np.sin(2 * np.pi * 9 * t_g)), 0.7), 500) * np.sin(np.pi * t_g / 0.7) * 0.5, T['eyeIgnite'] - 0.15)
# blade ignition: energy swish + chime, then a faint hum while it burns
mx.place('sfx', S.whoosh(0.4, 900, 6000, 0.7, tone=0.4), T['bladeIgnite'] - 0.08, pan=-0.2)
mx.place('sfx', S.bell(91, 1.2, 0.45), T['bladeIgnite'], pan=-0.2)
hum_d = T['flick'] + 0.4 - T['bladeIgnite']
hum = lp(saw(98 * (1 + 0.008 * np.sin(2 * np.pi * 4.3 * tt(hum_d))), hum_d) + 0.5 * saw(196.4, hum_d), 800) * 0.035
mx.place('sfx', hum * np.clip(tt(hum_d) / 0.2, 0, 1) * np.clip((hum_d - tt(hum_d)) / 0.4, 0, 1), T['bladeIgnite'])
# dashes
mx.place('sfx', S.whoosh(0.5, 500, 3800, 0.9, body=0.5), T['s5a'] - 0.06, pan=-0.3)
mx.place('sfx', S.whoosh(0.45, 300, 2200, 0.9, body=0.9), T['s5b'] - 0.04, pan=0.3)
for k in range(5):
    mx.place('sfx', S.taiko(0.16, 80, 0.15, d=0.4), T['s5a'] + 0.04 + k * (2 / 24) * 2, pan=-0.2)
# first clash
mx.place('sfx', S.metal_clash(1.0, 1.0, 1.6, 2.4), HIT1)
mx.place('sfx', S.boom(0.5, 2.0, 55), HIT1)
# blade lock: grinding + spark ticks
gd = 0.4
fc = 3200 + 900 * np.sin(2 * np.pi * 3.1 * tt(gd)) + 500 * np.sin(2 * np.pi * 11 * tt(gd))
mx.place('sfx', (svf(noise(gd), fc, 6.0, 'bp') * 0.5 + S.ticks(gd, 80, 0.5)) * np.sin(np.pi * tt(gd) / gd) ** 0.4 * 0.35, 5.56)
for sp in EV['sparks'][1:4]:
    mx.place('sfx', S.metal_clash(0.25, rng.uniform(1.3, 1.6), 0.4, 0.8), sp['t'], pan=rng.uniform(-0.2, 0.2))
# exchange: swings and hits
mx.place('sfx', S.whoosh(0.3, 250, 1500, 0.9, body=1.0), T['hOver'] - 0.1, pan=0.2)
mx.place('sfx', S.splash(0.6, 0.5), T['hOver'] + 0.06, pan=0.1)
mx.place('sfx', S.taiko(0.5, 60, 0.3, d=0.7), T['hOver'] + 0.06)
mx.place('sfx', S.whoosh(0.28, 700, 5200, 0.8, tone=0.35), T['hUp'] - 0.1, pan=-0.2)
mx.place('sfx', S.bell(96, 0.6, 0.3), T['hUp'], pan=-0.2)
mx.place('sfx', S.metal_clash(0.8, 1.1, 0.9, 1.6), T['clash2'], pan=0.05)
mx.place('sfx', S.whoosh(0.3, 250, 1700, 0.9, body=1.0), T['hSweep'] - 0.1, pan=0.2)
mx.place('sfx', S.splash(0.5, 0.4), T['hSweep'] + 0.05)
mx.place('sfx', S.whoosh(0.34, 600, 5600, 0.9, tone=0.4), T['hSpin'] - 0.1, pan=-0.1)
mx.place('sfx', S.metal_clash(0.95, 0.9, 1.2, 2.0), T['clash3'], pan=0.1)
mx.place('sfx', S.boom(0.3, 1.2, 60), T['clash3'])
skid = bp(noise(0.4), 300, 2400) * expdec(0.4, 0.18, 0.02) * 0.5
mx.place('sfx', skid, 7.0, pan=0.3)
for td in (6.0, 6.28):
    mx.place('sfx', lp(noise(0.25), 700) * expdec(0.25, 0.07) * 0.35, td)
# ink gathers, slam, wave
gt = tt(0.5)
mx.place('sfx', svf(noise(0.5), 200 + 900 * gt / 0.5, 3.0, 'bp') * (gt / 0.5) ** 1.5 * (1 + 0.5 * np.sin(2 * np.pi * 14 * gt)) * 0.7, 7.45, pan=0.3)
mx.place('sfx', S.boom(0.9, 3.0, 46), T['slam'], pan=0.2)
mx.place('sfx', S.splash(0.9, 0.9), T['slam'] + 0.02, pan=0.2)
wd = 1.0
wt = tt(wd)
wave = (lp(noise(wd), 500, 4) * 2.2 + bp(noise(wd), 500, 2600) * 0.6) * np.clip(wt / 0.12, 0, 1) * np.clip((wd - wt) / 0.45, 0, 1) * (1 + 0.3 * np.sin(2 * np.pi * 17 * wt))
pan_l = np.clip(0.75 - wt / wd * 1.2, 0.1, 1.0)
mx.place('sfx', np.stack([wave * (1 - pan_l * 0.6), wave * pan_l]) * 0.55, T['slam'] + 0.03)
mx.place('sfx', S.whoosh(0.5, 500, 4500, 0.8, tone=0.3), T['jump'] - 0.03, pan=-0.2)
# moon: glints and the charge
mx.place('sfx', S.bell(103, 0.8, 0.3), 9.93)
mx.place('sfx', S.whoosh(0.22, 1500, 9000, 0.9, tone=0.5), 10.3)
# the cut: a piercing ring, the impact, then a long tail
t_r = tt(2.6)
ring = np.zeros_like(t_r)
for f, a, dec in ((3520, 1.0, 1.3), (5280, 0.6, 0.9), (7040, 0.4, 0.6), (1760, 0.5, 1.5)):
    ring += a * np.sin(2 * np.pi * f * t_r) * np.exp(-t_r / dec)
mx.place('sfx', S.whoosh(0.16, 2500, 11000, 1.0), T['s9'] - 0.02)
mx.place('sfx', ring * 0.11, T['s9'] + 0.02)
mx.place('sfx', S.metal_clash(0.9, 1.3, 1.4, 2.2), T['cut'])
mx.place('sfx', S.boom(0.8, 2.4, 40), T['cut'])
# mask cracks and splits
for i, dt in enumerate((0.0, 0.05, 0.09, 0.14, 0.18)):
    mx.place('sfx', (hp(noise(0.08), 2500) * expdec(0.08, 0.012) + sine(1900 + i * 260, 0.08) * expdec(0.08, 0.02) * 0.5) * (0.4 + 0.1 * i), T['crack'] + dt, pan=rng.uniform(-0.2, 0.2))
mx.place('sfx', S.shatter(1.4, 0.55), T['split'])
mx.place('sfx', S.taiko(0.6, 70, 0.3, d=0.8), T['split'])
mx.place('sfx', S.bell(89, 1.5, 0.4), T['split'])
# dissolve: airy release
dd = 1.3
dt_ = tt(dd)
mx.place('sfx', (svf(noise(dd), 600 + 3200 * dt_ / dd, 2.0, 'bp') * 0.5 + S.ticks(dd, 60, 0.12, 3000, 9000)) * np.sin(np.pi * dt_ / dd) * 0.5, 13.0, pan=-0.3)
# blade flick + fade of the light
mx.place('sfx', S.whoosh(0.2, 1200, 7000, 0.6), T['flick'] - 0.06, pan=0.3)
mx.place('sfx', S.bell(98, 0.9, 0.3), T['flick'] + 0.03, pan=0.3)

# ------------------------------------------------------------------ mix
music, sfx, amb = mx.bus('music'), mx.bus('sfx'), mx.bus('amb')
# two frames of dead air before each big hit, and a hush over the moon / aftermath
duck = mx.curve([(0, 1), (T['clash1'] - 0.01, 1), (T['clash1'], 0.0), (HIT1 - 0.005, 0.0), (HIT1, 1), (T['s9'] - 0.01, 1), (T['s9'], 0.25), (T['cut'] - 0.005, 0.25), (T['cut'], 1), (DUR, 1)])
music *= duck
sfx *= mx.curve([(0, 1), (T['clash1'] - 0.01, 1), (T['clash1'], 0.0), (HIT1 - 0.005, 0.0), (HIT1, 1), (DUR, 1)])
amb *= mx.curve([(0, 0), (0.5, 1), (T['s2'], 1), (T['s2'] + 0.05, 0.35), (T['s4'], 0.35), (T['s4'] + 0.1, 0.9), (T['s8'], 0.9), (T['s8'] + 0.1, 0.5), (T['s10'], 0.5), (T['s10'] + 0.3, 1.2), (DUR - 0.5, 1.0), (DUR, 0.2)])
wet = S.convolve(music * 0.4 + sfx * 0.28, S.reverb_ir(2.6, 0.6)) * 0.55
mix = music * 0.85 + sfx * 1.0 + amb * 0.9 + wet
mix *= mx.curve([(0, 0), (0.25, 1), (DUR - 0.45, 1), (DUR, 0)])
os.makedirs(os.path.join(ROOT, 'output'), exist_ok=True)
out = os.path.join(ROOT, 'output', 'aurora_blade.wav')
rms = S.master(mix, out, drive=1.3)
print('wrote', out, f'{DUR:.1f}s rms {rms:.3f}')
