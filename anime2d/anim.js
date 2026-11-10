// Keyframe tracks: explicit holds + short eased transitions (anime-style timing).
import { ease, lerp } from './util.js';
import { lerpPose } from './poses.js';

// keys: [{t, p, dur?, e?}] — pose p is reached at time t after a transition lasting dur
export function poseTrack(keys, hold = 1) {
  return (t) => {
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1].t <= t) i++;
    const a = keys[i], b = keys[i + 1];
    let P = a.p;
    if (b && t > a.t - 1e-9) {
      const start = Math.max(b.t - (b.dur ?? (b.t - a.t)), a.t);
      if (t > start) P = lerpPose(a.p, b.p, (ease[b.e || 'inout'])((t - start) / (b.t - start)));
    }
    if (!hold) return P;
    // moving hold: a little breathing so held drawings stay alive
    const o = { ...P, hip: [P.hip[0], P.hip[1] + Math.sin(t * 2.3) * 0.006 * hold], lean: P.lean + Math.sin(t * 1.7) * 0.5 * hold };
    return o;
  };
}
// keys: [{t, x, y?, f?, rot?, sx?, wind?, dur?, e?}]
export function rootTrack(keys) {
  const num = ['x', 'y', 'rot', 'wind'];
  const full = keys.map((k, i) => ({ y: 0, rot: 0, ...k }));
  for (let i = 1; i < full.length; i++) { if (full[i].f == null) full[i].f = full[i - 1].f; if (keys[i].wind == null) full[i].wind = full[i - 1].wind; if (keys[i].y == null) full[i].y = full[i - 1].y; if (keys[i].rot == null) full[i].rot = full[i - 1].rot; }
  return (t) => {
    let i = 0;
    while (i < full.length - 1 && full[i + 1].t <= t) i++;
    const a = full[i], b = full[i + 1];
    const o = { x: a.x, y: a.y, rot: a.rot, wind: a.wind ?? 0.6, facing: a.f ?? 1 };
    if (b && t > a.t) {
      const start = Math.max(b.t - (b.dur ?? (b.t - a.t)), a.t);
      if (t > start) { const u = (ease[b.e || 'inout'])((t - start) / (b.t - start)); for (const k of num) o[k] = lerp(a[k] ?? 0, b[k] ?? 0, u); }
    }
    return o;
  };
}
export const F = (n) => n / 24;
