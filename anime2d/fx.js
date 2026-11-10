// Hand-drawn style effect primitives. All are pure functions of time so frames are independent.
import { TAU, D2R, clamp, lerp, smoothstep, RNG, noise1, fbm1, hash1, ease, add, sub, mul, norm, perp, mixv, rgba } from './util.js';

const both = (ctx, glow, fn) => { fn(ctx, false); if (glow) fn(glow, true); };

// ---------------------------------------------------------------- slash arcs
// s: {t0, dur, life, cx, cy, rx, ry, rot, a0, a1, width, style, seed}
export function slashArc(ctx, glow, t, s) {
  const age = t - s.t0;
  if (age < 0 || age > s.dur + s.life) return;
  const uHead = ease.out(clamp(age / s.dur, 0, 1));
  const lp = clamp((age - s.dur) / s.life, 0, 1);
  const uTail = lp * lp * 0.98;
  if (uHead - uTail < 0.02) return;
  const N = 30, ink = s.style === 'ink';
  const rmean = (s.rx + s.ry) / 2;
  const squash = s.ry / s.rx;
  const thin = 1 - 0.55 * lp;
  const outer = [], inner = [];
  for (let i = 0; i <= N; i++) {
    const v = i / N, u = lerp(uTail, uHead, v);
    const a = lerp(s.a0, s.a1, u) * D2R;
    let w = s.width * Math.pow(Math.sin(Math.PI * clamp(v * 0.94 + 0.03, 0, 1)), 0.55) * (0.45 + 0.55 * u) * thin;
    let ro = s.rx;
    if (ink) { ro *= 1 + 0.035 * noise1(u * 26 + s.seed, s.seed) + 0.02 * noise1(u * 70, s.seed + 3); w *= 1 + 0.3 * noise1(u * 18 + 5, s.seed + 1); }
    const ri = ro * (1 - w / rmean);
    outer.push([Math.cos(a) * ro, Math.sin(a) * ro]);
    inner.push([Math.cos(a) * ri, Math.sin(a) * ri]);
  }
  both(ctx, glow, (c, isGlow) => {
    c.save();
    c.translate(s.cx, s.cy); c.rotate((s.rot || 0) * D2R); c.scale(1, squash);
    const path = new Path2D();
    path.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i <= N; i++) path.lineTo(outer[i][0], outer[i][1]);
    for (let i = N; i >= 0; i--) path.lineTo(inner[i][0], inner[i][1]);
    path.closePath();
    const fade = 1 - lp * 0.5;
    if (ink) {
      if (!isGlow) {
        c.fillStyle = `rgba(8,6,12,${fade})`; c.fill(path);
        // dry-brush streaks trailing from the tail
        c.strokeStyle = `rgba(8,6,12,${0.8 * fade})`;
        const rr = new RNG(s.seed * 7 + 1);
        for (let k = 0; k < 7; k++) {
          const f = rr.range(0.15, 0.95), ua = lerp(s.a0, s.a1, clamp(uTail - rr.range(0.03, 0.14), 0, 1)) * D2R, ub = lerp(s.a0, s.a1, lerp(uTail, uHead, rr.range(0.1, 0.5))) * D2R;
          const r = s.rx * (1 - s.width / rmean * f * 0.9);
          c.lineWidth = s.width * rr.range(0.03, 0.09); c.beginPath(); c.arc(0, 0, r, Math.min(ua, ub), Math.max(ua, ub)); c.stroke();
        }
        // splatter
        for (let k = 0; k < 16; k++) {
          const u = rr.range(0.1, 1), a = lerp(s.a0, s.a1, u) * D2R;
          if (u > uHead) continue;
          const d = s.rx * (1.02 + rr.range(0.02, 0.3) * clamp((age - u * s.dur) / 0.25, 0, 1));
          c.fillStyle = `rgba(8,6,12,${fade})`; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, s.width * rr.range(0.03, 0.1), 0, TAU); c.fill();
        }
      }
      // crimson edge on the inside
      c.strokeStyle = isGlow ? `rgba(255,40,80,${0.8 * fade})` : `rgba(255,60,95,${0.95 * fade})`; c.lineWidth = s.width * 0.07; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(inner[0][0], inner[0][1]); for (let i = 1; i <= N; i++) c.lineTo(inner[i][0], inner[i][1]); c.stroke();
    } else {
      const span = Math.abs(s.a1 - s.a0) / 360;
      const g = c.createConicGradient(Math.min(s.a0, s.a1) * D2R, 0, 0);
      const cols = s.a1 > s.a0 ? ['#b060ff', '#5a8cff', '#3cf0d8', '#eaffff'] : ['#eaffff', '#3cf0d8', '#5a8cff', '#b060ff'];
      cols.forEach((col, i) => g.addColorStop(clamp(span * (i / (cols.length - 1)), 0, 1), col));
      g.addColorStop(Math.min(span + 0.001, 1), cols[cols.length - 1]);
      c.globalAlpha = (isGlow ? 0.9 : 0.92) * fade;
      c.fillStyle = g; c.fill(path);
      // white-hot core hugging the outer edge
      const core = new Path2D();
      core.moveTo(outer[0][0], outer[0][1]);
      for (let i = 1; i <= N; i++) core.lineTo(outer[i][0], outer[i][1]);
      for (let i = N; i >= 0; i--) core.lineTo(lerp(outer[i][0], inner[i][0], 0.32), lerp(outer[i][1], inner[i][1], 0.32));
      core.closePath();
      c.globalAlpha = fade; c.fillStyle = '#ffffff'; c.fill(core);
      // loose wisps
      c.globalAlpha = 0.7 * fade; c.strokeStyle = '#bffcff'; c.lineWidth = s.width * 0.035;
      const rr = new RNG(s.seed * 5 + 3);
      for (let k = 0; k < 4; k++) {
        const ua = lerp(s.a0, s.a1, lerp(uTail, uHead, rr.range(0, 0.5))) * D2R, ub = lerp(s.a0, s.a1, lerp(uTail, uHead, rr.range(0.55, 1))) * D2R;
        c.beginPath(); c.arc(0, 0, s.rx * (1.03 + k * 0.035), Math.min(ua, ub), Math.max(ua, ub)); c.stroke();
      }
    }
    c.restore();
  });
}

// ---------------------------------------------------------------- clash sparks
export function spark(ctx, glow, t, s) {
  const age = t - s.t0;
  if (age < 0 || age > 0.6) return;
  const rr = new RNG(s.seed || 1);
  const size = s.size || 1;
  both(ctx, glow, (c, isGlow) => {
    c.save(); c.translate(s.x, s.y);
    const k = 1 - clamp(age / 0.2, 0, 1);
    if (k > 0) {
      // star burst
      const n = 11;
      c.fillStyle = isGlow ? rgba(s.color || '#fff6c8', 0.9) : '#ffffff';
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rr.range(-0.2, 0.2), L = size * rr.range(0.35, 1.25) * (0.35 + 0.65 * k) * (i % 2 ? 0.55 : 1), wd = size * 0.05 * k;
        c.moveTo(Math.cos(a - 0.5) * wd * 2, Math.sin(a - 0.5) * wd * 2); c.lineTo(Math.cos(a) * L, Math.sin(a) * L); c.lineTo(Math.cos(a + 0.5) * wd * 2, Math.sin(a + 0.5) * wd * 2);
      }
      c.fill();
      c.beginPath(); c.arc(0, 0, size * 0.16 * k + 0.02, 0, TAU); c.fill();
      if (!isGlow) { c.strokeStyle = rgba(s.color || '#ffe9a0', 0.9 * k); c.lineWidth = size * 0.03; c.beginPath(); c.arc(0, 0, size * 0.22 * k + 0.03, 0, TAU); c.stroke(); }
    }
    // shock ring
    const rk = clamp(age / 0.32, 0, 1);
    if (rk < 1) { c.strokeStyle = `rgba(255,255,255,${(1 - rk) * 0.9})`; c.lineWidth = size * 0.05 * (1 - rk) + 0.004; c.beginPath(); c.ellipse(0, 0, size * (0.3 + 1.5 * ease.out(rk)), size * (0.3 + 1.5 * ease.out(rk)) * (s.ringSquash || 1), 0, 0, TAU); c.stroke(); }
    // flying streaks
    const m = s.count || 16;
    for (let i = 0; i < m; i++) {
      const a = rr.range(0, TAU), sp = rr.range(3, 11) * size, life = rr.range(0.25, 0.55);
      if (age > life) continue;
      const d = sp * (1 - Math.exp(-age * 6)) / 6, d2 = sp * (1 - Math.exp(-Math.max(age - 0.035, 0) * 6)) / 6;
      const gy = 4 * age * age, gy2 = 4 * Math.max(age - 0.035, 0) ** 2;
      c.strokeStyle = i % 3 === 0 ? '#ffffff' : (s.color || '#ffe08a'); c.globalAlpha = 1 - age / life; c.lineWidth = 0.014 * size;
      c.beginPath(); c.moveTo(Math.cos(a) * d2, Math.sin(a) * d2 + gy2); c.lineTo(Math.cos(a) * d, Math.sin(a) * d + gy); c.stroke();
    }
    c.restore();
  });
}

// ---------------------------------------------------------------- dust puffs (world space, on the ground)
export function dust(ctx, t, s) {
  const age = t - s.t0;
  if (age < 0 || age > 0.75) return;
  const rr = new RNG(s.seed || 3), k = age / 0.75, n = s.n || 6;
  for (let i = 0; i < n; i++) {
    const dir = (s.dir || 0) + rr.range(-1, 1), dist = rr.range(0.25, 0.9) * (s.size || 1) * ease.out(k);
    const x = s.x + dir * dist, y = (s.y || 0) - rr.range(0.05, 0.4) * ease.out(k) * (s.size || 1), r = rr.range(0.1, 0.22) * (s.size || 1) * (0.5 + 0.8 * ease.out(k)) * (1 - k * 0.3);
    ctx.globalAlpha = (1 - k) * 0.85;
    ctx.fillStyle = '#56659f'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#a9b6e6'; ctx.beginPath(); ctx.arc(x - r * 0.15, y - r * 0.2, r * 0.72, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- screen-space speed lines
export function speedLines(ctx, W, H, t, o) {
  const frame = Math.floor(t * 24);
  const rr = new RNG(900 + (o.seed || 0));
  const n = o.n || 70, dirx = o.dir || -1;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < n; i++) {
    const y = rr.range(0, H), L = rr.range(180, 900), sp = rr.range(2600, 6200), th = rr.range(1.5, 9), ph = rr.range(0, W * 2);
    const x = ((ph + dirx * t * sp) % (W + L * 2) + (W + L * 2)) % (W + L * 2) - L;
    const col = o.colors[i % o.colors.length];
    const g = ctx.createLinearGradient(x, 0, x + L, 0);
    g.addColorStop(dirx < 0 ? 0 : 1, rgba(col, o.alpha || 0.8)); g.addColorStop(dirx < 0 ? 1 : 0, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x, y, L, th);
  }
  ctx.restore();
}
// radial focus lines pointing at (fx, fy) in screen pixels
export function focusLines(ctx, W, H, t, o) {
  const rr = new RNG(Math.floor(t * 24) * 13 + (o.seed || 0));
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = o.color || '#000';
  const n = o.n || 48, R = Math.hypot(W, H);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rr.range(-0.05, 0.05), wd = rr.range(0.006, 0.03) * (o.width || 1), inner = (o.inner || 0.28) * H * rr.range(0.75, 1.5);
    ctx.beginPath();
    ctx.moveTo(o.fx + Math.cos(a) * inner, o.fy + Math.sin(a) * inner);
    ctx.lineTo(o.fx + Math.cos(a - wd) * R, o.fy + Math.sin(a - wd) * R);
    ctx.lineTo(o.fx + Math.cos(a + wd) * R, o.fy + Math.sin(a + wd) * R);
    ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- aurora ribbon trail behind a moving point pair
// sample(tt) -> [tipWorld, baseWorld]
export function ribbonTrail(ctx, glow, t, sample, o = {}) {
  const n = o.n || 16, dur = o.dur || 0.22;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(sample(t - (i / n) * dur));
  both(ctx, glow, (c, isGlow) => {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[i + 1], u = i / n;
      const d = Math.hypot(a[0][0] - b[0][0], a[0][1] - b[0][1]);
      const al = Math.pow(1 - u, 1.6) * clamp(d / (o.minMove || 0.04), 0, 1) * (o.alpha || 0.85) * (isGlow ? 0.8 : 0.7);
      if (al < 0.01) continue;
      const r = Math.round(lerp(90, 150, u)), g = Math.round(lerp(235, 90, u)), bl = Math.round(lerp(215, 255, u));
      c.fillStyle = `rgba(${r},${g},${bl},${al})`;
      c.beginPath(); c.moveTo(a[0][0], a[0][1]); c.lineTo(b[0][0], b[0][1]); c.lineTo(b[1][0], b[1][1]); c.lineTo(a[1][0], a[1][1]); c.closePath(); c.fill();
    }
    c.restore();
  });
}

// glowing blade overlay (world space)
export function bladeGlow(ctx, glow, guard, tip, color, k, wide = 0.05) {
  if (k <= 0.01) return;
  both(ctx, glow, (c, isGlow) => {
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    const g = c.createLinearGradient(guard[0], guard[1], tip[0], tip[1]);
    if (color === 'aurora') { g.addColorStop(0, `rgba(160,110,255,${k})`); g.addColorStop(0.5, `rgba(80,180,255,${k})`); g.addColorStop(1, `rgba(90,255,220,${k})`); }
    else { g.addColorStop(0, `rgba(255,30,70,${k})`); g.addColorStop(1, `rgba(255,90,110,${k})`); }
    c.strokeStyle = g; c.lineWidth = wide * (isGlow ? 1.6 : 1);
    c.beginPath(); c.moveTo(guard[0], guard[1]); c.lineTo(tip[0], tip[1]); c.stroke();
    if (!isGlow) { c.strokeStyle = `rgba(255,255,255,${0.85 * k})`; c.lineWidth = wide * 0.35; c.beginPath(); c.moveTo(guard[0], guard[1]); c.lineTo(tip[0], tip[1]); c.stroke(); }
    c.restore();
  });
}

// ---------------------------------------------------------------- ambient particles (fireflies / grass fluff)
export class Ambient {
  constructor(seed = 5, n = 70) {
    const rr = new RNG(seed);
    this.p = Array.from({ length: n }, () => ({ x: rr.range(-14, 14), y: rr.range(-3.2, -0.1), sp: rr.range(0.3, 1.2), ph: rr.range(0, 6), r: rr.range(0.012, 0.03), fly: rr.next() < 0.35, d: rr.range(0.7, 1.4) }));
  }
  draw(ctx, glow, bg, cam, t, o = {}) {
    for (const p of this.p) {
      const x = ((p.x - t * p.sp * (o.wind || 1) + 14) % 28 + 28) % 28 - 14 + cam.x * (1 - 1 / p.d) * 0;
      const y = p.y + Math.sin(t * 1.3 + p.ph) * 0.18;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + p.ph * 3);
      for (const c of [ctx, glow]) {
        if (!c) continue;
        bg.ground(c, cam, p.d);
        c.globalCompositeOperation = 'lighter';
        if (p.fly) { c.fillStyle = `rgba(150,255,210,${0.35 + 0.6 * tw})`; c.beginPath(); c.arc(x, y, p.r * (0.8 + 0.5 * tw), 0, TAU); c.fill(); }
        else { c.fillStyle = `rgba(220,228,255,${c === glow ? 0.25 : 0.55})`; c.beginPath(); c.ellipse(x, y, p.r * 1.4, p.r * 0.5, t * p.sp + p.ph, 0, TAU); c.fill(); }
        c.globalCompositeOperation = 'source-over';
      }
    }
  }
}

// ---------------------------------------------------------------- ink
// streams of ink spiralling up into a point (the raised blade)
export function inkGather(ctx, glow, t, o) {
  const k = clamp((t - o.t0) / o.dur, 0, 1);
  if (k <= 0 || t > o.t0 + o.dur + 0.15) return;
  const rr = new RNG(77);
  ctx.save(); ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const side = i % 2 ? 1 : -1, bx = o.x + side * rr.range(0.5, 2.2), ph = rr.range(0, 1), sp = rr.range(1.2, 2);
    const prog = ((t - o.t0) * sp + ph) % 1;
    const p0 = [bx, 0], p1 = [o.x + side * rr.range(0.6, 1.4) * Math.sin(t * 4 + i), o.ty * 0.5], p2 = [o.x, o.ty];
    const N = 14;
    for (let j = 0; j < N; j++) {
      const u0 = clamp(prog - 0.35 + j / N * 0.35, 0, 1), u1 = clamp(u0 + 0.35 / N + 0.01, 0, 1);
      if (u1 <= u0) continue;
      const q = (u) => [(1 - u) ** 2 * p0[0] + 2 * u * (1 - u) * p1[0] + u * u * p2[0], (1 - u) ** 2 * p0[1] + 2 * u * (1 - u) * p1[1] + u * u * p2[1]];
      const a = q(u0), b = q(u1);
      ctx.strokeStyle = `rgba(8,6,12,${k})`; ctx.lineWidth = 0.02 + 0.09 * (j / N) * k;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
  }
  ctx.restore();
  // dark orb with a crimson heart at the gathering point
  both(ctx, glow, (c, isGlow) => {
    const r = 0.12 + 0.3 * k + 0.03 * Math.sin(t * 40);
    if (!isGlow) { c.fillStyle = '#08060c'; c.beginPath(); for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU, rr2 = r * (1 + 0.18 * noise1(a * 3 + t * 9, 2)); c.lineTo(o.x + Math.cos(a) * rr2, o.ty + Math.sin(a) * rr2); } c.fill(); }
    c.fillStyle = `rgba(255,40,80,${0.9 * k})`; c.beginPath(); c.arc(o.x, o.ty, r * 0.35, 0, TAU); c.fill();
  });
}

// a surging wave of ink travelling toward -x. front(t) is the x of the leading edge.
export function inkWave(ctx, glow, t, o) {
  const age = t - o.t0;
  if (age < 0) return;
  const xf = o.x0 - o.speed * age;
  const grow = ease.out(clamp(age / 0.22, 0, 1)), die = 1 - smoothstep(o.life - 0.25, o.life, age);
  if (die <= 0) return;
  const Hw = o.height * grow * die, len = Math.min(o.speed * age + 0.6, o.len);
  const top = (x) => {
    const s = clamp((x - xf) / len, 0, 1);
    const prof = smoothstep(0, 0.07, s) * Math.pow(1 - s, 1.5) * 1.25 + 0.16 * Math.pow(Math.sin(s * 9 + t * 6), 2) * (1 - s) * smoothstep(0, 0.12, s);
    return -Hw * prof * (1 + 0.22 * noise1(x * 1.6 + t * 7, 4) + 0.1 * noise1(x * 5 - t * 13, 6));
  };
  const layer = (c, dx, dy, col) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(xf - 0.25 + dx, 0.05);
    const N = 60;
    for (let i = 0; i <= N; i++) { const x = xf + (i / N) * len; const s = i / N; const curl = -0.55 * Hw * Math.exp(-s * 9) * (1 + 0.3 * Math.sin(t * 20)); c.lineTo(x + curl + dx, top(x) + dy); }
    c.lineTo(xf + len + dx, 0.05); c.closePath(); c.fill();
  };
  layer(ctx, 0.18, -0.12, 'rgba(110,14,34,0.9)');
  layer(ctx, 0, 0, '#08060c');
  // claws reaching forward from the crest
  const rr = new RNG(31);
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const s = rr.range(0.0, 0.2), x = xf + s * len, y = top(x) * rr.range(0.5, 1.0), reach = rr.range(0.6, 1.7) * Hw * 0.7, ph = rr.range(0, 6);
    const tipx = x - reach * (1 + 0.25 * Math.sin(t * 16 + ph)), tipy = y + reach * rr.range(0.1, 0.7);
    ctx.fillStyle = '#08060c';
    const n = norm(perp([tipx - x, tipy - y])), wd = 0.13 * Hw * rr.range(0.6, 1.2);
    ctx.beginPath(); ctx.moveTo(x + n[0] * wd, y + n[1] * wd); ctx.quadraticCurveTo(x - reach * 0.6, y - reach * 0.35, tipx, tipy); ctx.quadraticCurveTo(x - reach * 0.45, y - reach * 0.05, x - n[0] * wd, y - n[1] * wd); ctx.fill();
  }
  // droplets thrown ahead
  for (let i = 0; i < 46; i++) {
    const born = rr.range(0, o.life * 0.8), a = age - born;
    if (a < 0 || a > 0.5) continue;
    const bx = o.x0 - o.speed * born, vx = -o.speed * rr.range(1.1, 1.7), vy = -rr.range(2, 7) * (o.height / 2.4);
    const x = bx + vx * a, y = -Hw * rr.range(0.2, 0.9) + vy * a + 9 * a * a;
    if (y > 0) continue;
    ctx.fillStyle = '#08060c'; ctx.beginPath(); ctx.ellipse(x, y, rr.range(0.03, 0.09) * (1 + a), rr.range(0.02, 0.05), Math.atan2(vy + 18 * a, vx), 0, TAU); ctx.fill();
  }
  // crimson rim + dry-brush streaks
  both(ctx, glow, (c, isGlow) => {
    c.strokeStyle = isGlow ? 'rgba(255,40,80,0.7)' : 'rgba(255,60,95,0.95)'; c.lineWidth = 0.035; c.lineJoin = 'round';
    c.beginPath();
    for (let i = 0; i <= 50; i++) { const s = 0.03 + (i / 50) * 0.6, x = xf + s * len; const curl = -0.55 * Hw * Math.exp(-s * 9); const y = top(x) * 0.93; if (i === 0) c.moveTo(x + curl, y); else c.lineTo(x + curl, y); }
    c.stroke();
  });
  ctx.strokeStyle = 'rgba(120,130,170,0.35)'; ctx.lineWidth = 0.02;
  for (let i = 0; i < 12; i++) { const s = rr.range(0.15, 0.85), x = xf + s * len, y = top(x) * rr.range(0.25, 0.8), L = rr.range(0.3, 0.9); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + L, y + 0.04); ctx.stroke(); }
}

// lingering puddle after the wave has passed
export function inkTrail(ctx, t, o) {
  const age = t - o.t0;
  if (age < 0) return;
  const xf = Math.max(o.x0 - o.speed * age, o.xEnd);
  ctx.fillStyle = `rgba(8,6,14,${0.75 * (1 - smoothstep(o.fade0, o.fade1, t))})`;
  ctx.beginPath(); ctx.moveTo(xf, 0.02);
  for (let x = xf; x <= o.x0; x += 0.15) ctx.lineTo(x, -0.04 - 0.05 * Math.abs(noise1(x * 3, 9)));
  ctx.lineTo(o.x0, 0.12); ctx.lineTo(xf, 0.12); ctx.closePath(); ctx.fill();
}

// ---------------------------------------------------------------- four-point glint star (world or screen space)
export function glint(ctx, glow, x, y, size, k, color = '#ffffff') {
  if (k <= 0.01) return;
  both(ctx, glow, (c) => {
    c.save(); c.translate(x, y); c.globalCompositeOperation = 'lighter'; c.fillStyle = rgba(color, clamp(k, 0, 1));
    for (const [sx, sy] of [[1, 0.07], [0.07, 0.6]]) { c.beginPath(); c.ellipse(0, 0, size * sx * k, size * sy * k, 0, 0, TAU); c.fill(); }
    c.beginPath(); c.arc(0, 0, size * 0.1 * k, 0, TAU); c.fill();
    c.restore();
  });
}

// ---------------------------------------------------------------- finishing streak (a long tapered beam)
export function beam(ctx, glow, p0, p1, width, k, tail = 0) {
  if (k <= 0.01) return;
  const d = norm(sub(p1, p0)), n = perp(d);
  const a = mixv(p0, p1, tail);
  both(ctx, glow, (c, isGlow) => {
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createLinearGradient(a[0], a[1], p1[0], p1[1]);
    g.addColorStop(0, `rgba(176,96,255,0)`); g.addColorStop(0.25, `rgba(90,140,255,${0.8 * k})`); g.addColorStop(0.7, `rgba(60,240,216,${k})`); g.addColorStop(1, `rgba(234,255,255,${k})`);
    for (const [wk, col] of [[1, g], [0.3, `rgba(255,255,255,${k})`]]) {
      if (isGlow && wk < 1) continue;
      c.fillStyle = col; c.beginPath();
      c.moveTo(a[0], a[1]); c.lineTo(mixv(a, p1, 0.6)[0] + n[0] * width * wk, mixv(a, p1, 0.6)[1] + n[1] * width * wk); c.lineTo(p1[0], p1[1]); c.lineTo(mixv(a, p1, 0.6)[0] - n[0] * width * wk, mixv(a, p1, 0.6)[1] - n[1] * width * wk); c.closePath(); c.fill();
    }
    c.restore();
  });
}

// ink petals drifting away (used when the rival dissolves)
export function inkPetals(ctx, glow, t, o) {
  const rr = new RNG(o.seed || 21);
  for (let i = 0; i < o.n; i++) {
    const born = o.t0 + rr.next() * o.dur, a = t - born, life = rr.range(0.9, 1.8);
    const bx = o.x + rr.range(-0.45, 0.45), by = o.y - rr.range(0.05, 1.9) * (1 - 0.0);
    if (a < 0 || a > life) continue;
    const x = bx - a * rr.range(0.6, 2.2) + Math.sin(a * 5 + i) * 0.12, y = by - a * rr.range(0.4, 1.3) - a * a * 0.3;
    const s = rr.range(0.03, 0.09) * (1 - a / life * 0.5), rot = a * rr.range(-6, 6) + i;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = 1 - a / life;
    ctx.fillStyle = i % 5 === 0 ? '#b8142f' : '#08060c';
    ctx.beginPath(); ctx.ellipse(0, 0, s * 1.6, s * 0.7, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
