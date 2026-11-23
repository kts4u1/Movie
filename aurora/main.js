// AURORA BLADE (30 s) — sculpted 3D characters rendered in ink-and-paint, in a moonlit pampas field.
//   SERA (세라 星羅), the aurora swordswoman, and KOKUYA (흑야 黑夜), the masked ink demon.
// window.__renderAt(t) renders the frame at time t (24 fps). The choreography and timing match the
// soundtrack (soundtrack.py reads window.__info()).
import * as THREE from 'three';
import { Character3D } from './char3d.js';
import { buildEnv } from './env.js';
import { buildPost } from './post.js';
import { inkMaterial } from './shaders.js';
import { H, R } from './poses.js';
import { poseTrack, rootTrack, F } from './anim.js';
import { FX, RNG } from './fx3d.js';
import { Overlay } from './overlay.js';
import { clamp, lerp, smoothstep, pulse, noise1, ease } from './util.js';

const V3 = THREE.Vector3;
const params = new URLSearchParams(location.search);
const W = parseInt(params.get('w') || '1920', 10), HH = parseInt(params.get('h') || '1080', 10);
const GH = Math.round(W / 2.39), TOP = Math.round((HH - GH) / 2);
const glc = document.getElementById('gl'), ovc = document.getElementById('ov');
glc.style.top = `${TOP}px`;
ovc.width = W; ovc.height = HH;
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, GH);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0, 0, 0);
const camera = new THREE.PerspectiveCamera(30, W / GH, 0.05, 1200);
const lightSrc = inkMaterial({});
lightSrc.uniforms.uRes.value.set(W, GH);
const env = buildEnv(scene);
const envMeshes = scene.children.slice();
const post = buildPost(renderer, scene, camera, W, GH);
const film = post.film;
const fx = new FX(scene, camera);
const ov = new Overlay(ovc, W, HH, TOP, GH);
const splitC = document.createElement('canvas'); splitC.width = W; splitC.height = GH;
const splitG = splitC.getContext('2d');

// ground decal (ink pool)
const decalMat = new THREE.ShaderMaterial({
  uniforms: { uA: { value: 1 }, uT: { value: 0 } }, transparent: true, depthWrite: false,
  vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec2 vP; uniform float uA, uT;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f); return mix(mix(h12(i), h12(i+vec2(1,0)), u.x), mix(h12(i+vec2(0,1)), h12(i+vec2(1,1)), u.x), u.y); }
    void main(){ float d = length(vP); float a = atan(vP.y, vP.x); float n = vn(vec2(a * 3.0, uT)) * 0.5 + vn(vP * 6.0) * 0.3;
      float m = 1.0 - smoothstep(0.62, 0.7, d + n * 0.35); float sheen = smoothstep(0.3, 0.0, abs(d - 0.45 - n * 0.2)) * 0.06;
      gl_FragColor = vec4(vec3(0.012, 0.008, 0.014) + sheen * vec3(0.6, 0.1, 0.2), m * uA); }`,
});
const decal = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), decalMat);
decal.position.y = 0.012; decal.renderOrder = 3; decal.visible = false; scene.add(decal);

// ================================================================ timeline (seconds; F(n) = frame n at 24 fps)
const T = {
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
const mk = (poses, roots, hold = 1) => ({ poseAt: poseTrack(poses, hold), rootAt: rootTrack(roots) });
const cycle = (a, b, t0, t1, step) => { const k = []; let i = 0; for (let t = t0; t <= t1 + 1e-6; t += step, i++) k.push({ t, p: i % 2 ? b : a, e: 'linear' }); return k; };
const hx = (tr, t) => tr.rootAt(t).x;

// ---------------- act 1
const s1H = mk([{ t: 0, p: restDown }], [{ t: 0, x: -2.4, f: 1, wind: 0.45 }, { t: 1.0, x: -2.4, wind: 1.05, dur: 0.35 }, { t: 2.2, x: -2.4, wind: 0.6, dur: 0.7 }]);
const s2R = mk([{ t: T.s2, p: R.kneel }, { t: T.riseA + 0.32, p: R.kneel }, { t: T.card2 - 0.02, p: R.laugh, dur: 0.25, e: 'out' }],
  [{ t: T.s2, x: 2.4, y: 2.6, f: -1, wind: 0.9 }, { t: T.riseA, x: 2.4, y: 2.6 }, { t: T.card2 - 0.04, x: 2.4, y: 0, dur: 0.38, e: 'out', wind: 1.3 }]);
const s3H = mk([{ t: T.s3, p: restDown }, { t: T.headTurn + 0.18, p: H.restGrip, dur: 0.22, e: 'out' }], [{ t: T.s3, x: -2.4, f: 1, wind: 0.6 }, { t: T.headTurn + 0.2, x: -2.4, wind: 1.35, dur: 0.25 }]);
const laughA = P(R.laugh, { head: -14, lean: -4 }), laughB = P(R.laugh, { head: -30, lean: -9 });
const s4R = mk([...cycle(laughA, laughB, T.s4 - 0.1, T.s5 - 0.3, 0.13), { t: T.s5, p: P(R.laugh, { head: -6, lean: 2 }), dur: 0.3 }], [{ t: T.s4, x: 2.4, f: -1, wind: 1.0 }]);
const s5H = mk([{ t: T.s5, p: P(H.restGrip, { head: -8 }) }, { t: T.s6, p: P(H.restGrip, { head: -12 }), dur: 1.0 }], [{ t: T.s5, x: -2.4, f: 1, wind: 1.1 }]);
const s6H = mk([{ t: T.s6, p: P(H.restGrip, { sheathing: 0.0025, lean: 6 }) }, { t: T.push, p: P(H.restGrip, { sheathing: 0.0025, lean: 6 }) }, { t: T.push + 0.06, p: P(H.restGrip, { sheathing: 0.11, lean: 9 }), dur: 0.06, e: 'snap' }],
  [{ t: T.s6, x: -2.4, f: 1, wind: 1.1 }]);
const s7H = mk(cycle(H.runA, H.runB, T.s7 - 0.1, T.s8 + 0.1, F(2)), [{ t: T.s7, x: -6, f: 1, wind: 1.2 }, { t: T.s8, x: -1.5, e: 'linear' }], 0);
const s7R = mk(cycle(R.runA, R.runB, T.s7 - 0.1, T.s8 + 0.1, F(2)), [{ t: T.s7, x: 6, f: -1, wind: 1.2 }, { t: T.s8, x: 1.5, e: 'linear' }], 0);

// ---------------- act 2
const s8H = mk([
  { t: T.s8, p: H.runA }, { t: r8(5.375), p: H.upWind, dur: 0.06 }, { t: T.clash1, p: clashH, dur: 0.07, e: 'snap' }, { t: r8(5.75), p: lockH, dur: 0.25 },
  { t: r8(6.08), p: H.backstep, dur: 0.14, e: 'out' }, { t: r8(6.17), p: H.ready, dur: 0.08 }, { t: r8(6.3), p: H.backstep, dur: 0.09, e: 'out' },
  { t: r8(6.365), p: H.upWind, dur: 0.05 }, { t: r8(6.445), p: H.upEnd, dur: 0.07, e: 'snap' }, { t: r8(6.6), p: H.ready, dur: 0.12 },
  { t: r8(6.7), p: H.duck, dur: 0.07, e: 'snap' }, { t: r8(6.86), p: H.low, dur: 0.08 }, { t: r8(6.96), p: H.spin, dur: 0.09, e: 'snap' }, { t: r8(7.15), p: H.ready, dur: 0.16 },
], [
  { t: T.s8, x: -3.0, f: 1, wind: 0.9 }, { t: T.clash1, x: -0.62, e: 'linear' }, { t: r8(5.92), x: -0.62 }, { t: r8(6.08), x: -1.75, dur: 0.15, e: 'out' }, { t: r8(6.19), x: -1.75 },
  { t: r8(6.3), x: -2.55, dur: 0.1, e: 'out' }, { t: r8(6.445), x: -1.0, dur: 0.1, e: 'out' }, { t: r8(6.86), x: -1.0 }, { t: r8(6.9), x: -0.85, f: -1, dur: 0.04 }, { t: r8(6.96), x: -0.55, f: 1, dur: 0.06 }, { t: r8(7.5), x: -0.55 },
]);
const s8R = mk([
  { t: T.s8, p: R.runA }, { t: r8(5.375), p: R.overWind, dur: 0.06 }, { t: T.clash1, p: clashR, dur: 0.07, e: 'snap' }, { t: r8(5.75), p: lockR, dur: 0.25 },
  { t: r8(6.08), p: R.ready, dur: 0.14, e: 'out' }, { t: r8(6.17), p: R.overWind, dur: 0.08 }, { t: r8(6.275), p: R.overEnd, dur: 0.07, e: 'snap' }, { t: r8(6.38), p: R.ready, dur: 0.08 },
  { t: r8(6.445), p: R.block, dur: 0.05 }, { t: r8(6.62), p: R.sweepWind, dur: 0.1 }, { t: r8(6.72), p: R.sweepEnd, dur: 0.07, e: 'snap' }, { t: r8(6.9), p: R.block, dur: 0.08 },
  { t: T.clash3, p: R.knock, dur: 0.05, e: 'snap' }, { t: r8(7.4), p: R.ready, dur: 0.18 },
], [
  { t: T.s8, x: 3.0, f: -1, wind: 0.9 }, { t: T.clash1, x: 0.62, e: 'linear' }, { t: r8(5.92), x: 0.62 }, { t: r8(6.08), x: 1.3, dur: 0.15, e: 'out' }, { t: r8(6.16), x: 1.3 },
  { t: r8(6.275), x: 0.25, dur: 0.1, e: 'out' }, { t: r8(6.445), x: 0.55, dur: 0.06 }, { t: r8(6.62), x: 0.55 }, { t: r8(6.72), x: 0.3, dur: 0.08 }, { t: T.clash3, x: 0.5, dur: 0.05 }, { t: r8(7.36), x: 3.3, dur: 0.4, e: 'out' },
]);
const FLURRY = [0, 0.13, 0.26, 0.39, 0.52, 0.66, 0.8].map((d) => T.flurry + d);
const flurryPoses = [H.upEnd, H.downEnd, H.spin, H.upEnd, H.downEnd, H.spin, H.upEnd];
const s9H = mk([{ t: T.s9, p: H.ready }, { t: T.flurry - 0.12, p: H.low, dur: 0.1 }, ...FLURRY.map((t, i) => ({ t, p: flurryPoses[i], dur: 0.06, e: 'snap' })), { t: T.s10, p: H.ready, dur: 0.2 }],
  [{ t: T.s9, x: -1.9, f: 1, wind: 1.0 }, { t: T.flurry, x: -1.6, dur: 0.1 }]);
const s9R = mk([{ t: T.s9, p: R.ready }, { t: T.crows - 0.05, p: R.cast, dur: 0.12, e: 'snap' }, { t: T.s10 - 0.2, p: R.ready, dur: 0.3 }], [{ t: T.s9, x: 2.7, f: -1, wind: 1.1 }]);
const ARCS9 = FLURRY.map((t0, i) => ({ t0, dur: 0.05, life: 0.22, cx: -1.0 + (i % 3) * 0.12, cy: -1.15 - (i % 2) * 0.2, rx: 1.0 + (i % 3) * 0.15, ry: i % 3 === 2 ? 0.45 : 1.0 + (i % 3) * 0.15, rot: (i * 37) % 30 - 15, a0: i % 2 ? 120 : -100, a1: i % 2 ? -110 : 110, width: 0.3, style: 'aurora', seed: 20 + i }));
const s10R = mk([{ t: T.s10, p: R.ready }, { t: T.s10 + 0.22, p: R.gather, dur: 0.16, e: 'out' }, { t: T.slam, p: R.slam, dur: 0.07, e: 'snap' }], [{ t: T.s10, x: 3.3, f: -1, wind: 1.0 }]);
const s10H = mk([{ t: T.s10, p: H.ready }, { t: T.jump - 0.07, p: lowDeep, dur: 0.1, e: 'out' }, { t: T.jump + 0.07, p: H.jump, dur: 0.07, e: 'snap' }, { t: T.s11, p: H.arch, dur: 0.5 }],
  [{ t: T.s10, x: -1.6, f: 1, wind: 0.8 }, { t: T.jump, x: -1.6 }, { t: T.s11, x: -1.2, y: -4.4, dur: 0.75, e: 'out' }]);
const WAVE = { t0: T.slam + 0.02, x0: 2.0, speed: 13, height: 2.5, len: 6, life: 1.5 };
const s11H = mk([{ t: T.s11, p: H.arch }, { t: T.airClash - 0.15, p: H.downWind, dur: 0.2 }, { t: T.airClash, p: H.downEnd, dur: 0.06, e: 'snap' }, { t: T.airClash + 0.25, p: H.fall, dur: 0.12, e: 'out' }],
  [{ t: T.s11, x: -3.4, y: -5.0, f: 1, wind: 0.9, rot: -10 }, { t: T.airClash, x: -0.62, y: -7.35, rot: 8, dur: 0.83, e: 'out' }, { t: T.airClash + 0.12, x: -0.7, y: -7.35, rot: 8 }, { t: T.s12, x: -4.2, y: -4.0, rot: -200, dur: 0.9, e: 'in' }], 0.5);
const s11R = mk([{ t: T.s11, p: R.runA }, { t: T.airClash - 0.15, p: R.air, dur: 0.2 }, { t: T.airClash, p: R.overEnd, dur: 0.06, e: 'snap' }],
  [{ t: T.s11, x: 3.6, y: -4.8, f: -1, wind: 0.9, rot: 6 }, { t: T.airClash, x: 0.66, y: -7.45, rot: -4, dur: 0.83, e: 'out' }, { t: T.s12, x: 1.6, y: -8.4, rot: -10, dur: 0.9, e: 'out' }], 0.5);
const s12H = mk([{ t: T.s12, p: H.fall }, { t: T.crash, p: H.land, dur: 0.05, e: 'snap' }, { t: T.crash + 0.45, p: H.kneel, dur: 0.3, e: 'out' }],
  [{ t: T.s12, x: -4.4, y: -4.6, f: 1, rot: -170, wind: 0.8 }, { t: T.crash, x: -2.3, y: 0, rot: 0, dur: 0.21, e: 'in' }, { t: T.crash + 0.32, x: -2.8, dur: 0.3, e: 'out' }]);
const s12R = mk([{ t: T.s12, p: R.air }, { t: T.rLand, p: R.slam, dur: 0.05, e: 'snap' }, { t: T.rLand + 0.35, p: R.idle, dur: 0.3 }, ...cycle(R.walkA, R.walkB, T.rLand + 0.6, T.s13 + 0.4, 0.34)],
  [{ t: T.s12, x: 3.0, y: -4.5, f: -1, wind: 0.9 }, { t: T.rLand, x: 2.9, y: 0, dur: 0.2, e: 'in' }, { t: T.rLand + 0.6, x: 2.9 }, { t: T.s13 + 0.4, x: 1.9, e: 'linear' }]);
const s13H = mk([{ t: T.s13, p: H.kneel }, { t: T.rise, p: H.kneel }, { t: T.rise + 0.45, p: H.high, dur: 0.42, e: 'out' }],
  [{ t: T.s13, x: -2.8, f: 1, wind: 0.5 }, { t: T.rise, x: -2.8, wind: 0.5, lift: 0 }, { t: T.rise + 0.5, x: -2.8, wind: 0.3, lift: 0.75, dur: 0.5 }]);
const s13bH = mk([{ t: T.s13b, p: P(H.ready, { head: -4 }) }], [{ t: T.s13b, x: -2.8, f: 1, wind: 1.3, lift: 0.75 }]);
const s14R = mk([{ t: T.s14, p: R.ready }, { t: T.s14 + 0.25, p: R.dragon, dur: 0.15, e: 'out' }, ...cycle(R.runA, R.runB, T.s14 + 0.5, T.s15, F(2))],
  [{ t: T.s14, x: 3.4, f: -1, wind: 1.0 }, { t: T.s14 + 0.45, x: 3.4 }, { t: T.s15, x: -0.1, e: 'in', wind: 1.4 }], 0);
const s14H = mk([{ t: T.s14, p: H.high }, { t: T.s14 + 0.35, p: lowDeep, dur: 0.15, e: 'out' }, ...cycle(H.runA, H.runB, T.s14 + 0.6, T.s15, F(2))],
  [{ t: T.s14, x: -3.4, f: 1, wind: 0.7, lift: 0.4 }, { t: T.s14 + 0.55, x: -3.4, lift: 0 }, { t: T.s15, x: -1.0, e: 'in', wind: 1.4 }], 0);
const dragonHead = (tt) => {
  const u = clamp((tt - T.s14) / (T.s15 - T.s14), 0, 1);
  if (u < 0.45) { const k = u / 0.45; return [lerp(5.2, 2.9, k) + Math.sin(k * 6) * 0.2, lerp(-0.6, -3.6, ease.out(k))]; }
  const k = (u - 0.45) / 0.55; return [lerp(2.9, -0.8, ease.in(k)), lerp(-3.6, -1.7, ease.inout(k)) + Math.sin(k * 9) * 0.15];
};

// ---------------- act 3
const s15H = mk([{ t: T.s15, p: H.finish }, { t: T.s18 + 0.35, p: H.rise, dur: 0.38 }, { t: T.flick, p: H.chiburi, dur: 0.08, e: 'snap' }, { t: T.sheatheA, p: H.chiburi }, { t: T.sheatheA + 0.06, p: H.sheatheA, dur: 0.06, e: 'snap' }, { t: T.click, p: H.sheatheB, dur: 0.3, e: 'inout' }, { t: T.click + 0.04, p: H.sheathed, dur: 0.04 }, { t: 29.6, p: P(H.sheathed, { head: -30 }), dur: 0.5 }],
  [{ t: T.s15, x: 3.6, f: 1, wind: 0.75 }, { t: r15(12), x: 3.6, wind: 0.45, dur: 0.7 }]);
const s15R = mk([{ t: T.s15, p: R.guardUp }, { t: r15(11.95), p: R.struck, dur: 0.6 }, { t: T.s18 + 0.2, p: R.kneel, dur: 0.33, e: 'in' }], [{ t: T.s15, x: 0.9, f: -1, wind: 0.75 }, { t: r15(12), x: 0.9, wind: 0.45, dur: 0.7 }]);

// ---------------- effects lists
const ARCS = [
  { t0: T.hOver, dur: 0.06, life: 0.26, cx: 0.6, cy: -1.3, rx: 1.95, ry: 1.95, rot: 0, a0: -55, a1: -215, width: 0.5, style: 'ink', seed: 2 },
  { t0: T.hUp, dur: 0.06, life: 0.28, cx: -1.1, cy: -1.15, rx: 1.35, ry: 1.35, rot: 0, a0: 105, a1: -100, width: 0.36, style: 'aurora', seed: 3 },
  { t0: T.hSweep, dur: 0.06, life: 0.24, cx: 0.2, cy: -1.02, rx: 2.1, ry: 0.5, rot: -4, a0: -25, a1: 205, width: 0.45, style: 'ink', seed: 5 },
  { t0: T.hSpin, dur: 0.09, life: 0.3, cx: -0.6, cy: -1.0, rx: 1.55, ry: 0.5, rot: 3, a0: 190, a1: -150, width: 0.38, style: 'aurora', seed: 7 },
];
const FLICK = { t0: T.flick, dur: 0.05, life: 0.3, cx: 3.75, cy: -0.95, rx: 0.9, ry: 0.9, rot: 0, a0: -20, a1: 75, width: 0.14, style: 'aurora', seed: 9 };
const TEAL = [0.5, 2.2, 2.0], RED = [2.4, 0.25, 0.4];
const SPARKS = [
  { t0: T.clash1 + F(2), x: 0, y: -1.5, size: 1.4, seed: 1, count: 30 },
  { t0: r8(5.66), x: 0.02, y: -1.47, size: 0.4, seed: 4, count: 8 }, { t0: r8(5.79), x: -0.02, y: -1.45, size: 0.45, seed: 5, count: 8 }, { t0: r8(5.9), x: 0, y: -1.46, size: 0.5, seed: 6, count: 9 },
  { t0: T.clash2, x: -0.05, y: -1.75, size: 1.0, seed: 2, count: 20, col: TEAL },
  { t0: T.clash3, x: 0.15, y: -1.15, size: 1.2, seed: 3, count: 24, col: TEAL },
];
const DUSTS = [
  { t0: T.s8 + 0.02, x: -2.6, dir: -1, size: 1 }, { t0: T.s8 + 0.02, x: 2.6, dir: 1, size: 1 }, { t0: T.clash1 + F(2), x: 0, dir: 0, size: 1.5, n: 9 },
  { t0: r8(6.0), x: -1.3, dir: 1, size: 1 }, { t0: r8(6.0), x: 1.0, dir: -1, size: 1 }, { t0: r8(6.27), x: -2.5, dir: 1, size: 0.9 }, { t0: r8(6.28), x: 0.1, dir: -1, size: 1.3, n: 8 },
  { t0: r8(6.44), x: -1.2, dir: -1, size: 0.9 }, { t0: r8(7.0), x: 0.9, dir: -1, size: 1.2 }, { t0: r8(7.1), x: 1.8, dir: -1, size: 1.2 }, { t0: r8(7.2), x: 2.6, dir: -1, size: 1.1 }, { t0: r8(7.3), x: 3.1, dir: -1, size: 0.9 },
];
const SHAKES = [
  { t: T.clash1, a: 0.16, d: 7 }, { t: T.hOver + 0.06, a: 0.08, d: 9 }, { t: T.clash2, a: 0.07, d: 10 }, { t: T.clash3, a: 0.12, d: 8 },
  ...FLURRY.map((t) => ({ t, a: 0.035, d: 12 })), { t: T.slam, a: 0.22, d: 5 }, { t: T.airClash, a: 0.25, d: 5 }, { t: T.crash, a: 0.3, d: 5 }, { t: T.rLand, a: 0.14, d: 7 },
  { t: T.rise + 0.45, a: 0.05, d: 4 }, { t: T.s15b, a: 0.2, d: 6 }, { t: T.split, a: 0.06, d: 6 },
];
const crowCut = (i, arrive) => { const c = FLURRY.find((f) => f >= arrive - 0.06); return c ?? FLURRY[FLURRY.length - 1]; };
const RED_A = '#d23a52', TEAL_A = '#4fe0cc';
const CALLOUTS = [
  { t0: T.crows - 0.18, dur: 0.62, text: '먹의 형 · 까마귀 떼', sub: '墨之型 · 鴉群', x: 1780, y: 150, align: 'right', col: RED_A, from: 1 },
  { t0: T.flurry - 0.12, dur: 0.95, text: '극광류 제2형 · 성운난무', sub: '極光流 第二型 · 星雲亂舞', x: 150, y: 170, col: TEAL_A, from: -1 },
  { t0: T.s14 + 0.05, dur: 0.95, text: '먹의 형 · 흑룡', sub: '墨之型 · 黑龍', x: 1780, y: 160, align: 'right', col: RED_A, from: 1, size: 104 },
];
const ULT = { t0: T.s13b + 0.12, dur: 0.8, text: '극광류 오의 · 북극일섬', sub: '極光流 奧義 · 北極一閃', x: 960, y: 720, align: 'center', col: TEAL_A, from: -1, size: 100 };
const SUBS = [
  { t0: T.s4 + 0.12, dur: 0.98, who: '흑야', whoCol: '#ff7d92', text: '달 밝은 밤이군… 그 빛, 먹으로 덮어주마.' },
  { t0: T.s5 + 0.15, dur: 1.05, who: '세라', whoCol: '#86f0e2', text: '그 먹, 남김없이 베어주지.' },
  { t0: T.rLand + 0.55, dur: 1.15, who: '흑야', whoCol: '#ff7d92', text: '빛이 꺼져가는구나.' },
  { t0: T.s13 + 0.12, dur: 0.95, who: '세라', whoCol: '#86f0e2', text: '…아니. 이제부터다.' },
];

// ================================================================ characters
const hero = new Character3D('hero', s1H, scene, lightSrc);
const rival = new Character3D('rival', s2R, scene, lightSrc);
const use = (ch, tr) => { if (ch.anim !== tr) { ch.anim = tr; ch.cache.clear(); } };
function show(ch, tr, t, o = {}) { use(ch, tr); ch.setVisible(true); ch.update(t, o); }
function headAt(ch, t) {
  const s = ch.state(t), L = s.L, n = L.neck, h = L.headTop;
  const ux = (h[0] - n[0]) / 0.29, uy = (h[1] - n[1]) / 0.29;
  return (f, u, z = 0) => ch.toWorld(s, [n[0] + ux * u + uy * f, n[1] + uy * u - ux * f, z]);
}
const w3 = (x, y, z = 0) => new V3(x, -y, z);

// ================================================================ frame plumbing
const frameOf = (t) => Math.floor(t * 24 + 1e-4);
const camQ = { p: new V3(), q: new V3(), fov: 30, roll: 0 };
function look(px, py, pz, tx, ty, tz, fov = 30, roll = 0) { camQ.p.set(px, py, pz); camQ.q.set(tx, ty, tz); camQ.fov = fov; camQ.roll = roll; }
function shake(t, k = 1) {
  const f = frameOf(t);
  for (const s of SHAKES) {
    const age = t - s.t;
    if (age < 0 || age > 0.9) continue;
    const a = s.a * Math.exp(-age * s.d) * 0.7 * k;
    camQ.p.x += noise1(f * 3.7 + s.t, 1) * a; camQ.p.y += noise1(f * 4.3 + s.t, 2) * a;
    camQ.q.x += noise1(f * 3.7 + s.t, 1) * a * 0.6; camQ.q.y += noise1(f * 4.3 + s.t, 2) * a * 0.6;
    camQ.roll += noise1(f * 5.1 + s.t, 3) * a * 0.05;
  }
}
function applyCam() {
  camera.position.copy(camQ.p); camera.up.set(Math.sin(camQ.roll), Math.cos(camQ.roll), 0); camera.lookAt(camQ.q);
  camera.fov = camQ.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
}
const envO = {};
function envSet(o) { Object.assign(envO, o); }
function resetFrame() {
  hero.setVisible(false); rival.setVisible(false); decal.visible = false;
  for (const m of envMeshes) m.visible = true;
  for (const k of Object.keys(envO)) delete envO[k];
  film.uInvert.value = 0; film.uToneK.value = 0; film.uFlash.value = 0; film.uFade.value = 0; film.uCutOff.value = 0; film.uCutGlow.value = 0;
  film.uFlashCol.value.setRGB(1, 1, 1); film.uSat.value = 0.92; film.uGrain.value = 0.05; scene.background.setRGB(0, 0, 0); film.uCA.value = 0.0015;
  post.bloom.strength = 0.55;
  lightSrc.uniforms.uPL1Col.value.setRGB(0, 0, 0); lightSrc.uniforms.uPL2Col.value.setRGB(0, 0, 0);
  camQ.roll = 0;
}
function bladeLights(t, kh = 1, kr = 1) {
  if (hero.mesh.visible) { lightSrc.uniforms.uPL1Pos.value.copy(hero.joint(t, 'guard').lerp(hero.joint(t, 'tip'), 0.6)); lightSrc.uniforms.uPL1Col.value.setRGB(0.12 * kh, 0.55 * kh, 0.5 * kh); }
  if (rival.mesh.visible) { lightSrc.uniforms.uPL2Pos.value.copy(rival.joint(t, 'guard').lerp(rival.joint(t, 'tip'), 0.6)); lightSrc.uniforms.uPL2Col.value.setRGB(0.55 * kr, 0.04 * kr, 0.09 * kr); }
}
// render the 3D view for the current camera; setup() places characters and effects
function view(t, setup) {
  hero.setVisible(false); rival.setVisible(false);
  fx.begin();
  applyCam();
  setup();
  fx.end();
  env.update(t, envO);
  pending = true;
}
let pending = false;
function renderNow() { post.composer.render(); pending = false; }
function flashP(t, a, k, fin = 0.005, fout = 0.12) { return pulse(t, a, a + 0.02, fin, fout) * k; }
const toUV = (p) => { const q = p.clone().project(camera); return new THREE.Vector2(q.x * 0.5 + 0.5, q.y * 0.5 + 0.5); };
const toPx = (p) => { const q = p.clone().project(camera); return [(q.x * 0.5 + 0.5) * W, TOP + (1 - (q.y * 0.5 + 0.5)) * GH]; };
// impact frames: (0) black silhouettes on white, (1) red duotone with black silhouettes
function impact(t, fi, chars, focus) {
  // env hidden: (0) white silhouettes on black, inverted by the film pass -> black on white; (1) black on crimson
  for (const m of envMeshes) m.visible = false;
  if (fi === 0) film.uInvert.value = 1; else scene.background.setRGB(0.55, 0.035, 0.06);
  const tint = fi === 0 ? new THREE.Color(1.3, 1.3, 1.3) : new THREE.Color(0, 0, 0);
  post.bloom.strength = 0;
  view(t, () => { for (const [ch, tr] of chars) show(ch, tr, t, { sil: 1, tint }); });
  film.uGrain.value = 0.02;
  const f = toPx(focus);
  ov.focusLines(f[0], f[1], fi === 0 ? 'rgba(0,0,0,0.9)' : 'rgba(10,0,2,0.8)', 90, fi + 3, 0.28);
}

// ---------------- effect builders
function inkColumn(t, x) {
  const grow = ease.out(clamp((t - T.column) / 0.32, 0, 1));
  if (grow <= 0) return;
  const fall = clamp((t - (T.riseA + 0.2)) / 0.55, 0, 1);
  for (let k = 0; k < 11; k++) {
    const pts = [], ph = k * 0.571;
    for (let i = 0; i < 32; i++) {
      const u = i / 31, h = u * 4.6 * grow;
      const a = ph + h * 1.7 - t * 6 * (k % 2 ? 1 : -0.8), r = (0.62 - 0.3 * u) * (1 + 0.1 * Math.sin(h * 4 + k)) * (1 + fall * 0.8);
      pts.push(new V3(x + Math.cos(a) * r, h - fall * fall * 2.5 * u, Math.sin(a) * r * 0.85));
    }
    fx.inkR.get().line(pts, (u) => 0.42 * (1 - u * 0.55), () => [0.016, 0.011, 0.02, 0.96 * (1 - fall)], camera);
    if (k < 3) fx.glowR.get().line(pts, (u) => 0.05, (u) => [1.4, 0.06, 0.18, 0.55 * (1 - fall) * u], camera);
  }
  const rr = new RNG(17);
  const blots = [];
  for (let i = 0; i < 60; i++) {
    const t0 = T.column + rr.range(0, 0.6), a = t - t0, th = rr.range(0, 6.28), v = rr.range(1.5, 4), up = rr.range(2, 6);
    if (a < 0 || a > 1.2) continue;
    const p = new V3(x + Math.cos(th) * v * a, rr.range(0.5, 4) * grow + up * a - 6 * a * a, Math.sin(th) * v * a * 0.6);
    if (p.y < 0) continue;
    blots.push({ p, r: rr.range(0.03, 0.09), seed: i });
  }
  fx.blots(blots);
}
function inkGather(t, tip) {
  const u = clamp((t - (T.s10 + 0.05)) / 0.4, 0, 1);
  if (u <= 0 || t > T.slam + 0.05) return;
  for (let k = 0; k < 8; k++) {
    const pts = [], ph = k * 0.785;
    for (let i = 0; i < 24; i++) {
      const s = i / 23, rad = (2.6 * (1 - u) + 0.1) * (0.3 + s), a = ph + s * 2.4 + t * 5;
      pts.push(new V3(tip.x + Math.cos(a) * rad, tip.y + Math.sin(a) * rad * 0.7, tip.z + Math.sin(a * 1.3) * rad * 0.6));
    }
    fx.inkR.get().line(pts, (s) => 0.16 * (1 - s), () => [0.015, 0.01, 0.02, 0.9 * Math.sin(Math.PI * u)], camera);
  }
  fx.glow.add(tip, 0.5 + u * 0.6, 0.5 + u * 0.6, [2.0, 0.1, 0.25, 0.8 * u], 0, 0);
}
function inkWave(t) {
  const a = t - WAVE.t0; if (a < 0 || a > WAVE.life) return;
  const xf = WAVE.x0 - WAVE.speed * a, fade = 1 - smoothstep(0.9, WAVE.life, a);
  const N = new V3(1, 0, 0);
  for (let L = 0; L < 4; L++) {
    const pts = [], hs = [];
    for (let i = 0; i < 28; i++) {
      const z = -3.2 + 6.4 * i / 27;
      const h = WAVE.height * (0.72 + 0.18 * Math.sin(z * 1.1 + t * 6 + L * 1.3) + 0.1 * Math.sin(z * 2.6 - t * 7)) * (1 - L * 0.22) * Math.exp(-z * z / 16) * Math.min(1, a * 8) * fade;
      hs.push(h); pts.push(new V3(xf + L * 0.35 + Math.sin(z * 2 + L) * 0.1, h * 0.5, z));
    }
    fx.inkR.get().line(pts, (u, i) => hs[i], () => [0.014, 0.01, 0.018, 0.97], camera, N);
  }
  // spray off the crest and the trail left on the ground
  const rr = new RNG(Math.floor(a * 24) + 5), blots = [];
  for (let i = 0; i < 40; i++) { const z = rr.range(-3, 3), hh = WAVE.height * rr.range(0.6, 1.1) * fade; blots.push({ p: new V3(xf + rr.range(-0.3, 0.6), hh + rr.range(0, 0.6), z), r: rr.range(0.04, 0.12), seed: i }); }
  fx.blots(blots);
  const trail = []; for (let i = 0; i < 20; i++) trail.push(new V3(lerp(xf + 0.2, WAVE.x0, i / 19), 0.02, 0));
  fx.inkR.get().line(trail, (u) => 3.2 * (1 - u * 0.4), () => [0.012, 0.009, 0.015, 0.85 * fade], camera, new V3(0, 1, 0));
}
function auroraSpiral(t, x, y0, y1, r, k, n, off = 0) {
  if (k <= 0.01) return;
  for (let j = 0; j < n; j++) {
    const pts = [];
    for (let i = 0; i < 50; i++) {
      const u = i / 49, y = lerp(y0, y1, u), a = j * (6.283 / n) + y * 2.6 - t * 4.5 + off;
      const rad = r * (1 - 0.35 * u) * (1 + 0.08 * Math.sin(t * 3 + j));
      pts.push(new V3(x + Math.cos(a) * rad, y, Math.sin(a) * rad));
    }
    fx.glowR.get().line(pts, (u) => 0.05 * Math.sin(Math.PI * u), (u) => [0.2 + 0.7 * u, 1.3 - 0.5 * u, 1.1 + 0.4 * u, 0.8 * k * Math.sin(Math.PI * u)], camera);
  }
}
function groundRing(x, z, r, w, col, a) {
  const pts = []; for (let i = 0; i <= 64; i++) { const th = i / 64 * 6.283; pts.push(new V3(x + Math.cos(th) * r, 0.03, z + Math.sin(th) * r)); }
  fx.glowR.get().line(pts, () => w, () => [col[0], col[1], col[2], a], camera, new V3(0, 1, 0));
}
function cracks(t, x) {
  const k = ease.out(clamp((t - T.crash) / 0.15, 0, 1)); if (k <= 0) return;
  const rr = new RNG(77);
  for (let i = 0; i < 12; i++) {
    const th = rr.range(0, 6.283), L = rr.range(0.6, 1.8) * k, pts = [];
    for (let j = 0; j < 6; j++) { const u = j / 5; pts.push(new V3(x + Math.cos(th + rr.range(-0.2, 0.2)) * L * u, 0.025, Math.sin(th + rr.range(-0.2, 0.2)) * L * u * 0.8)); }
    fx.inkR.get().line(pts, (u) => 0.05 * (1 - u), () => [0.005, 0.006, 0.012, 0.95], camera, new V3(0, 1, 0));
  }
}
function heroGlowTrail(t, tr, dur, a) {
  const pts = []; for (let i = 0; i < 16; i++) { const tt = t - i / 15 * dur; pts.push(hero.joint(tt, 'chest').lerp(hero.joint(tt, 'hip'), 0.5)); }
  if (pts[0].distanceTo(pts[15]) < 0.3) return;
  fx.glowR.get().line(pts, (u) => 0.9 * (1 - u), (u) => [0.25, 1.4, 1.3, a * (1 - u) ** 1.5 * 0.5], camera);
}
function eyeGlow(t, k, blaze = 0) {
  const at = headAt(hero, t);
  for (const [z, c] of [[0.036, [0.3, 2.4, 2.1]], [-0.036, [1.3, 0.7, 2.6]]]) {
    const p = at(0.095, 0.163, z);
    fx.glow.add(p, 0.012 + 0.03 * k, 0.012 + 0.03 * k, [c[0], c[1], c[2], 0.9 * k], 0, 0);
    if (blaze > 0) {
      fx.glow.add(p, 0.16 * blaze, 0.004 + 0.003 * blaze, [c[0], c[1], c[2], blaze], 0.08, 2);
      fx.glow.add(p, 0.05 * blaze, 0.05 * blaze, [c[0], c[1], c[2], blaze * 0.7], 0.4, 6);
    }
  }
}
const subs = (t) => { for (const s of SUBS) ov.subtitle(t, s); };

// ================================================================ shots
// S1 — the field under the moon; crows cross; Sera waits alone
function shot1(t) {
  const u = t / T.s2;
  look(lerp(0.3, -0.6, ease.inout(u)), lerp(0.7, 0.85, u), lerp(9.0, 7.2, ease.out(u)), lerp(-1.2, -1.7, u), 1.35, 0, 30);
  envSet({ aurora: 0.2, gust: pulse(t, 0.8, 1.35, 0.3, 0.7) * 0.75, waveX: 9 - t * 12, waveK: 0.35 });
  view(t, () => {
    show(hero, s1H, t);
    fx.crows(t, { seed: 4, n: 9, t0: 0.2, stagger: 1.2, dur: 2.6, size: 1.3, bend: 0.6, from: (i, rr) => [8 + rr.range(0, 2), 3.6 + rr.range(0, 1.4), -2 - rr.range(0, 4)], to: (i, rr) => [-9, 4.4 + rr.range(0, 1.2), -2 - rr.range(0, 4)] });
  });
  film.uFade.value = 1 - smoothstep(0, 0.8, t);
}
// S2 — an ink pool, a pillar of ink, crows; Kokuya rises. Name card on a red freeze-frame.
function shot2(t) {
  const tf = Math.min(t, T.card2 + 0.04), frozen = t > T.card2 + 0.04;
  const u = (tf - T.s2) / (T.s3 - T.s2);
  look(lerp(0.7, 1.0, u), 0.7, lerp(5.2, 4.5, ease.out(u)), 2.4, lerp(1.5, 1.7, u), 0, 34, -0.02);
  shake(tf);
  envSet({ aurora: 0.12, gust: -0.4, waveX: 2.4, waveK: -0.5 * smoothstep(T.column, T.column + 0.2, tf) });
  const eye = smoothstep(T.rEye, T.rEye + 0.06, tf);
  view(tf, () => {
    decal.visible = true; const pr = ease.out(clamp((tf - T.pool) / 0.35, 0, 1)) * 1.3 * (1 - 0.3 * smoothstep(T.riseA + 0.3, T.card2, tf));
    decal.scale.set(pr + 1e-3, 1, pr + 1e-3); decal.position.set(2.4, 0.012, 0); decalMat.uniforms.uT.value = tf * 2;
    const shade = 1 - smoothstep(T.riseA + 0.12, T.card2, tf);
    show(rival, s2R, tf, { sil: shade * 0.92, tint: new THREE.Color(0.012, 0.008, 0.014), glow: -1 + 2 * eye });
    inkColumn(tf, 2.4);
    fx.crows(tf, { seed: 8, n: 22, t0: T.column + 0.08, stagger: 0.45, dur: 1.0, size: 1.0, bend: 0.9, fadeIn: true, from: (i, rr) => [2.4 + rr.range(-0.3, 0.3), rr.range(0.5, 3.8), rr.range(-0.3, 0.3)], to: (i, rr) => [2.4 + rr.range(-6, 3), rr.range(3.5, 6.5), rr.range(-5, 1)] });
    if (eye > 0) { const at = headAt(rival, tf); fx.glow.add(at(0.11, 0.175, 0.04), 0.3 * eye, 0.3 * eye, [2.2, 0.1, 0.25, eye * pulse(tf, T.rEye, T.rEye + 0.1, 0.01, 0.4)], 0, 6); }
    bladeLights(tf, 0, 0.6 * eye);
  });
  film.uFlash.value = flashP(tf, T.rEye, 0.35); film.uFlashCol.value.setRGB(1, 0.2, 0.3);
  if (frozen) { film.uToneK.value = 0.78; film.uTone.value.setRGB(0.95, 0.22, 0.28); }
  ov.nameCard(t, { t0: T.card2, name: '흑야', hanja: '黑夜', en: 'KOKUYA — THE INK DEMON', title: '먹의 귀검사 · 墨之鬼劍士', accent: '#d0283f', side: -1 });
}
// S3 — Sera lifts her head; name card on a teal freeze-frame
function shot3(t) {
  const tf = Math.min(t, T.card3 + 0.04), frozen = t > T.card3 + 0.04;
  const u = (tf - T.s3) / (T.s4 - T.s3);
  look(lerp(-1.35, -1.5, u), lerp(1.38, 1.42, u), lerp(2.4, 2.1, ease.out(u)), -2.3, 1.42, 0, 28, 0.02);
  envSet({ aurora: 0.25, gust: 0.6 * smoothstep(T.headTurn, T.headTurn + 0.3, tf) });
  view(tf, () => {
    show(hero, s3H, tf);
    const g = pulse(tf, T.headTurn + 0.42, T.headTurn + 0.46, 0.03, 0.15);
    if (g > 0) { const at = headAt(hero, tf); fx.glow.add(at(0.1, 0.165, 0.04), 0.14, 0.14, [0.6, 2.4, 2.2, g], 0.3, 6); }
    eyeGlow(tf, 0.4 * smoothstep(T.headTurn, T.headTurn + 0.4, tf));
  });
  if (frozen) { film.uToneK.value = 0.78; film.uTone.value.setRGB(0.3, 0.95, 0.88); }
  ov.nameCard(t, { t0: T.card3, name: '세라', hanja: '星羅', en: 'SERA — THE AURORA SWORDSWOMAN', title: '극광의 검사 · 極光之劍士', accent: '#3fd2c0', side: 1 });
}
// S4 — the grinning mask laughs
function shot4(t) {
  const u = (t - T.s4) / (T.s5 - T.s4);
  use(rival, s4R);
  const at = headAt(rival, t), c = at(0.03, 0.15, 0);
  look(c.x - lerp(1.05, 0.85, u), c.y + 0.02, c.z + lerp(0.5, 0.42, u), c.x, c.y - 0.01, c.z, 24, 0.03);
  envSet({ aurora: 0.15, gust: -0.3 });
  view(t, () => {
    show(rival, s4R, t, { glow: 0.2 + 0.5 * Math.sin(t * 40) });
    const rr = new RNG(41), blots = [];
    for (let i = 0; i < 10; i++) { const t0 = T.s4 + rr.range(0, 0.9), a = t - t0; if (a < 0 || a > 0.6) continue; const p = at(0.1 + rr.range(-0.02, 0.02), 0.06 + rr.range(-0.02, 0.02), rr.range(-0.06, 0.06)); p.y -= 2.5 * a * a; blots.push({ p, r: 0.008 + 0.004 * Math.sin(i), seed: i }); }
    fx.blots(blots);
    bladeLights(t, 0, 0.4);
  });
  subs(t);
}
// S5 — her eyes: teal and violet
function shot5(t) {
  const u = (t - T.s5) / (T.s6 - T.s5);
  use(hero, s5H);
  const at = headAt(hero, t), c = at(0.06, 0.16, 0);
  look(c.x + lerp(0.62, 0.5, u), c.y + 0.01, c.z + lerp(0.26, 0.2, u), c.x, c.y, c.z, 20, -0.02);
  envSet({ aurora: 0.3, gust: 0.4 });
  view(t, () => { show(hero, s5H, t, { glow: 0.3 + 0.4 * u }); eyeGlow(t, 0.35 + 0.35 * u); });
  subs(t);
}
// S6 — the thumb pushes the guard; a sliver of blade catches the moon
function shot6(t) {
  const u = (t - T.s6) / (T.s7 - T.s6);
  use(hero, s6H);
  const g = hero.joint(T.s6 + 0.01, 'sbMouth');
  look(g.x + lerp(1.15, 1.0, u), g.y + 0.3, g.z + lerp(1.0, 0.85, u), g.x + 0.1, g.y + 0.22, g.z, 28, 0.04);
  envSet({ aurora: 0.3, gust: 0.5 });
  view(t, () => {
    show(hero, s6H, t);
    const gl = pulse(t, T.push + 0.04, T.push + 0.08, 0.03, 0.22);
    if (gl > 0) { const gp = hero.joint(t, 'guard').lerp(hero.joint(t, 'tip'), 0.08); fx.glow.add(gp, 0.12 * gl + 0.02, 0.12 * gl + 0.02, [2.4, 2.6, 2.6, gl], 0.2, 6); }
  });
  film.uFlash.value = pulse(t, T.s7 - 0.06, T.s7, 0.04, 0.001) * 0.6; film.uFlashCol.value.setRGB(0.8, 1, 0.97);
}
// S7 — split screen: both charge
function runView(t, ch, tr, heroSide) {
  const x = hx(tr, t), d = heroSide ? 1 : -1;
  look(x + 1.5 * d, 0.55, 2.7, x + 0.3 * d, 1.0, 0, 42, -0.06 * d);
  envSet({ aurora: 0.25, gust: 0.9 * d, pushX: x, pushK: 0.6 * d });
  view(t, () => {
    show(ch, tr, t, { glow: 0.5 });
    fx.bladeTrail(ch, t, { col: heroSide ? TEAL : RED, ink: !heroSide, dur: 0.14, minMove: 0.1 });
    if (heroSide) heroGlowTrail(t, tr, 0.25, 0.9);
    const rr = new RNG(heroSide ? 3 : 4);
    for (let i = 0; i < 40; i++) {
      const z = rr.range(-1.5, 1.5), y = rr.range(0.1, 2.2), sp = rr.range(8, 16), x0 = rr.range(-6, 6);
      const px = x0 - ((t * sp) % 12) * d;
      const p = new V3(x + ((px - x + 6) % 12 + 12) % 12 - 6, y, z);
      if (heroSide) fx.glow.add(p, 0.25, 0.006, [0.6, 1.6, 1.6, 0.5], 0, 2);
      else fx.ink.add(p, 0.03, 0.03, [0.02, 0.015, 0.02, 0.9], 0, 3, 0, i);
    }
    for (let k = 0; k < 4; k++) fx.dust(t, { t0: T.s7 + k * 0.2, x: hx(tr, T.s7 + k * 0.2), dir: -d, size: 0.6, n: 3 });
    bladeLights(t, heroSide ? 1 : 0, heroSide ? 0 : 1);
  });
}
function shot7(t) {
  runView(t, rival, s7R, false);
  renderNow();
  splitG.drawImage(glc, 0, 0);
  runView(t, hero, s7H, true);
  // diagonal divide: hero left, rival right
  const g = ov.g, a = [W * 0.62, TOP - 10], b = [W * 0.38, TOP + GH + 10];
  g.save(); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(W + 10, TOP - 10); g.lineTo(W + 10, TOP + GH + 10); g.lineTo(b[0], b[1]); g.closePath(); g.clip();
  g.drawImage(splitC, 0, TOP); g.restore();
  g.save(); g.beginPath(); g.rect(0, TOP, W, GH); g.clip();
  g.strokeStyle = '#f4f7ff'; g.lineWidth = (5 + 10 * pulse(t, T.s8 - 0.12, T.s8, 0.06, 0.001)) * W / 1920; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); g.restore();
  film.uFlash.value = pulse(t, T.s8 - 0.05, T.s8, 0.04, 0.001) * 0.5;
}
// S8 — the clash and the exchange
function camS8(t) {
  const mid = (tt) => (hx(s8H, tt) + hx(s8R, tt)) / 2;
  if (t < T.clash1) {
    const u = (t - T.s8) / (T.clash1 - T.s8);
    look(0.2, lerp(0.8, 1.0, u), lerp(8.0, 4.3, ease.in(u)), 0, 1.25, 0, 30);
  } else {
    const w = smoothstep(r8(5.93), r8(6.06), t);
    const a = (t - T.clash1) * 0.25;
    const lockP = [Math.sin(a) * 1.4 + 0.4, 1.15, lerp(3.4, 3.0, clamp((t - T.clash1) / 0.5, 0, 1))];
    const m = (mid(t) + mid(t - 0.08) + mid(t - 0.16)) / 3;
    const folP = [m + 0.8, 1.0, 5.4];
    const w2 = smoothstep(r8(7.0), r8(7.4), t);
    const px = lerp(lerp(lockP[0], folP[0], w), 2.0, w2), py = lerp(lockP[1], folP[1], w), pz = lerp(lerp(lockP[2], folP[2], w), 6.2, w2);
    look(px, py, pz, lerp(lerp(0, m, w), 1.4, w2), lerp(1.4, 1.2, w), 0, 30);
    let kick = 0; for (const tc of [T.clash2, T.clash3, T.hOver + 0.06]) { const a2 = t - tc; if (a2 >= 0) kick += Math.exp(-a2 * 9); }
    camQ.fov -= kick * 2.5;
  }
  shake(t);
}
function shot8(t) {
  camS8(t);
  const fi = frameOf(t) - frameOf(T.clash1);
  envSet({ aurora: 0.3, gust: 0.3 + 0.5 * Math.exp(-Math.max(t - T.clash1, 0) * 3), waveX: t > T.clash1 ? -(t - T.clash1) * 16 : -100, waveK: t > T.clash1 ? 0.5 : 0 });
  if (fi === 0 || fi === 1) { impact(t, fi, [[hero, s8H], [rival, s8R]], new V3(0, 1.5, 0)); return; }
  view(t, () => {
    show(rival, s8R, t, { glow: 0.6 }); show(hero, s8H, t, { glow: 0.6 });
    fx.bladeTrail(hero, t, { col: TEAL, minMove: 0.3 }); fx.bladeTrail(rival, t, { col: RED, minMove: 0.3, alpha: 0.7 });
    for (const d of DUSTS) fx.dust(t, d);
    for (const a of ARCS) fx.slashArc(t, a, 0.15);
    for (const s of SPARKS) fx.spark(t, s);
    bladeLights(t, 1 + 2 * Math.exp(-Math.max(0, t - T.clash1) * 6), 1);
  });
  film.uFlash.value = flashP(t, T.clash1 + F(2), 0.5, 0.005, 0.14) + flashP(t, T.clash3, 0.3, 0.005, 0.1);
}
// S9 — a storm of ink crows; the nebula flurry cuts them all down
function shot9(t) {
  const u = (t - T.s9) / (T.s10 - T.s9);
  look(lerp(-0.6, -0.2, u), lerp(0.75, 0.9, u), lerp(6.4, 5.8, u), 0.35, 1.35, 0, 32, 0.02);
  shake(t);
  envSet({ aurora: 0.35, gust: -0.5 * pulse(t, T.crows, T.flurry + 0.5, 0.1, 0.3) });
  view(t, () => {
    show(rival, s9R, t, { glow: 0.8 }); show(hero, s9H, t, { glow: 0.8 });
    use(rival, s9R); const tip = rival.joint(T.crows, 'tip');
    fx.crows(t, { seed: 13, n: 24, t0: T.crows + 0.05, stagger: 0.6, dur: 0.7, size: 1.5, bend: 0.8, keep: false,
      from: (i, rr) => [tip.x + rr.range(-0.2, 0.2), tip.y + rr.range(-0.3, 0.3), rr.range(-0.3, 0.3)], to: (i, rr) => [-1.6 + rr.range(-0.2, 0.9), rr.range(0.6, 2.1), rr.range(-0.6, 0.6)], cut: crowCut });
    for (const a of ARCS9) fx.slashArc(t, a, 0.2);
    fx.bladeTrail(hero, t, { col: TEAL, dur: 0.1, minMove: 0.3 });
    bladeLights(t, 1.5, 1);
  });
  film.uFlash.value = FLURRY.reduce((m, f) => Math.max(m, pulse(t, f, f + 0.02, 0.005, 0.06) * 0.1), 0);
  for (const c of CALLOUTS.slice(0, 2)) ov.callout(t, c);
}
// S10 — ink gathers on the blade, the ground slam, the wave; Sera leaps
function shot10(t) {
  const w = smoothstep(T.jump - 0.15, T.jump + 0.25, t), up = smoothstep(T.jump + 0.08, T.s11, t);
  look(lerp(2.4, -0.4, w), lerp(0.9, 1.4, up), lerp(5.6, 6.6, w), lerp(1.8, -1.2, w), lerp(1.3, 3.6, up), 0, 32, lerp(0, -0.05, up));
  shake(t);
  envSet({ aurora: 0.35, gust: -0.4, waveX: WAVE.x0 - WAVE.speed * (t - WAVE.t0) + 0.5, waveK: t > WAVE.t0 ? -0.9 : 0 });
  view(t, () => {
    show(rival, s10R, t, { glow: 1.0 }); show(hero, s10H, t, { glow: 0.6 });
    inkGather(t, rival.joint(t, 'tip'));
    inkWave(t);
    fx.dust(t, { t0: T.slam, x: 2.3, dir: -1, size: 2.0, n: 10 }); fx.dust(t, { t0: T.jump, x: -1.6, dir: 0, size: 1.2, n: 7 });
    fx.spark(t, { t0: T.slam, x: 2.2, y: -0.1, size: 1.4, seed: 11, count: 22, col: RED, squash: 0.3 });
    fx.bladeTrail(hero, t, { col: TEAL, minMove: 0.3 });
    bladeLights(t, 1, 1.5);
  });
  film.uFlash.value = flashP(t, T.slam, 0.3); film.uFlashCol.value.setRGB(1, 0.3, 0.4);
}
// S11 — silhouettes collide in front of a giant moon
function shot11(t) {
  const u = (t - T.s11) / (T.s12 - T.s11);
  look(0.3, 1.2, lerp(9.5, 9.0, u), 0, 7.4, 0, 32, 0.03);
  shake(t);
  const md = new V3(0.15, 8.2, 0).sub(camQ.p).normalize();
  envSet({ aurora: 0.5, moonDir: md, moonSize: 0.17, moonK: 0.3 });
  const fi = frameOf(t) - frameOf(T.airClash);
  if (fi === 0 || fi === 1) { impact(t, fi, [[hero, s11H], [rival, s11R]], new V3(0, 8.1, 0)); return; }
  view(t, () => {
    const sil = { sil: 0.82, tint: new THREE.Color(0.01, 0.012, 0.03), glow: 0.8 };
    show(rival, s11R, t, sil); show(hero, s11H, t, sil);
    if (t < T.airClash) { fx.bladeTrail(hero, t, { col: TEAL, dur: 0.16, minMove: 0.1 }); heroGlowTrail(t, s11H, 0.3, 0.8); }
    fx.spark(t, { t0: T.airClash + F(2), x: 0, y: -8.1, size: 0.8, seed: 21, count: 34 });
  });
  film.uFlash.value = flashP(t, T.airClash + F(2), 0.3, 0.005, 0.16);
}
// S12 — she crashes down; he lands and walks toward her, dragging his blade
function shot12(t) {
  look(0.2, 1.0, 7.6, 0.1, 1.05, 0, 32);
  shake(t);
  envSet({ aurora: 0.3, gust: 0.6 * pulse(t, T.crash, T.crash + 0.2, 0.01, 0.6), waveX: -2.3 + (t - T.crash) * 9, waveK: t > T.crash ? 0.6 * Math.exp(-(t - T.crash) * 1.5) : 0 });
  view(t, () => {
    show(rival, s12R, t, { glow: 0.8 }); show(hero, s12H, t, { glow: 0.3 });
    cracks(t, -2.3);
    fx.dust(t, { t0: T.crash, x: -2.3, dir: 0, size: 2.4, n: 14 }); fx.dust(t, { t0: T.rLand, x: 2.9, dir: 0, size: 1.6, n: 9 });
    fx.spark(t, { t0: T.crash, x: -2.3, y: -0.2, size: 1.4, seed: 31, count: 16, col: TEAL, squash: 0.3 });
    if (t > T.crash) groundRing(-2.3, 0, 0.3 + (t - T.crash) * 5, 0.12, TEAL, 0.8 * Math.exp(-(t - T.crash) * 5));
    if (t > T.rLand + 0.6) { const xr = hx(s12R, t), pts = []; for (let i = 0; i < 16; i++) pts.push(new V3(lerp(xr - 0.9, 3.0, i / 15), 0.02, 0.05)); fx.inkR.get().line(pts, () => 0.09, () => [0.01, 0.008, 0.012, 0.9], camera, new V3(0, 1, 0)); }
    bladeLights(t, 0.4, 1);
  });
  film.uFlash.value = flashP(t, T.crash, 0.3);
  subs(t);
}
// S13 — the aurora answers: power-up
function shot13(t) {
  const u = (t - T.s13) / (T.s13b - T.s13), ak = smoothstep(T.rise - 0.2, T.rise + 0.6, t);
  look(lerp(-1.4, -1.85, ease.inout(u)), lerp(0.8, 1.0, u), lerp(3.6, 2.9, ease.inout(u)), -2.8, lerp(1.1, 1.35, u), 0, 32, -0.02);
  shake(t);
  envSet({ aurora: 0.4 + 1.1 * ak, gust: 0.15, pushX: -2.8, pushK: 0.4 * ak });
  view(t, () => {
    show(hero, s13H, t, { glow: ak * 1.5 });
    auroraSpiral(t, -2.8, 0, 2.3, 0.75, ak * 0.7, 3);
    auroraSpiral(t, -2.8, 0, 2.5, 0.85, ak, 4, 1.7);
    groundRing(-2.8, 0, 1.0 + 0.15 * Math.sin(t * 6), 0.25, [0.3, 1.6, 1.4], 0.6 * ak);
    const rr = new RNG(61);
    for (let i = 0; i < 70; i++) { const ph = rr.range(0, 1), sp = rr.range(0.4, 1.0), a = rr.range(0, 6.28), r = rr.range(0.3, 1.4); const y = ((t * sp + ph) % 1) * 2.8; fx.glow.add(new V3(-2.8 + Math.cos(a + t) * r, y, Math.sin(a + t) * r), 0.03, 0.03, [0.5, 2.0, 1.8, ak * Math.sin(Math.PI * y / 2.8)], 0, 0); }
    eyeGlow(t, ak);
    bladeLights(t, 1 + 2 * ak, 0);
  });
  post.bloom.strength = 0.55 + 0.25 * ak;
  subs(t);
}
// S13b — both eyes ignite; the secret art is named
function shot13b(t) {
  const u = (t - T.s13b) / (T.s14 - T.s13b);
  use(hero, s13bH);
  const at = headAt(hero, t), c = at(0.06, 0.16, 0);
  look(c.x + lerp(0.6, 0.46, u), c.y + 0.0, c.z + lerp(0.24, 0.17, u), c.x, c.y, c.z, 20, 0.03);
  envSet({ aurora: 1.1, gust: 0.3 });
  view(t, () => { show(hero, s13bH, t, { glow: -0.6 }); eyeGlow(t, 0.8, 0.45 * ease.out(clamp(u * 2.5, 0, 1))); });
  post.bloom.strength = 0.6;
  film.uFlash.value = flashP(t, T.s13b, 0.4, 0.005, 0.15); film.uFlashCol.value.setRGB(0.6, 1, 0.95);
  ov.callout(t, ULT);
}
// S14 — Kokuya unleashes the ink dragon; both charge
function shot14(t) {
  const u = (t - T.s14) / (T.s15 - T.s14);
  look(lerp(0.6, 0.3, u), lerp(1.2, 1.4, u), lerp(8.6, 7.8, ease.in(u)), lerp(0.4, 0.1, u), 1.7, 0, 32);
  camQ.p.x += noise1(frameOf(t) * 2.1, 3) * 0.05 * u; camQ.p.y += noise1(frameOf(t) * 2.7, 4) * 0.05 * u;
  envSet({ aurora: 1.1, gust: -0.6 });
  view(t, () => {
    show(rival, s14R, t, { glow: 1.4 }); show(hero, s14H, t, { glow: 1.4 });
    heroGlowTrail(t, s14H, 0.25, 1);
    fx.bladeTrail(hero, t, { col: TEAL, minMove: 0.2 });
    const k = smoothstep(T.s14, T.s14 + 0.35, t);
    if (k > 0) {
      const pts = []; for (let i = 0; i < 40; i++) { const tt = t - i * 0.028, h = dragonHead(tt); pts.push(new V3(h[0], -h[1], -0.6 + 0.4 * Math.sin(tt * 5 + i * 0.2))); }
      fx.inkR.get().line(pts, (s) => 0.95 * (1 - s * 0.8) * (s < 0.06 ? 0.6 + s * 6 : 1) * k, () => [0.014, 0.01, 0.018, 0.97], camera);
      fx.inkR.get().line(pts.map((p, i) => p.clone().add(new V3(0, 0.25 * Math.sin(i * 0.5 + t * 8), 0))), (s) => 0.35 * (1 - s) * k, () => [0.02, 0.012, 0.02, 0.9], camera);
      fx.glowR.get().line(pts, (s) => 0.06 * (1 - s), (s) => [1.8, 0.08, 0.22, 0.8 * k * (1 - s)], camera);
      const hd = pts[0], dir = pts[0].clone().sub(pts[2]).normalize();
      for (const zz of [0.12, -0.12]) fx.glow.add(hd.clone().add(new V3(0, 0.12, zz)).addScaledVector(dir, -0.05), 0.1, 0.1, [2.6, 0.15, 0.3, k], 0, 6);
      const rr = new RNG(Math.floor(t * 24)), blots = [];
      for (let i = 0; i < 30; i++) { const j = Math.floor(rr.range(0, 39)), p = pts[j].clone().add(new V3(rr.range(-0.4, 0.4), rr.range(-0.5, 0.2), rr.range(-0.3, 0.3))); blots.push({ p, r: rr.range(0.03, 0.08), seed: i }); }
      fx.blots(blots);
    }
    bladeLights(t, 2, 2);
  });
  post.bloom.strength = 0.7;
  ov.callout(t, CALLOUTS[2]);
}
// S15 — the cut
const CUT_A = w3(-4.2, -5.0, 0.2), CUT_B = w3(4.3, -0.35, 0.2);
function aftermath(t, setupExtra) {
  const a = t - T.s15b;
  envSet({ aurora: 1.0, gust: 0.7 * Math.exp(-Math.max(a, 0) * 1.6), waveX: 1 + a * 10, waveK: 0.6 * Math.exp(-Math.max(a, 0)) });
  view(t, () => {
    show(rival, s15R, t, { glow: -0.2 - 0.8 * smoothstep(0.3, 1.4, a) });
    show(hero, s15H, t, { glow: 1 });
    const bw = 0.16 * (1 - smoothstep(0.05, 0.9, a)) + 0.015, ba = 1 - smoothstep(0.2, 1.2, a);
    if (ba > 0) { fx.glowR.get().line([CUT_A, CUT_B], () => bw * 3, () => [0.3, 1.8, 1.6, ba * 0.6], camera); fx.glowR.get().line([CUT_A, CUT_B], () => bw, () => [3, 3.2, 3.2, ba], camera); }
    fx.dust(t, { t0: T.s15b, x: 3.2, dir: -1, size: 1.4, n: 9 });
    const rr = new RNG(91), blots = [];
    for (let i = 0; i < 90; i++) { const x = rr.range(-3, 5), y0 = rr.range(2, 6), v = rr.range(3, 6), y = y0 - v * a - 4 * a * a; if (a > 0 && y > 0 && a < 1.8) blots.push({ p: new V3(x, y, rr.range(-2, 1)), r: rr.range(0.015, 0.035), a: 1 - a / 1.8, seed: i }); }
    fx.blots(blots);
    bladeLights(t, 1, 0.3 * (1 - smoothstep(0.2, 1, a)));
    if (setupExtra) setupExtra();
  });
}
function shot15(t) {
  const fi = frameOf(t) - frameOf(T.s15);
  if (fi < 3) { ov.beamFrame(fi); film.uFlash.value = fi === 2 ? 0.5 : 0; return; }
  look(2.1, 1.0, 5.6, 2.2, 1.3, 0, 30);
  shake(t);
  if (fi === 3 || fi === 4) {
    envSet({ aurora: 1.0 });
    impact(t, fi - 3, [[rival, s15R], [hero, s15H]], new V3(0.9, 1.3, 0));
    return;
  }
  const a = t - T.s15b, d = 0.016 * ease.out(clamp((a - F(2)) / 0.1, 0, 1)) * (1 - smoothstep(0.35, 0.66, a));
  if (d > 0.0003) {
    applyCam();
    const A = toUV(CUT_A), B = toUV(CUT_B), asp = W / GH;
    film.uCutP.value.copy(A); film.uCutD.value.copy(new THREE.Vector2((B.x - A.x) * asp, B.y - A.y).normalize()); film.uCutOff.value = d; film.uCutGlow.value = 1;
  }
  aftermath(t);
}
// S16 — back to back in the silence
function shot16(t) {
  const u = (t - T.s16) / (T.s17 - T.s16);
  look(lerp(2.0, 2.3, u), 0.42, lerp(4.9, 4.6, u), 2.25, 1.15, 0, 34);
  aftermath(t);
}
// S17 — the grinning mask cracks and splits
function shot17(t) {
  const u = (t - T.s17) / (T.s18 - T.s17);
  use(rival, s15R);
  const at = headAt(rival, t), c = at(0.03, 0.15, 0);
  look(c.x - lerp(0.95, 0.8, u), c.y + 0.0, c.z + lerp(0.38, 0.32, u), c.x, c.y, c.z, 24, -0.02);
  shake(t);
  const flick = t < T.split ? 0.55 + 0.45 * Math.sin(t * 70) * Math.sin(t * 23) : Math.max(0, 1 - (t - T.split) / 0.1);
  envSet({ aurora: 0.9 });
  const cr = smoothstep(T.crack, T.crack + 0.2, t), sp = smoothstep(T.split, T.split + 0.22, t);
  if (cr > 0) {
    applyCam();
    const A = toUV(at(0.11, 0.3, 0.05)), B = toUV(at(0.11, 0.02, -0.05)), asp = W / GH;
    film.uCutP.value.copy(A); film.uCutD.value.copy(new THREE.Vector2((B.x - A.x) * asp, B.y - A.y).normalize());
    film.uCutGlow.value = cr * (0.6 + 0.4 * Math.sin(t * 50)) * (1 - sp * 0.5); film.uCutOff.value = sp * 0.035;
  }
  view(t, () => { show(rival, s15R, t, { glow: -1 + flick * 1.2 }); });
  film.uFlash.value = flashP(t, T.split, 0.5, 0.005, 0.15); film.uFlashCol.value.setRGB(0.7, 1, 0.95);
}
// S18 — he dissolves into crows and ash; she sheathes her blade beneath the aurora
function shot18(t) {
  const u = (t - T.s18) / (T.end - T.s18);
  look(lerp(2.4, 2.9, ease.inout(u)), lerp(0.9, 1.6, ease.inout(u)), lerp(5.4, 7.4, ease.inout(u)), lerp(2.4, 2.7, ease.inout(u)), lerp(1.15, 2.1, ease.inout(u)), 0, 30);
  const dk = smoothstep(T.s18 + 0.15, T.s18 + 1.3, t);
  envSet({ aurora: 1.0 + 0.4 * u, gust: 0.12 });
  view(t, () => {
    if (dk < 1.15) show(rival, s15R, t, { glow: -1, dis: dk * 1.25 });
    show(hero, s15H, t, { glow: 1 - smoothstep(T.click - 0.15, T.click, t) });
    const rx = hx(s15R, t), rr = new RNG(55), blots = [];
    for (let i = 0; i < 140; i++) {
      const t0 = T.s18 + 0.15 + rr.range(0, 1.1), a = t - t0; if (a < 0 || a > 1.6) continue;
      const p = new V3(rx + rr.range(-0.5, 0.5) + a * rr.range(-0.6, 0.3), rr.range(0.2, 2.2) + a * rr.range(0.5, 1.6), rr.range(-0.4, 0.4));
      const k = 1 - a / 1.6;
      if (i % 4 === 0) fx.glow.add(p, 0.02, 0.02, [2.2, 0.15, 0.3, k], 0, 0);
      else blots.push({ p, r: 0.025 * k + 0.01, seed: i });
    }
    fx.blots(blots);
    fx.crows(t, { seed: 33, n: 16, t0: T.s18 + 0.15, stagger: 1.1, dur: 1.6, size: 1.0, bend: 0.8, fadeIn: true, from: (i, r2) => [rx + r2.range(-0.4, 0.4), r2.range(0.3, 2.3), r2.range(-0.3, 0.3)], to: (i, r2) => [rx + r2.range(-4, 1), r2.range(6, 8), r2.range(-4, 0)] });
    fx.slashArc(t, FLICK, 0.2);
    const gl = pulse(t, T.flick + 0.05, T.flick + 0.08, 0.02, 0.2); if (gl > 0) fx.glow.add(hero.joint(t, 'tip'), 0.18 * gl, 0.18 * gl, [2.4, 2.6, 2.6, gl], 0.3, 6);
    const ck = pulse(t, T.click, T.click + 0.04, 0.01, 0.25); if (ck > 0) fx.glow.add(hero.joint(t, 'sbMouth'), 0.22 * ck, 0.22 * ck, [2.6, 2.0, 1.0, ck], 0.1, 6);
    bladeLights(t, 1 - smoothstep(T.click - 0.15, T.click, t), 0);
  });
  ov.title(t, T.title);
  film.uFade.value = smoothstep(29.5, 29.98, t);
}
const SHOTS = [[0, shot1], [T.s2, shot2], [T.s3, shot3], [T.s4, shot4], [T.s5, shot5], [T.s6, shot6], [T.s7, shot7], [T.s8, shot8], [T.s9, shot9], [T.s10, shot10], [T.s11, shot11], [T.s12, shot12], [T.s13, shot13], [T.s13b, shot13b], [T.s14, shot14], [T.s15, shot15], [T.s16, shot16], [T.s17, shot17], [T.s18, shot18]];

const DBG = params.get('dbg') || '';
const idleTr = { hero: mk([{ t: 0, p: H.restGrip }], [{ t: 0, x: 0, f: 1, wind: 0.6 }]), rival: mk([{ t: 0, p: R.idle }], [{ t: 0, x: 0, f: -1, wind: 0.6 }]) };
function dbgHead(t) {
  const [, kind, angS, distS] = DBG.split('-'), ch = kind === 'r' ? rival : hero, tr = idleTr[kind === 'r' ? 'rival' : 'hero'];
  use(ch, tr);
  const at = headAt(ch, t), c = at(0.03, 0.15, 0), f = at(1.03, 0.15, 0).sub(c), a = parseFloat(angS) * Math.PI / 180, d = parseFloat(distS || '0.9');
  const side = new V3(0, 0, 1);
  const dir = f.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a));
  look(c.x + dir.x * d, c.y + 0.05, c.z + dir.z * d, c.x, c.y, c.z, 30);
  envSet({ aurora: 0.3 });
  view(t, () => show(ch, tr, t));
}
window.__renderAt = (t) => {
  t += 1e-5;
  if (DBG.startsWith('head')) { ov.clear(); resetFrame(); dbgHead(t); renderNow(); return; }
  ov.clear(); resetFrame(); pending = false;
  film.uTime.value = t;
  let fn = SHOTS[0][1];
  for (const [t0, f] of SHOTS) if (t >= t0 - 1e-6) fn = f;
  fn(t);
  if (pending) renderNow();
};
window.__info = () => ({ fps: 24, duration: T.end, T, flurry: FLURRY, sparks: SPARKS.map((s) => ({ t: s.t0, size: s.size })), arcs: ARCS.map((a) => ({ t: a.t0, style: a.style })), wave: WAVE, callouts: [...CALLOUTS, ULT].map((c) => ({ t: c.t0, text: c.text })), subs: SUBS.map((s) => ({ t: s.t0, who: s.who })) });
window.__ready = true;
