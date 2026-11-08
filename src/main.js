import * as THREE from 'three';
import { buildEnvironment } from './env.js';
import { buildPost } from './post.js';
import { buildCharacter } from './characters.js';
import { A, B, evalPose, rootAt, rootPosAt, warp, cameraAt, events, DURATION, T_EXPLODE } from './choreo.js';
import { buildFX } from './fx.js';
import { clamp, smoothstep, lerp } from './util.js';

const params = new URLSearchParams(location.search);
const W = parseInt(params.get('w') || '1920', 10);
const H = parseInt(params.get('h') || '816', 10);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);
document.documentElement.style.setProperty('--h', H + 'px');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 900);
camera.layers.enable(1);
const env = buildEnvironment(scene, renderer, W, H);
const rigs = { A: buildCharacter('A', scene), B: buildCharacter('B', scene) };
const fx = buildFX(scene, rigs, env);
const post = buildPost(renderer, scene, camera, W, H);
const DBG = (params.get('dbg') || '').split(',');
if (DBG.includes('nobloom')) post.bloom.enabled = false;
if (DBG.includes('nostreak')) post.streak.enabled = false;
const titleEl = document.getElementById('title');
const lineEl = titleEl.querySelector('.line');

// ---------------------------------------------------------------- tail + scarf history
const TAIL_N = 18, SCARF_N = 16;
const hist = { r: {} };
const UP = new THREE.Vector3(0, 1, 0);
function secondary(c, s, P) {
  P.tailPts = P.tailPts || Array.from({ length: TAIL_N }, () => new THREE.Vector3());
  P.tailR = P.tailR || new Array(TAIL_N).fill(0);
  const local = new THREE.Vector3(), body = new THREE.Vector3(), base = new THREE.Vector3();
  for (let i = 0; i < TAIL_N; i++) {
    const u = i / (TAIL_N - 1);
    const tau = s - i * 0.03;
    rootPosAt(c, tau, base);
    const dOff = (0.12 + u * 1.0) * c.sc;
    local.set(0, -dOff, 0);
    body.copy(local).applyQuaternion(P.rootQuat);
    body.lerp(local, Math.min(i / 5, 1));
    const wob = 0.018 * i * c.sc;
    P.tailPts[i].copy(base).add(body).add(new THREE.Vector3(Math.sin(s * 5.3 + i * 0.7) * wob, 0, Math.cos(s * 4.1 + i * 0.9) * wob));
    P.tailR[i] = c.sc * (0.15 + 0.1 * Math.sin(Math.min(u * 3, 1) * Math.PI / 2)) * Math.pow(1 - u, 0.75) * (1 + 0.12 * Math.sin(s * 11 + i * 1.3));
  }
  if (c === A) {
    P.scarfPts = P.scarfPts || Array.from({ length: SCARF_N }, () => new THREE.Vector3());
    P.scarfSides = P.scarfSides || Array.from({ length: SCARF_N }, () => new THREE.Vector3());
    P.scarfW = P.scarfW || new Array(SCARF_N).fill(0);
    const anchorL = new THREE.Vector3(0, 0.55, -0.11).add(c.waist);
    const R = {};
    for (let i = 0; i < SCARF_N; i++) {
      const u = i / (SCARF_N - 1);
      const tau = s - i * 0.028;
      rootAt(c, tau, R);
      const p = P.scarfPts[i].copy(anchorL).applyQuaternion(R.quat).add(R.pos);
      p.y -= i * 0.03;
      p.x += -0.025 * i; p.z += 0.012 * i;
      p.addScaledVector(new THREE.Vector3(0.6, 0.3, 0.7).normalize(), Math.sin(s * 9.5 - i * 0.75) * 0.012 * i);
      P.scarfW[i] = 0.075 * (1 - 0.45 * u);
    }
    for (let i = 0; i < SCARF_N; i++) {
      const a = P.scarfPts[Math.max(i - 1, 0)], b = P.scarfPts[Math.min(i + 1, SCARF_N - 1)];
      const t = b.clone().sub(a).normalize();
      const side = new THREE.Vector3().crossVectors(t, UP);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      side.applyAxisAngle(t, Math.sin(s * 6 - i * 0.5) * 0.4);
      P.scarfSides[i].copy(side);
    }
  }
}

// ---------------------------------------------------------------- frame
const poses = { A: {}, B: {} };
const camState = {};
const FLASHES = [
  { r: 4.1, k: 0.15, d: 12 }, { r: 7.45, k: 0.12, d: 12 }, { r: T_EXPLODE, k: 0.22, d: 6 }, { r: 10.42, k: 0.15, d: 8 },
  { r: 13.09, k: 0.55, d: 10 }, { r: 8.62, k: 0.15, d: 8 }, { r: 14.3, k: 0.18, d: 5 },
];
const INVERT = [4.1, 10.42];

window.__renderAt = (r) => {
  const s = warp.S(r);
  evalPose(A, s, poses.A);
  evalPose(B, s, poses.B);
  secondary(A, s, poses.A);
  secondary(B, s, poses.B);
  rigs.A.apply(poses.A, s);
  rigs.B.apply(poses.B, s);

  cameraAt(r, camState);
  camera.position.copy(camState.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(camState.target);
  camera.rotateY(camState.yaw);
  camera.rotateX(camState.pitch);
  camera.rotateZ(camState.roll);
  camera.fov = camState.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  fx.update(r, s, camera, W, H, poses);
  env.update(s, fx.lightningFlash || 0, camera);
  // rim light sits behind the subjects relative to the camera
  const mid = poses.A.chestPos.clone().add(poses.B.chestPos).multiplyScalar(0.5);
  const back = mid.clone().sub(camera.position).setY(0).normalize();
  env.rim.position.copy(mid).addScaledVector(back, 10).add(new THREE.Vector3(0, 8, 0));
  env.rim.target.position.copy(mid);
  env.fill.position.copy(camera.position).add(new THREE.Vector3(0, 2.5, 0));
  env.fill.target.position.copy(mid);

  // post
  const F = post.final.uniforms;
  let flash = 0, ca = 0;
  for (const f of FLASHES) {
    const d = r - f.r;
    if (d >= 0 && d < 2) { flash += f.k * Math.exp(-d * f.d); ca += f.k * Math.exp(-d * f.d * 0.7) * 0.012; }
  }
  flash += (fx.lightningFlash || 0) * 0.05;
  F.uFlash.value = flash;
  F.uCA.value = ca + (r > 10.42 && r < 11.85 ? 0.004 : 0);
  F.uInvert.value = INVERT.some((t) => r >= t - 1e-4 && r < t + 0.034) ? 1 : 0;
  F.uFade.value = 1 - smoothstep(0.0, 0.4, r) + smoothstep(14.72, 15.0, r);
  F.uTime.value = r;
  post.bloom.strength = 0.5 + Math.min(flash, 1) * 0.3;
  post.streak.strength = 0.22 + Math.min(flash, 1) * 0.2;

  // title card
  const tOp = smoothstep(14.3, 14.62, r) * (1 - smoothstep(14.75, 15.0, r));
  titleEl.style.opacity = tOp.toFixed(3);
  titleEl.style.transform = `scale(${lerp(1.08, 1.0, smoothstep(14.3, 14.9, r)).toFixed(4)})`;
  lineEl.style.width = `${(smoothstep(14.35, 14.85, r) * 42).toFixed(2)}%`;

  if (DBG.includes('nofx')) scene.traverse((o) => { if (o.material && o.material.blending === THREE.AdditiveBlending) o.visible = false; });
  post.composer.render();
};

window.__info = () => ({ events: { clashes: events.clashes.map((e) => ({ r: e.r, kind: e.kind, intensity: e.intensity, pos: e.pos.toArray() })), whooshes: events.whooshes, misc: events.misc, lightning: events.lightning.map((l) => ({ r: l.r, strength: l.strength })), dust: events.dust } });
window.__ready = true;
