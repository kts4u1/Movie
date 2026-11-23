// AURORA BLADE (30 s) — a 2D sword duel between two original characters:
//   SERA (세라 星羅), the aurora swordswoman, and KOKUYA (흑야 黑夜), the ink demon swordsman.
// window.__renderAt(t) draws the frame at time t (24 fps).
import { Character } from './rig.js';
import { H, R } from './poses.js';
import { Background, PPM } from './bg.js';
import { poseTrack, rootTrack, F } from './anim.js';
import * as FX from './fx.js';
import { drawHeroEyes, drawRivalMask, drawHiltCloseup } from './closeups.js';
import { TAU, clamp, lerp, smoothstep, pulse, RNG, noise1, ease, norm, perp, sub, add, mul } from './util.js';

const params = new URLSearchParams(location.search);
const W = parseInt(params.get('w') || '1920', 10), HH = parseInt(params.get('h') || '1080', 10);
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = HH;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const mk2d = () => { const c = document.createElement('canvas'); c.width = W; c.height = HH; return [c, c.getContext('2d', { willReadFrequently: true })]; };
const [glowC, gctx] = mk2d();
const [tmpC, tctx] = mk2d();
const [tmpGC, tgctx] = mk2d();
const mode = params.get('dbg') || '';
const bg = new Background(W, HH);
const amb = new FX.Ambient();
const S = W / 1920;

const grain = Array.from({ length: 4 }, (_, k) => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), im = g.createImageData(256, 256), r = new RNG(100 + k);
  for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (r.next() - 0.5) * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
});

// ================================================================ timeline (seconds; F(n) = frame n at 24 fps)
export const T = {
  s1: 0,
  s2: F(60), pool: F(62), column: F(70), riseA: F(80), rEye: F(88), card2: F(92),
  s3: F(108), headTurn: F(116), card3: F(134),
  s4: F(154), s5: F(180), s6: F(210), push: F(222), s7: F(234),
  s8: F(254), clash1: F(258),
  s9: F(312), crows: F(318), flurry: F(336),
  s10: F(370), slam: F(381), jump: F(386),
  s11: F(406), airClash: F(426),
  s12: F(452), crash: F(457), rLand: F(462),
  s13: F(500), rise: F(510), s13b: F(538),
  s14: F(560), s15: F(590), cut: F(593), s16: F(612), s17: F(642), crack: F(645), split: F(661),
  s18: F(668), flick: F(676), sheatheA: F(686), click: F(695), title: F(697), end: 30,
};
// the melee and the final cut reuse the 15 s choreography, shifted in time
const r8 = (x) => x - F(127) + T.s8;
const r15 = (x) => x - F(250) + T.s15;
T.clash2 = r8(F(155)); T.clash3 = r8(F(167)); T.hOver = r8(6.215); T.hUp = r8(6.385); T.hSweep = r8(6.66); T.hSpin = r8(6.87);
T.s15b = r15(F(253));

const P = (b, o) => ({ ...b, ...o });
const clashH = P(H.ready, { hip: [0.05, -0.8], lean: 14, armF: [62, 96], sword: 126 });
const lockH = P(clashH, { hip: [0.12, -0.76], lean: 21 });
const clashR = P(R.ready, { hip: [0.05, -0.8], lean: 14, armF: [66, 100], sword: 128 });
const lockR = P(clashR, { hip: [0.12, -0.76], lean: 21 });
const lowDeep = P(H.low, { hip: [-0.12, -0.55], lean: 37 });
const restDown = P(H.rest, { head: 22 });
const mk = (kind, poses, roots, hold = 1) => new Character(kind, { poseAt: poseTrack(poses, hold), rootAt: rootTrack(roots) });
const cycle = (a, b, t0, t1, step) => { const k = []; let i = 0; for (let t = t0; t <= t1 + 1e-6; t += step, i++) k.push({ t, p: i % 2 ? b : a, e: 'linear' }); return k; };
const hx = (c, t) => c.state(t).R.x;

// ---------------- act 1
const s1H = mk('hero', [{ t: 0, p: restDown }], [{ t: 0, x: -2.4, f: 1, wind: 0.45 }, { t: 1.0, x: -2.4, wind: 1.05, dur: 0.35 }, { t: 2.2, x: -2.4, wind: 0.6, dur: 0.7 }]);
const s2R = mk('rival', [{ t: T.s2, p: R.kneel }, { t: T.riseA + 0.32, p: R.kneel }, { t: T.card2 - 0.02, p: R.laugh, dur: 0.25, e: 'out' }],
  [{ t: T.s2, x: 2.4, y: 2.6, f: -1, wind: 0.9 }, { t: T.riseA, x: 2.4, y: 2.6 }, { t: T.card2 - 0.04, x: 2.4, y: 0, dur: 0.38, e: 'out', wind: 1.3 }]);
const s3H = mk('hero', [{ t: T.s3, p: restDown }, { t: T.headTurn + 0.18, p: H.restGrip, dur: 0.22, e: 'out' }], [{ t: T.s3, x: -2.4, f: 1, wind: 0.6 }, { t: T.headTurn + 0.2, x: -2.4, wind: 1.35, dur: 0.25 }]);
// split-screen dash
const s7H = mk('hero', cycle(H.runA, H.runB, T.s7 - 0.1, T.s8 + 0.1, F(2)), [{ t: T.s7, x: -6, f: 1, wind: 1.2 }, { t: T.s8, x: -1.5, e: 'linear' }], 0);
const s7R = mk('rival', cycle(R.runA, R.runB, T.s7 - 0.1, T.s8 + 0.1, F(2)), [{ t: T.s7, x: 6, f: -1, wind: 1.2 }, { t: T.s8, x: 1.5, e: 'linear' }], 0);

// ---------------- act 2: melee (time-shifted 15 s choreography)
const s8H = mk('hero', [
  { t: T.s8, p: H.runA }, { t: r8(5.375), p: H.upWind, dur: 0.06 }, { t: T.clash1, p: clashH, dur: 0.07, e: 'snap' }, { t: r8(5.75), p: lockH, dur: 0.25 },
  { t: r8(6.08), p: H.backstep, dur: 0.14, e: 'out' }, { t: r8(6.17), p: H.ready, dur: 0.08 }, { t: r8(6.3), p: H.backstep, dur: 0.09, e: 'out' },
  { t: r8(6.365), p: H.upWind, dur: 0.05 }, { t: r8(6.445), p: H.upEnd, dur: 0.07, e: 'snap' }, { t: r8(6.6), p: H.ready, dur: 0.12 },
  { t: r8(6.7), p: H.duck, dur: 0.07, e: 'snap' }, { t: r8(6.86), p: H.low, dur: 0.08 }, { t: r8(6.96), p: H.spin, dur: 0.09, e: 'snap' }, { t: r8(7.15), p: H.ready, dur: 0.16 },
], [
  { t: T.s8, x: -3.0, f: 1, wind: 0.9 }, { t: T.clash1, x: -0.62, e: 'linear' }, { t: r8(5.92), x: -0.62 }, { t: r8(6.08), x: -1.75, dur: 0.15, e: 'out' }, { t: r8(6.19), x: -1.75 },
  { t: r8(6.3), x: -2.55, dur: 0.1, e: 'out' }, { t: r8(6.445), x: -1.0, dur: 0.1, e: 'out' }, { t: r8(6.86), x: -1.0 }, { t: r8(6.9), x: -0.85, f: -1, dur: 0.04 }, { t: r8(6.96), x: -0.55, f: 1, dur: 0.06 }, { t: r8(7.5), x: -0.55 },
]);
const s8R = mk('rival', [
  { t: T.s8, p: R.runA }, { t: r8(5.375), p: R.overWind, dur: 0.06 }, { t: T.clash1, p: clashR, dur: 0.07, e: 'snap' }, { t: r8(5.75), p: lockR, dur: 0.25 },
  { t: r8(6.08), p: R.ready, dur: 0.14, e: 'out' }, { t: r8(6.17), p: R.overWind, dur: 0.08 }, { t: r8(6.275), p: R.overEnd, dur: 0.07, e: 'snap' }, { t: r8(6.38), p: R.ready, dur: 0.08 },
  { t: r8(6.445), p: R.block, dur: 0.05 }, { t: r8(6.62), p: R.sweepWind, dur: 0.1 }, { t: r8(6.72), p: R.sweepEnd, dur: 0.07, e: 'snap' }, { t: r8(6.9), p: R.block, dur: 0.08 },
  { t: T.clash3, p: R.knock, dur: 0.05, e: 'snap' }, { t: r8(7.4), p: R.ready, dur: 0.18 },
], [
  { t: T.s8, x: 3.0, f: -1, wind: 0.9 }, { t: T.clash1, x: 0.62, e: 'linear' }, { t: r8(5.92), x: 0.62 }, { t: r8(6.08), x: 1.3, dur: 0.15, e: 'out' }, { t: r8(6.16), x: 1.3 },
  { t: r8(6.275), x: 0.25, dur: 0.1, e: 'out' }, { t: r8(6.445), x: 0.55, dur: 0.06 }, { t: r8(6.62), x: 0.55 }, { t: r8(6.72), x: 0.3, dur: 0.08 }, { t: T.clash3, x: 0.5, dur: 0.05 }, { t: r8(7.36), x: 3.3, dur: 0.4, e: 'out' },
]);
// crows vs. the nebula flurry
const FLURRY = [0, 0.13, 0.26, 0.39, 0.52, 0.66, 0.8].map((d) => T.flurry + d);
const flurryPoses = [H.upEnd, H.downEnd, H.spin, H.upEnd, H.downEnd, H.spin, H.upEnd];
const s9H = mk('hero', [{ t: T.s9, p: H.ready }, { t: T.flurry - 0.12, p: H.low, dur: 0.1 }, ...FLURRY.map((t, i) => ({ t, p: flurryPoses[i], dur: 0.06, e: 'snap' })), { t: T.s10, p: H.ready, dur: 0.2 }],
  [{ t: T.s9, x: -1.9, f: 1, wind: 1.0 }, { t: T.flurry, x: -1.6, dur: 0.1 }]);
const s9R = mk('rival', [{ t: T.s9, p: R.ready }, { t: T.crows - 0.05, p: R.cast, dur: 0.12, e: 'snap' }, { t: T.s10 - 0.2, p: R.ready, dur: 0.3 }], [{ t: T.s9, x: 2.7, f: -1, wind: 1.1 }]);
const ARCS9 = FLURRY.map((t0, i) => ({ t0, dur: 0.05, life: 0.2, cx: -1.0 + (i % 3) * 0.12, cy: -1.15 - (i % 2) * 0.2, rx: 1.0 + (i % 3) * 0.15, ry: i % 3 === 2 ? 0.45 : 1.0 + (i % 3) * 0.15, rot: (i * 37) % 30 - 15, a0: i % 2 ? 120 : -100, a1: i % 2 ? -110 : 110, width: 0.34, style: 'aurora', seed: 20 + i }));
// ink wave + leap
const s10R = mk('rival', [{ t: T.s10, p: R.ready }, { t: T.s10 + 0.22, p: R.gather, dur: 0.16, e: 'out' }, { t: T.slam, p: R.slam, dur: 0.07, e: 'snap' }], [{ t: T.s10, x: 3.3, f: -1, wind: 1.0 }]);
const s10H = mk('hero', [{ t: T.s10, p: H.ready }, { t: T.jump - 0.07, p: lowDeep, dur: 0.1, e: 'out' }, { t: T.jump + 0.07, p: H.jump, dur: 0.07, e: 'snap' }, { t: T.s11, p: H.arch, dur: 0.5 }],
  [{ t: T.s10, x: -1.6, f: 1, wind: 0.8 }, { t: T.jump, x: -1.6 }, { t: T.s11, x: -1.2, y: -4.4, dur: 0.75, e: 'out' }]);
const WAVE = { t0: T.slam + 0.02, x0: 2.0, speed: 13, height: 2.5, len: 6, life: 1.5 };
// clash in front of the moon
const s11H = mk('hero', [{ t: T.s11, p: H.arch }, { t: T.airClash - 0.15, p: H.downWind, dur: 0.2 }, { t: T.airClash, p: H.downEnd, dur: 0.06, e: 'snap' }, { t: T.airClash + 0.25, p: H.fall, dur: 0.12, e: 'out' }],
  [{ t: T.s11, x: -3.4, y: -5.0, f: 1, wind: 0.9, rot: -10 }, { t: T.airClash, x: -0.62, y: -7.35, rot: 8, dur: 0.83, e: 'out' }, { t: T.airClash + 0.12, x: -0.7, y: -7.35, rot: 8 }, { t: T.s12, x: -4.2, y: -4.0, rot: -200, dur: 0.9, e: 'in' }], 0.5);
const s11R = mk('rival', [{ t: T.s11, p: R.runA }, { t: T.airClash - 0.15, p: R.air, dur: 0.2 }, { t: T.airClash, p: R.overEnd, dur: 0.06, e: 'snap' }],
  [{ t: T.s11, x: 3.6, y: -4.8, f: -1, wind: 0.9, rot: 6 }, { t: T.airClash, x: 0.66, y: -7.45, rot: -4, dur: 0.83, e: 'out' }, { t: T.s12, x: 1.6, y: -8.4, rot: -10, dur: 0.9, e: 'out' }], 0.5);
// crash, taunt
const s12H = mk('hero', [{ t: T.s12, p: H.fall }, { t: T.crash, p: H.land, dur: 0.05, e: 'snap' }, { t: T.crash + 0.45, p: H.kneel, dur: 0.3, e: 'out' }],
  [{ t: T.s12, x: -4.4, y: -4.6, f: 1, rot: -170, wind: 0.8 }, { t: T.crash, x: -2.3, y: 0, rot: 0, dur: 0.21, e: 'in' }, { t: T.crash + 0.32, x: -2.8, dur: 0.3, e: 'out' }]);
const s12R = mk('rival', [{ t: T.s12, p: R.air }, { t: T.rLand, p: R.slam, dur: 0.05, e: 'snap' }, { t: T.rLand + 0.35, p: R.idle, dur: 0.3 }, ...cycle(R.walkA, R.walkB, T.rLand + 0.6, T.s13 + 0.4, 0.34)],
  [{ t: T.s12, x: 3.0, y: -4.5, f: -1, wind: 0.9 }, { t: T.rLand, x: 2.9, y: 0, dur: 0.2, e: 'in' }, { t: T.rLand + 0.6, x: 2.9 }, { t: T.s13 + 0.4, x: 1.9, e: 'linear' }]);
// power-up
const s13H = mk('hero', [{ t: T.s13, p: H.kneel }, { t: T.rise, p: H.kneel }, { t: T.rise + 0.45, p: H.high, dur: 0.42, e: 'out' }],
  [{ t: T.s13, x: -2.8, f: 1, wind: 0.5 }, { t: T.rise, x: -2.8, wind: 0.5, lift: 0 }, { t: T.rise + 0.5, x: -2.8, wind: 0.3, lift: 0.75, dur: 0.5 }]);
// final charge
const s14R = mk('rival', [{ t: T.s14, p: R.ready }, { t: T.s14 + 0.25, p: R.dragon, dur: 0.15, e: 'out' }, ...cycle(R.runA, R.runB, T.s14 + 0.5, T.s15, F(2))],
  [{ t: T.s14, x: 3.4, f: -1, wind: 1.0 }, { t: T.s14 + 0.45, x: 3.4 }, { t: T.s15, x: -0.1, e: 'in', wind: 1.4 }], 0);
const s14H = mk('hero', [{ t: T.s14, p: H.high }, { t: T.s14 + 0.35, p: lowDeep, dur: 0.15, e: 'out' }, ...cycle(H.runA, H.runB, T.s14 + 0.6, T.s15, F(2))],
  [{ t: T.s14, x: -3.4, f: 1, wind: 0.7, lift: 0.4 }, { t: T.s14 + 0.55, x: -3.4, lift: 0 }, { t: T.s15, x: -1.0, e: 'in', wind: 1.4 }], 0);
const dragonHead = (tt) => {
  const u = clamp((tt - T.s14) / (T.s15 - T.s14), 0, 1);
  if (u < 0.45) { const k = u / 0.45; return [lerp(5.2, 2.9, k) + Math.sin(k * 6) * 0.2, lerp(-0.6, -3.6, ease.out(k))]; }
  const k = (u - 0.45) / 0.55; return [lerp(2.9, -0.8, ease.in(k)), lerp(-3.6, -1.7, ease.inout(k)) + Math.sin(k * 9) * 0.15];
};

// ---------------- act 3: the cut and the aftermath
const s15H = mk('hero', [{ t: T.s15, p: H.finish }, { t: T.s18 + 0.35, p: H.rise, dur: 0.38 }, { t: T.flick, p: H.chiburi, dur: 0.08, e: 'snap' }, { t: T.sheatheA, p: H.chiburi }, { t: T.sheatheA + 0.06, p: H.sheatheA, dur: 0.06, e: 'snap' }, { t: T.click, p: H.sheatheB, dur: 0.3, e: 'inout' }, { t: T.click + 0.04, p: H.sheathed, dur: 0.04 }, { t: 29.6, p: P(H.sheathed, { head: -30 }), dur: 0.5 }],
  [{ t: T.s15, x: 3.6, f: 1, wind: 0.75 }, { t: r15(12), x: 3.6, wind: 0.45, dur: 0.7 }]);
const s15R = mk('rival', [{ t: T.s15, p: R.guardUp }, { t: r15(11.95), p: R.struck, dur: 0.6 }, { t: T.s18 + 0.2, p: R.kneel, dur: 0.33, e: 'in' }], [{ t: T.s15, x: 0.9, f: -1, wind: 0.75 }, { t: r15(12), x: 0.9, wind: 0.45, dur: 0.7 }]);

// ---------------- effects lists
const ARCS = [
  { t0: T.hOver, dur: 0.06, life: 0.26, cx: 0.6, cy: -1.3, rx: 1.95, ry: 1.95, rot: 0, a0: -55, a1: -215, width: 0.55, style: 'ink', seed: 2 },
  { t0: T.hUp, dur: 0.06, life: 0.28, cx: -1.1, cy: -1.15, rx: 1.35, ry: 1.35, rot: 0, a0: 105, a1: -100, width: 0.4, style: 'aurora', seed: 3 },
  { t0: T.hSweep, dur: 0.06, life: 0.24, cx: 0.2, cy: -1.02, rx: 2.1, ry: 0.5, rot: -4, a0: -25, a1: 205, width: 0.5, style: 'ink', seed: 5 },
  { t0: T.hSpin, dur: 0.09, life: 0.3, cx: -0.6, cy: -1.0, rx: 1.55, ry: 0.5, rot: 3, a0: 190, a1: -150, width: 0.42, style: 'aurora', seed: 7 },
];
const FLICK = { t0: T.flick, dur: 0.05, life: 0.3, cx: 3.75, cy: -0.95, rx: 0.9, ry: 0.9, rot: 0, a0: -20, a1: 75, width: 0.16, style: 'aurora', seed: 9 };
const SPARKS = [
  { t0: T.clash1 + F(2), x: 0, y: -1.5, size: 1.5, seed: 1, count: 26 },
  { t0: r8(5.66), x: 0.02, y: -1.47, size: 0.4, seed: 4, count: 8 }, { t0: r8(5.79), x: -0.02, y: -1.45, size: 0.45, seed: 5, count: 8 }, { t0: r8(5.9), x: 0, y: -1.46, size: 0.5, seed: 6, count: 9 },
  { t0: T.clash2, x: -0.05, y: -1.75, size: 1.0, seed: 2, count: 18, color: '#9ff5e6' },
  { t0: T.clash3, x: 0.15, y: -1.15, size: 1.3, seed: 3, count: 22, color: '#9ff5e6' },
];
const DUSTS = [
  { t0: T.s8 + 0.02, x: -2.6, dir: -1, size: 1 }, { t0: T.s8 + 0.02, x: 2.6, dir: 1, size: 1 }, { t0: T.clash1 + F(2), x: 0, dir: 0, size: 1.5, n: 9 },
  { t0: r8(6.0), x: -1.3, dir: 1, size: 1 }, { t0: r8(6.0), x: 1.0, dir: -1, size: 1 }, { t0: r8(6.27), x: -2.5, dir: 1, size: 0.9 }, { t0: r8(6.28), x: 0.1, dir: -1, size: 1.3, n: 8 },
  { t0: r8(6.44), x: -1.2, dir: -1, size: 0.9 }, { t0: r8(7.0), x: 0.9, dir: -1, size: 1.2 }, { t0: r8(7.1), x: 1.8, dir: -1, size: 1.2 }, { t0: r8(7.2), x: 2.6, dir: -1, size: 1.1 }, { t0: r8(7.3), x: 3.1, dir: -1, size: 0.9 },
];
const SHAKES = [
  { t: T.clash1, a: 0.16, d: 7 }, { t: T.hOver + 0.06, a: 0.08, d: 9 }, { t: T.clash2, a: 0.07, d: 10 }, { t: T.clash3, a: 0.12, d: 8 },
  ...FLURRY.map((t) => ({ t, a: 0.035, d: 12 })), { t: T.slam, a: 0.22, d: 5 }, { t: T.airClash, a: 0.25, d: 5 }, { t: T.crash, a: 0.3, d: 5 }, { t: T.rLand, a: 0.14, d: 7 },
  { t: T.rise + 0.45, a: 0.05, d: 4 }, { t: T.s15b, a: 0.2, d: 6 },
];
// crows: each one is cut by the first flurry stroke after it reaches her
const crowCut = (i, rr) => { const arrive = T.crows + 0.05 + (i / 22) * 0.6 + 0.62; let c = FLURRY.find((f) => f >= arrive - 0.06); return c ?? FLURRY[FLURRY.length - 1]; };
const CALLOUTS = [
  { t0: T.crows - 0.18, dur: 0.62, text: '먹의 형 · 까마귀 떼', sub: '墨之型 · 鴉群', x: 1300, y: 190, colA: '#ff5a78', colB: '#9a0c26', swash: '#120a10', from: 1, rot: -0.05 },
  { t0: T.flurry - 0.12, dur: 0.95, text: '극광류 제2형 · 성운난무', sub: '極光流 第二型 · 星雲亂舞', x: 660, y: 215, colA: '#5ff2dc', colB: '#8d68ff', swash: '#0d1440', from: -1, rot: -0.05 },
  { t0: T.s14 + 0.05, dur: 0.95, text: '먹의 형 · 흑룡', sub: '墨之型 · 黑龍', x: 1290, y: 200, colA: '#ff5a78', colB: '#9a0c26', swash: '#120a10', from: 1, rot: -0.06, size: 116 },
];
const ULT = { t0: T.s13b + 0.12, dur: 0.8, text: '극광류 오의 · 북극일섬', sub: '極光流 奧義 · 北極一閃', x: 960, y: 860, colA: '#5ff2dc', colB: '#a46bff', swash: '#0a1036', from: -1, rot: -0.04, size: 112 };
const SUBS = [
  { t0: T.s4 + 0.12, dur: 0.98, who: '흑야', whoCol: '#ff7088', text: '달 밝은 밤이군… 그 빛, 먹으로 덮어주마.' },
  { t0: T.s5 + 0.15, dur: 1.05, who: '세라', whoCol: '#7ff5e6', text: '그 먹, 남김없이 베어주지.' },
  { t0: T.rLand + 0.55, dur: 1.15, who: '흑야', whoCol: '#ff7088', text: '빛이 꺼져가는구나.' },
  { t0: T.s13 + 0.12, dur: 0.95, who: '세라', whoCol: '#7ff5e6', text: '…아니. 이제부터다.' },
];
const subsAt = (t) => { for (const s of SUBS) FX.subtitle(ctx, W, HH, t, s); };

// ================================================================ frame plumbing
const stepT = (t, ones) => Math.floor(t * (ones ? 24 : 12) + 1e-4) / (ones ? 24 : 12);
const frameOf = (t) => Math.floor(t * 24 + 1e-4);
function beginFrame() {
  for (const c of [ctx, gctx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; }
  gctx.fillStyle = '#000'; gctx.fillRect(0, 0, W, HH);
}
function post(t, o = {}) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  if (!o.noBloom) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.filter = `blur(${22 * S}px)`; ctx.globalAlpha = (o.bloom ?? 1) * 0.85; ctx.drawImage(glowC, 0, 0);
    ctx.filter = `blur(${6 * S}px)`; ctx.globalAlpha = (o.bloom ?? 1) * 0.6; ctx.drawImage(glowC, 0, 0);
    ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  if (o.tint) { ctx.fillStyle = o.tint; ctx.fillRect(0, 0, W, HH); }
  if (!o.noVignette) {
    const vg = ctx.createRadialGradient(W / 2, HH / 2, HH * 0.45, W / 2, HH / 2, HH * 1.05);
    vg.addColorStop(0, 'rgba(4,6,24,0)'); vg.addColorStop(1, 'rgba(4,6,24,0.6)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, HH);
  }
  if (o.flash) { ctx.fillStyle = `rgba(${o.flashCol || '255,255,255'},${o.flash})`; ctx.fillRect(0, 0, W, HH); }
  ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.15;
  ctx.fillStyle = ctx.createPattern(grain[frameOf(t) % 4], 'repeat'); ctx.fillRect(0, 0, W, HH);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  if (o.fade) { ctx.fillStyle = `rgba(0,0,0,${o.fade})`; ctx.fillRect(0, 0, W, HH); }
}
function shakeCam(cam, t) {
  const f = frameOf(t);
  for (const s of SHAKES) {
    const age = t - s.t;
    if (age < 0 || age > 0.9 || !s.a) continue;
    const k = s.a * Math.exp(-age * s.d);
    cam.x += noise1(f * 3.7 + s.t, 1) * k; cam.y += noise1(f * 4.3 + s.t, 2) * k; cam.rot = (cam.rot || 0) + noise1(f * 5.1 + s.t, 3) * k * 0.12;
  }
  return cam;
}
const wld = (cam) => { bg.ground(ctx, cam, 1); bg.ground(gctx, cam, 1); };
const toScreen = (cam, p) => { const Z = cam.zoom * PPM * S; return [W / 2 + (p[0] - cam.x) * Z, HH / 2 + (p[1] - cam.y) * Z]; };
function drawChar(c, cam, t, o = {}) {
  const clip = (cc) => { if (o.clipY == null) return; cc.save(); cc.beginPath(); cc.rect(-60, -60, 120, 60 + o.clipY); cc.clip(); };
  const unclip = (cc) => { if (o.clipY != null) cc.restore(); };
  bg.ground(ctx, cam, 1); clip(ctx); c.draw(ctx, t, o);
  if (o.shade) c.draw(ctx, t, { ...o, sil: o.shadeCol || '#0a1236', alpha: o.shade });
  unclip(ctx);
  bg.ground(gctx, cam, 1); clip(gctx); c.draw(gctx, t, { ...o, sil: '#000' }); unclip(gctx);
  // emissive parts
  const st = c.state(t);
  const g = c.toWorld(st.R, st.J.guard), tip = c.toWorld(st.R, st.J.tip);
  wld(cam);
  if (c.kind === 'hero') FX.bladeGlow(ctx, gctx, g, tip, 'aurora', o.glow ?? 0, 0.055);
  else {
    FX.bladeGlow(ctx, gctx, g, tip, 'ink', (o.glow ?? 0.5) * 0.6, 0.04);
    const hd = c.toWorld(st.R, add(st.J.headC, [0.1, -0.01]));
    gctx.fillStyle = `rgba(255,40,80,${o.eye ?? 1})`; gctx.beginPath(); gctx.arc(hd[0], hd[1], 0.045, 0, TAU); gctx.fill();
  }
}
// standard layered scene
function scene(t, cam, o) {
  beginFrame();
  bg.drawBack(ctx, gctx, cam, t, o.bg || {});
  if (o.pre) o.pre();
  amb.draw(ctx, gctx, bg, cam, t, { wind: o.wind || 1 });
  wld(cam); if (o.behind) o.behind();
  for (const [c, tc, co] of o.chars || []) drawChar(c, cam, tc, co);
  wld(cam); if (o.front) o.front();
  bg.drawFront(ctx, cam, t, o.bg || {});
  if (o.over) o.over();
}
const heroTrail = (c, t, o) => FX.ribbonTrail(ctx, gctx, t, (tt) => [c.joint(tt, 'tip'), c.joint(tt, 'guard')], o);
function impactFrame(t, cam, inv, chars, extra) {
  beginFrame();
  ctx.fillStyle = inv ? '#05060f' : '#f7fbff'; ctx.fillRect(0, 0, W, HH);
  const f = toScreen(cam, extra.focus);
  FX.focusLines(ctx, W, HH, t, { fx: f[0], fy: f[1], color: inv ? '#f7fbff' : '#05060f', n: 64, inner: 0.24, width: 1.3 });
  bg.ground(ctx, cam, 1);
  for (const [c, tc] of chars) c.draw(ctx, tc, { sil: inv ? '#f7fbff' : '#05060f' });
  bg.ground(ctx, cam, 1);
  if (extra.draw) extra.draw(inv);
}
function screenCut(p0, p1, d, gap) {
  tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'copy'; tctx.drawImage(canvas, 0, 0); tctx.globalCompositeOperation = 'source-over';
  const dir = norm(sub(p1, p0)), n = perp(dir), far = 5000;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tmpC, 0, 0);
  for (const s of [1, -1]) {
    ctx.save(); ctx.beginPath();
    const a = add(p0, mul(dir, -far)), b = add(p1, mul(dir, far));
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(b[0] + n[0] * s * far, b[1] + n[1] * s * far); ctx.lineTo(a[0] + n[0] * s * far, a[1] + n[1] * s * far); ctx.closePath(); ctx.clip();
    ctx.drawImage(tmpC, dir[0] * d * s, dir[1] * d * s);
    ctx.restore();
  }
  // the cut itself
  ctx.lineCap = 'butt';
  for (const [w, col] of [[gap * 5, 'rgba(90,255,225,0.55)'], [gap * 1.6, '#ffffff']]) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(p0[0] - dir[0] * far, p0[1] - dir[1] * far); ctx.lineTo(p1[0] + dir[0] * far, p1[1] + dir[1] * far); ctx.stroke(); }
}
function title(t) {
  const k = smoothstep(T.title, T.title + 0.45, t);
  if (k <= 0) return;
  ctx.setTransform(S, 0, 0, S, 0, 0);
  for (const c of [ctx, gctx]) { c.textAlign = 'center'; c.textBaseline = 'middle'; }
  const sc = lerp(1.06, 1.0, k), TY = 300, TX = 760;
  ctx.save(); ctx.translate(TX, TY); ctx.scale(sc, sc);
  for (const [c, a] of [[gctx, 0], [ctx, 1]]) {
    if (c === gctx) { gctx.setTransform(S * sc, 0, 0, S * sc, TX * S, TY * S); }
    c.font = '800 132px "Inter Display", "Inter", sans-serif';
    try { c.letterSpacing = '30px'; } catch (e) { /* older engines */ }
    const g = c.createLinearGradient(-620, 0, 620, 0);
    g.addColorStop(0, `rgba(90,255,220,${k})`); g.addColorStop(0.5, `rgba(240,250,255,${k})`); g.addColorStop(1, `rgba(190,120,255,${k})`);
    c.fillStyle = g; c.fillText('AURORA BLADE', 15, 0);
    c.font = '700 54px "WenQuanYi Zen Hei", sans-serif';
    try { c.letterSpacing = '42px'; } catch (e) { /* older engines */ }
    c.fillStyle = `rgba(235,242,255,${k * (c === gctx ? 0.5 : 0.95)})`; c.fillText('오로라의 검', 21, 118);
    try { c.letterSpacing = '0px'; } catch (e) { /* older engines */ }
  }
  const lw = 520 * smoothstep(T.title + 0.1, T.title + 0.6, t);
  const lg = ctx.createLinearGradient(-lw, 0, lw, 0); lg.addColorStop(0, 'rgba(90,255,220,0)'); lg.addColorStop(0.5, `rgba(255,255,255,${k})`); lg.addColorStop(1, 'rgba(190,120,255,0)');
  ctx.fillStyle = lg; ctx.fillRect(-lw, 64, lw * 2, 3);
  ctx.restore();
}

// ================================================================ shots
const freezeAt = (t, tf) => (t >= tf ? tf : t);
// S1 — the field, the moon, crows crossing; Sera waits alone
function shot1(t) {
  const u = t / T.s2;
  const cam = { x: lerp(-0.9, -0.3, ease.inout(u)), y: lerp(-1.55, -1.4, u), zoom: lerp(0.46, 0.55, ease.out(u)), rot: 0, eye: -1.0 };
  const gust = pulse(t, 0.8, 1.35, 0.3, 0.7) * 0.75;
  scene(t, cam, {
    bg: { gust, wave: (x) => 0.35 * Math.exp(-((x - (9 - t * 12)) ** 2) / 6) },
    chars: [[s1H, stepT(t), { glow: 0, expr: 'closed' }]],
    front: () => FX.inkCrows(ctx, gctx, t, { seed: 4, n: 9, t0: 0.2, stagger: 1.2, dur: 2.6, size: 1.6, bend: 0.6, from: (i, rr) => [7.5 + rr.range(0, 2), -3.8 - rr.range(0, 1.4)], to: (i, rr) => [-8, -4.6 - rr.range(0, 1.2)] }),
  });
  post(t, { fade: 1 - smoothstep(0, 0.7, t) });
}
// S2 — an ink pool, a pillar of ink, crows, and Kokuya rises; name card
function shot2(t) {
  const tf = freezeAt(t, T.card2 + 0.04), tq = stepT(tf, true);
  const u = (t - T.s2) / (T.s3 - T.s2);
  const cam = shakeCam({ x: 2.25, y: lerp(-1.55, -1.45, u), zoom: lerp(0.86, 0.98, ease.out(u)), rot: 0.03, eye: -0.55 }, tf);
  const eye = smoothstep(T.rEye, T.rEye + 0.06, tf);
  scene(tf, cam, {
    bg: { moon: { x: 1.0, y: -2.6, r: 1.25 }, gust: -0.4, wave: (x) => -0.5 * smoothstep(T.column, T.column + 0.2, tf) * Math.exp(-((x - 2.4) ** 2) / 3) }, wind: -1.4,
    behind: () => FX.inkColumn(ctx, gctx, tf, { t0: T.pool, t1: T.column, x: 2.4, r: 1.15, h: 4.4 }),
    chars: [[s2R, tq, { glow: 0.3 + eye, eye, clipY: 0.02, shade: 1 - smoothstep(T.riseA + 0.15, T.card2, tf), shadeCol: '#07050a' }]],
    front: () => FX.inkCrows(ctx, gctx, tf, { seed: 8, n: 22, t0: T.column + 0.08, stagger: 0.45, dur: 1.0, size: 1.2, bend: 0.9, from: (i, rr) => [2.4 + rr.range(-0.3, 0.3), -rr.range(0.5, 3.8)], to: (i, rr) => [2.4 + rr.range(-6, 3), -rr.range(3.5, 6.5)] }),
  });
  post(tf, { bloom: 1.1, flash: pulse(tf, T.rEye, T.rEye + 0.02, 0.005, 0.12) * 0.4, flashCol: '255,60,90' });
  FX.nameCard(ctx, gctx, W, HH, t, { t0: T.card2, name: '흑야', hanja: '黑夜', title: '먹의 귀검사 · 墨之鬼劍士', tone: '#c0122f', shade: '#3a0a18', accent: '#ff3a58', side: -1 });
}
// S3 — Sera lifts her head; name card
function shot3(t) {
  const tf = freezeAt(t, T.card3 + 0.04), tq = stepT(tf, true);
  const u = (t - T.s3) / (T.s4 - T.s3);
  const cam = { x: -1.75, y: lerp(-1.2, -1.28, u), zoom: lerp(1.28, 1.38, ease.out(u)), rot: -0.04, eye: -0.42 };
  const expr = tf < T.headTurn + 0.1 ? 'closed' : tf < T.headTurn + 0.4 ? 'calm' : 'smirk';
  scene(tf, cam, {
    bg: { moon: { x: -0.4, y: -1.9, r: 1.25 }, gust: 0.6 * smoothstep(T.headTurn, T.headTurn + 0.3, tf) }, wind: 1.4,
    chars: [[s3H, tq, { glow: 0, expr, blink: 0 }]],
    front: () => { const hd = s3H.joint(tq, 'headC'); FX.glint(ctx, gctx, hd[0] + 0.12, hd[1] + 0.0, 0.7, pulse(tf, T.headTurn + 0.42, T.headTurn + 0.46, 0.03, 0.15), '#aefff0'); },
  });
  post(tf, { bloom: 1.0 });
  FX.nameCard(ctx, gctx, W, HH, t, { t0: T.card3, name: '세라', hanja: '星羅', title: '극광의 검사 · 極光之劍士', tone: '#2fd6c4', shade: '#1a1f5a', accent: '#5ff2dc', side: 1 });
}
// S4 — the mask laughs
function shot4(t) {
  beginFrame();
  drawRivalMask(ctx, gctx, W, HH, t, { eye: 0.85 + 0.15 * Math.sin(t * 40), drip: smoothstep(T.s4, T.s5, t), laugh: 1 - smoothstep(T.s5 - 0.25, T.s5, t) * 0.7, push: lerp(1.0, 1.06, (t - T.s4) / (T.s5 - T.s4)) });
  post(t, { bloom: 1.2 });
  subsAt(t);
}
// S5 — her eyes: violet and teal
function shot5(t) {
  beginFrame();
  const u = (t - T.s5) / (T.s6 - T.s5);
  drawHeroEyes(ctx, gctx, W, HH, t, { open: lerp(0.75, 0.55, smoothstep(0.55, 0.75, u)), glow: 0.35 + 0.3 * u, brow: smoothstep(0.5, 0.75, u), push: lerp(1.0, 1.07, u), wind: 0.4 });
  post(t, { bloom: 0.95 });
  subsAt(t);
}
// S6 — the thumb pushes the guard; a sliver of blade catches the moon
function shot6(t) {
  beginFrame();
  const u = (t - T.s6) / (T.s7 - T.s6);
  drawHiltCloseup(ctx, gctx, W, HH, t, { push: lerp(1.0, 1.08, u), push2: ease.snap(clamp((t - T.push) / 0.06, 0, 1)), glint: pulse(t, T.push + 0.04, T.push + 0.08, 0.03, 0.22) });
  post(t, { bloom: 1.1, flash: pulse(t, T.s7 - 0.06, T.s7, 0.04, 0.001) * 0.6, flashCol: '200,255,248' });
}
// S7 — split screen: both charge
function dashHalf(t, c, cam, hero) {
  scene(t, cam, {
    bg: { gust: hero ? 0.9 : -0.9 }, wind: hero ? 6 : -6,
    pre: () => FX.speedLines(ctx, W, HH, t, hero ? { dir: -1, colors: ['#ffffff', '#7ff5e6', '#8fa2ff', '#18225c'], alpha: 0.6, n: 90, seed: 1 } : { dir: 1, colors: ['#ff3a58', '#0a0810', '#7a0e25', '#ffd0d8'], alpha: 0.6, n: 90, seed: 3 }),
    behind: () => {
      if (hero) heroTrail(c, t, { dur: 0.16, alpha: 0.9 });
      else { const rr = new RNG(4); for (let i = 0; i < 26; i++) { const tb = t - rr.range(0, 0.3), p = c.joint(tb, 'tip'), a = t - tb; ctx.fillStyle = '#08060c'; ctx.beginPath(); ctx.arc(p[0] + rr.range(-0.1, 0.1), Math.min(p[1] + 6 * a * a + rr.range(-0.05, 0.05), 0), rr.range(0.02, 0.06), 0, TAU); ctx.fill(); } }
    },
    chars: [[c, stepT(t, true), hero ? { glow: 1, expr: 'grit' } : { glow: 1 }]],
  });
}
function shot7(t) {
  const camR = { x: hx(s7R, t) - 0.9, y: -0.95, zoom: 1.12, rot: -0.04, eye: -0.85 };
  dashHalf(t, s7R, camR, false);
  tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'copy'; tctx.drawImage(canvas, 0, 0);
  tgctx.setTransform(1, 0, 0, 1, 0, 0); tgctx.globalCompositeOperation = 'copy'; tgctx.drawImage(glowC, 0, 0);
  const camH = { x: hx(s7H, t) + 0.9, y: -0.85, zoom: 1.22, rot: 0.04, eye: -0.8 };
  dashHalf(t, s7H, camH, true);
  // diagonal divide: hero top-left, rival bottom-right
  const a = [W * 0.66, -10], b = [W * 0.34, HH + 10];
  for (const [c, src] of [[ctx, tmpC], [gctx, tmpGC]]) {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(W + 10, -10); c.lineTo(W + 10, HH + 10); c.lineTo(b[0], b[1]); c.closePath(); c.clip(); c.drawImage(src, 0, 0); c.restore();
  }
  for (const c of [ctx, gctx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.strokeStyle = '#ffffff'; c.lineWidth = (10 + 8 * pulse(t, T.s8 - 0.12, T.s8, 0.06, 0.001)) * S; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke(); }
  post(t, { flash: pulse(t, T.s8 - 0.05, T.s8, 0.04, 0.001) * 0.5 });
}
// S8 — the clash and the exchange
function camS8(t) {
  const mid = (tt) => (hx(s8H, tt) + hx(s8R, tt)) / 2;
  let zoom, x, y = -1.18;
  if (t < T.clash1) { const u = (t - T.s8) / (T.clash1 - T.s8); zoom = lerp(0.62, 0.84, ease.in(u)); x = 0; }
  else {
    const w = smoothstep(r8(5.93), r8(6.06), t);
    const zl = lerp(1.0, 1.16, clamp((t - T.clash1) / 0.5, 0, 1));
    zoom = lerp(zl, 0.86, w); y = lerp(-1.3, -1.18, w);
    x = lerp(0, (mid(t) + mid(t - 0.08) + mid(t - 0.16)) / 3, w);
    const w2 = smoothstep(r8(7.0), r8(7.4), t);
    zoom = lerp(zoom, 0.8, w2); x = lerp(x, 1.4, w2);
  }
  for (const tc of [T.clash2, T.clash3, T.hOver + 0.06]) { const a = t - tc; if (a >= 0) zoom += 0.07 * Math.exp(-a * 9); }
  return shakeCam({ x, y, zoom, rot: 0, eye: -0.92 }, t);
}
function shot8(t) {
  const tq = stepT(t, t < r8(7.05));
  const cam = camS8(t);
  const fi = frameOf(t) - frameOf(T.clash1);
  if (fi === 0 || fi === 1) {
    impactFrame(t, cam, fi === 1, [[s8H, tq], [s8R, tq]], { focus: [0, -1.5], draw: (inv) => { FX.spark(ctx, null, T.clash1 + 0.03, { t0: T.clash1, x: 0, y: -1.5, size: 2.4, seed: 9, count: 0, color: inv ? '#3cf0d8' : '#ff3a58' }); } });
    post(t, { noBloom: true, noVignette: true });
    return;
  }
  const lock = t > T.clash1 && t < r8(6.0);
  scene(t, cam, {
    bg: { gust: 0.3 + 0.5 * Math.exp(-Math.max(t - T.clash1, 0) * 3), wave: (x) => (t > T.clash1 ? 0.5 * Math.sign(x) * Math.exp(-((Math.abs(x) - (t - T.clash1) * 16) ** 2) / 5) : 0) }, wind: 1.5,
    behind: () => { for (const d of DUSTS) FX.dust(ctx, t, d); },
    chars: [[s8R, tq, { glow: 1, laugh: lock ? t : 0 }], [s8H, tq, { glow: 1, expr: lock ? 'grit' : 'calm', brow: 1 }]],
    front: () => {
      if (t > r8(6.2) && t < r8(6.4)) { for (const [dt, al] of [[0.09, 0.22], [0.05, 0.38]]) { bg.ground(ctx, cam, 1); s8H.draw(ctx, stepT(t - dt, true), { sil: '#7ff5e6', alpha: al }); } wld(cam); }
      for (const a of ARCS) FX.slashArc(ctx, gctx, stepT(t, true), a);
      for (const s of SPARKS) FX.spark(ctx, gctx, t, s);
    },
  });
  const f1 = pulse(t, T.clash1 + F(2), T.clash1 + F(2) + 0.02, 0.005, 0.14) * 0.5;
  post(t, { flash: f1 + pulse(t, T.clash3, T.clash3 + 0.02, 0.005, 0.1) * 0.3 });
}
// S9 — a storm of ink crows; the nebula flurry cuts them all down
function shot9(t) {
  const tq = stepT(t, true);
  const u = (t - T.s9) / (T.s10 - T.s9);
  const cam = shakeCam({ x: lerp(0.6, 0.2, u), y: -1.3, zoom: lerp(0.66, 0.74, u), rot: 0, eye: -1.0 }, t);
  const tip = s9R.joint(T.crows, 'tip');
  scene(t, cam, {
    bg: { gust: -0.5 * pulse(t, T.crows, T.flurry + 0.5, 0.1, 0.3), moon: { x: 0.3, y: -2.6, r: 1.25 } }, wind: -1.2,
    chars: [[s9R, tq, { glow: 1.2 }], [s9H, tq, { glow: 1, expr: t > T.flurry - 0.1 ? 'shout' : 'grit', brow: 1 }]],
    front: () => {
      FX.inkCrows(ctx, gctx, t, { seed: 13, n: 22, t0: T.crows + 0.05, stagger: 0.6, dur: 0.7, size: 2.0, bend: 1.0, keep: false,
        from: (i, rr) => [tip[0] + rr.range(-0.2, 0.2), tip[1] + rr.range(-0.3, 0.3)], to: (i, rr) => [-1.6 + rr.range(-0.2, 0.9), -rr.range(0.6, 2.1)], cut: crowCut });
      for (const a of ARCS9) FX.slashArc(ctx, gctx, tq, a);
      if (t > T.flurry && t < T.flurry + 0.9) { for (const [dt, al] of [[0.06, 0.25]]) { bg.ground(ctx, cam, 1); s9H.draw(ctx, stepT(t - dt, true), { sil: '#7ff5e6', alpha: al }); } wld(cam); }
    },
  });
  post(t, { flash: FLURRY.reduce((m, f) => Math.max(m, pulse(t, f, f + 0.02, 0.005, 0.06) * 0.12), 0) });
  for (const c of CALLOUTS.slice(0, 2)) FX.callout(ctx, gctx, W, HH, t, c);
}
// S10 — ink gathers, the ground slam, the wave; Sera leaps
function shot10(t) {
  const tq = stepT(t, true);
  const w = smoothstep(T.jump - 0.15, T.jump + 0.25, t);
  const cam = shakeCam({ x: lerp(1.4, -1.0, w), y: lerp(-1.3, -3.7, smoothstep(T.jump + 0.08, T.s11, t)), zoom: lerp(0.6, 0.72, smoothstep(T.jump + 0.1, T.s11, t)), rot: lerp(0, -0.05, smoothstep(T.jump + 0.1, T.s11, t)), eye: -1.0 }, t);
  const xf = WAVE.x0 - WAVE.speed * (t - WAVE.t0);
  const tipR = s10R.joint(tq, 'tip');
  scene(t, cam, {
    bg: { gust: -0.4, wave: (x) => (t > WAVE.t0 ? -0.9 * Math.exp(-((x - xf + 0.5) ** 2) / 3) : 0) }, wind: -2,
    behind: () => { FX.inkGather(ctx, gctx, t, { t0: T.s10 + 0.05, dur: 0.38, x: tipR[0], ty: tipR[1] }); FX.inkTrail(ctx, t, { t0: WAVE.t0, x0: WAVE.x0, speed: WAVE.speed, xEnd: -7, fade0: 19, fade1: 20 }); FX.dust(ctx, t, { t0: T.slam, x: 2.3, dir: -1, size: 2.2, n: 10 }); FX.dust(ctx, t, { t0: T.jump, x: -1.6, dir: 0, size: 1.3, n: 7 }); },
    chars: [[s10R, tq, { glow: 1.5 }], [s10H, tq, { glow: 1, expr: 'grit', brow: 1 }]],
    front: () => { FX.inkWave(ctx, gctx, t, WAVE); FX.spark(ctx, gctx, t, { t0: T.slam, x: 2.2, y: -0.1, size: 1.6, seed: 11, count: 20, color: '#ff5a78', ringSquash: 0.3 }); },
  });
  post(t, { flash: pulse(t, T.slam, T.slam + 0.02, 0.005, 0.12) * 0.35, flashCol: '255,80,110', tint: `rgba(140,10,35,${0.1 * pulse(t, T.s10, T.slam, 0.2, 0.3)})` });
}
// S11 — silhouettes collide against the moon
function shot11(t) {
  const tq = stepT(t, true);
  const cam = shakeCam({ x: 0, y: -7.0, zoom: lerp(0.8, 0.86, (t - T.s11) / (T.s12 - T.s11)), rot: 0.02, eye: -1 }, t);
  const fi = frameOf(t) - frameOf(T.airClash);
  if (fi === 0 || fi === 1) {
    impactFrame(t, cam, fi === 1, [[s11H, tq], [s11R, tq]], { focus: [0, -8.1], draw: (inv) => FX.spark(ctx, null, T.airClash + 0.03, { t0: T.airClash, x: 0, y: -8.1, size: 2.8, seed: 19, count: 0, color: inv ? '#3cf0d8' : '#ff3a58' }) });
    post(t, { noBloom: true, noVignette: true });
    return;
  }
  beginFrame();
  bg.drawBack(ctx, gctx, cam, t, { moon: { x: 0, y: -7.2, r: 2.05 }, aurora: 0.5, auroraY: -4.4 });
  wld(cam);
  if (t < T.airClash) heroTrail(s11H, t, { dur: 0.18, alpha: 0.8, minMove: 0.05 });
  drawChar(s11R, cam, tq, { glow: 1, shade: 0.6 });
  drawChar(s11H, cam, tq, { glow: 1, shade: 0.55, expr: 'shout' });
  wld(cam);
  FX.spark(ctx, gctx, t, { t0: T.airClash + F(2), x: 0, y: -8.1, size: 2.4, seed: 21, count: 30 });
  post(t, { bloom: 1.15, flash: pulse(t, T.airClash + F(2), T.airClash + F(2) + 0.02, 0.005, 0.16) * 0.55 });
}
// S12 — she crashes down; he lands and walks toward her
function shot12(t) {
  const tq = stepT(t, t < T.crash + 0.5);
  const cam = shakeCam({ x: 0.0, y: -1.25, zoom: 0.6, rot: 0, eye: -1.0 }, t);
  scene(t, cam, {
    bg: { gust: 0.6 * pulse(t, T.crash, T.crash + 0.2, 0.01, 0.6), wave: (x) => (t > T.crash ? 0.6 * Math.exp(-((Math.abs(x + 2.3) - (t - T.crash) * 9) ** 2) / 4) * Math.exp(-(t - T.crash) * 1.5) : 0) }, wind: 0.7,
    behind: () => {
      if (t > T.crash) {
        // cracked earth around the impact
        ctx.strokeStyle = 'rgba(8,10,30,0.85)'; ctx.lineWidth = 0.035; const rr = new RNG(77);
        for (let i = 0; i < 10; i++) { const dir = rr.range(-1, 1), L = rr.range(0.6, 1.6) * ease.out(clamp((t - T.crash) / 0.15, 0, 1)); ctx.beginPath(); ctx.moveTo(-2.3, 0.01); ctx.lineTo(-2.3 + dir * L * 0.5, 0.01 + rr.range(-0.02, 0.03)); ctx.lineTo(-2.3 + dir * L, 0.015 + rr.range(-0.02, 0.04)); ctx.stroke(); }
      }
      FX.dust(ctx, t, { t0: T.crash, x: -2.3, dir: 0, size: 2.6, n: 14 }); FX.dust(ctx, t, { t0: T.rLand, x: 2.9, dir: 0, size: 1.8, n: 9 });
      // ink smear behind the dragging blade
      if (t > T.rLand + 0.6) { ctx.fillStyle = 'rgba(7,5,10,0.8)'; const xr = hx(s12R, t); ctx.beginPath(); ctx.moveTo(xr - 1.0, 0.01); for (let x = xr - 1.0; x <= 3.0; x += 0.1) ctx.lineTo(x, -0.01 - 0.02 * Math.abs(noise1(x * 4, 2))); ctx.lineTo(3.0, 0.04); ctx.lineTo(xr - 1.0, 0.04); ctx.fill(); }
    },
    chars: [[s12R, tq, { glow: 1.2 }], [s12H, tq, { glow: 0.5, expr: t > T.crash + 0.4 ? 'grit' : 'shout', brow: 1 }]],
    front: () => FX.spark(ctx, gctx, t, { t0: T.crash, x: -2.3, y: -0.2, size: 1.6, seed: 31, count: 14, color: '#9ff5e6', ringSquash: 0.3 }),
  });
  post(t, { flash: pulse(t, T.crash, T.crash + 0.02, 0.005, 0.12) * 0.3 });
  subsAt(t);
}
// S13 — the aurora answers: power-up
function shot13(t) {
  const tq = stepT(t, true);
  const u = (t - T.s13) / (T.s13b - T.s13);
  const ak = smoothstep(T.rise - 0.2, T.rise + 0.6, t);
  const cam = shakeCam({ x: -2.35, y: lerp(-1.2, -1.32, u), zoom: lerp(1.0, 1.22, ease.inout(u)), rot: -0.02, eye: -0.5 }, t);
  scene(t, cam, {
    bg: { aurora: 0.6 + 1.0 * ak, auroraY: 0.6, gust: 0.15 }, wind: 0.6,
    behind: () => {
      for (const c of [ctx, gctx]) { c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(-2.8, 0, 0.1, -2.8, 0, 1.8); g.addColorStop(0, `rgba(90,255,220,${0.55 * ak})`); g.addColorStop(1, 'rgba(90,255,220,0)'); c.fillStyle = g; c.beginPath(); c.ellipse(-2.8, 0, 1.8, 0.28, 0, 0, TAU); c.fill(); c.restore(); }
      FX.auroraSpiral(ctx, gctx, t, { x: -2.8, y0: 0, y1: -2.3, r: 0.75, k: ak * 0.6, n: 3 });
    },
    chars: [[s13H, tq, { glow: ak * 1.4, aura: ak, expr: t < T.rise + 0.2 ? 'closed' : t < T.rise + 0.6 ? 'grit' : 'shout', brow: 1 }]],
    front: () => FX.auroraSpiral(ctx, gctx, t + 0.37, { x: -2.8, y0: 0, y1: -2.4, r: 0.8, k: ak, n: 4 }),
  });
  post(t, { bloom: 1 + 0.5 * ak, tint: `rgba(30,200,180,${0.06 * ak})` });
  subsAt(t);
}
// S13b — both eyes ignite; the secret art is named
function shot13b(t) {
  beginFrame();
  const u = (t - T.s13b) / (T.s14 - T.s13b);
  drawHeroEyes(ctx, gctx, W, HH, t, { open: 1, glow: 1, blaze: ease.out(clamp(u * 2.5, 0, 1)), brow: 1, push: lerp(1.0, 1.12, u), wind: 1.2 });
  post(t, { bloom: 1.3, flash: pulse(t, T.s13b, T.s13b + 0.02, 0.005, 0.15) * 0.4, flashCol: '160,255,240' });
  FX.callout(ctx, gctx, W, HH, t, ULT);
}
// S14 — Kokuya unleashes the ink dragon; both charge
function shot14(t) {
  const tq = stepT(t, true);
  const u = (t - T.s14) / (T.s15 - T.s14);
  const cam = shakeCam({ x: lerp(0.6, 0.2, u), y: -1.75, zoom: lerp(0.5, 0.58, ease.in(u)), rot: 0, eye: -1.0 }, t);
  cam.x += noise1(frameOf(t) * 2.1, 3) * 0.04 * u; cam.y += noise1(frameOf(t) * 2.7, 4) * 0.04 * u;
  scene(t, cam, {
    bg: { aurora: 1.0, auroraY: 0.4, gust: -0.6 }, wind: 2,
    pre: () => { if (u > 0.55) FX.speedLines(ctx, W, HH, t, { dir: 1, colors: ['#ffffff', '#ff8fa0', '#7ff5e6'], alpha: 0.45 * smoothstep(0.55, 0.8, u), n: 60, seed: 7 }); },
    behind: () => { heroTrail(s14H, t, { dur: 0.2, alpha: 0.9 }); FX.inkDragon(ctx, gctx, t, { head: dragonHead, lag: 0.03, width: 0.42, k: smoothstep(T.s14, T.s14 + 0.35, t) }); },
    chars: [[s14R, tq, { glow: 1.6 }], [s14H, tq, { glow: 1.6, aura: 1, expr: 'shout', brow: 1 }]],
  });
  post(t, { bloom: 1.2 });
  FX.callout(ctx, gctx, W, HH, t, CALLOUTS[2]);
}
// S15 — the cut
const CUT_A = [-4.2, -5.0], CUT_B = [4.3, -0.35];
function shot15(t) {
  const fi = frameOf(t) - frameOf(T.s15);
  if (fi < 3) {
    beginFrame();
    ctx.fillStyle = '#04050d'; ctx.fillRect(0, 0, W, HH);
    const k = [0.45, 1, 1][fi];
    const p0 = [W * 0.02, -HH * 0.08], p1 = [W * 0.02 + (W * 1.0) * k, -HH * 0.08 + (HH * 1.12) * k];
    FX.focusLines(ctx, W, HH, t, { fx: W * 0.5, fy: HH * 0.5, color: 'rgba(120,255,235,0.35)', n: 40, inner: 0.5, width: 0.6 });
    for (const c of [ctx, gctx]) c.setTransform(1, 0, 0, 1, 0, 0);
    FX.beam(ctx, gctx, p0, p1, (fi === 2 ? 30 : 120) * S, 1, fi === 2 ? 0.3 : 0);
    const rr = new RNG(fi + 40);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 18; i++) { const o = rr.range(-420, 420) * S, a = rr.range(0, 0.6), b = a + rr.range(0.15, 0.4); ctx.lineWidth = rr.range(1, 5) * S; ctx.beginPath(); ctx.moveTo(lerp(p0[0], p1[0], a) + o, lerp(p0[1], p1[1], a) - o * 0.6); ctx.lineTo(lerp(p0[0], p1[0], b) + o, lerp(p0[1], p1[1], b) - o * 0.6); ctx.stroke(); }
    post(t, { bloom: 1.3, noVignette: true, flash: fi === 2 ? 0.5 : 0, flashCol: '220,255,250' });
    return;
  }
  const tq = stepT(t), a = t - T.s15b;
  const cam = shakeCam({ x: 1.7, y: -1.28, zoom: 0.66, rot: 0, eye: -1.0 }, t);
  if (fi === 3 || fi === 4) {
    impactFrame(t, cam, fi === 4, [[s15R, tq], [s15H, tq]], { focus: [0.9, -1.3], draw: (inv) => { FX.beam(ctx, null, CUT_A, CUT_B, 0.2, 1, 0); ctx.strokeStyle = inv ? '#3cf0d8' : '#05060f'; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(CUT_A[0], CUT_A[1]); ctx.lineTo(CUT_B[0], CUT_B[1]); ctx.stroke(); } });
    post(t, { noBloom: true, noVignette: true });
    return;
  }
  drawAftermath(t, cam, tq, a);
  post(t, { bloom: 1.15 });
  const d = 34 * S * ease.out(clamp((a - F(2)) / 0.1, 0, 1)) * (1 - smoothstep(0.35, 0.66, a));
  if (d > 0.3) screenCut(toScreen(cam, CUT_A), toScreen(cam, CUT_B), d, Math.min(d * 0.12, 3 * S));
}
function drawAftermath(t, cam, tq, a) {
  scene(t, cam, {
    bg: { aurora: 1, gust: 0.7 * Math.exp(-a * 1.6), wave: (x) => 0.6 * Math.exp(-((Math.abs(x - 1) - a * 10) ** 2) / 6) * Math.exp(-a) }, wind: 1.4,
    behind: () => {
      // the ink dragon falls apart as black rain
      const rr = new RNG(91);
      for (let i = 0; i < 70; i++) { const x = rr.range(-3, 5), y0 = -rr.range(2, 6), v = rr.range(3, 6), y = y0 + v * a + 4 * a * a; if (a > 0 && y < 0 && a < 1.6) { ctx.fillStyle = `rgba(7,5,10,${1 - a / 1.6})`; ctx.beginPath(); ctx.ellipse(x, y, 0.025, 0.06, 0, 0, TAU); ctx.fill(); } }
    },
    chars: [[s15R, tq, { glow: 0.8 * (1 - smoothstep(0.3, 1.2, a)), eye: 1 - 0.6 * smoothstep(0.2, 1.0, a) }], [s15H, tq, { glow: 1, brow: 1, expr: 'calm' }]],
    front: () => { FX.beam(ctx, gctx, CUT_A, CUT_B, 0.16 * (1 - smoothstep(0.05, 0.9, a)) + 0.012, 1 - smoothstep(0.2, 1.1, a), smoothstep(0.1, 1.0, a) * 0.7); FX.dust(ctx, t, { t0: T.s15b, x: 3.2, dir: -1, size: 1.6, n: 9 }); },
  });
}
// S16 — back to back in the silence
function shot16(t) {
  const u = (t - T.s16) / (T.s17 - T.s16), a = t - T.s15b;
  const cam = { x: lerp(2.1, 2.25, u), y: -1.22, zoom: lerp(0.8, 0.84, u), rot: 0, eye: -1.0 };
  drawAftermath(t, cam, stepT(t), a);
  post(t, { bloom: 1.1 });
}
// S17 — the grinning mask cracks and splits
function shot17(t) {
  beginFrame();
  const sp = smoothstep(T.split, T.split + 0.22, t);
  const flick = t < T.split ? 0.55 + 0.45 * Math.sin(t * 70) * Math.sin(t * 23) : Math.max(0, 1 - (t - T.split) / 0.1);
  drawRivalMask(ctx, gctx, W, HH, t, { eye: flick, drip: 1, crack: smoothstep(T.crack, T.crack + 0.2, t), split: sp, shake: t > T.split ? 10 * Math.exp(-(t - T.split) * 6) : (t > T.crack ? 3 : 0), push: lerp(1.04, 1.1, (t - T.s17) / (T.s18 - T.s17)) });
  post(t, { bloom: 1.2, flash: pulse(t, T.split, T.split + 0.03, 0.005, 0.15) * 0.6, flashCol: '170,255,240' });
}
// S18 — he dissolves into crows; she sheathes her blade beneath the aurora
function shot18(t) {
  const u = (t - T.s18) / (T.end - T.s18), tq = stepT(t);
  const cam = { x: lerp(2.3, 2.75, ease.inout(u)), y: lerp(-1.25, -2.05, ease.inout(u)), zoom: lerp(0.8, 0.66, ease.inout(u)), rot: 0, eye: -1.0 };
  const dk = smoothstep(T.s18 + 0.15, T.s18 + 1.3, t);
  const gl = 1 - smoothstep(T.click - 0.15, T.click, t);
  scene(t, cam, {
    bg: { aurora: 1 + 0.3 * u, gust: 0.12 }, wind: 1,
    chars: [[s15H, tq, { glow: gl, brow: 1 - smoothstep(28.3, 29, t), expr: t > T.click ? 'smirk' : 'calm' }]],
    behind: () => {
      tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, W, HH);
      bg.ground(tctx, cam, 1); s15R.draw(tctx, tq, { eye: 0 });
      bg.ground(tctx, cam, 1); tctx.globalCompositeOperation = 'destination-out';
      const rr = new RNG(55), rx = hx(s15R, tq);
      for (let i = 0; i < 300; i++) { const x = rx + rr.range(-1.1, 1.1), y = -rr.range(0, 2.9); const thr = clamp(0.8 * (1 - (-y) / 2.9) + rr.range(-0.12, 0.2), 0, 1) * 0.86; if (dk > thr) { tctx.beginPath(); tctx.arc(x, y, (dk - thr) * 1.0 + 0.02, 0, TAU); tctx.fill(); } }
      tctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tmpC, 0, 0);
      wld(cam);
      FX.inkPetals(ctx, gctx, t, { t0: T.s18 + 0.1, dur: 1.2, n: 130, x: rx, y: 0, seed: 21 });
      FX.inkCrows(ctx, gctx, t, { seed: 33, n: 16, t0: T.s18 + 0.15, stagger: 1.1, dur: 1.6, size: 1.1, bend: 0.8, from: (i, rr) => [rx + rr.range(-0.5, 0.5), -rr.range(0.3, 2.5)], to: (i, rr) => [rx + rr.range(-4, 1), -rr.range(6, 8)] });
    },
    front: () => {
      FX.slashArc(ctx, gctx, stepT(t, true), FLICK);
      const tip = s15H.joint(tq, 'tip'); FX.glint(ctx, gctx, tip[0], tip[1], 0.9, pulse(t, T.flick + 0.05, T.flick + 0.08, 0.02, 0.2));
      const mo = s15H.joint(tq, 'sbMouth'); FX.glint(ctx, gctx, mo[0], mo[1], 1.1, pulse(t, T.click, T.click + 0.04, 0.01, 0.25), '#ffe9a8');
    },
    over: () => title(t),
  });
  post(t, { bloom: 1.1, fade: smoothstep(29.55, 29.98, t) });
}
const SHOTS = [[0, shot1], [T.s2, shot2], [T.s3, shot3], [T.s4, shot4], [T.s5, shot5], [T.s6, shot6], [T.s7, shot7], [T.s8, shot8], [T.s9, shot9], [T.s10, shot10], [T.s11, shot11], [T.s12, shot12], [T.s13, shot13], [T.s13b, shot13b], [T.s14, shot14], [T.s15, shot15], [T.s16, shot16], [T.s17, shot17], [T.s18, shot18]];

// ================================================================ debug sheet
function poseSheet(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#56608a'; ctx.fillRect(0, 0, W, HH);
  const all = [...Object.entries(H).map(([k, p]) => ['hero', k, p]), ...Object.entries(R).map(([k, p]) => ['rival', k, p])];
  const cols = 9, cw = W / cols, chh = HH / 4;
  all.forEach(([kind, name, pose], i) => {
    const cx = (i % cols + 0.5) * cw, gy = (Math.floor(i / cols) + 0.88) * chh;
    const c = new Character(kind, { poseAt: () => pose, rootAt: () => ({ x: 0, y: 0, facing: 1, wind: 0.5 }) });
    ctx.save(); ctx.translate(cx, gy); const s = chh / 2.6; ctx.scale(s, s); c.draw(ctx, t, { lw: 0.013 }); ctx.restore();
    ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif'; ctx.fillText(`${kind[0]}:${name}`, cx - cw / 2 + 6, gy + 22);
  });
}

function zoomSheet(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#4c5687'; ctx.fillRect(0, 0, W, HH);
  const items = [['hero', H.ready, 470, 520, {}], ['rival', R.ready, 1420, 470, {}]];
  for (const [kind, pose, x, sc, o] of items) {
    const c = new Character(kind, { poseAt: () => pose, rootAt: () => ({ x: 0, y: 0, facing: 1, wind: 0.7 }) });
    ctx.save(); ctx.translate(x * S, 1060 * S); ctx.scale(sc * S, sc * S); c.draw(ctx, t, { lw: 0.011, ...o }); ctx.restore();
  }
}
function headSheet(t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#4c5687'; ctx.fillRect(0, 0, W, HH);
  const ex = ['calm', 'smirk', 'grit', 'shout', 'closed'];
  ex.forEach((e, i) => {
    const c = new Character('hero', { poseAt: () => H.idle, rootAt: () => ({ x: 0, y: 0, facing: 1, wind: 0.5 }) });
    ctx.save(); ctx.translate((150 + i * 300) * S, 1500 * S); ctx.scale(700 * S, 700 * S); c.draw(ctx, t, { lw: 0.006, expr: e }); ctx.restore();
  });
  const r = new Character('rival', { poseAt: () => R.idle, rootAt: () => ({ x: 0, y: 0, facing: 1, wind: 0.5 }) });
  ctx.save(); ctx.translate(1640 * S, 1600 * S); ctx.scale(600 * S, 600 * S); r.draw(ctx, t, { lw: 0.006 }); ctx.restore();
}
window.__renderAt = (t) => {
  if (mode === 'poses') return poseSheet(t);
  if (mode === 'zoom') return zoomSheet(t);
  if (mode === 'heads') return headSheet(t);
  t += 1e-5;
  let fn = SHOTS[0][1];
  for (const [t0, f] of SHOTS) if (t >= t0 - 1e-6) fn = f;
  fn(t);
};
window.__info = () => ({ fps: 24, duration: T.end, T, flurry: FLURRY, sparks: SPARKS.map((s) => ({ t: s.t0, size: s.size })), arcs: ARCS.map((a) => ({ t: a.t0, style: a.style })), wave: WAVE, callouts: [...CALLOUTS, ULT].map((c) => ({ t: c.t0, text: c.text })), subs: SUBS.map((s) => ({ t: s.t0, who: s.who })) });
window.__ready = true;
