// 2D cut-out rig drawn with canvas paths: skeleton solve (FK arms, IK legs),
// cloth/hair chains with lag, and two original character skins in cel style.
import { TAU, D2R, clamp, lerp, add, sub, mul, norm, perp, mixv, dirA, dirUp, smoothPath, poly, limbPath, ik2, mixHex, noise1 } from './util.js';

export const DIMS = { thigh: 0.45, shin: 0.45, ankle: 0.07, spineLow: 0.25, spineUp: 0.25, neck: 0.06, headR: 0.125, upperArm: 0.26, foreArm: 0.25 };

export const BASE_POSE = {
  hip: [0, -0.86], lean: 6, bend: 2, head: 0, turn: 0,
  armF: [30, 60], armB: [-12, 8], sword: 120, two: 0,
  footF: [0.2, 0], footB: [-0.22, 0], footAF: 0, footAB: 0,
  squash: 1, bladeLen: 1,
};

// ---------------------------------------------------------------- skeleton
export function solve(P, D = DIMS) {
  const J = {};
  const up1 = dirUp(P.lean), up2 = dirUp(P.lean + P.bend);
  const f1 = [up1[1] * -1, up1[0]], f2 = [-up2[1], up2[0]]; // forward perpendiculars
  J.up1 = up1; J.up2 = up2; J.f1 = f1; J.f2 = f2;
  J.hip = P.hip.slice();
  J.chest = add(J.hip, mul(up1, D.spineLow));
  J.neck = add(J.chest, mul(up2, D.spineUp));
  J.R = D.headR;
  J.headAng = P.lean + P.bend + P.head;
  J.headC = add(J.neck, mul(dirUp(P.lean + P.bend + P.head * 0.5), D.neck + D.headR * 0.8));
  const shBase = add(J.neck, mul(up2, -0.045));
  J.shF = add(shBase, mul(f2, -0.025 - 0.06 * P.turn));
  J.shB = add(shBase, mul(f2, 0.02 + 0.07 * P.turn));
  J.elF = add(J.shF, mul(dirA(P.armF[0]), D.upperArm));
  J.haF = add(J.elF, mul(dirA(P.armF[1]), D.foreArm));
  const sd = dirA(P.sword);
  J.sd = sd;
  J.guard = add(J.haF, mul(sd, 0.05));
  J.tip = add(J.guard, mul(sd, (D.blade || 0.84) * P.bladeLen));
  J.pommel = add(J.haF, mul(sd, -(D.hilt || 0.17)));
  if (P.two > 0.5) {
    const r = ik2(J.shB, add(J.haF, mul(sd, -0.1)), D.upperArm, D.foreArm, 'down');
    J.elB = r.joint; J.haB = r.end;
  } else {
    J.elB = add(J.shB, mul(dirA(P.armB[0]), D.upperArm));
    J.haB = add(J.elB, mul(dirA(P.armB[1]), D.foreArm));
  }
  J.hipF = add(J.hip, [0.025, 0.02]);
  J.hipB = add(J.hip, [-0.035, 0.02]);
  J.anF = [P.footF[0], P.footF[1] - D.ankle];
  J.anB = [P.footB[0], P.footB[1] - D.ankle];
  const kf = ik2(J.hipF, J.anF, D.thigh, D.shin, 'right'), kb = ik2(J.hipB, J.anB, D.thigh, D.shin, 'right');
  J.knF = kf.joint; J.anF = kf.end; J.knB = kb.joint; J.anB = kb.end;
  J.footAF = P.footAF; J.footAB = P.footAB;
  return J;
}

// ---------------------------------------------------------------- drawing helpers
function fillStroke(ctx, path, fill, C, lw) {
  ctx.fillStyle = fill; ctx.fill(path);
  if (lw > 0) { ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path); }
}
// tapered limb with a lit upper side (cel two-tone) and outline
function limb(ctx, p0, p1, r0, r1, lit, shade, C, lw, rim = true) {
  const path = limbPath(p0, p1, r0, r1);
  ctx.fillStyle = shade; ctx.fill(path);
  const d = norm(sub(p1, p0));
  let n = perp(d);
  if (n[1] > 0) n = [-n[0], -n[1]]; // lit side faces up
  if (!C.sil) {
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = lit;
    ctx.fill(limbPath(add(p0, mul(n, r0 * 0.55)), add(p1, mul(n, r1 * 0.55)), r0 * 0.95, r1 * 0.95));
    if (rim && C.rim) {
      ctx.strokeStyle = C.rim; ctx.lineWidth = lw * 1.1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p0[0] + n[0] * (r0 - lw * 0.9), p0[1] + n[1] * (r0 - lw * 0.9)); ctx.lineTo(p1[0] + n[0] * (r1 - lw * 0.9), p1[1] + n[1] * (r1 - lw * 0.9)); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(path);
}
function blob(pts, tension = 0.5, closed = true) { return smoothPath(new Path2D(), pts, closed, tension); }
function polyP(pts, closed = true) { return poly(new Path2D(), pts, closed); }
// ribbon polygon along a chain of points with per-point half widths
function ribbon(pts, widths, endStyle = 'round') {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    const n = perp(norm(sub(b, a)));
    L.push(add(pts[i], mul(n, widths[i])));
    R.push(add(pts[i], mul(n, -widths[i])));
  }
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) { const m = mixv(L[i - 1], L[i], 0.5); p.quadraticCurveTo(L[i - 1][0], L[i - 1][1], m[0], m[1]); }
  p.lineTo(L[L.length - 1][0], L[L.length - 1][1]);
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const dir = norm(sub(last, prev));
  if (endStyle === 'notch') { const m = add(last, mul(dir, -widths[widths.length - 1] * 1.2)); p.lineTo(m[0], m[1]); }
  else if (endStyle === 'point') { const m = add(last, mul(dir, widths[widths.length - 1] * 2.5 + 0.03)); p.lineTo(m[0], m[1]); }
  p.lineTo(R[R.length - 1][0], R[R.length - 1][1]);
  for (let i = R.length - 2; i >= 0; i--) { const m = mixv(R[i + 1], R[i], 0.5); p.quadraticCurveTo(R[i + 1][0], R[i + 1][1], m[0], m[1]); }
  p.lineTo(R[0][0], R[0][1]);
  p.closePath();
  return p;
}
// transform a point from part-local (origin o, rotation deg, unit scale s) to rig-local
function xf(o, deg, s) { const c = Math.cos(deg * D2R), sn = Math.sin(deg * D2R); return (p) => [o[0] + (p[0] * c - p[1] * sn) * s, o[1] + (p[0] * sn + p[1] * c) * s]; }
const silProxy = (col) => new Proxy({ sil: true }, { get: (t, k) => (k === 'sil' ? true : k === 'rim' ? null : col) });

function footPoly(an, ang) {
  const T = xf(an, ang, 1);
  return polyP([[-0.05, -0.03], [-0.068, 0.068], [0.12, 0.072], [0.175, 0.05], [0.09, -0.005], [0.04, -0.045]].map(T));
}

// ---------------------------------------------------------------- palettes
export const HERO_PAL = {
  line: '#0b1026', rim: 'rgba(200,232,255,0.55)',
  skin: '#e6d3dc', skinS: '#b79fc0',
  hair: '#eef2fb', hairS: '#aab6da', hairD: '#8490bd',
  coat: '#2c3c72', coatS: '#192350', trim: '#46d8c6',
  sleeve: '#e3e9f7', sleeveS: '#9da9d0',
  sash: '#35c4b4', sashS: '#1c8088',
  pants: '#262d55', pantsS: '#161b3a',
  boot: '#d5dbee', bootS: '#939dc4', sole: '#1d5f6b',
  scarfA: '#3fe0cc', scarfB: '#6f86ff', scarfC: '#cf74ff',
  blade: '#eafcff', bladeS: '#9fd8ea', guard: '#e2cc86', hilt: '#1b2550',
  eye: '#28c8c0', eyeD: '#0d3f56',
};
export const RIVAL_PAL = {
  line: '#060409', rim: 'rgba(170,186,236,0.5)',
  armor: '#3d3745', armorS: '#201c27', armorD: '#131018', trim: '#b8142f',
  cloth: '#1c1822', clothS: '#0e0b12', lining: '#8a1126', liningS: '#560a18',
  mask: '#f2ece6', maskS: '#b9aebd', eye: '#ff3350',
  plume: '#c91c3e', plumeS: '#7a0e25',
  blade: '#121016', bladeS: '#060508', edge: '#ff3a58', guard: '#5a4a3a', hilt: '#2a1a1e',
};

// ---------------------------------------------------------------- hero skin
function drawHero(ctx, J, P, ch, o) {
  const C = o.sil ? silProxy(o.sil) : HERO_PAL;
  const lw = o.lw;
  const { up1, up2, f1, f2 } = J;
  const dark = (lit, sh) => (C.sil ? lit : mixHex(lit, '#0b1026', 0.35));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // scabbard at the back hip
  {
    const a = add(J.hip, add(mul(up1, 0.07), mul(f1, -0.04)));
    const b = add(a, mul(dirA(-118 + P.lean * 0.6), 0.86));
    limb(ctx, a, b, 0.022, 0.018, C.hilt, C.pantsS, C, lw, false);
    if (!C.sil) { ctx.strokeStyle = C.trim; ctx.lineWidth = lw * 1.4; for (const k of [0.12, 0.2]) { const m = mixv(a, b, k), n = mul(perp(norm(sub(b, a))), 0.022); ctx.beginPath(); ctx.moveTo(m[0] - n[0], m[1] - n[1]); ctx.lineTo(m[0] + n[0], m[1] + n[1]); ctx.stroke(); } }
  }
  // scarf tail (behind the body)
  if (ch.scarf) {
    const n = ch.scarf.length, w = ch.scarf.map((_, i) => lerp(0.05, 0.085, Math.min(i / 3, 1)) * (1 - 0.25 * (i / (n - 1))));
    const path = ribbon(ch.scarf, w, 'notch');
    if (C.sil) { ctx.fillStyle = C.line; ctx.fill(path); }
    else {
      const g = ctx.createLinearGradient(ch.scarf[0][0], ch.scarf[0][1], ch.scarf[n - 1][0], ch.scarf[n - 1][1]);
      g.addColorStop(0, C.scarfA); g.addColorStop(0.55, C.scarfB); g.addColorStop(1, C.scarfC);
      ctx.fillStyle = g; ctx.fill(path);
      // fold shadow along the lower half
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = 'rgba(12,16,60,0.33)';
      ctx.fill(ribbon(ch.scarf.map((p, i) => add(p, [0, w[i] * 0.9])), w.map((x) => x * 0.75)));
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = lw * 0.9;
      ctx.stroke(ribbon(ch.scarf.map((p, i) => add(p, [0, -w[i] * 0.75])), w.map(() => 0.001)));
      ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
    }
  }
  // back arm
  limb(ctx, J.shB, J.elB, 0.048, 0.04, dark(C.coat), dark(C.coatS), C, lw, false);
  {
    const d = norm(sub(J.haB, J.elB)); let n = perp(d); if (n[1] > 0) n = mul(n, -1);
    const path = blob([add(J.elB, mul(n, 0.05)), add(J.haB, add(mul(n, 0.07), mul(d, 0.02))), add(J.haB, add(mul(n, -0.03), mul(d, 0.03))), add(mixv(J.haB, ch.sleeveB || J.haB, 1), [0, 0.0]), add(J.elB, mul(n, -0.05))], 0.4);
    fillStroke(ctx, path, C.sil ? C.line : mixHex(C.sleeveS, '#0b1026', 0.18), C, lw);
  }
  { const p = new Path2D(); p.arc(J.haB[0], J.haB[1], 0.04, 0, TAU); fillStroke(ctx, p, C.sil ? C.line : C.skinS, C, lw); }
  // back leg
  limb(ctx, J.hipB, J.knB, 0.085, 0.064, dark(C.pants), dark(C.pantsS), C, lw, false);
  limb(ctx, J.knB, J.anB, 0.06, 0.046, dark(C.pants), dark(C.pantsS), C, lw, false);
  limb(ctx, mixv(J.knB, J.anB, 0.45), J.anB, 0.06, 0.052, dark(C.boot), dark(C.bootS), C, lw, false);
  fillStroke(ctx, footPoly(J.anB, J.footAB), dark(C.bootS), C, lw);
  // coat tails
  if (ch.tails) for (const tl of ch.tails) {
    const w = tl.map((_, i) => lerp(0.06, 0.1, i / (tl.length - 1)));
    const path = ribbon(tl, w, 'point');
    fillStroke(ctx, path, C.coatS, C, lw);
    if (!C.sil) { ctx.save(); ctx.clip(path); ctx.fillStyle = C.coat; ctx.fill(ribbon(tl.map((p, i) => add(p, [0.03, -0.01])), w.map((x) => x * 0.6), 'point')); ctx.restore(); ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path); }
  }
  // torso
  const waistF = add(J.hip, add(mul(up1, 0.1), mul(f1, 0.085))), waistB = add(J.hip, add(mul(up1, 0.1), mul(f1, -0.08)));
  {
    const pts = [
      add(J.hip, add(mul(f1, 0.1), mul(up1, -0.02))), waistF,
      add(J.chest, add(mul(up2, 0.07), mul(f2, 0.118 + 0.02 * P.turn))),
      add(J.neck, add(mul(f2, 0.055), mul(up2, -0.015))), add(J.neck, mul(f2, -0.06)),
      add(J.chest, add(mul(up2, 0.1), mul(f2, -0.1 - 0.02 * P.turn))), waistB,
      add(J.hip, add(mul(f1, -0.11), mul(up1, -0.02))),
    ];
    const path = blob(pts, 0.45);
    ctx.fillStyle = C.coatS; ctx.fill(path);
    if (!C.sil) {
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = C.coat; ctx.fill(blob(pts.map((p) => add(p, add(mul(f2, 0.05), mul(up2, 0.03)))), 0.45));
      // front trim
      ctx.strokeStyle = C.trim; ctx.lineWidth = lw * 1.6;
      ctx.beginPath(); const a = add(J.neck, mul(f2, 0.035)), b = add(J.chest, mul(f2, 0.085)), c = add(waistF, mul(f1, -0.03));
      ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
    // peplum below the sash
    const pep = blob([add(waistF, mul(up1, -0.02)), add(J.hip, add(mul(f1, 0.15), mul(up1, -0.1))), add(J.hip, add(mul(f1, 0.0), mul(up1, -0.13))), add(J.hip, add(mul(f1, -0.15), mul(up1, -0.09))), add(waistB, mul(up1, -0.02))], 0.35);
    fillStroke(ctx, pep, C.coat, C, lw);
    if (!C.sil) { ctx.save(); ctx.clip(pep); ctx.fillStyle = C.coatS; ctx.fill(blob([add(J.hip, mul(f1, -0.2)), add(J.hip, add(mul(f1, -0.02), mul(up1, 0.02))), add(J.hip, add(mul(f1, 0.0), mul(up1, -0.2))), add(J.hip, add(mul(f1, -0.2), mul(up1, -0.2)))], 0.3)); ctx.restore(); }
    // sash + bow
    const sash = polyP([add(waistF, mul(up1, 0.035)), add(waistF, mul(up1, -0.04)), add(waistB, mul(up1, -0.04)), add(waistB, mul(up1, 0.035))]);
    fillStroke(ctx, sash, C.sash, C, lw);
    if (!C.sil) {
      const bo = add(waistB, mul(f1, -0.01));
      for (const s of [-1, 1]) { const p = new Path2D(); p.ellipse(bo[0] - 0.05, bo[1] + s * 0.035, 0.07, 0.035, s * 0.5, 0, TAU); fillStroke(ctx, p, s < 0 ? C.sash : C.sashS, C, lw); }
    }
  }
  // front leg
  limb(ctx, J.hipF, J.knF, 0.088, 0.066, C.pants, C.pantsS, C, lw);
  limb(ctx, J.knF, J.anF, 0.062, 0.047, C.pants, C.pantsS, C, lw);
  limb(ctx, mixv(J.knF, J.anF, 0.42), J.anF, 0.063, 0.054, C.boot, C.bootS, C, lw);
  {
    const fp = footPoly(J.anF, J.footAF);
    fillStroke(ctx, fp, C.boot, C, lw);
    if (!C.sil) { const T = xf(J.anF, J.footAF, 1); ctx.strokeStyle = C.sole; ctx.lineWidth = lw * 2.2; ctx.beginPath(); const a = T([-0.062, 0.066]), b = T([0.125, 0.07]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  }
  // ponytail
  if (ch.pony) {
    const n = ch.pony.length, w = ch.pony.map((_, i) => 0.062 * Math.pow(1 - i / (n - 1), 0.7) + 0.012);
    const path = ribbon(ch.pony, w, 'point');
    ctx.fillStyle = C.hairS; ctx.fill(path);
    if (!C.sil) { ctx.save(); ctx.clip(path); ctx.fillStyle = C.hair; ctx.fill(ribbon(ch.pony.map((p) => add(p, [0.012, -0.03])), w.map((x) => x * 0.72), 'point')); ctx.restore(); }
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
  }
  // head
  {
    const R = J.R, T = xf(J.headC, J.headAng, R);
    limb(ctx, J.neck, add(J.headC, mul(up2, -0.03)), 0.042, 0.04, C.skinS, C.skinS, C, lw, false);
    // back hair volume
    const back = blob([[0.7, -0.85], [0.2, -1.2], [-0.6, -1.08], [-1.12, -0.45], [-1.08, 0.3], [-0.8, 0.82], [-0.45, 0.6], [-0.2, 0.2], [0.2, -0.4]].map(T), 0.5);
    fillStroke(ctx, back, C.hairS, C, lw);
    // face
    const face = blob([[0.3, -1.0], [0.8, -0.72], [0.97, -0.25], [0.93, -0.02], [1.13, 0.27], [0.96, 0.37], [0.97, 0.5], [0.9, 0.57], [0.93, 0.68], [0.84, 0.8], [0.8, 1.0], [0.58, 1.1], [0.1, 0.82], [-0.3, 0.45], [-0.5, -0.1], [-0.3, -0.8]].map(T), 0.32);
    fillStroke(ctx, face, C.skin, C, lw);
    if (!C.sil) {
      ctx.save(); ctx.clip(face);
      ctx.fillStyle = C.skinS;
      ctx.fill(blob([[-0.6, -0.2], [0.1, 0.0], [0.4, 0.75], [0.75, 1.0], [0.5, 1.3], [-0.6, 1.0]].map(T), 0.4)); // jaw/neck shadow
      ctx.fill(blob([[0.2, -1.1], [1.1, -0.8], [1.05, -0.32], [0.6, -0.42], [0.2, -0.3]].map(T), 0.4)); // shadow under the bangs
      ctx.restore();
      // ear
      const ear = new Path2D(); const e = T([-0.12, 0.16]); ear.ellipse(e[0], e[1], R * 0.14, R * 0.22, J.headAng * D2R + 0.2, 0, TAU);
      fillStroke(ctx, ear, C.skin, C, lw * 0.8);
      // eye
      const blink = o.blink || 0;
      ctx.save();
      const eyeShape = blob([[0.42, -0.02], [0.6, -0.22], [0.87, -0.05], [0.8, 0.17], [0.54, 0.18]].map(T), 0.4);
      if (blink < 0.6) {
        ctx.fillStyle = '#f6f8ff'; ctx.fill(eyeShape);
        ctx.save(); ctx.clip(eyeShape);
        const ic = T([0.69, 0.02]);
        const g = ctx.createLinearGradient(ic[0], ic[1] - R * 0.2, ic[0], ic[1] + R * 0.2);
        g.addColorStop(0, C.eyeD); g.addColorStop(0.6, C.eye); g.addColorStop(1, '#9ff5e6');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ic[0], ic[1], R * 0.14, R * 0.24, J.headAng * D2R, 0, TAU); ctx.fill();
        ctx.fillStyle = '#06202e'; ctx.beginPath(); ctx.ellipse(ic[0], ic[1], R * 0.06, R * 0.12, J.headAng * D2R, 0, TAU); ctx.fill();
        ctx.fillStyle = '#fff'; const hl = T([0.74, -0.08]); ctx.beginPath(); ctx.arc(hl[0], hl[1], R * 0.055, 0, TAU); ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = C.line; ctx.lineWidth = lw * 1.5;
      ctx.beginPath(); let a = T([0.38, 0.0]), b = T([0.62, blink < 0.6 ? -0.3 : 0.04]), c = T([0.9, -0.05]); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.stroke();
      ctx.lineWidth = lw * 0.9;
      ctx.beginPath(); a = T([0.46, -0.46 + (o.brow || 0) * 0.08]); b = T([0.94, -0.33 - (o.brow || 0) * 0.02]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); // brow
      ctx.beginPath(); a = T([0.9, 0.58]); b = T([0.76, 0.6]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); // mouth
      ctx.restore();
    }
    // bangs + side lock
    const sway = (ch.lock || 0);
    const bangs = polyP([[0.1, -1.2], [0.75, -1.02], [1.08, -0.62], [1.14, -0.2], [0.98, -0.42], [0.95, -0.12], [0.8, -0.4], [0.7, -0.14], [0.56, -0.42], [0.42, -0.2], [0.3, -0.45], [0.22 + sway * 0.3, 0.55], [0.06 + sway * 0.5, 0.98], [0.0 + sway * 0.2, 0.4], [-0.15, -0.1], [-0.35, -0.6]].map(T));
    fillStroke(ctx, bangs, C.hair, C, lw);
    if (!C.sil) {
      ctx.save(); ctx.clip(bangs); ctx.fillStyle = C.hairS;
      ctx.fill(polyP([[0.1, -0.5], [0.5, -0.55], [1.2, -0.3], [1.2, 0.2], [0.3, 0.0], [0.3, 1.2], [-0.2, 1.2], [-0.2, -0.2]].map(T)));
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 1.4; ctx.beginPath(); const a = T([0.05, -0.95]), b = T([0.5, -1.0]), c = T([0.9, -0.72]); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]); ctx.stroke();
      ctx.restore(); ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(bangs);
      // ribbon tie
      const rb = T([-0.72, -0.82]); const p = new Path2D(); p.arc(rb[0], rb[1], R * 0.2, 0, TAU); fillStroke(ctx, p, C.trim, C, lw);
    }
  }
  // scarf wrap around the neck
  {
    const c = add(J.neck, mul(up2, 0.03));
    const wrap = blob([add(c, add(mul(f2, 0.09), mul(up2, 0.03))), add(c, add(mul(f2, 0.075), mul(up2, -0.07))), add(c, add(mul(f2, -0.03), mul(up2, -0.095))), add(c, add(mul(f2, -0.105), mul(up2, -0.04))), add(c, add(mul(f2, -0.09), mul(up2, 0.05))), add(c, add(mul(f2, 0.0), mul(up2, 0.07)))], 0.5);
    if (C.sil) { ctx.fillStyle = C.line; ctx.fill(wrap); }
    else {
      const g = ctx.createLinearGradient(c[0] - 0.1, c[1], c[0] + 0.1, c[1]); g.addColorStop(0, C.scarfB); g.addColorStop(1, C.scarfA);
      fillStroke(ctx, wrap, g, C, lw);
      ctx.strokeStyle = 'rgba(10,20,70,0.5)'; ctx.lineWidth = lw; ctx.beginPath(); const a = add(c, add(mul(f2, 0.07), mul(up2, -0.01))), b = add(c, add(mul(f2, -0.08), mul(up2, 0.0))); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1] + 0.03, b[0], b[1]); ctx.stroke();
    }
  }
  // sword
  drawBlade(ctx, J, P, C, lw, o, false);
  // front arm: sleeve with hanging corner
  limb(ctx, J.shF, J.elF, 0.052, 0.043, C.coat, C.coatS, C, lw);
  {
    const d = norm(sub(J.haF, J.elF)); let n = perp(d); if (n[1] > 0) n = mul(n, -1);
    const hang = ch.sleeveF || add(J.haF, [0, 0.18]);
    const pts = [add(J.elF, mul(n, 0.055)), add(J.haF, add(mul(n, 0.075), mul(d, 0.0))), add(J.haF, add(mul(n, 0.02), mul(d, 0.045))), add(J.haF, add(mul(n, -0.05), mul(d, 0.02))), hang, add(mixv(J.elF, hang, 0.45), mul(n, -0.03)), add(J.elF, mul(n, -0.055))];
    const path = blob(pts, 0.38);
    ctx.fillStyle = C.sleeveS; ctx.fill(path);
    if (!C.sil) {
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = C.sleeve; ctx.fill(blob(pts.map((p) => add(p, mul(n, 0.045))), 0.38));
      ctx.strokeStyle = C.trim; ctx.lineWidth = lw * 2.2; ctx.beginPath(); const a = add(J.haF, add(mul(n, 0.08), mul(d, 0.01))), b = add(J.haF, add(mul(n, -0.045), mul(d, 0.03))); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(hang[0], hang[1]); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
  }
  { const p = new Path2D(); p.ellipse(J.haF[0], J.haF[1], 0.047, 0.04, Math.atan2(J.sd[1], J.sd[0]), 0, TAU); fillStroke(ctx, p, C.skin, C, lw); }
}

function drawBlade(ctx, J, P, C, lw, o, heavy) {
  const sd = J.sd, n = perp(sd);
  const hw0 = heavy ? 0.04 : 0.02, hw1 = heavy ? 0.03 : 0.012;
  limb(ctx, J.pommel, J.guard, heavy ? 0.022 : 0.017, heavy ? 0.022 : 0.017, C.hilt, C.hilt, C, lw, false);
  const L = Math.hypot(J.tip[0] - J.guard[0], J.tip[1] - J.guard[1]);
  if (L > 0.02) {
    const m = mixv(J.guard, J.tip, 0.88);
    const blade = polyP([add(J.guard, mul(n, hw0)), add(m, mul(n, hw1)), J.tip, add(m, mul(n, -hw1)), add(J.guard, mul(n, -hw0))]);
    fillStroke(ctx, blade, C.blade, C, lw);
    if (!C.sil) {
      ctx.save(); ctx.clip(blade);
      ctx.fillStyle = heavy ? C.edge : C.bladeS;
      ctx.fill(polyP([add(J.guard, mul(n, heavy ? -hw0 * 0.35 : 0)), add(J.tip, mul(n, 0)), add(m, mul(n, -hw1 * 2)), add(J.guard, mul(n, -hw0 * 2))]));
      ctx.restore();
      if (o.glint) { ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 1.2; ctx.beginPath(); const a = mixv(J.guard, J.tip, clamp(o.glint - 0.12, 0, 1)), b = mixv(J.guard, J.tip, clamp(o.glint, 0, 1)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
  }
  // guard
  const g = polyP([add(J.guard, mul(n, heavy ? 0.075 : 0.06)), add(J.guard, mul(sd, 0.02)), add(J.guard, mul(n, heavy ? -0.075 : -0.06)), add(J.guard, mul(sd, -0.02))]);
  fillStroke(ctx, g, C.guard, C, lw);
}

// ---------------------------------------------------------------- rival skin
function drawRival(ctx, J, P, ch, o) {
  const C = o.sil ? silProxy(o.sil) : RIVAL_PAL;
  const lw = o.lw;
  const { up1, up2, f1, f2 } = J;
  const dark = (c) => (C.sil ? c : mixHex(c, '#050308', 0.4));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // cape (behind)
  if (ch.cape) {
    const n = ch.cape.length, w = ch.cape.map((_, i) => lerp(0.12, 0.24, i / (n - 1)));
    const outer = ribbon(ch.cape, w, 'round');
    // ragged hem: bite triangles out of the end
    fillStroke(ctx, outer, C.clothS, C, lw);
    if (!C.sil) {
      ctx.save(); ctx.clip(outer);
      ctx.fillStyle = C.lining; ctx.fill(ribbon(ch.cape.map((p, i) => add(p, [0, w[i] * 0.55])), w.map((x) => x * 0.6)));
      ctx.fillStyle = C.cloth; ctx.fill(ribbon(ch.cape.map((p, i) => add(p, [0, -w[i] * 0.5])), w.map((x) => x * 0.55)));
      ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(outer);
    }
  }
  // back arm + back leg
  limb(ctx, J.shB, J.elB, 0.06, 0.052, dark(C.cloth), dark(C.clothS), C, lw, false);
  limb(ctx, J.elB, J.haB, 0.06, 0.055, dark(C.armor), dark(C.armorS), C, lw, false);
  { const p = new Path2D(); p.arc(J.haB[0], J.haB[1], 0.05, 0, TAU); fillStroke(ctx, p, dark(C.armorS), C, lw); }
  limb(ctx, J.hipB, J.knB, 0.105, 0.09, dark(C.cloth), dark(C.clothS), C, lw, false);
  limb(ctx, J.knB, J.anB, 0.085, 0.062, dark(C.cloth), dark(C.clothS), C, lw, false);
  limb(ctx, mixv(J.knB, J.anB, 0.3), J.anB, 0.07, 0.06, dark(C.armor), dark(C.armorS), C, lw, false);
  fillStroke(ctx, footPoly(J.anB, J.footAB), dark(C.armorS), C, lw);
  // waist cloth
  if (ch.waist) { const w = ch.waist.map((_, i) => lerp(0.07, 0.13, i / (ch.waist.length - 1))); const path = ribbon(ch.waist, w, 'point'); fillStroke(ctx, path, C.liningS, C, lw); if (!C.sil) { ctx.save(); ctx.clip(path); ctx.fillStyle = C.lining; ctx.fill(ribbon(ch.waist.map((p) => add(p, [0.03, -0.02])), w.map((x) => x * 0.6), 'point')); ctx.restore(); } }
  // torso armor
  {
    const pts = [
      add(J.hip, add(mul(f1, 0.13), mul(up1, -0.03))), add(J.hip, add(mul(up1, 0.1), mul(f1, 0.115))),
      add(J.chest, add(mul(up2, 0.06), mul(f2, 0.155))), add(J.neck, add(mul(f2, 0.08), mul(up2, -0.01))), add(J.neck, mul(f2, -0.085)),
      add(J.chest, add(mul(up2, 0.1), mul(f2, -0.14))), add(J.hip, add(mul(up1, 0.1), mul(f1, -0.11))), add(J.hip, add(mul(f1, -0.13), mul(up1, -0.03))),
    ];
    const path = blob(pts, 0.4);
    ctx.fillStyle = C.armorS; ctx.fill(path);
    if (!C.sil) {
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = C.armor; ctx.fill(blob(pts.map((p) => add(p, add(mul(f2, 0.06), mul(up2, 0.04)))), 0.4));
      ctx.strokeStyle = C.armorD; ctx.lineWidth = lw * 1.2;
      for (const k of [0.02, 0.1, 0.18]) { ctx.beginPath(); const a = add(J.hip, add(mul(up1, k + 0.1), mul(f1, 0.13))), b = add(J.hip, add(mul(up1, k + 0.12), mul(f1, -0.13))); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
      ctx.strokeStyle = C.trim; ctx.lineWidth = lw * 1.8; ctx.beginPath(); const a = add(J.neck, mul(f2, 0.06)), b = add(J.chest, mul(f2, 0.12)); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
    // tassets
    for (const s of [1, -1]) {
      const top = add(J.hip, add(mul(up1, 0.03), mul(f1, s * 0.07)));
      const plate = polyP([add(top, mul(f1, -0.075)), add(top, mul(f1, 0.075)), add(top, add(mul(f1, 0.09 + s * 0.03), [0, 0.2])), add(top, add(mul(f1, s * 0.02), [0, 0.25])), add(top, add(mul(f1, -0.09 + s * 0.03), [0, 0.2]))]);
      fillStroke(ctx, plate, s > 0 ? C.armor : C.armorS, C, lw);
      if (!C.sil) { ctx.strokeStyle = C.trim; ctx.lineWidth = lw * 1.5; ctx.beginPath(); const a = add(top, add(mul(f1, 0.085 + s * 0.03), [0, 0.19])), b = add(top, add(mul(f1, s * 0.02), [0, 0.24])), c = add(top, add(mul(f1, -0.085 + s * 0.03), [0, 0.19])); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    }
    fillStroke(ctx, polyP([add(J.hip, add(mul(up1, 0.13), mul(f1, 0.12))), add(J.hip, add(mul(up1, 0.05), mul(f1, 0.125))), add(J.hip, add(mul(up1, 0.05), mul(f1, -0.12))), add(J.hip, add(mul(up1, 0.13), mul(f1, -0.115)))]), C.trim, C, lw);
  }
  // front leg
  limb(ctx, J.hipF, J.knF, 0.11, 0.092, C.cloth, C.clothS, C, lw);
  limb(ctx, J.knF, J.anF, 0.088, 0.064, C.cloth, C.clothS, C, lw);
  limb(ctx, mixv(J.knF, J.anF, 0.28), J.anF, 0.074, 0.062, C.armor, C.armorS, C, lw);
  fillStroke(ctx, footPoly(J.anF, J.footAF), C.armor, C, lw);
  // plume
  if (ch.plume) { const n = ch.plume.length, w = ch.plume.map((_, i) => 0.07 * Math.sin(Math.PI * clamp(i / (n - 1) * 0.85 + 0.12, 0, 1)) + 0.01); const path = ribbon(ch.plume, w, 'point'); ctx.fillStyle = C.plumeS; ctx.fill(path); if (!C.sil) { ctx.save(); ctx.clip(path); ctx.fillStyle = C.plume; ctx.fill(ribbon(ch.plume.map((p) => add(p, [0, -0.03])), w.map((x) => x * 0.7), 'point')); ctx.restore(); } ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path); }
  // head: helmet + mask
  {
    const R = J.R, T = xf(J.headC, J.headAng, R);
    limb(ctx, J.neck, J.headC, 0.055, 0.05, C.armorD, C.armorD, C, lw, false);
    const helm = blob([[0.62, -0.92], [0.1, -1.22], [-0.75, -1.02], [-1.15, -0.3], [-1.1, 0.45], [-1.25, 0.85], [-0.5, 0.8], [-0.1, 0.5], [0.3, 0.2], [0.42, -0.5]].map(T), 0.4);
    fillStroke(ctx, helm, C.armorS, C, lw);
    if (!C.sil) { ctx.save(); ctx.clip(helm); ctx.fillStyle = C.armor; ctx.fill(blob([[0.7, -1.0], [0.1, -1.3], [-0.7, -1.2], [-1.0, -0.6], [-0.2, -0.55], [0.4, -0.7]].map(T), 0.4)); ctx.restore(); }
    const mask = blob([[0.5, -0.8], [0.98, -0.45], [1.1, 0.15], [0.98, 0.72], [0.72, 1.08], [0.38, 0.82], [0.3, -0.1], [0.36, -0.6]].map(T), 0.35);
    fillStroke(ctx, mask, C.mask, C, lw);
    if (!C.sil) {
      ctx.save(); ctx.clip(mask);
      ctx.fillStyle = C.maskS; ctx.fill(blob([[0.2, -0.9], [0.62, -0.7], [0.5, 0.2], [0.75, 1.2], [0.2, 1.2]].map(T), 0.4));
      ctx.restore();
      // eye slit
      const eg = o.eye == null ? 1 : o.eye;
      ctx.strokeStyle = eg > 0.05 ? C.eye : '#1a1016'; ctx.lineWidth = lw * 2.4; ctx.beginPath(); const a = T([0.62, -0.02]), b = T([0.96, -0.16]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = C.line; ctx.lineWidth = lw * 1.2; ctx.beginPath(); const c = T([0.78, 0.2]), d = T([0.74, 0.85]); ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.stroke();
    }
    // crest horn
    const crest = polyP([[0.78, -0.78], [0.62, -1.3], [-0.25, -2.05], [0.2, -1.2], [0.42, -0.92]].map(T));
    fillStroke(ctx, crest, C.trim, C, lw);
    const crest2 = polyP([[0.3, -1.05], [-0.1, -1.5], [-0.95, -1.75], [-0.4, -1.2], [-0.05, -1.05]].map(T));
    fillStroke(ctx, crest2, C.armor, C, lw);
  }
  // weapon
  drawBlade(ctx, J, P, C, lw, o, true);
  // front arm with layered pauldron
  limb(ctx, J.shF, J.elF, 0.066, 0.056, C.cloth, C.clothS, C, lw);
  limb(ctx, J.elF, J.haF, 0.066, 0.058, C.armor, C.armorS, C, lw);
  if (!C.sil) { ctx.strokeStyle = C.trim; ctx.lineWidth = lw * 1.6; const d = norm(sub(J.haF, J.elF)), n = perp(d), m = mixv(J.elF, J.haF, 0.85); ctx.beginPath(); ctx.moveTo(m[0] + n[0] * 0.055, m[1] + n[1] * 0.055); ctx.lineTo(m[0] - n[0] * 0.055, m[1] - n[1] * 0.055); ctx.stroke(); }
  {
    const d = norm(sub(J.elF, J.shF)), n = perp(d);
    for (let i = 1; i >= 0; i--) {
      const c = add(J.shF, mul(d, 0.05 + i * 0.075));
      const w = 0.105 - i * 0.02;
      const plate = blob([add(c, mul(n, w)), add(c, add(mul(n, w * 0.6), mul(d, -0.09))), add(c, add(mul(n, -w * 0.6), mul(d, -0.09))), add(c, mul(n, -w)), add(c, mul(d, 0.045))], 0.45);
      fillStroke(ctx, plate, i === 0 ? C.armor : C.armorS, C, lw);
      if (!C.sil) { ctx.strokeStyle = C.trim; ctx.lineWidth = lw * 1.5; ctx.beginPath(); const a1 = add(c, mul(n, w * 0.92)), m1 = add(c, mul(d, 0.03)), b1 = add(c, mul(n, -w * 0.92)); ctx.moveTo(a1[0], a1[1]); ctx.quadraticCurveTo(m1[0], m1[1], b1[0], b1[1]); ctx.stroke(); }
    }
    if (!C.sil) { ctx.fillStyle = C.rim; ctx.beginPath(); ctx.ellipse(J.shF[0] - 0.02, J.shF[1] - 0.04, 0.03, 0.012, -0.5, 0, TAU); ctx.fill(); }
  }
  { const p = new Path2D(); p.ellipse(J.haF[0], J.haF[1], 0.058, 0.05, Math.atan2(J.sd[1], J.sd[0]), 0, TAU); fillStroke(ctx, p, C.armorS, C, lw); }
}

// ---------------------------------------------------------------- character
const CHAINS = {
  hero: {
    scarf: { n: 11, len: 1.25, lag: 0.035, rest: [-0.92, 0.38], wave: 0.11, freq: 7.5, k: 0.8, anchor: (J) => add(J.neck, add(mul(J.f2, -0.085), mul(J.up2, 0.03))) },
    pony: { n: 8, len: 0.72, lag: 0.03, rest: [-0.5, 0.86], wave: 0.05, freq: 6, k: 0.9, anchor: (J) => { const T = xf(J.headC, J.headAng, J.R); return T([-0.8, -0.78]); } },
    tailA: { n: 5, len: 0.5, lag: 0.04, rest: [-0.42, 0.9], wave: 0.04, freq: 6.5, k: 1.1, anchor: (J) => add(J.hip, add(mul(J.up1, 0.06), mul(J.f1, -0.09))) },
    tailB: { n: 5, len: 0.44, lag: 0.045, rest: [-0.15, 0.98], wave: 0.035, freq: 7, k: 1.2, anchor: (J) => add(J.hip, add(mul(J.up1, 0.03), mul(J.f1, -0.03))) },
  },
  rival: {
    cape: { n: 8, len: 1.15, lag: 0.045, rest: [-0.6, 0.8], wave: 0.09, freq: 5.5, k: 0.75, anchor: (J) => add(J.neck, add(mul(J.f2, -0.1), mul(J.up2, -0.06))) },
    plume: { n: 8, len: 0.85, lag: 0.035, rest: [-0.85, 0.5], wave: 0.07, freq: 7, k: 0.85, anchor: (J) => { const T = xf(J.headC, J.headAng, J.R); return T([-0.35, -1.15]); } },
    waist: { n: 5, len: 0.55, lag: 0.05, rest: [-0.35, 0.93], wave: 0.04, freq: 6, k: 1.1, anchor: (J) => add(J.hip, add(mul(J.up1, 0.04), mul(J.f1, -0.1))) },
  },
};

export class Character {
  constructor(kind, anim) {
    this.kind = kind;
    this.anim = anim; // {poseAt(t) -> pose, rootAt(t) -> {x, y, facing, wind}}
    this.scale = kind === 'hero' ? 1.0 : 1.2;
    this.D = kind === 'hero' ? { ...DIMS, headR: 0.146, blade: 0.84, hilt: 0.17 } : { ...DIMS, headR: 0.132, blade: 1.22, hilt: 0.3 };
    this.cache = new Map();
  }
  state(t) {
    const key = Math.round(t * 1000);
    let s = this.cache.get(key);
    if (!s) {
      const P = this.anim.poseAt(t), R = this.anim.rootAt(t);
      s = { P, R, J: solve(P, this.D) };
      if (this.cache.size > 600) this.cache.clear();
      this.cache.set(key, s);
    }
    return s;
  }
  toWorld(R, p) { return [R.x + p[0] * R.facing * this.scale * (R.sx || 1), R.y + p[1] * this.scale]; }
  toLocal(R, w) { return [(w[0] - R.x) * R.facing / this.scale, (w[1] - R.y) / this.scale]; }
  // world position of a named joint at time t
  joint(t, name) { const s = this.state(t); return this.toWorld(s.R, s.J[name]); }
  chain(t, spec) {
    const now = this.state(t);
    const pts = [];
    const seg = spec.len / (spec.n - 1);
    const wind = now.R.wind == null ? 0.6 : now.R.wind;
    // rest direction: hangs down in calm air, streams behind in wind / motion
    const rd = norm([lerp(spec.rest[0] * 0.25, spec.rest[0], wind), lerp(1, spec.rest[1], wind)]);
    for (let i = 0; i < spec.n; i++) {
      const s = this.state(t - i * spec.lag);
      const aw = this.toWorld(s.R, spec.anchor(s.J));
      const u = i / (spec.n - 1);
      const wob = Math.sin(t * spec.freq - i * spec.k) * spec.wave * u * (0.35 + 0.65 * wind) + noise1(t * 2.3 + i * 0.37, 3) * spec.wave * 0.35 * u;
      const rx = rd[0] * now.R.facing, ry = rd[1];
      const curl = u * u * 0.18;
      const w = [aw[0] + (rx * seg * i - ry * wob) * this.scale, aw[1] + (ry * seg * i + rx * wob * now.R.facing - curl * seg * i * wind) * this.scale];
      pts.push(this.toLocal(now.R, w));
    }
    return pts;
  }
  draw(ctx, t, o = {}) {
    const s = this.state(t), { P, R, J } = s;
    const ch = {};
    const specs = CHAINS[this.kind];
    if (this.kind === 'hero') {
      ch.scarf = this.chain(t, specs.scarf); ch.pony = this.chain(t, specs.pony);
      ch.tails = [this.chain(t, specs.tailB), this.chain(t, specs.tailA)];
      const past = this.state(t - 0.07);
      const lagW = this.toLocal(R, this.toWorld(past.R, past.J.haF)), lagB = this.toLocal(R, this.toWorld(past.R, past.J.haB));
      ch.sleeveF = add(mixv(J.haF, lagW, 0.8), [-0.02, 0.19]);
      ch.sleeveB = add(mixv(J.haB, lagB, 0.8), [-0.02, 0.16]);
      ch.lock = clamp((lagW[0] - J.haF[0]) * 0.0 + Math.sin(t * 5) * 0.06 * (R.wind == null ? 0.6 : R.wind), -0.3, 0.3);
    } else {
      ch.cape = this.chain(t, specs.cape); ch.plume = this.chain(t, specs.plume); ch.waist = this.chain(t, specs.waist);
    }
    ctx.save();
    ctx.translate(R.x, R.y);
    ctx.rotate((R.rot || 0) * D2R);
    ctx.scale(R.facing * this.scale * (R.sx || 1), this.scale * (R.sy || 1));
    const opts = { lw: o.lw || 0.012, ...o };
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    (this.kind === 'hero' ? drawHero : drawRival)(ctx, J, P, ch, opts);
    ctx.restore();
  }
}
