// 2D cut-out rig drawn with canvas paths: skeleton solve (FK arms, IK legs), cloth/hair
// chains with lag, and two original character designs in cel style:
//   SERA   (hero)  — the aurora swordswoman: knee-length silver ponytail with aurora tips,
//                    heterochromia, crescent hair ornament, patterned white haori, indigo hakama.
//   KOKUYA (rival) — the ink demon swordsman: crimson mane, broken horn, grinning mask,
//                    tattered black haori, prayer beads, an odachi that bleeds ink.
import { TAU, D2R, clamp, lerp, add, sub, mul, norm, perp, mixv, dirA, dirUp, smoothPath, poly, limbPath, ik2, mixHex, noise1, rgba } from './util.js';

export const DIMS = { thigh: 0.45, shin: 0.45, ankle: 0.07, spineLow: 0.25, spineUp: 0.25, neck: 0.06, headR: 0.125, upperArm: 0.26, foreArm: 0.25 };

export const BASE_POSE = {
  hip: [0, -0.86], lean: 6, bend: 2, head: 0, turn: 0,
  armF: [30, 60], armB: [-12, 8], sword: 120, two: 0,
  footF: [0.2, 0], footB: [-0.22, 0], footAF: 0, footAB: 0,
  squash: 1, bladeLen: 1, sheath: 0, grip: 0, sheathing: -1,
};

// ---------------------------------------------------------------- skeleton
export function solve(P, D = DIMS) {
  const J = {};
  const up1 = dirUp(P.lean), up2 = dirUp(P.lean + P.bend);
  const f1 = [-up1[1], up1[0]], f2 = [-up2[1], up2[0]];
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
  // scabbard rides on the near hip, mouth forward, pointing back and down
  J.sbMouth = add(J.hip, add(mul(up1, 0.08), mul(f1, 0.07)));
  J.sbDir = dirA(-108 + P.lean * 0.5);
  const BL = D.blade || 0.84;
  if (P.sheathing > 0.001 && P.sheathing < 0.999) {
    // blade sliding into the scabbard: the hand rides along the scabbard axis
    J.sd = J.sbDir;
    J.guard = sub(J.sbMouth, mul(J.sd, BL * P.sheathing));
    const r = ik2(J.shF, sub(J.guard, mul(J.sd, 0.05)), D.upperArm, D.foreArm, 'down');
    J.elF = r.joint; J.haF = r.end;
    J.guard = add(J.haF, mul(J.sd, 0.05));
    J.tip = J.sbMouth.slice();
    J.pommel = add(J.haF, mul(J.sd, -(D.hilt || 0.17)));
  } else if (P.sheath > 0.5) {
    J.sd = J.sbDir;
    J.guard = J.sbMouth.slice();
    J.tip = add(J.guard, mul(J.sd, BL * 0.98));
    J.pommel = add(J.guard, mul(J.sd, -(D.hilt || 0.17) - 0.05));
    if (P.grip > 0.5) {
      // hand on the hilt, ready to draw
      const r = ik2(J.shF, add(J.guard, mul(J.sd, -0.09)), D.upperArm, D.foreArm, 'down');
      J.elF = r.joint; J.haF = r.end;
    }
  } else {
    const sd = dirA(P.sword);
    J.sd = sd;
    J.guard = add(J.haF, mul(sd, 0.05));
    J.tip = add(J.guard, mul(sd, (D.blade || 0.84) * P.bladeLen));
    J.pommel = add(J.haF, mul(sd, -(D.hilt || 0.17)));
  }
  if (P.two > 0.5 && P.sheath < 0.5 && !(P.sheathing > 0.001 && P.sheathing < 0.999)) {
    const r = ik2(J.shB, add(J.haF, mul(J.sd, -0.1)), D.upperArm, D.foreArm, 'down');
    J.elB = r.joint; J.haB = r.end;
  } else if ((P.sheath > 0.5 && P.grip > 0.5) || (P.sheathing > 0.001 && P.sheathing < 0.999)) {
    // off hand steadies the scabbard mouth
    const r = ik2(J.shB, add(J.sbMouth, mul(J.sbDir, 0.07)), D.upperArm, D.foreArm, 'down');
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
  if (n[1] > 0) n = [-n[0], -n[1]];
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
const blob = (pts, tension = 0.5, closed = true) => smoothPath(new Path2D(), pts, closed, tension);
const polyP = (pts, closed = true) => poly(new Path2D(), pts, closed);
const line = (ctx, a, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
const quad = (ctx, a, c, b) => { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo(c[0], c[1], b[0], b[1]); ctx.stroke(); };
const angOf = (d) => Math.atan2(d[1], d[0]) / D2R;

// edges of a ribbon along a chain of points with per-point half widths
function ribbonEdges(pts, widths) {
  const L = [], R = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)];
    const n = perp(norm(sub(b, a)));
    L.push(add(pts[i], mul(n, widths[i])));
    R.push(add(pts[i], mul(n, -widths[i])));
  }
  return { L, R };
}
function ribbon(pts, widths, endStyle = 'round', seed = 1) {
  const { L, R } = ribbonEdges(pts, widths);
  const p = new Path2D();
  p.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) { const m = mixv(L[i - 1], L[i], 0.5); p.quadraticCurveTo(L[i - 1][0], L[i - 1][1], m[0], m[1]); }
  p.lineTo(L[L.length - 1][0], L[L.length - 1][1]);
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  const dir = norm(sub(last, prev)), wl = widths[widths.length - 1];
  if (endStyle === 'notch') { const m = add(last, mul(dir, -wl * 1.2)); p.lineTo(m[0], m[1]); }
  else if (endStyle === 'point') { const m = add(last, mul(dir, wl * 2.5 + 0.03)); p.lineTo(m[0], m[1]); }
  else if (endStyle === 'ragged') {
    const a = L[L.length - 1], b = R[R.length - 1], k = 7;
    for (let i = 1; i < k; i++) {
      const m = mixv(a, b, i / k);
      const dep = (i % 2 ? 1 : -0.35) * wl * (0.45 + 0.4 * Math.abs(Math.sin(seed * 9.1 + i * 2.3)));
      p.lineTo(m[0] + dir[0] * dep, m[1] + dir[1] * dep);
    }
  }
  p.lineTo(R[R.length - 1][0], R[R.length - 1][1]);
  for (let i = R.length - 2; i >= 0; i--) { const m = mixv(R[i + 1], R[i], 0.5); p.quadraticCurveTo(R[i + 1][0], R[i + 1][1], m[0], m[1]); }
  p.lineTo(R[0][0], R[0][1]);
  p.closePath();
  return p;
}
// transform a point from part-local (origin o, rotation deg, unit scale s) to rig-local
function xf(o, deg, s) { const c = Math.cos(deg * D2R), sn = Math.sin(deg * D2R); return (p) => [o[0] + (p[0] * c - p[1] * sn) * s, o[1] + (p[0] * sn + p[1] * c) * s]; }
const silProxy = (col) => new Proxy({ sil: true }, { get: (t, k) => (k === 'sil' ? true : k === 'rim' ? null : col) });

function footPoly(an, ang, s = 1) {
  const T = xf(an, ang, s);
  return polyP([[-0.05, -0.03], [-0.068, 0.068], [0.12, 0.072], [0.175, 0.05], [0.09, -0.005], [0.04, -0.045]].map(T));
}
function star4(x, y, r, rot = 0) {
  const p = new Path2D();
  for (let i = 0; i < 8; i++) { const a = rot + (i / 8) * TAU, rr = i % 2 ? r * 0.28 : r; i ? p.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : p.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  p.closePath();
  return p;
}
// mitten fist aligned with the forearm (ang in degrees)
function fist(ctx, p, ang, s, lit, shade, C, lw, cuffCol) {
  const T = xf(p, ang, s);
  const path = blob([[-0.95, -0.72], [0.55, -0.88], [1.12, -0.38], [1.12, 0.45], [0.72, 0.88], [-0.85, 0.82], [-1.12, 0.05]].map(T), 0.4);
  ctx.fillStyle = shade; ctx.fill(path);
  if (!C.sil) {
    ctx.save(); ctx.clip(path); ctx.fillStyle = lit; ctx.fill(blob([[-1.2, -1.0], [1.3, -1.1], [1.3, 0.05], [-1.2, 0.15]].map(T), 0.3)); ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = lw * 0.7;
    for (const y of [-0.3, 0.2]) line(ctx, T([0.62, y]), T([1.05, y + 0.05]));
    if (cuffCol) { ctx.strokeStyle = cuffCol; ctx.lineWidth = lw * 1.8; line(ctx, T([-0.78, -0.72]), T([-0.72, 0.8])); }
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
  const th = new Path2D(); const tc = T([0.15, -0.82]); th.ellipse(tc[0], tc[1], s * 0.55, s * 0.3, ang * D2R - 0.25, 0, TAU);
  fillStroke(ctx, th, lit, C, lw * 0.85);
}
// wide pleated trouser leg ending at mid-shin
function hakamaLeg(ctx, hip, knee, ankle, wt, wk, wb, lit, shade, C, lw) {
  const d1 = norm(sub(knee, hip)), d2 = norm(sub(ankle, knee));
  const n1 = perp(d1), n2 = perp(d2), nk = norm(add(n1, n2));
  const bot = add(knee, mul(sub(ankle, knee), 0.66));
  const pts = [add(hip, mul(n1, wt)), add(knee, mul(nk, wk)), add(bot, add(mul(n2, wb), mul(d2, 0.02))), add(bot, mul(d2, 0.045)), add(bot, add(mul(n2, -wb * 0.95), mul(d2, 0.015))), add(knee, mul(nk, -wk * 0.92)), add(hip, mul(n1, -wt))];
  const path = blob(pts, 0.28);
  ctx.fillStyle = shade; ctx.fill(path);
  if (!C.sil) {
    ctx.save(); ctx.clip(path);
    let n = nk; if (n[1] > 0) n = mul(n, -1);
    ctx.fillStyle = lit; ctx.fill(blob(pts.map((q) => add(q, mul(n, 0.045))), 0.28));
    ctx.strokeStyle = rgba('#000000', 0.35); ctx.lineWidth = lw * 0.8;
    for (const k of [-0.45, 0.1, 0.55]) quad(ctx, add(hip, mul(n1, wt * k)), add(knee, mul(nk, wk * k * 1.05)), add(bot, add(mul(n2, wb * k * 1.1), mul(d2, 0.03))));
    ctx.restore();
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
}
// cloth panel streaming from an anchor (haori back / flaps): base, shade, lining edge,
// a patterned hem band and an optional ragged end
function clothPanel(ctx, pts, widths, C, lw, o) {
  const path = ribbon(pts, widths, o.end || 'round', o.seed || 1);
  if (C.sil) { ctx.fillStyle = C.line; ctx.fill(path); if (o.glowBand > 0.01 && o.bandGlow) bandFill(ctx, pts, widths, o, path, true); return; }
  ctx.fillStyle = o.shade; ctx.fill(path);
  ctx.save(); ctx.clip(path);
  ctx.fillStyle = o.main; ctx.fill(ribbon(pts.map((p, i) => add(p, [0.0, -widths[i] * 0.45])), widths.map((w) => w * 0.8), o.end || 'round', o.seed || 1));
  if (o.lining) { ctx.fillStyle = o.lining; ctx.fill(ribbon(pts.map((p, i) => add(p, [0, widths[i] * 0.92])), widths.map((w) => w * 0.22))); }
  if (o.band) bandFill(ctx, pts, widths, o, path, false);
  // fold lines
  ctx.strokeStyle = rgba('#000000', 0.22); ctx.lineWidth = lw * 0.9;
  const { L, R } = ribbonEdges(pts, widths);
  for (const k of [0.35, 0.65]) { ctx.beginPath(); for (let i = 1; i < pts.length; i++) { const q = mixv(L[i], R[i], k + 0.06 * Math.sin(i * 1.7 + k * 5)); i === 1 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); } ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
}
function bandFill(ctx, pts, widths, o, clipPath, glowOnly) {
  const n = pts.length, i0 = Math.floor(n * (o.bandStart || 0.66));
  const sp = pts.slice(i0), sw = widths.slice(i0).map((w) => w * 1.15);
  const band = ribbon(sp, sw, o.end === 'ragged' ? 'round' : (o.end || 'round'));
  ctx.save(); ctx.clip(clipPath);
  const g = ctx.createLinearGradient(sp[0][0], sp[0][1], sp[sp.length - 1][0], sp[sp.length - 1][1]);
  const a = glowOnly ? o.glowBand : 1;
  g.addColorStop(0, rgba(o.band[0], a)); g.addColorStop(1, rgba(o.band[1], a));
  ctx.fillStyle = g; ctx.fill(band);
  if (!glowOnly) {
    const { L, R } = ribbonEdges(sp, sw);
    // motif: a flowing wave (hero) or brush splashes (rival)
    ctx.strokeStyle = o.wave; ctx.lineWidth = sw[0] * 0.11;
    for (const off of [0.3, 0.62]) {
      ctx.beginPath();
      for (let i = 0; i < sp.length; i++) { const q = mixv(L[i], R[i], off + 0.12 * Math.sin(i * 2.4 + off * 9)); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
      ctx.stroke();
    }
    if (o.star) { ctx.fillStyle = o.star; for (let i = 0; i < sp.length; i++) { const q = mixv(L[i], R[i], 0.15 + 0.7 * ((i * 0.37) % 1)); ctx.fill(star4(q[0], q[1], sw[i] * 0.13, i)); } }
    if (o.splat) { ctx.fillStyle = o.splat; for (let i = 0; i < sp.length * 3; i++) { const j = i % sp.length, q = mixv(L[j], R[j], (i * 0.618) % 1); ctx.beginPath(); ctx.arc(q[0], q[1], sw[j] * (0.03 + 0.05 * ((i * 0.41) % 1)), 0, TAU); ctx.fill(); } }
    // edge stripe where the band meets the cloth
    ctx.strokeStyle = o.bandEdge || o.wave; ctx.lineWidth = sw[0] * 0.07;
    line(ctx, L[0], R[0]);
  }
  ctx.restore();
}
// wide hanging sleeve (from the elbow) with a lagging lower corner
function wideSleeve(ctx, el, ha, hang, lit, shade, trim, band, C, lw) {
  const d = norm(sub(ha, el)); let n = perp(d); if (n[1] > 0) n = mul(n, -1);
  const pts = [add(el, mul(n, 0.06)), add(ha, mul(n, 0.08)), add(ha, add(mul(n, 0.02), mul(d, 0.05))), add(ha, add(mul(n, -0.055), mul(d, 0.025))), hang, add(mixv(el, hang, 0.45), mul(n, -0.03)), add(el, mul(n, -0.06))];
  const path = blob(pts, 0.38);
  ctx.fillStyle = shade; ctx.fill(path);
  if (!C.sil) {
    ctx.save(); ctx.clip(path);
    ctx.fillStyle = lit; ctx.fill(blob(pts.map((q) => add(q, mul(n, 0.05))), 0.38));
    if (band) {
      const g = ctx.createLinearGradient(ha[0], ha[1], hang[0], hang[1]);
      g.addColorStop(0, rgba(band[0], 0)); g.addColorStop(0.45, rgba(band[0], 0.95)); g.addColorStop(1, rgba(band[1], 1));
      ctx.fillStyle = g; ctx.fill(blob([add(ha, mul(n, 0.1)), add(ha, add(mul(n, -0.08), mul(d, 0.06))), add(hang, [0.06, 0.04]), add(hang, [-0.08, 0.02])], 0.4));
    }
    ctx.strokeStyle = trim; ctx.lineWidth = lw * 2.2;
    ctx.beginPath(); const a = add(ha, add(mul(n, 0.085), mul(d, 0.01))), b = add(ha, add(mul(n, -0.05), mul(d, 0.035))); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(hang[0], hang[1]); ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
}

// ---------------------------------------------------------------- palettes
export const HERO_PAL = {
  line: '#0a0d24', rim: 'rgba(205,236,255,0.6)',
  skin: '#f1dee3', skinS: '#c4a2c1', blush: '#f2a0b6',
  hair: '#f4f7ff', hairS: '#aab5de', hairD: '#7c87c2', tipA: '#3ff0d2', tipB: '#a46bff',
  jacket: '#1d2552', jacketS: '#10153a', gold: '#ecc96e', goldS: '#a9853a',
  haori: '#eef1fb', haoriS: '#a3add6', lining: '#2b3172', pat1: '#3ce6cf', pat2: '#8d68ff', star: '#ffe49c',
  hakama: '#2b3174', hakamaS: '#191d4c',
  obi: '#3ce6cf', obiS: '#1b8c86',
  glove: '#1a1f45', gloveS: '#0e1230',
  boot: '#eaedf8', bootS: '#9ea6cb',
  blade: '#f1fcff', bladeA: '#5ff2dc', bladeB: '#a77dff', tsuba: '#ecc96e', hiltWrap: '#f2f4ff', hiltDia: '#2fc9c0', sheath: '#e9ecf6', sheathS: '#a9b0d2',
  eye: '#2fe0c8', eyeD: '#0b3e55', eye2: '#9b6bff',
};
export const RIVAL_PAL = {
  line: '#050307', rim: 'rgba(176,190,238,0.5)',
  armor: '#353040', armorS: '#1c1923', armorD: '#110e15', gold: '#a9843f', red: '#c0122f', redS: '#6c0a1c',
  cloth: '#19151f', clothS: '#0c0a10', lining: '#8e0f25', liningS: '#55091a',
  hakama: '#251f2c', hakamaS: '#130f18',
  mask: '#f5f0e9', maskS: '#b7acbd', eye: '#ff2d4f', grin: '#cf1431',
  mane: '#c8132f', maneS: '#6e0a1d', maneD: '#14090f',
  horn: '#e8ddc7', hornS: '#a5957b',
  bead: '#b5122c', beadD: '#151017',
  blade: '#0e0c12', bladeS: '#050407', edge: '#ff3a58', guard: '#5d4a33', hilt: '#2a171c',
};

// ---------------------------------------------------------------- SERA (hero)
function drawHero(ctx, J, P, ch, o) {
  const C = o.sil ? silProxy(o.sil) : HERO_PAL;
  const lw = o.lw, aura = o.aura || 0;
  const { up1, up2, f1, f2 } = J;
  const dk = (c) => (C.sil ? c : mixHex(c, '#0a0d24', 0.3));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // haori back panel
  if (ch.haori) {
    const n = ch.haori.length;
    clothPanel(ctx, ch.haori, ch.haori.map((_, i) => lerp(0.085, 0.25, Math.pow(i / (n - 1), 0.75))), C, lw,
      { main: C.haori, shade: C.haoriS, lining: C.lining, band: [C.pat1, C.pat2], wave: '#ffffff', star: C.star, bandEdge: C.gold, bandStart: 0.62, glowBand: aura, bandGlow: true });
  }
  // ponytail with aurora-dyed tips
  if (ch.pony) {
    const n = ch.pony.length, w = ch.pony.map((_, i) => 0.078 * Math.pow(1 - i / (n - 1), 0.62) + 0.01);
    const path = ribbon(ch.pony, w, 'point');
    const p0 = ch.pony[0], p1 = ch.pony[n - 1];
    if (C.sil) {
      ctx.fillStyle = C.line; ctx.fill(path);
      if (aura > 0.01) { const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]); g.addColorStop(0.45, 'rgba(60,240,210,0)'); g.addColorStop(0.75, rgba('#3ff0d2', aura)); g.addColorStop(1, rgba('#a46bff', aura)); ctx.fillStyle = g; ctx.fill(path); }
    } else {
      const g = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
      g.addColorStop(0, C.hairS); g.addColorStop(0.5, C.hairS); g.addColorStop(0.74, mixHex(C.tipA, '#1a2a60', 0.25)); g.addColorStop(1, mixHex(C.tipB, '#1a2a60', 0.2));
      ctx.fillStyle = g; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      const g2 = ctx.createLinearGradient(p0[0], p0[1], p1[0], p1[1]);
      g2.addColorStop(0, C.hair); g2.addColorStop(0.5, C.hair); g2.addColorStop(0.74, C.tipA); g2.addColorStop(1, C.tipB);
      ctx.fillStyle = g2; ctx.fill(ribbon(ch.pony.map((p) => add(p, [0.01, -0.032])), w.map((x) => x * 0.7), 'point'));
      ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.lineWidth = lw * 1.1;
      ctx.beginPath(); for (let i = 1; i < n - 2; i++) { const q = add(ch.pony[i], [0.005, -w[i] * 0.55]); i === 1 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); } ctx.stroke();
      ctx.strokeStyle = rgba(C.hairD, 0.8); ctx.lineWidth = lw * 0.8;
      ctx.beginPath(); for (let i = 1; i < n - 1; i++) { const q = add(ch.pony[i], [0, w[i] * 0.3]); i === 1 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); } ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
    }
  }
  // scabbard (white lacquer, gold fittings)
  {
    const a = J.sbMouth, b = add(a, mul(J.sbDir, 0.9)), nn = perp(J.sbDir);
    limb(ctx, a, b, 0.024, 0.019, C.sheath, C.sheathS, C, lw);
    if (!C.sil) {
      ctx.strokeStyle = C.gold; ctx.lineWidth = lw * 2;
      for (const k of [0.02, 0.14, 0.97]) { const m = mixv(a, b, k), q = mul(nn, 0.025); line(ctx, sub(m, q), add(m, q)); }
      ctx.strokeStyle = C.pat1; ctx.lineWidth = lw * 1.3; const m = mixv(a, b, 0.14); quad(ctx, m, add(m, [0.02, 0.12]), add(m, [-0.06, 0.2]));
    }
  }
  // back arm: haori shoulder, wide sleeve, glove
  limb(ctx, J.shB, J.elB, 0.052, 0.046, dk(C.haori), dk(C.haoriS), C, lw, false);
  wideSleeve(ctx, J.elB, J.haB, ch.sleeveB || add(J.haB, [0, 0.16]), dk(C.haori), dk(C.haoriS), dk(C.pat1), null, C, lw);
  fist(ctx, J.haB, angOf(sub(J.haB, J.elB)), 0.04, dk(C.glove), dk(C.gloveS), C, lw, C.sil ? null : dk(C.gold));
  // back leg
  limb(ctx, mixv(J.knB, J.anB, 0.4), J.anB, 0.057, 0.05, dk(C.boot), dk(C.bootS), C, lw, false);
  fillStroke(ctx, footPoly(J.anB, J.footAB), dk(C.bootS), C, lw);
  hakamaLeg(ctx, J.hipB, J.knB, J.anB, 0.1, 0.1, 0.13, dk(C.hakama), dk(C.hakamaS), C, lw);
  // haori front flap (far side) and obi tails
  if (ch.flap) clothPanel(ctx, ch.flap, ch.flap.map((_, i) => lerp(0.05, 0.09, i / (ch.flap.length - 1))), C, lw, { main: dk(C.haori), shade: dk(C.haoriS), band: [C.pat1, C.pat2], wave: '#e9f3ff', star: C.star, bandStart: 0.55 });
  if (ch.tails) for (const tl of ch.tails) { const w = tl.map((_, i) => lerp(0.026, 0.034, i / (tl.length - 1))); fillStroke(ctx, ribbon(tl, w, 'notch'), C.obiS, C, lw); }
  // torso: fitted jacket, high collar, haori lapel, obi
  const waistF = add(J.hip, add(mul(up1, 0.1), mul(f1, 0.082))), waistB = add(J.hip, add(mul(up1, 0.1), mul(f1, -0.08)));
  {
    const pts = [
      add(J.hip, add(mul(f1, 0.095), mul(up1, -0.02))), waistF,
      add(J.chest, add(mul(up2, 0.07), mul(f2, 0.115 + 0.02 * P.turn))),
      add(J.neck, add(mul(f2, 0.05), mul(up2, -0.02))), add(J.neck, mul(f2, -0.06)),
      add(J.chest, add(mul(up2, 0.1), mul(f2, -0.1 - 0.02 * P.turn))), waistB,
      add(J.hip, add(mul(f1, -0.105), mul(up1, -0.02))),
    ];
    const path = blob(pts, 0.45);
    ctx.fillStyle = C.jacketS; ctx.fill(path);
    if (!C.sil) {
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = C.jacket; ctx.fill(blob(pts.map((p) => add(p, add(mul(f2, 0.05), mul(up2, 0.03)))), 0.45));
      // gold piping down the front + a teal gem button
      ctx.strokeStyle = C.gold; ctx.lineWidth = lw * 1.6;
      quad(ctx, add(J.neck, mul(f2, 0.04)), add(J.chest, mul(f2, 0.09)), add(waistF, mul(f1, -0.02)));
      ctx.fillStyle = C.pat1; ctx.beginPath(); const gm = add(J.chest, add(mul(f2, 0.07), mul(up2, 0.1))); ctx.arc(gm[0], gm[1], 0.012, 0, TAU); ctx.fill();
      // haori lapel over the shoulder
      const lap = ribbon([add(J.neck, add(mul(f2, -0.04), mul(up2, 0.01))), add(J.neck, add(mul(f2, 0.025), mul(up2, -0.06))), add(J.chest, add(mul(f2, 0.06), mul(up2, 0.02))), add(waistF, add(mul(f1, -0.025), mul(up1, 0.05)))], [0.026, 0.03, 0.03, 0.028]);
      ctx.fillStyle = C.haori; ctx.fill(lap);
      ctx.strokeStyle = C.pat1; ctx.lineWidth = lw * 1.1; ctx.stroke(lap);
      ctx.restore();
    }
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
    // obi with gold cord
    const obi = polyP([add(waistF, mul(up1, 0.04)), add(waistF, mul(up1, -0.045)), add(waistB, mul(up1, -0.045)), add(waistB, mul(up1, 0.04))]);
    fillStroke(ctx, obi, C.obi, C, lw);
    if (!C.sil) {
      ctx.strokeStyle = C.gold; ctx.lineWidth = lw * 1.2; line(ctx, add(waistF, mul(up1, -0.005)), add(waistB, mul(up1, -0.005)));
      const kn = add(waistB, mul(f1, -0.012)); const p = new Path2D(); p.ellipse(kn[0], kn[1], 0.035, 0.03, 0, 0, TAU); fillStroke(ctx, p, C.obiS, C, lw);
    }
    // high collar
    const col = blob([add(J.neck, add(mul(f2, 0.05), mul(up2, 0.05))), add(J.neck, add(mul(f2, 0.06), mul(up2, -0.03))), add(J.neck, add(mul(f2, -0.07), mul(up2, -0.04))), add(J.neck, add(mul(f2, -0.07), mul(up2, 0.06)))], 0.4);
    fillStroke(ctx, col, C.jacket, C, lw);
    if (!C.sil) { ctx.strokeStyle = C.gold; ctx.lineWidth = lw * 1.4; line(ctx, add(J.neck, add(mul(f2, 0.05), mul(up2, 0.05))), add(J.neck, add(mul(f2, -0.07), mul(up2, 0.06)))); }
  }
  // front leg
  limb(ctx, mixv(J.knF, J.anF, 0.4), J.anF, 0.058, 0.051, C.boot, C.bootS, C, lw);
  {
    fillStroke(ctx, footPoly(J.anF, J.footAF), C.boot, C, lw);
    if (!C.sil) { const T = xf(J.anF, J.footAF, 1); ctx.strokeStyle = C.gold; ctx.lineWidth = lw * 1.8; line(ctx, T([-0.062, 0.066]), T([0.125, 0.07])); }
  }
  hakamaLeg(ctx, J.hipF, J.knF, J.anF, 0.105, 0.105, 0.135, C.hakama, C.hakamaS, C, lw);
  // head
  heroHead(ctx, J, C, lw, o, ch);
  // sword
  if (!o.noSword) heroBlade(ctx, J, P, C, lw, o, ch);
  // front arm: haori shoulder, wide sleeve with patterned cuff, glove
  limb(ctx, J.shF, J.elF, 0.055, 0.048, C.haori, C.haoriS, C, lw);
  wideSleeve(ctx, J.elF, J.haF, ch.sleeveF || add(J.haF, [0, 0.18]), C.haori, C.haoriS, C.pat1, [C.pat1, C.pat2], C, lw);
  fist(ctx, J.haF, angOf(sub(J.haF, J.elF)), 0.043, C.glove, C.gloveS, C, lw, C.sil ? null : C.gold);
}

function heroHead(ctx, J, C, lw, o, ch) {
  const { up2 } = J;
  const R = J.R, T = xf(J.headC, J.headAng, R), A = J.headAng * D2R;
  const expr = o.expr || 'calm', blink = o.blink || 0;
  limb(ctx, J.neck, add(J.headC, mul(up2, -0.03)), 0.04, 0.038, C.skinS, C.skinS, C, lw, false);
  // back hair volume
  fillStroke(ctx, blob([[0.62, -0.92], [0.12, -1.22], [-0.58, -1.12], [-1.12, -0.55], [-1.14, 0.2], [-0.96, 0.78], [-0.6, 0.98], [-0.3, 0.6], [-0.1, 0.2], [0.3, -0.45]].map(T), 0.5), C.hairS, C, lw);
  // face profile
  const face = blob([[0.3, -1.0], [0.8, -0.72], [0.97, -0.25], [0.93, -0.02], [1.12, 0.26], [0.96, 0.37], [0.97, 0.5], [0.9, 0.57], [0.93, 0.68], [0.84, 0.8], [0.76, 1.0], [0.55, 1.08], [0.1, 0.82], [-0.3, 0.45], [-0.5, -0.1], [-0.3, -0.8]].map(T), 0.32);
  fillStroke(ctx, face, C.skin, C, lw);
  if (!C.sil) {
    ctx.save(); ctx.clip(face);
    ctx.fillStyle = C.skinS;
    ctx.fill(blob([[-0.6, -0.2], [0.1, 0.0], [0.4, 0.75], [0.75, 1.0], [0.5, 1.3], [-0.6, 1.0]].map(T), 0.4));
    ctx.fill(blob([[0.2, -1.1], [1.1, -0.8], [1.05, -0.32], [0.6, -0.42], [0.2, -0.3]].map(T), 0.4));
    ctx.fillStyle = rgba(C.blush, expr === 'shout' || expr === 'grit' ? 0.25 : 0.45);
    const bl = T([0.66, 0.42]); ctx.beginPath(); ctx.ellipse(bl[0], bl[1], R * 0.2, R * 0.08, A, 0, TAU); ctx.fill();
    ctx.restore();
    const ear = new Path2D(); const e = T([-0.12, 0.16]); ear.ellipse(e[0], e[1], R * 0.14, R * 0.22, A + 0.2, 0, TAU);
    fillStroke(ctx, ear, C.skin, C, lw * 0.8);
    // crescent earring
    ctx.strokeStyle = C.gold; ctx.lineWidth = lw * 1.3; const er = T([-0.12, 0.5]); ctx.beginPath(); ctx.arc(er[0], er[1], R * 0.1, A + 0.3, A + 0.3 + Math.PI * 1.4); ctx.stroke();
    // eye — expression changes the lid
    const open = blink > 0.6 || expr === 'closed' ? 0 : expr === 'calm' || expr === 'smirk' ? 0.72 : expr === 'shout' ? 1.15 : 1;
    if (open > 0.05) {
      const eyeShape = blob([[0.42, -0.02], [0.6, -0.04 - 0.18 * open], [0.87, -0.05 - 0.02 * open], [0.8, 0.17], [0.54, 0.18]].map(T), 0.4);
      ctx.fillStyle = '#f6f8ff'; ctx.fill(eyeShape);
      ctx.save(); ctx.clip(eyeShape);
      const ic = T([0.69, 0.02]);
      const g = ctx.createLinearGradient(ic[0], ic[1] - R * 0.22, ic[0], ic[1] + R * 0.22);
      g.addColorStop(0, C.eyeD); g.addColorStop(0.55, C.eye); g.addColorStop(1, '#b5fff0');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(ic[0], ic[1], R * 0.14, R * 0.24, A, 0, TAU); ctx.fill();
      ctx.fillStyle = '#05202c'; ctx.beginPath(); ctx.ellipse(ic[0], ic[1], R * 0.055, R * (expr === 'shout' ? 0.07 : 0.12), A, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; const hl = T([0.74, -0.08]); ctx.beginPath(); ctx.arc(hl[0], hl[1], R * 0.055, 0, TAU); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = C.line; ctx.lineWidth = lw * 1.6;
      quad(ctx, T([0.38, 0.0]), T([0.62, -0.08 - 0.24 * open]), T([0.92, -0.06]));
      ctx.lineWidth = lw * 1.2; line(ctx, T([0.9, -0.06]), T([1.0, -0.14])); // wing
    } else {
      ctx.strokeStyle = C.line; ctx.lineWidth = lw * 1.5; quad(ctx, T([0.42, 0.02]), T([0.64, 0.1]), T([0.9, 0.0]));
      ctx.lineWidth = lw; line(ctx, T([0.5, 0.06]), T([0.46, 0.14])); line(ctx, T([0.62, 0.09]), T([0.6, 0.18]));
    }
    // beauty mark
    ctx.fillStyle = C.line; const bm = T([0.6, 0.3]); ctx.beginPath(); ctx.arc(bm[0], bm[1], R * 0.035, 0, TAU); ctx.fill();
    // brow
    const bk = expr === 'grit' || expr === 'shout' ? 1 : (o.brow || 0);
    ctx.lineWidth = lw * 1.0; ctx.strokeStyle = C.line;
    line(ctx, T([0.46, -0.48 + bk * 0.12]), T([0.95, -0.34 - bk * 0.03]));
    // mouth
    ctx.lineWidth = lw * 0.9;
    if (expr === 'shout') { const m = blob([[0.95, 0.52], [0.72, 0.5], [0.74, 0.76], [0.9, 0.78]].map(T), 0.4); fillStroke(ctx, m, '#5a1830', C, lw * 0.8); ctx.fillStyle = '#fff'; ctx.fill(polyP([[0.93, 0.53], [0.76, 0.52], [0.77, 0.58], [0.93, 0.59]].map(T))); }
    else if (expr === 'grit') { const m = polyP([[0.95, 0.56], [0.74, 0.55], [0.75, 0.66], [0.94, 0.66]].map(T)); fillStroke(ctx, m, '#ffffff', C, lw * 0.8); line(ctx, T([0.95, 0.61]), T([0.75, 0.6])); }
    else if (expr === 'smirk') quad(ctx, T([0.9, 0.6]), T([0.82, 0.63]), T([0.72, 0.54]));
    else line(ctx, T([0.9, 0.6]), T([0.77, 0.61]));
  }
  // bangs, long side lock with aurora tip, ahoge
  const sway = ch.lock || 0;
  const bangs = polyP([[0.1, -1.2], [0.75, -1.02], [1.08, -0.62], [1.14, -0.2], [0.98, -0.42], [0.95, -0.1], [0.8, -0.4], [0.68, -0.12], [0.55, -0.42], [0.42, -0.18], [0.3, -0.45], [-0.15, -0.1], [-0.35, -0.6]].map(T));
  fillStroke(ctx, bangs, C.hair, C, lw);
  const lockPts = [[0.32, -0.5], [0.3 + sway * 0.2, 0.2], [0.24 + sway * 0.5, 0.85], [0.14 + sway * 0.9, 1.45]].map(T);
  const lock = ribbon(lockPts, [R * 0.13, R * 0.12, R * 0.09, R * 0.03], 'point');
  if (C.sil) { ctx.fillStyle = C.line; ctx.fill(lock); }
  else {
    const g = ctx.createLinearGradient(lockPts[0][0], lockPts[0][1], lockPts[3][0], lockPts[3][1]);
    g.addColorStop(0, C.hair); g.addColorStop(0.55, C.hair); g.addColorStop(0.85, C.tipA); g.addColorStop(1, C.tipB);
    fillStroke(ctx, lock, g, C, lw);
    ctx.save(); ctx.clip(bangs); ctx.fillStyle = C.hairS;
    ctx.fill(polyP([[0.1, -0.5], [0.5, -0.55], [1.2, -0.3], [1.2, 0.2], [0.3, 0.0], [0.3, 1.2], [-0.2, 1.2], [-0.2, -0.2]].map(T)));
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 1.4; quad(ctx, T([0.05, -0.95]), T([0.5, -1.0]), T([0.9, -0.72]));
    ctx.restore(); ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(bangs);
  }
  const ah = blob([[0.05, -1.12], [0.2, -1.55 + sway * 0.1], [0.55, -1.72 + sway * 0.15], [0.42, -1.55], [0.22, -1.38], [0.18, -1.12]].map(T), 0.4);
  fillStroke(ctx, ah, C.hair, C, lw);
  // crescent hair ornament with a swinging star charm
  if (!C.sil) {
    const hc = T([-0.72, -0.82]);
    const cr = new Path2D(); cr.arc(hc[0], hc[1], R * 0.3, A - 2.2, A + 1.2); cr.arc(hc[0] + Math.cos(A + 0.5) * R * 0.12, hc[1] + Math.sin(A + 0.5) * R * 0.12, R * 0.23, A + 1.2, A - 2.2, true); cr.closePath();
    fillStroke(ctx, cr, C.gold, C, lw * 0.9);
    const sw = ch.charm || 0, ca = Math.PI / 2 + sw;
    const cp = [hc[0] + Math.cos(ca) * R * 0.75, hc[1] + Math.sin(ca) * R * 0.75];
    ctx.strokeStyle = C.goldS; ctx.lineWidth = lw * 0.7; line(ctx, hc, cp);
    const st = star4(cp[0], cp[1], R * 0.22, sw); fillStroke(ctx, st, C.star, C, lw * 0.7);
  }
}

function heroBlade(ctx, J, P, C, lw, o, ch) {
  const sd = J.sd, n = perp(sd);
  // tassel from the pommel
  if (ch.tassel) { const w = ch.tassel.map((_, i) => 0.012 + i * 0.004); fillStroke(ctx, ribbon(ch.tassel, w, 'point'), C.pat1, C, lw * 0.8); }
  // hilt: white wrap with teal diamonds
  const hp = limbPath(J.pommel, J.guard, 0.019, 0.019);
  fillStroke(ctx, hp, C.hiltWrap, C, lw);
  if (!C.sil) {
    ctx.fillStyle = C.hiltDia;
    for (let k = 0.15; k < 0.9; k += 0.18) { const m = mixv(J.pommel, J.guard, k), a = mul(sd, 0.03), b = mul(n, 0.012); ctx.fill(polyP([sub(m, a), add(m, b), add(m, a), sub(m, b)])); }
    const cap = new Path2D(); cap.arc(J.pommel[0], J.pommel[1], 0.021, 0, TAU); fillStroke(ctx, cap, C.tsuba, C, lw * 0.8);
  }
  const sheathing = P.sheathing > 0.001 && P.sheathing < 0.999;
  if (P.sheath < 0.5 || sheathing) {
    const L = Math.hypot(J.tip[0] - J.guard[0], J.tip[1] - J.guard[1]);
    if (L > 0.02) {
      const m = sheathing ? J.tip : mixv(J.guard, J.tip, 0.9);
      const blade = polyP([add(J.guard, mul(n, 0.02)), add(m, mul(n, 0.013)), J.tip, add(m, mul(n, -0.013)), add(J.guard, mul(n, -0.02))]);
      fillStroke(ctx, blade, C.blade, C, lw);
      if (!C.sil) {
        ctx.save(); ctx.clip(blade);
        const g = ctx.createLinearGradient(J.guard[0], J.guard[1], J.tip[0], J.tip[1]);
        g.addColorStop(0, C.bladeB); g.addColorStop(1, C.bladeA);
        ctx.fillStyle = g; ctx.fill(polyP([J.guard, J.tip, add(m, mul(n, -0.03)), add(J.guard, mul(n, -0.04))]));
        ctx.restore();
        if (o.glint) { ctx.strokeStyle = '#fff'; ctx.lineWidth = lw * 1.2; line(ctx, mixv(J.guard, J.tip, clamp(o.glint - 0.12, 0, 1)), mixv(J.guard, J.tip, clamp(o.glint, 0, 1))); }
      }
    }
  }
  // crescent tsuba
  const g = new Path2D(); const gc = J.guard, ga = Math.atan2(sd[1], sd[0]);
  g.arc(gc[0], gc[1], 0.058, ga + 0.35, ga + TAU - 0.35); g.arc(gc[0] - sd[0] * 0.02, gc[1] - sd[1] * 0.02, 0.04, ga + TAU - 0.55, ga + 0.55, true); g.closePath();
  fillStroke(ctx, g, C.tsuba, C, lw * 0.9);
}

// ---------------------------------------------------------------- KOKUYA (rival)
function drawRival(ctx, J, P, ch, o) {
  const C = o.sil ? silProxy(o.sil) : RIVAL_PAL;
  const lw = o.lw;
  const { up1, up2, f1, f2 } = J;
  const dk = (c) => (C.sil ? c : mixHex(c, '#050307', 0.38));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // mane locks streaming back
  if (ch.mane) for (let k = ch.mane.length - 1; k >= 0; k--) {
    const pts = ch.mane[k], n = pts.length;
    const w = pts.map((_, i) => (0.09 - k * 0.012) * Math.pow(1 - i / (n - 1), 0.55) + 0.012);
    const path = ribbon(pts, w, 'point');
    if (C.sil) { ctx.fillStyle = C.line; ctx.fill(path); continue; }
    const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
    g.addColorStop(0, C.maneS); g.addColorStop(0.65, C.maneS); g.addColorStop(1, C.maneD);
    ctx.fillStyle = g; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    const g2 = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
    g2.addColorStop(0, C.mane); g2.addColorStop(0.6, C.mane); g2.addColorStop(1, '#2a0a12');
    ctx.fillStyle = g2; ctx.fill(ribbon(pts.map((p) => add(p, [0.01, -0.03])), w.map((x) => x * 0.68), 'point'));
    ctx.strokeStyle = rgba('#ff8090', 0.6); ctx.lineWidth = lw * 0.9;
    ctx.beginPath(); for (let i = 1; i < n - 2; i++) { const q = add(pts[i], [0, -w[i] * 0.5]); i === 1 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); } ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
  }
  // tattered haori back panel with a crimson ink-wave hem
  if (ch.haori) {
    const n = ch.haori.length;
    clothPanel(ctx, ch.haori, ch.haori.map((_, i) => lerp(0.12, 0.27, Math.pow(i / (n - 1), 0.8))), C, lw,
      { main: C.cloth, shade: C.clothS, lining: C.lining, band: [C.red, '#3a0712'], wave: '#0b080e', splat: '#f2e9e2', bandEdge: C.gold, bandStart: 0.6, end: 'ragged', seed: 3 });
  }
  // back arm + back leg
  limb(ctx, J.shB, J.elB, 0.062, 0.054, dk(C.cloth), dk(C.clothS), C, lw, false);
  limb(ctx, J.elB, J.haB, 0.064, 0.058, dk(C.armor), dk(C.armorS), C, lw, false);
  fist(ctx, J.haB, angOf(sub(J.haB, J.elB)), 0.052, dk(C.armor), dk(C.armorS), C, lw, C.sil ? null : dk(C.red));
  limb(ctx, mixv(J.knB, J.anB, 0.3), J.anB, 0.074, 0.062, dk(C.armor), dk(C.armorS), C, lw, false);
  fillStroke(ctx, footPoly(J.anB, J.footAB, 1.05), dk(C.armorS), C, lw);
  hakamaLeg(ctx, J.hipB, J.knB, J.anB, 0.12, 0.115, 0.145, dk(C.hakama), dk(C.hakamaS), C, lw);
  // torso armor
  {
    const pts = [
      add(J.hip, add(mul(f1, 0.13), mul(up1, -0.03))), add(J.hip, add(mul(up1, 0.1), mul(f1, 0.12))),
      add(J.chest, add(mul(up2, 0.06), mul(f2, 0.165))), add(J.neck, add(mul(f2, 0.085), mul(up2, -0.01))), add(J.neck, mul(f2, -0.09)),
      add(J.chest, add(mul(up2, 0.1), mul(f2, -0.15))), add(J.hip, add(mul(up1, 0.1), mul(f1, -0.115))), add(J.hip, add(mul(f1, -0.13), mul(up1, -0.03))),
    ];
    const path = blob(pts, 0.4);
    ctx.fillStyle = C.armorS; ctx.fill(path);
    if (!C.sil) {
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = C.armor; ctx.fill(blob(pts.map((p) => add(p, add(mul(f2, 0.06), mul(up2, 0.04)))), 0.4));
      ctx.strokeStyle = C.armorD; ctx.lineWidth = lw * 1.2;
      for (const k of [0.02, 0.09, 0.16]) line(ctx, add(J.hip, add(mul(up1, k + 0.1), mul(f1, 0.14))), add(J.hip, add(mul(up1, k + 0.12), mul(f1, -0.14))));
      // haori lapel (black, crimson edge)
      const lap = ribbon([add(J.neck, add(mul(f2, -0.05), mul(up2, 0.01))), add(J.neck, add(mul(f2, 0.03), mul(up2, -0.06))), add(J.chest, add(mul(f2, 0.09), mul(up2, 0.02))), add(J.hip, add(mul(f1, 0.1), mul(up1, 0.12)))], [0.034, 0.04, 0.04, 0.036]);
      ctx.fillStyle = C.cloth; ctx.fill(lap); ctx.strokeStyle = C.red; ctx.lineWidth = lw * 1.3; ctx.stroke(lap);
      ctx.restore();
    }
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(path);
    // prayer beads across the chest
    const ba = add(J.neck, add(mul(f2, 0.07), mul(up2, -0.06))), bb = add(J.hip, add(mul(f1, -0.1), mul(up1, 0.14)));
    for (let i = 0; i <= 9; i++) {
      const q = add(mixv(ba, bb, i / 9), mul(f1, Math.sin((i / 9) * Math.PI) * 0.035));
      const bp = new Path2D(); bp.arc(q[0], q[1], i === 4 ? 0.03 : 0.021, 0, TAU);
      fillStroke(ctx, bp, i === 4 ? C.gold : i % 2 ? C.bead : C.beadD, C, lw * 0.7);
      if (!C.sil) { ctx.fillStyle = rgba('#ffffff', 0.45); ctx.beginPath(); ctx.arc(q[0] - 0.006, q[1] - 0.008, 0.006, 0, TAU); ctx.fill(); }
    }
    // rope belt + tassets
    const belt = polyP([add(J.hip, add(mul(up1, 0.13), mul(f1, 0.125))), add(J.hip, add(mul(up1, 0.06), mul(f1, 0.13))), add(J.hip, add(mul(up1, 0.06), mul(f1, -0.125))), add(J.hip, add(mul(up1, 0.13), mul(f1, -0.12)))]);
    fillStroke(ctx, belt, C.red, C, lw);
    if (!C.sil) { ctx.strokeStyle = C.redS; ctx.lineWidth = lw; for (let k = -0.1; k < 0.13; k += 0.03) line(ctx, add(J.hip, add(mul(up1, 0.13), mul(f1, k))), add(J.hip, add(mul(up1, 0.06), mul(f1, k + 0.02)))); }
    for (const s of [1, -1]) {
      const top = add(J.hip, add(mul(up1, 0.04), mul(f1, s * 0.075)));
      const plate = polyP([add(top, mul(f1, -0.08)), add(top, mul(f1, 0.08)), add(top, add(mul(f1, 0.095 + s * 0.03), [0, 0.2])), add(top, add(mul(f1, s * 0.02), [0, 0.25])), add(top, add(mul(f1, -0.095 + s * 0.03), [0, 0.2]))]);
      fillStroke(ctx, plate, s > 0 ? C.armor : C.armorS, C, lw);
      if (!C.sil) { ctx.strokeStyle = C.red; ctx.lineWidth = lw * 1.5; ctx.beginPath(); const a = add(top, add(mul(f1, 0.09 + s * 0.03), [0, 0.19])), b = add(top, add(mul(f1, s * 0.02), [0, 0.24])), c = add(top, add(mul(f1, -0.09 + s * 0.03), [0, 0.19])); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.stroke(); }
    }
  }
  // front leg
  limb(ctx, mixv(J.knF, J.anF, 0.28), J.anF, 0.076, 0.064, C.armor, C.armorS, C, lw);
  fillStroke(ctx, footPoly(J.anF, J.footAF, 1.05), C.armor, C, lw);
  hakamaLeg(ctx, J.hipF, J.knF, J.anF, 0.125, 0.12, 0.15, C.hakama, C.hakamaS, C, lw);
  if (!C.sil) { const g = mixv(J.knF, J.anF, 0.82), d = norm(sub(J.anF, J.knF)), nn = perp(d); ctx.strokeStyle = C.red; ctx.lineWidth = lw * 1.6; line(ctx, add(g, mul(nn, 0.07)), add(g, mul(nn, -0.07))); }
  rivalHead(ctx, J, C, lw, o);
  rivalBlade(ctx, J, P, C, lw, o, ch);
  // front arm: layered pauldron, spiked gauntlet
  limb(ctx, J.shF, J.elF, 0.068, 0.058, C.cloth, C.clothS, C, lw);
  limb(ctx, J.elF, J.haF, 0.068, 0.06, C.armor, C.armorS, C, lw);
  {
    const d = norm(sub(J.haF, J.elF)), nn = perp(d);
    let up = nn; if (up[1] > 0) up = mul(up, -1);
    for (const k of [0.35, 0.6]) { const b = add(mixv(J.elF, J.haF, k), mul(up, 0.06)); fillStroke(ctx, polyP([add(b, mul(d, -0.025)), add(b, mul(up, 0.05)), add(b, mul(d, 0.025))]), C.horn, C, lw * 0.8); }
    if (!C.sil) { ctx.strokeStyle = C.red; ctx.lineWidth = lw * 1.6; const m = mixv(J.elF, J.haF, 0.85); line(ctx, add(m, mul(nn, 0.058)), add(m, mul(nn, -0.058))); }
  }
  {
    const d = norm(sub(J.elF, J.shF)), nn = perp(d);
    for (let i = 2; i >= 0; i--) {
      const c = add(J.shF, mul(d, 0.04 + i * 0.065));
      const w = 0.12 - i * 0.018;
      const plate = blob([add(c, mul(nn, w)), add(c, add(mul(nn, w * 0.6), mul(d, -0.09))), add(c, add(mul(nn, -w * 0.6), mul(d, -0.09))), add(c, mul(nn, -w)), add(c, mul(d, 0.05))], 0.45);
      fillStroke(ctx, plate, i === 0 ? C.armor : C.armorS, C, lw);
      if (!C.sil) { ctx.strokeStyle = C.red; ctx.lineWidth = lw * 1.5; quad(ctx, add(c, mul(nn, w * 0.92)), add(c, mul(d, 0.035)), add(c, mul(nn, -w * 0.92))); }
    }
    if (!C.sil) { ctx.fillStyle = C.rim; ctx.beginPath(); ctx.ellipse(J.shF[0] - 0.02, J.shF[1] - 0.045, 0.035, 0.012, -0.5, 0, TAU); ctx.fill(); }
  }
  fist(ctx, J.haF, angOf(sub(J.haF, J.elF)), 0.055, C.armor, C.armorS, C, lw, C.sil ? null : C.red);
}

function rivalHead(ctx, J, C, lw, o) {
  const R = J.R, T = xf(J.headC, J.headAng, R), A = J.headAng * D2R;
  const shake = o.laugh ? Math.sin(o.laugh * 70) * 0.06 : 0;
  const T2 = xf(add(J.headC, [0, shake * R]), J.headAng + shake * 20, R);
  limb(ctx, J.neck, J.headC, 0.06, 0.055, C.armorD, C.armorD, C, lw, false);
  // broken horn (far side)
  fillStroke(ctx, polyP([[0.05, -0.85], [-0.12, -1.35], [-0.02, -1.28], [0.04, -1.5], [0.12, -1.36], [0.22, -1.42], [0.3, -0.9]].map(T2)), C.sil ? C.line : C.hornS, C, lw);
  // mane crown
  const crown = blob([[0.55, -0.98], [0.05, -1.42], [-0.7, -1.36], [-1.35, -0.92], [-1.5, -0.2], [-1.25, 0.55], [-0.75, 0.45], [-0.35, -0.15], [0.2, -0.68]].map(T2), 0.42);
  fillStroke(ctx, crown, C.maneS, C, lw);
  if (!C.sil) {
    ctx.save(); ctx.clip(crown); ctx.fillStyle = C.mane; ctx.fill(blob([[0.6, -1.1], [0.0, -1.55], [-0.8, -1.45], [-1.4, -1.0], [-0.9, -0.62], [-0.2, -0.75]].map(T2), 0.45));
    ctx.strokeStyle = rgba('#ff8090', 0.55); ctx.lineWidth = lw; quad(ctx, T2([0.3, -1.1]), T2([-0.4, -1.4]), T2([-1.2, -0.9])); ctx.restore();
  }
  // hood
  fillStroke(ctx, blob([[0.5, -0.86], [0.05, -1.02], [-0.6, -0.86], [-0.85, -0.25], [-0.8, 0.45], [-0.35, 0.7], [0.2, 0.4], [0.34, -0.4]].map(T2), 0.4), C.armorS, C, lw);
  // mask
  const mask = blob([[0.4, -0.92], [1.0, -0.6], [1.2, 0.1], [1.1, 0.78], [0.8, 1.2], [0.3, 0.95], [0.12, -0.1], [0.2, -0.7]].map(T2), 0.35);
  fillStroke(ctx, mask, C.mask, C, lw);
  if (!C.sil) {
    ctx.save(); ctx.clip(mask);
    ctx.fillStyle = C.maskS; ctx.fill(blob([[0.2, -0.9], [0.6, -0.7], [0.5, 0.2], [0.75, 1.2], [0.2, 1.2]].map(T2), 0.4));
    // painted grin: a red crescent filled with sharp teeth
    const gpts = [[1.08, 0.38], [0.92, 0.66], [0.62, 0.78], [0.42, 0.6]];
    const grin = new Path2D();
    grin.moveTo(...T2(gpts[0])); grin.quadraticCurveTo(...T2([0.95, 0.85]), ...T2([0.42, 0.62]));
    grin.quadraticCurveTo(...T2([0.85, 0.58]), ...T2(gpts[0])); grin.closePath();
    ctx.fillStyle = C.grin; ctx.fill(grin);
    ctx.fillStyle = '#fff8f0';
    for (let i = 0; i < 6; i++) { const u = (i + 0.5) / 6, a = T2([lerp(1.02, 0.48, u), lerp(0.47, 0.63, u) + Math.sin(u * Math.PI) * 0.12]), b = T2([lerp(1.02, 0.48, u) - 0.04, lerp(0.47, 0.63, u) + Math.sin(u * Math.PI) * 0.12 + 0.1]); ctx.beginPath(); ctx.moveTo(a[0] - R * 0.055, a[1]); ctx.lineTo(b[0], b[1] + R * 0.03); ctx.lineTo(a[0] + R * 0.055, a[1]); ctx.fill(); }
    ctx.strokeStyle = C.line; ctx.lineWidth = lw * 0.8; ctx.stroke(grin);
    // ink stroke across the eye + eye slit
    ctx.fillStyle = '#0a070e'; ctx.fill(blob([[0.48, -0.5], [0.58, -0.55], [0.64, 0.0], [0.58, 0.4], [0.5, 0.0]].map(T2), 0.5));
    const eg = o.eye == null ? 1 : o.eye;
    ctx.strokeStyle = eg > 0.05 ? C.eye : '#1a1016'; ctx.lineWidth = lw * 2.6; line(ctx, T2([0.66, -0.04]), T2([0.98, -0.2]));
    ctx.restore();
    ctx.strokeStyle = C.line; ctx.lineWidth = lw; ctx.stroke(mask);
  }
  // long curved horn (near side)
  const horn = blob([[0.36, -0.86], [0.46, -1.5], [0.72, -2.05], [1.15, -2.55], [0.95, -2.02], [0.8, -1.5], [0.74, -0.84]].map(T2), 0.4);
  fillStroke(ctx, horn, C.horn, C, lw);
  if (!C.sil) {
    ctx.save(); ctx.clip(horn); ctx.fillStyle = C.hornS; ctx.fill(polyP([[0.62, -0.8], [0.66, -1.4], [0.9, -2.0], [1.2, -2.0], [1.0, -0.8]].map(T2)));
    ctx.strokeStyle = rgba(C.line, 0.6); ctx.lineWidth = lw * 0.8; for (const y of [-1.1, -1.4, -1.7, -2.0]) line(ctx, T2([0.42, y]), T2([0.9, y - 0.14]));
    ctx.restore();
    const band = polyP([[0.32, -0.96], [0.78, -1.02], [0.8, -0.86], [0.3, -0.8]].map(T2)); fillStroke(ctx, band, C.red, C, lw * 0.8);
  }
}

function rivalBlade(ctx, J, P, C, lw, o, ch) {
  const sd = J.sd, n = perp(sd);
  if (ch.tassel) { const w = ch.tassel.map((_, i) => 0.014 + i * 0.006); fillStroke(ctx, ribbon(ch.tassel, w, 'point'), C.red, C, lw * 0.8); }
  const hp = limbPath(J.pommel, J.guard, 0.024, 0.024);
  fillStroke(ctx, hp, C.hilt, C, lw);
  if (!C.sil) { ctx.strokeStyle = C.red; ctx.lineWidth = lw * 1.2; for (let k = 0.12; k < 0.95; k += 0.14) { const m = mixv(J.pommel, J.guard, k); line(ctx, add(m, mul(add(n, mul(sd, 0.5)), 0.024)), sub(m, mul(sub(n, mul(sd, 0.5)), 0.024))); } }
  const L = Math.hypot(J.tip[0] - J.guard[0], J.tip[1] - J.guard[1]);
  if (L > 0.02) {
    const m = mixv(J.guard, J.tip, 0.86);
    const blade = polyP([add(J.guard, mul(n, 0.042)), add(m, mul(n, 0.032)), J.tip, add(m, mul(n, -0.03)), add(J.guard, mul(n, -0.04))]);
    fillStroke(ctx, blade, C.blade, C, lw);
    if (!C.sil) {
      ctx.save(); ctx.clip(blade);
      ctx.fillStyle = C.edge; ctx.fill(polyP([add(J.guard, mul(n, -0.022)), add(J.tip, mul(n, 0)), add(m, mul(n, -0.06)), add(J.guard, mul(n, -0.08))]));
      ctx.strokeStyle = rgba('#7a6a80', 0.6); ctx.lineWidth = lw * 0.8; line(ctx, add(J.guard, mul(n, 0.012)), add(m, mul(n, 0.008)));
      ctx.restore();
    }
  }
  // square guard with a skull-ish notch
  const g = polyP([add(J.guard, add(mul(n, 0.08), mul(sd, -0.02))), add(J.guard, add(mul(n, 0.085), mul(sd, 0.02))), add(J.guard, add(mul(n, -0.085), mul(sd, 0.02))), add(J.guard, add(mul(n, -0.08), mul(sd, -0.02)))]);
  fillStroke(ctx, g, C.guard, C, lw);
}

// ---------------------------------------------------------------- character
const headPt = (J, p) => xf(J.headC, J.headAng, J.R)(p);
const CHAINS = {
  hero: {
    haori: { n: 9, len: 1.12, lag: 0.04, liftK: 0.3, rest: [-0.62, 0.78], wave: 0.09, freq: 6, k: 0.7, anchor: (J) => add(J.neck, add(mul(J.f2, -0.075), mul(J.up2, -0.05))) },
    pony: { n: 11, len: 1.05, lag: 0.028, rest: [-0.74, 0.66], wave: 0.075, freq: 6, k: 0.8, anchor: (J) => headPt(J, [-0.78, -0.8]) },
    flap: { n: 5, len: 0.52, lag: 0.045, rest: [-0.25, 0.97], wave: 0.035, freq: 6.5, k: 1.1, anchor: (J) => add(J.hip, add(mul(J.up1, 0.06), mul(J.f1, 0.02))) },
    tailA: { n: 4, len: 0.3, lag: 0.04, rest: [-0.55, 0.84], wave: 0.03, freq: 7, k: 1.1, anchor: (J) => add(J.hip, add(mul(J.up1, 0.1), mul(J.f1, -0.09))) },
    tailB: { n: 4, len: 0.24, lag: 0.045, rest: [-0.3, 0.95], wave: 0.03, freq: 7.5, k: 1.2, anchor: (J) => add(J.hip, add(mul(J.up1, 0.1), mul(J.f1, -0.09))) },
    tassel: { n: 4, len: 0.18, lag: 0.03, rest: [-0.3, 0.95], wave: 0.02, freq: 8, k: 1.2, anchor: (J) => J.pommel },
  },
  rival: {
    haori: { n: 9, len: 1.28, lag: 0.045, rest: [-0.6, 0.8], wave: 0.1, freq: 5.5, k: 0.75, anchor: (J) => add(J.neck, add(mul(J.f2, -0.1), mul(J.up2, -0.06))) },
    maneA: { n: 10, len: 1.25, lag: 0.035, rest: [-0.86, 0.5], wave: 0.09, freq: 6.5, k: 0.8, anchor: (J) => headPt(J, [-0.9, -0.6]) },
    maneB: { n: 9, len: 1.0, lag: 0.035, rest: [-0.8, 0.6], wave: 0.08, freq: 7, k: 0.9, anchor: (J) => headPt(J, [-1.0, -0.1]) },
    maneC: { n: 8, len: 0.85, lag: 0.03, rest: [-0.92, 0.38], wave: 0.07, freq: 7.5, k: 0.85, anchor: (J) => headPt(J, [-0.55, -1.05]) },
    tassel: { n: 5, len: 0.3, lag: 0.035, rest: [-0.3, 0.95], wave: 0.03, freq: 7, k: 1.1, anchor: (J) => J.pommel },
  },
};

export class Character {
  constructor(kind, anim) {
    this.kind = kind;
    this.anim = anim; // {poseAt(t) -> pose, rootAt(t) -> {x, y, facing, wind}}
    this.scale = kind === 'hero' ? 1.0 : 1.22;
    this.D = kind === 'hero' ? { ...DIMS, headR: 0.146, blade: 0.86, hilt: 0.18 } : { ...DIMS, headR: 0.148, blade: 1.3, hilt: 0.32 };
    this.cache = new Map();
  }
  state(t) {
    const key = Math.round(t * 1000);
    let s = this.cache.get(key);
    if (!s) {
      const P = this.anim.poseAt(t), R = this.anim.rootAt(t);
      s = { P, R, J: solve(P, this.D) };
      if (this.cache.size > 800) this.cache.clear();
      this.cache.set(key, s);
    }
    return s;
  }
  toWorld(R, p) { return [R.x + p[0] * R.facing * this.scale * (R.sx || 1), R.y + p[1] * this.scale]; }
  toLocal(R, w) { return [(w[0] - R.x) * R.facing / this.scale, (w[1] - R.y) / this.scale]; }
  joint(t, name) { const s = this.state(t); return this.toWorld(s.R, s.J[name]); }
  chain(t, spec) {
    const now = this.state(t);
    const pts = [];
    const seg = spec.len / (spec.n - 1);
    const wind = now.R.wind == null ? 0.6 : now.R.wind;
    const lift = now.R.lift || 0; // upward draft (power-up)
    const rd = norm([lerp(spec.rest[0] * 0.25, spec.rest[0], Math.min(wind, 1.5)), lerp(1, spec.rest[1], Math.min(wind, 1.5)) - lift * 1.4 * (spec.liftK ?? 1)]);
    for (let i = 0; i < spec.n; i++) {
      const s = this.state(t - i * spec.lag);
      const aw = this.toWorld(s.R, spec.anchor(s.J));
      const u = i / (spec.n - 1);
      const wob = Math.sin(t * spec.freq - i * spec.k) * spec.wave * u * (0.35 + 0.65 * Math.min(wind, 1.5)) + noise1(t * 2.3 + i * 0.37, 3) * spec.wave * 0.35 * u;
      const rx = rd[0] * now.R.facing, ry = rd[1];
      const curl = u * u * 0.18;
      const w = [aw[0] + (rx * seg * i - ry * wob) * this.scale, aw[1] + (ry * seg * i + rx * wob * now.R.facing - curl * seg * i * wind) * this.scale];
      if (i > 0) {
        const pw = this.toWorld(now.R, pts[i - 1]), d = sub(w, pw), L = Math.hypot(d[0], d[1]), mx = seg * this.scale * 1.25;
        if (L > mx) { w[0] = pw[0] + d[0] / L * mx; w[1] = pw[1] + d[1] / L * mx; }
      }
      pts.push(this.toLocal(now.R, w));
    }
    return pts;
  }
  draw(ctx, t, o = {}) {
    const s = this.state(t), { P, R, J } = s;
    const ch = {};
    const sp = CHAINS[this.kind];
    if (this.kind === 'hero') {
      ch.haori = this.chain(t, sp.haori); ch.pony = this.chain(t, sp.pony); ch.flap = this.chain(t, sp.flap);
      ch.tails = [this.chain(t, sp.tailB), this.chain(t, sp.tailA)];
      ch.tassel = this.chain(t, sp.tassel);
      const past = this.state(t - 0.07);
      const lagW = this.toLocal(R, this.toWorld(past.R, past.J.haF)), lagB = this.toLocal(R, this.toWorld(past.R, past.J.haB));
      ch.sleeveF = add(mixv(J.haF, lagW, 0.8), [-0.02, 0.2]);
      ch.sleeveB = add(mixv(J.haB, lagB, 0.8), [-0.02, 0.17]);
      const wind = R.wind == null ? 0.6 : R.wind;
      ch.lock = clamp(Math.sin(t * 5) * 0.06 * wind, -0.3, 0.3);
      ch.charm = Math.sin(t * 4.2) * 0.35 * (0.4 + wind) + noise1(t * 3, 9) * 0.2;
    } else {
      ch.haori = this.chain(t, sp.haori); ch.mane = [this.chain(t, sp.maneA), this.chain(t, sp.maneB), this.chain(t, sp.maneC)];
      ch.tassel = this.chain(t, sp.tassel);
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
