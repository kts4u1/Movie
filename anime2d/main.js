// AURORA BLADE — a 15 s 2D sword duel. window.__renderAt(t) draws the frame at time t (24 fps).
import { Character } from './rig.js';
import { H, R } from './poses.js';
import { Background, PPM } from './bg.js';
import { poseTrack, rootTrack, F } from './anim.js';
import * as FX from './fx.js';
import { drawHeroEyes, drawRivalMask } from './closeups.js';
import { TAU, clamp, lerp, smoothstep, pulse, RNG, noise1, ease, norm, perp, sub, add, mul } from './util.js';

const params = new URLSearchParams(location.search);
const W = parseInt(params.get('w') || '1920', 10), HH = parseInt(params.get('h') || '1080', 10);
const canvas = document.getElementById('c');
canvas.width = W; canvas.height = HH;
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const mk2d = () => { const c = document.createElement('canvas'); c.width = W; c.height = HH; return [c, c.getContext('2d', { willReadFrequently: true })]; };
const [glowC, gctx] = mk2d();
const [tmpC, tctx] = mk2d();
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
  s2: F(42), s3: F(66), s4: F(87), s5a: F(108), s5b: F(119), s6: F(127), clash1: F(131), s6b: F(178),
  s7: F(190), slam: F(192), s8: F(216), s9: F(250), s9b: F(253), s10: F(269), s11: F(294), s12: F(309), end: 15,
  eyesOpen: 2.0, eyeIgnite: F(72), bladeIgnite: 4.0, clash2: F(155), clash3: F(167), hOver: 6.215, hUp: 6.385, hSweep: 6.66, hSpin: 6.87,
  jump: 8.2, cut: F(253), crack: 12.3, split: F(302), flick: F(330), title: 14.0,
};
const P = (b, o) => ({ ...b, ...o });
const clashH = P(H.ready, { hip: [0.05, -0.8], lean: 14, armF: [62, 96], sword: 126 });
const lockH = P(clashH, { hip: [0.12, -0.76], lean: 21 });
const clashR = P(R.ready, { hip: [0.05, -0.8], lean: 14, armF: [66, 100], sword: 128 });
const lockR = P(clashR, { hip: [0.12, -0.76], lean: 21 });
const lowDeep = P(H.low, { hip: [-0.12, -0.55], lean: 37 });
const diveWind = P(H.arch, { lean: 6, bend: -4, armF: [202, 232], sword: 252, head: -12 });
const mk = (kind, poses, roots, hold = 1) => new Character(kind, { poseAt: poseTrack(poses, hold), rootAt: rootTrack(roots) });
const cycle = (a, b, t0, t1, step) => { const k = []; let i = 0; for (let t = t0; t <= t1 + 1e-6; t += step, i++) k.push({ t, p: i % 2 ? b : a, e: 'linear' }); return k; };

// S1 — establishing
const s1H = mk('hero', [{ t: 0, p: H.idle }], [{ t: 0, x: -4.2, f: 1, wind: 0.4 }, { t: 0.9, x: -4.2, wind: 1.0, dur: 0.3 }, { t: 1.75, x: -4.2, wind: 0.55, dur: 0.6 }]);
const s1R = mk('rival', [{ t: 0, p: R.idle }], [{ t: 0, x: 4.2, f: -1, wind: 0.4 }, { t: 0.95, x: 4.2, wind: 1.0, dur: 0.3 }, { t: 1.75, x: 4.2, wind: 0.55, dur: 0.6 }]);
// S4 — stance + ignition
const s4H = mk('hero', [{ t: T.s4, p: H.idle }, { t: 3.95, p: H.low, dur: 0.2, e: 'out' }, { t: 4.36, p: lowDeep, dur: 0.14, e: 'out' }, { t: 4.5, p: H.runA, dur: 0.05, e: 'in' }],
  [{ t: T.s4, x: -4.2, f: 1, wind: 0.7 }, { t: 4.1, x: -4.2, wind: 1.0, dur: 0.1 }, { t: 4.44, x: -4.2 }, { t: 4.5, x: -3.6, dur: 0.06, e: 'in' }]);
// S5 — dashes
const s5H = mk('hero', cycle(H.runA, H.runB, T.s5a - 0.1, T.s5b + 0.1, F(2)), [{ t: T.s5a, x: -3.6, f: 1, wind: 1 }, { t: T.s5b, x: 2.4, e: 'linear' }], 0);
const s5R = mk('rival', cycle(R.runA, R.runB, T.s5b - 0.1, T.s6 + 0.1, F(2)), [{ t: T.s5b, x: 4.6, f: -1, wind: 1 }, { t: T.s6, x: 0.9, e: 'linear' }], 0);
// S6 — clash and exchange
const s6H = mk('hero', [
  { t: T.s6, p: H.runA }, { t: 5.375, p: H.upWind, dur: 0.06 }, { t: T.clash1, p: clashH, dur: 0.07, e: 'snap' }, { t: 5.75, p: lockH, dur: 0.25 },
  { t: 6.08, p: H.backstep, dur: 0.14, e: 'out' }, { t: 6.17, p: H.ready, dur: 0.08 }, { t: 6.3, p: H.backstep, dur: 0.09, e: 'out' },
  { t: 6.365, p: H.upWind, dur: 0.05 }, { t: 6.445, p: H.upEnd, dur: 0.07, e: 'snap' }, { t: 6.6, p: H.ready, dur: 0.12 },
  { t: 6.7, p: H.duck, dur: 0.07, e: 'snap' }, { t: 6.86, p: H.low, dur: 0.08 }, { t: 6.96, p: H.spin, dur: 0.09, e: 'snap' }, { t: 7.15, p: H.ready, dur: 0.16 },
], [
  { t: T.s6, x: -3.0, f: 1, wind: 0.9 }, { t: T.clash1, x: -0.62, e: 'linear' }, { t: 5.92, x: -0.62 }, { t: 6.08, x: -1.75, dur: 0.15, e: 'out' }, { t: 6.19, x: -1.75 },
  { t: 6.3, x: -2.55, dur: 0.1, e: 'out' }, { t: 6.445, x: -1.0, dur: 0.1, e: 'out' }, { t: 6.86, x: -1.0 }, { t: 6.9, x: -0.85, f: -1, dur: 0.04 }, { t: 6.96, x: -0.55, f: 1, dur: 0.06 }, { t: 7.5, x: -0.55 },
]);
const s6R = mk('rival', [
  { t: T.s6, p: R.runA }, { t: 5.375, p: R.overWind, dur: 0.06 }, { t: T.clash1, p: clashR, dur: 0.07, e: 'snap' }, { t: 5.75, p: lockR, dur: 0.25 },
  { t: 6.08, p: R.ready, dur: 0.14, e: 'out' }, { t: 6.17, p: R.overWind, dur: 0.08 }, { t: 6.275, p: R.overEnd, dur: 0.07, e: 'snap' }, { t: 6.38, p: R.ready, dur: 0.08 },
  { t: 6.445, p: R.block, dur: 0.05 }, { t: 6.62, p: R.sweepWind, dur: 0.1 }, { t: 6.72, p: R.sweepEnd, dur: 0.07, e: 'snap' }, { t: 6.9, p: R.block, dur: 0.08 },
  { t: T.clash3, p: R.knock, dur: 0.05, e: 'snap' }, { t: 7.4, p: R.ready, dur: 0.18 },
], [
  { t: T.s6, x: 3.0, f: -1, wind: 0.9 }, { t: T.clash1, x: 0.62, e: 'linear' }, { t: 5.92, x: 0.62 }, { t: 6.08, x: 1.3, dur: 0.15, e: 'out' }, { t: 6.16, x: 1.3 },
  { t: 6.275, x: 0.25, dur: 0.1, e: 'out' }, { t: 6.445, x: 0.55, dur: 0.06 }, { t: 6.62, x: 0.55 }, { t: 6.72, x: 0.3, dur: 0.08 }, { t: T.clash3, x: 0.5, dur: 0.05 }, { t: 7.36, x: 3.3, dur: 0.4, e: 'out' },
]);
// S6b / S7 — ink gather, slam, wave, leap
const s7R = mk('rival', [{ t: T.s6b, p: R.ready }, { t: 7.62, p: R.gather, dur: 0.16, e: 'out' }, { t: T.slam, p: R.slam, dur: 0.07, e: 'snap' }], [{ t: T.s6b, x: 3.3, f: -1, wind: 1.0 }]);
const s7H = mk('hero', [{ t: T.s7, p: H.ready }, { t: 8.13, p: lowDeep, dur: 0.1, e: 'out' }, { t: 8.27, p: H.jump, dur: 0.07, e: 'snap' }, { t: 8.9, p: H.arch, dur: 0.5 }],
  [{ t: T.s7, x: -1.6, f: 1, wind: 0.8 }, { t: T.jump, x: -1.6 }, { t: 8.8, x: -1.2, y: -4.4, dur: 0.6, e: 'out' }]);
// S8 — the moon
const s8H = mk('hero', [{ t: T.s8, p: H.jump }, { t: 9.62, p: H.arch, dur: 0.5 }, { t: 10.26, p: diveWind, dur: 0.2, e: 'out' }, { t: 10.36, p: H.dive, dur: 0.05, e: 'snap' }],
  [{ t: T.s8, x: -1.0, y: -5.0, f: 1, wind: 0.5, rot: -6 }, { t: 9.78, x: 0.1, y: -7.75, rot: -14, dur: 0.78, e: 'out' }, { t: 10.26, x: 0.3, y: -7.9, rot: 6, dur: 0.48 }, { t: 10.33, x: 0.3, y: -7.9, rot: 38, dur: 0.06 }, { t: T.s9, x: 2.6, y: -5.2, rot: 42, dur: 0.085, e: 'in' }], 0.5);
// S9 / S10 / S12 — the cut and the aftermath
const s9H = mk('hero', [{ t: T.s9, p: H.finish }, { t: 13.45, p: H.rise, dur: 0.38 }, { t: T.flick, p: H.chiburi, dur: 0.08, e: 'snap' }, { t: 14.35, p: H.lookup, dur: 0.45 }], [{ t: T.s9, x: 3.6, f: 1, wind: 0.75 }, { t: 12, x: 3.6, wind: 0.45, dur: 0.7 }]);
const s9R = mk('rival', [{ t: T.s9, p: R.guardUp }, { t: 11.95, p: R.struck, dur: 0.6 }, { t: 13.25, p: R.kneel, dur: 0.33, e: 'in' }], [{ t: T.s9, x: 0.9, f: -1, wind: 0.75 }, { t: 12, x: 0.9, wind: 0.45, dur: 0.7 }]);

// slash arcs / sparks / dust (world space)
const hx = (c, t) => c.state(t).R.x;
const ARCS = [
  { t0: T.hOver, dur: 0.06, life: 0.26, cx: 0.6, cy: -1.3, rx: 1.95, ry: 1.95, rot: 0, a0: -55, a1: -215, width: 0.55, style: 'ink', seed: 2 },
  { t0: T.hUp, dur: 0.06, life: 0.28, cx: -1.1, cy: -1.15, rx: 1.35, ry: 1.35, rot: 0, a0: 105, a1: -100, width: 0.4, style: 'aurora', seed: 3 },
  { t0: T.hSweep, dur: 0.06, life: 0.24, cx: 0.2, cy: -1.02, rx: 2.1, ry: 0.5, rot: -4, a0: -25, a1: 205, width: 0.5, style: 'ink', seed: 5 },
  { t0: T.hSpin, dur: 0.09, life: 0.3, cx: -0.6, cy: -1.0, rx: 1.55, ry: 0.5, rot: 3, a0: 190, a1: -150, width: 0.42, style: 'aurora', seed: 7 },
  { t0: T.flick, dur: 0.05, life: 0.3, cx: 3.75, cy: -0.95, rx: 0.9, ry: 0.9, rot: 0, a0: -20, a1: 75, width: 0.16, style: 'aurora', seed: 9 },
];
const SPARKS = [
  { t0: T.clash1 + F(2), x: 0, y: -1.5, size: 1.5, seed: 1, count: 26 },
  { t0: 5.66, x: 0.02, y: -1.47, size: 0.4, seed: 4, count: 8 }, { t0: 5.79, x: -0.02, y: -1.45, size: 0.45, seed: 5, count: 8 }, { t0: 5.9, x: 0, y: -1.46, size: 0.5, seed: 6, count: 9 },
  { t0: T.clash2, x: -0.05, y: -1.75, size: 1.0, seed: 2, count: 18, color: '#9ff5e6' },
  { t0: T.clash3, x: 0.15, y: -1.15, size: 1.3, seed: 3, count: 22, color: '#9ff5e6' },
];
const DUSTS = [
  { t0: T.s6 + 0.02, x: -2.6, dir: -1, size: 1 }, { t0: T.s6 + 0.02, x: 2.6, dir: 1, size: 1 }, { t0: T.clash1 + F(2), x: 0, dir: 0, size: 1.5, n: 9 },
  { t0: 6.0, x: -1.3, dir: 1, size: 1 }, { t0: 6.0, x: 1.0, dir: -1, size: 1 }, { t0: 6.27, x: -2.5, dir: 1, size: 0.9 }, { t0: 6.28, x: 0.1, dir: -1, size: 1.3, n: 8 },
  { t0: 6.44, x: -1.2, dir: -1, size: 0.9 }, { t0: 7.0, x: 0.9, dir: -1, size: 1.2 }, { t0: 7.1, x: 1.8, dir: -1, size: 1.2 }, { t0: 7.2, x: 2.6, dir: -1, size: 1.1 }, { t0: 7.3, x: 3.1, dir: -1, size: 0.9 },
];
const SHAKES = [{ t: T.eyeIgnite, a: 0, d: 8 }, { t: T.clash1, a: 0.16, d: 7 }, { t: T.hOver + 0.06, a: 0.08, d: 9 }, { t: T.clash2, a: 0.07, d: 10 }, { t: T.clash3, a: 0.12, d: 8 }, { t: T.slam, a: 0.22, d: 5 }, { t: T.cut, a: 0.2, d: 6 }];
const WAVE = { t0: T.slam + 0.02, x0: 2.0, speed: 13, height: 2.5, len: 6, life: 1.5 };

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
  bg.ground(ctx, cam, 1); c.draw(ctx, t, o);
  if (o.shade) c.draw(ctx, t, { ...o, sil: '#0a1236', alpha: o.shade });
  bg.ground(gctx, cam, 1); c.draw(gctx, t, { ...o, sil: '#000' });
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
  const sc = lerp(1.06, 1.0, k), TY = 520, TX = 770;
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
function shot1(t) {
  const u = t / T.s2;
  const cam = { x: 0, y: lerp(-1.5, -1.36, u), zoom: lerp(0.44, 0.52, ease.out(u)), rot: 0, eye: -1.0 };
  const gust = pulse(t, 0.55, 1.05, 0.3, 0.6) * 0.7;
  const tq = stepT(t);
  scene(t, cam, { bg: { gust, wave: (x) => 0.35 * Math.exp(-((x - (9 - t * 14)) ** 2) / 6) }, chars: [[s1H, tq, { glow: 0 }], [s1R, tq, { glow: 0.3, eye: 0.0 }]] });
  post(t, { fade: 1 - smoothstep(0, 0.7, t) });
}
function shot2(t) {
  beginFrame();
  const tf = stepT(t, true);
  const open = tf < T.eyesOpen ? 0 : ease.out(clamp((tf - T.eyesOpen) / 0.17, 0, 1));
  const glow = smoothstep(2.25, 2.6, t);
  drawHeroEyes(ctx, gctx, W, HH, t, { open, glow, brow: smoothstep(T.eyesOpen, T.eyesOpen + 0.2, t), push: lerp(1.0, 1.08, (t - T.s2) / (T.s3 - T.s2)), wind: Math.sin(t * 3) * 0.3 + 0.3 });
  const gk = pulse(t, 2.5, 2.56, 0.05, 0.14);
  for (const c of [ctx, gctx]) c.setTransform(S, 0, 0, S, 0, 0);
  FX.glint(ctx, gctx, 1285, 535, 520, gk, '#cffff6');
  post(t, { bloom: 0.9 });
}
function shot3(t) {
  beginFrame();
  const a = t - T.eyeIgnite;
  const eye = a < 0 ? 0 : clamp(a / 0.08, 0, 1) * (0.82 + 0.18 * Math.sin(t * 50));
  drawRivalMask(ctx, gctx, W, HH, t, { eye, drip: smoothstep(T.eyeIgnite + 0.06, T.s4 - 0.05, t), shake: a > 0 ? 16 * Math.exp(-a * 7) : 0, push: lerp(1.0, 1.07, (t - T.s3) / (T.s4 - T.s3)) });
  post(t, { bloom: 1.2, flash: a >= 0 && a < F(1) ? 0.55 : 0, flashCol: '255,70,100' });
}
function shot4(t) {
  const u = (t - T.s4) / (T.s5a - T.s4);
  const cam = shakeCam({ x: -3.72 + u * 0.12, y: -0.98, zoom: lerp(1.5, 1.64, u), rot: -0.07, eye: -0.32 }, t);
  const tq = stepT(t), gl = smoothstep(T.bladeIgnite, T.bladeIgnite + 0.1, t);
  const tip = s4H.joint(tq, 'tip'), guard = s4H.joint(tq, 'guard');
  scene(t, cam, {
    bg: { moon: { x: 0.42, y: -1.55, r: 1.25 }, gust: 0.25 + 0.5 * gl }, wind: 1.6,
    chars: [[s4H, tq, { glow: gl, brow: 1 }]],
    front: () => {
      // aurora wisps licking up the blade when it ignites
      const a = t - T.bladeIgnite;
      if (a > 0) {
        for (const c of [ctx, gctx]) { c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; }
        const rr = new RNG(12);
        for (let i = 0; i < 14; i++) {
          const f = rr.next(), ph = rr.range(0, 1), life = 0.5, age = ((a * 1.3 + ph) % life) / life;
          const b = [lerp(guard[0], tip[0], f), lerp(guard[1], tip[1], f)];
          const x = b[0] + Math.sin(age * 5 + i) * 0.1 - age * 0.3, y = b[1] - age * 0.55;
          for (const c of [ctx, gctx]) { c.strokeStyle = `rgba(${i % 2 ? '90,255,220' : '150,130,255'},${(1 - age) * 0.8 * gl})`; c.lineWidth = 0.03 * (1 - age); c.beginPath(); c.moveTo(b[0], b[1]); c.quadraticCurveTo(b[0] - 0.1, b[1] - age * 0.3, x, y); c.stroke(); }
        }
        for (const c of [ctx, gctx]) c.restore();
        FX.glint(ctx, gctx, guard[0], guard[1], 1.5, pulse(a, 0, 0.05, 0.03, 0.2));
      }
    },
  });
  post(t, { flash: pulse(t, T.bladeIgnite, T.bladeIgnite + 0.03, 0.01, 0.12) * 0.3, flashCol: '120,255,230' });
}
function shot5a(t) {
  const tq = stepT(t, true), u = (t - T.s5a) / (T.s5b - T.s5a);
  const cam = { x: hx(s5H, t) + 0.95 - u * 0.9, y: -0.82, zoom: 1.28, rot: 0.035, eye: -0.8 };
  scene(t, cam, {
    bg: { gust: 0.9 }, wind: 6,
    pre: () => FX.speedLines(ctx, W, HH, t, { dir: -1, colors: ['#ffffff', '#7ff5e6', '#8fa2ff', '#18225c'], alpha: 0.6, n: 90, seed: 1 }),
    behind: () => { heroTrail(s5H, t, { dur: 0.16, alpha: 0.9 }); FX.dust(ctx, t, { t0: T.s5a, x: -3.7, dir: -1, size: 1.4, n: 8 }); },
    chars: [[s5H, tq, { glow: 1, brow: 1 }]],
    over: () => FX.speedLines(ctx, W, HH, t, { dir: -1, colors: ['#ffffff', '#bffcff'], alpha: 0.55, n: 14, seed: 2 }),
  });
  post(t);
}
function shot5b(t) {
  const tq = stepT(t, true), u = (t - T.s5b) / (T.s6 - T.s5b);
  const cam = { x: hx(s5R, t) - 0.95 + u * 0.9, y: -0.9, zoom: 1.18, rot: -0.035, eye: -0.85 };
  scene(t, cam, {
    bg: { gust: -0.9 }, wind: -6,
    pre: () => FX.speedLines(ctx, W, HH, t, { dir: 1, colors: ['#ff3a58', '#0a0810', '#7a0e25', '#ffd0d8'], alpha: 0.6, n: 90, seed: 3 }),
    behind: () => {
      // ink dripping off the dragging blade
      const rr = new RNG(4);
      for (let i = 0; i < 26; i++) { const tb = t - rr.range(0, 0.3), p = s5R.joint(tb, 'tip'), a = t - tb; ctx.fillStyle = '#08060c'; ctx.beginPath(); ctx.arc(p[0] + rr.range(-0.1, 0.1), Math.min(p[1] + 6 * a * a + rr.range(-0.05, 0.05), 0), rr.range(0.02, 0.06), 0, TAU); ctx.fill(); }
    },
    chars: [[s5R, tq, { glow: 1 }]],
    over: () => FX.speedLines(ctx, W, HH, t, { dir: 1, colors: ['#ff8fa0', '#0a0810'], alpha: 0.5, n: 14, seed: 5 }),
  });
  post(t, { tint: 'rgba(120,10,30,0.08)' });
}
function camS6(t) {
  const mid = (tt) => (hx(s6H, tt) + hx(s6R, tt)) / 2;
  let zoom, x, y = -1.18;
  if (t < T.clash1) { const u = (t - T.s6) / (T.clash1 - T.s6); zoom = lerp(0.6, 0.84, ease.in(u)); x = 0; }
  else {
    const w = smoothstep(5.93, 6.06, t);
    const zl = lerp(1.0, 1.16, clamp((t - T.clash1) / 0.5, 0, 1));
    zoom = lerp(zl, 0.86, w); y = lerp(-1.3, -1.18, w);
    x = lerp(0, (mid(t) + mid(t - 0.08) + mid(t - 0.16)) / 3, w);
    const w2 = smoothstep(7.0, 7.4, t);
    zoom = lerp(zoom, 0.8, w2); x = lerp(x, 1.7, w2);
  }
  for (const tc of [T.clash2, T.clash3, T.hOver + 0.06]) { const a = t - tc; if (a >= 0) zoom += 0.07 * Math.exp(-a * 9); }
  return shakeCam({ x, y, zoom, rot: 0, eye: -0.92 }, t);
}
function shot6(t) {
  const tq = stepT(t, t < 7.05);
  const cam = camS6(t);
  const fi = frameOf(t) - frameOf(T.clash1);
  if (fi === 0 || fi === 1) {
    impactFrame(t, cam, fi === 1, [[s6H, tq], [s6R, tq]], { focus: [0, -1.5], draw: (inv) => { FX.spark(ctx, null, T.clash1 + 0.03, { t0: T.clash1, x: 0, y: -1.5, size: 2.4, seed: 9, count: 0, color: inv ? '#3cf0d8' : '#ff3a58' }); } });
    post(t, { noBloom: true, noVignette: true });
    return;
  }
  scene(t, cam, {
    bg: { gust: 0.3 + 0.5 * Math.exp(-Math.max(t - T.clash1, 0) * 3), wave: (x) => (t > T.clash1 ? 0.5 * Math.sign(x) * Math.exp(-((Math.abs(x) - (t - T.clash1) * 16) ** 2) / 5) : 0) }, wind: 1.5,
    behind: () => { for (const d of DUSTS) FX.dust(ctx, t, d); },
    chars: [[s6R, tq, { glow: 1 }], [s6H, tq, { glow: 1, brow: 1 }]],
    front: () => {
      // after-images of the dodge
      if (t > 6.2 && t < 6.4) { for (const [dt, al] of [[0.09, 0.22], [0.05, 0.38]]) { bg.ground(ctx, cam, 1); s6H.draw(ctx, stepT(t - dt, true), { sil: '#7ff5e6', alpha: al }); } wld(cam); }
      for (const a of ARCS) FX.slashArc(ctx, gctx, stepT(t, true), a);
      for (const s of SPARKS) FX.spark(ctx, gctx, t, s);
    },
  });
  const f1 = pulse(t, T.clash1 + F(2), T.clash1 + F(2) + 0.02, 0.005, 0.14) * 0.5;
  post(t, { flash: f1 + pulse(t, T.clash3, T.clash3 + 0.02, 0.005, 0.1) * 0.3 });
}
function shot6b(t) {
  const u = (t - T.s6b) / (T.s7 - T.s6b), tq = stepT(t);
  const cam = shakeCam({ x: 2.95 - u * 0.1, y: -1.3, zoom: lerp(1.16, 1.3, u), rot: 0.06, eye: -0.36 }, t);
  const gk = smoothstep(7.5, 7.9, t);
  cam.x += noise1(frameOf(t) * 3.1, 7) * 0.02 * gk; cam.y += noise1(frameOf(t) * 2.7, 8) * 0.02 * gk;
  const tip = s7R.joint(tq, 'tip');
  scene(t, cam, {
    bg: { moon: { x: 1.1, y: -1.9, r: 1.25 }, gust: -0.5 * gk, wave: (x) => -0.4 * gk * Math.exp(-((x - 3.3) ** 2) / 8) }, wind: -2,
    behind: () => FX.inkGather(ctx, gctx, t, { t0: 7.5, dur: 0.42, x: tip[0], ty: tip[1] }),
    chars: [[s7R, tq, { glow: 1 + gk }]],
  });
  post(t, { tint: `rgba(140,10,35,${0.12 * gk})`, bloom: 1 + 0.4 * gk });
}
function shot7(t) {
  const tq = stepT(t, true);
  const hy = s7H.state(t).R.y;
  const w = smoothstep(8.05, 8.45, t);
  const cam = shakeCam({ x: lerp(0.9, -1.0, w), y: lerp(-1.3, -3.7, smoothstep(8.28, 8.98, t)), zoom: lerp(0.58, 0.72, smoothstep(8.3, 9.0, t)), rot: lerp(0, -0.05, smoothstep(8.3, 9.0, t)), eye: -1.0 }, t);
  const xf = WAVE.x0 - WAVE.speed * (t - WAVE.t0);
  scene(t, cam, {
    bg: { gust: -0.4, wave: (x) => (t > WAVE.t0 ? -0.9 * Math.exp(-((x - xf + 0.5) ** 2) / 3) : 0), noNear: false }, wind: -2,
    behind: () => { FX.inkTrail(ctx, t, { t0: WAVE.t0, x0: WAVE.x0, speed: WAVE.speed, xEnd: -7, fade0: 9, fade1: 10 }); FX.dust(ctx, t, { t0: T.slam, x: 2.3, dir: -1, size: 2.2, n: 10 }); FX.dust(ctx, t, { t0: T.jump, x: -1.6, dir: 0, size: 1.3, n: 7 }); },
    chars: [[s7R, tq, { glow: 1.5 }], [s7H, tq, { glow: 1, brow: 1 }]],
    front: () => { FX.inkWave(ctx, gctx, t, WAVE); FX.spark(ctx, gctx, t, { t0: T.slam, x: 2.2, y: -0.1, size: 1.6, seed: 11, count: 20, color: '#ff5a78', ringSquash: 0.3 }); },
  });
  post(t, { flash: pulse(t, T.slam, T.slam + 0.02, 0.005, 0.12) * 0.35, flashCol: '255,80,110' });
}
function shot8(t) {
  const tq = stepT(t, t > 10.2);
  const cam = { x: 0.1, y: -7.75, zoom: lerp(1.04, 1.14, (t - T.s8) / (T.s9 - T.s8)), rot: -0.03, eye: -1 };
  const ak = smoothstep(9.4, 10.15, t);
  const gl = 0.35 + 0.65 * smoothstep(9.85, 10.05, t) + pulse(t, 10.28, T.s9, 0.03, 0.01) * 1.2;
  beginFrame();
  bg.drawBack(ctx, gctx, cam, t, { moon: { x: 0.05, y: -7.1, r: 1.95 }, aurora: ak, auroraY: -4.4 });
  // fluff carried up with her
  const rr = new RNG(66);
  wld(cam);
  for (let i = 0; i < 40; i++) { const x = rr.range(-5, 5), y0 = rr.range(-11, -4), sp = rr.range(0.4, 1.4); const y = y0 - ((t - T.s8) * sp) % 3; for (const c of [ctx, gctx]) { c.fillStyle = `rgba(220,235,255,${c === ctx ? 0.6 : 0.3})`; c.beginPath(); c.ellipse(x + Math.sin(t * 2 + i) * 0.1, y, 0.03, 0.012, i + t, 0, TAU); c.fill(); } }
  heroTrail(s8H, t, { dur: 0.2, alpha: 0.8, minMove: 0.05 });
  drawChar(s8H, cam, tq, { glow: gl, brow: 1, shade: 0.5, lw: 0.012 });
  wld(cam);
  const hd = s8H.joint(tq, 'headC');
  FX.glint(ctx, gctx, hd[0] + 0.09, hd[1], 1.3, pulse(t, 9.93, 9.98, 0.04, 0.2), '#aefff0');
  const tip = s8H.joint(tq, 'tip');
  FX.glint(ctx, gctx, tip[0], tip[1], 1.8, pulse(t, 10.27, 10.32, 0.04, 0.1));
  if (t > 10.33) { const g = s8H.joint(t, 'chest'); FX.beam(ctx, gctx, [0.3, -8.6], [g[0] + 0.6, g[1] + 0.5], 0.5, 1, 0); }
  post(t, { bloom: 1.1, flash: pulse(t, 10.34, T.s9, 0.02, 0.01) * 0.5, flashCol: '190,255,245' });
}
const CUT_A = [-4.2, -5.0], CUT_B = [4.3, -0.35];
function shot9(t) {
  const fi = frameOf(t) - frameOf(T.s9);
  if (fi < 3) {
    // abstract cut-in: the stroke itself
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
  const tq = stepT(t), a = t - T.s9b;
  const cam = shakeCam({ x: 1.7, y: -1.28, zoom: 0.66, rot: 0, eye: -1.0 }, t);
  if (fi === 3 || fi === 4) {
    impactFrame(t, cam, fi === 4, [[s9R, tq], [s9H, tq]], { focus: [0.9, -1.3], draw: (inv) => { FX.beam(ctx, null, CUT_A, CUT_B, 0.2, 1, 0); ctx.strokeStyle = inv ? '#3cf0d8' : '#05060f'; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.moveTo(CUT_A[0], CUT_A[1]); ctx.lineTo(CUT_B[0], CUT_B[1]); ctx.stroke(); } });
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
    chars: [[s9R, tq, { glow: 0.8 * (1 - smoothstep(0.3, 1.2, a)), eye: 1 - 0.6 * smoothstep(0.2, 1.0, a) }], [s9H, tq, { glow: 1, brow: 1 }]],
    front: () => { FX.beam(ctx, gctx, CUT_A, CUT_B, 0.16 * (1 - smoothstep(0.05, 0.9, a)) + 0.012, 1 - smoothstep(0.2, 1.1, a), smoothstep(0.1, 1.0, a) * 0.7); FX.dust(ctx, t, { t0: T.s9b, x: 3.2, dir: -1, size: 1.6, n: 9 }); },
  });
}
function shot10(t) {
  const u = (t - T.s10) / (T.s11 - T.s10), a = t - T.s9b;
  const cam = { x: lerp(2.1, 2.25, u), y: -1.22, zoom: lerp(0.8, 0.84, u), rot: 0, eye: -1.0 };
  drawAftermath(t, cam, stepT(t), a);
  post(t, { bloom: 1.1 });
}
function shot11(t) {
  beginFrame();
  const sp = smoothstep(T.split, T.split + 0.22, t);
  const flick = t < T.split ? 0.55 + 0.45 * Math.sin(t * 70) * Math.sin(t * 23) : Math.max(0, 1 - (t - T.split) / 0.1);
  drawRivalMask(ctx, gctx, W, HH, t, { eye: flick, drip: 1, crack: smoothstep(T.crack, T.crack + 0.2, t), split: sp, shake: t > T.split ? 10 * Math.exp(-(t - T.split) * 6) : (t > T.crack ? 3 : 0), push: lerp(1.04, 1.1, (t - T.s11) / (T.s12 - T.s11)) });
  post(t, { bloom: 1.2, flash: pulse(t, T.split, T.split + 0.03, 0.005, 0.15) * 0.6, flashCol: '170,255,240' });
}
function shot12(t) {
  const u = (t - T.s12) / (T.end - T.s12), tq = stepT(t);
  const cam = { x: lerp(2.3, 2.75, ease.inout(u)), y: lerp(-1.25, -2.05, ease.inout(u)), zoom: lerp(0.8, 0.66, ease.inout(u)), rot: 0, eye: -1.0 };
  const dk = smoothstep(13.0, 14.15, t);
  const gl = 1 - smoothstep(T.flick + 0.1, T.flick + 0.5, t);
  scene(t, cam, {
    bg: { aurora: 1 + 0.3 * u, gust: 0.12 }, wind: 1,
    chars: [[s9H, tq, { glow: gl, brow: 1 - smoothstep(13.3, 14, t) }]],
    behind: () => {
      // the rival crumbles into ink petals
      tctx.setTransform(1, 0, 0, 1, 0, 0); tctx.globalCompositeOperation = 'source-over'; tctx.clearRect(0, 0, W, HH);
      bg.ground(tctx, cam, 1); s9R.draw(tctx, tq, { eye: 0 });
      bg.ground(tctx, cam, 1); tctx.globalCompositeOperation = 'destination-out';
      const rr = new RNG(55), rx = hx(s9R, tq);
      for (let i = 0; i < 300; i++) { const x = rx + rr.range(-1.0, 1.0), y = -rr.range(0, 2.6); const thr = clamp(0.8 * (1 - (-y) / 2.6) + rr.range(-0.12, 0.2), 0, 1) * 0.86; if (dk > thr) { tctx.beginPath(); tctx.arc(x, y, (dk - thr) * 1.0 + 0.02, 0, TAU); tctx.fill(); } }
      tctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tmpC, 0, 0);
      wld(cam);
      FX.inkPetals(ctx, gctx, t, { t0: 13.0, dur: 1.1, n: 170, x: rx, y: 0, seed: 21 });
    },
    front: () => { FX.slashArc(ctx, gctx, stepT(t, true), ARCS[4]); const tip = s9H.joint(tq, 'tip'); FX.glint(ctx, gctx, tip[0], tip[1], 0.9, pulse(t, T.flick + 0.05, T.flick + 0.08, 0.02, 0.2)); },
    over: () => title(t),
  });
  post(t, { bloom: 1.1, fade: smoothstep(14.55, 14.98, t) });
}
const SHOTS = [[0, shot1], [T.s2, shot2], [T.s3, shot3], [T.s4, shot4], [T.s5a, shot5a], [T.s5b, shot5b], [T.s6, shot6], [T.s6b, shot6b], [T.s7, shot7], [T.s8, shot8], [T.s9, shot9], [T.s10, shot10], [T.s11, shot11], [T.s12, shot12]];

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

window.__renderAt = (t) => {
  if (mode === 'poses') return poseSheet(t);
  t += 1e-5;
  let fn = SHOTS[0][1];
  for (const [t0, f] of SHOTS) if (t >= t0 - 1e-6) fn = f;
  fn(t);
};
window.__info = () => ({ fps: 24, duration: T.end, T, sparks: SPARKS.map((s) => ({ t: s.t0, size: s.size })), arcs: ARCS.map((a) => ({ t: a.t0, style: a.style })), wave: WAVE });
window.__ready = true;
