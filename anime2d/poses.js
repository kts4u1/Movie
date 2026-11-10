// Pose library for both fighters. Angles: 0 = down, 90 = forward, 180 = up, -90 = back.
// hip / feet are relative to the character's ground origin (y is negative upward).
import { BASE_POSE } from './rig.js';

const P = (o) => ({ ...BASE_POSE, ...o });

export const H = {
  idle: P({ hip: [0, -0.9], lean: 3, bend: 0, head: 0, armF: [8, 30], sword: 55, armB: [-8, 5], footF: [0.1, 0], footB: [-0.12, 0] }),
  ready: P({ hip: [0, -0.8], lean: 10, bend: 4, head: -10, armF: [50, 95], sword: 140, two: 1, footF: [0.32, 0], footB: [-0.34, 0], footAB: 12 }),
  low: P({ hip: [0, -0.62], lean: 30, bend: 8, head: -30, armF: [-25, -70], sword: -100, armB: [25, 65], footF: [0.45, 0], footB: [-0.5, 0], footAB: 28, turn: -0.4 }),
  runA: P({ hip: [0, -0.68], lean: 52, bend: 6, head: -42, armF: [-62, -92], sword: -104, armB: [-50, -78], footF: [0.52, -0.04], footB: [-0.5, -0.34], footAF: -12, footAB: 55 }),
  runB: P({ hip: [0, -0.74], lean: 54, bend: 6, head: -42, armF: [-66, -96], sword: -108, armB: [-56, -84], footF: [-0.42, -0.3], footB: [0.5, -0.03], footAF: 50, footAB: -10 }),
  upWind: P({ hip: [-0.04, -0.68], lean: 24, bend: 6, head: -24, armF: [-30, -62], sword: -96, armB: [30, 60], footF: [0.4, 0], footB: [-0.42, 0], footAB: 20, turn: -0.6 }),
  upEnd: P({ hip: [0.12, -0.86], lean: 0, bend: -8, head: 2, armF: [150, 166], sword: 196, armB: [-30, -55], footF: [0.42, 0], footB: [-0.36, 0], footAB: 30, turn: 0.6 }),
  downWind: P({ hip: [-0.02, -0.88], lean: -4, bend: -8, head: 6, armF: [164, 200], sword: 216, two: 1, footF: [0.3, 0], footB: [-0.3, 0] }),
  downEnd: P({ hip: [0.14, -0.66], lean: 28, bend: 10, head: -30, armF: [58, 74], sword: 48, two: 1, footF: [0.52, 0], footB: [-0.46, 0], footAB: 35, turn: 0.3 }),
  block: P({ hip: [-0.04, -0.78], lean: 2, bend: -2, head: -2, armF: [76, 128], sword: 172, two: 1, footF: [0.3, 0], footB: [-0.42, 0], footAB: 15 }),
  duck: P({ hip: [0, -0.42], lean: 50, bend: 12, head: -52, armF: [-12, -42], sword: -82, armB: [35, 72], footF: [0.46, 0], footB: [-0.52, 0], footAB: 45 }),
  spin: P({ hip: [0, -0.78], lean: 8, bend: 2, head: -8, armF: [92, 96], sword: 92, armB: [-80, -95], footF: [0.3, 0], footB: [-0.3, 0], footAB: 20 }),
  backstep: P({ hip: [-0.08, -0.76], lean: -10, bend: -6, head: 10, armF: [70, 110], sword: 150, armB: [-50, -80], footF: [0.38, -0.06], footB: [-0.3, 0], footAF: -20 }),
  jump: P({ hip: [0, -0.8], lean: -6, bend: -10, head: -4, armF: [150, 172], sword: 204, armB: [-40, -72], footF: [0.2, -0.36], footB: [-0.28, -0.1], footAF: 30, footAB: 55 }),
  arch: P({ hip: [0, -0.8], lean: -18, bend: -24, head: 12, armF: [176, 206], sword: 224, armB: [-62, -104], footF: [0.26, -0.44], footB: [-0.42, -0.04], footAF: 32, footAB: 62, turn: 0.5 }),
  dive: P({ hip: [0, -0.8], lean: 24, bend: 4, head: -22, armF: [94, 94], sword: 93, armB: [-70, -95], footF: [-0.28, -0.22], footB: [-0.62, -0.1], footAF: 60, footAB: 70 }),
  finish: P({ hip: [0, -0.5], lean: 38, bend: 6, head: -32, armF: [84, 92], sword: 89, armB: [-42, -72], footF: [0.62, 0], footB: [-0.62, 0], footAB: 55, turn: 0.4 }),
  rise: P({ hip: [0, -0.86], lean: 6, bend: 0, head: -4, armF: [42, 58], sword: 36, armB: [-10, 5], footF: [0.22, 0], footB: [-0.26, 0] }),
  chiburi: P({ hip: [0, -0.89], lean: 2, bend: 0, head: 0, armF: [22, 34], sword: 18, armB: [-8, 6], footF: [0.14, 0], footB: [-0.16, 0] }),
  lookup: P({ hip: [0, -0.9], lean: 0, bend: -3, head: -24, armF: [6, 14], sword: 8, armB: [-6, 4], footF: [0.1, 0], footB: [-0.12, 0] }),
};

export const R = {
  idle: P({ hip: [0, -0.9], lean: 2, bend: 0, head: 2, armF: [22, 160], sword: 218, armB: [-6, 8], footF: [0.14, 0], footB: [-0.16, 0] }),
  ready: P({ hip: [0, -0.8], lean: 10, bend: 4, head: -8, armF: [42, 72], sword: 82, two: 1, footF: [0.36, 0], footB: [-0.36, 0], footAB: 10 }),
  runA: P({ hip: [0, -0.72], lean: 40, bend: 6, head: -32, armF: [-50, -85], sword: -100, armB: [-40, -70], footF: [0.5, -0.04], footB: [-0.48, -0.3], footAF: -12, footAB: 50 }),
  runB: P({ hip: [0, -0.77], lean: 42, bend: 6, head: -32, armF: [-54, -88], sword: -104, armB: [-46, -76], footF: [-0.4, -0.28], footB: [0.48, -0.03], footAF: 48, footAB: -10 }),
  overWind: P({ hip: [-0.02, -0.88], lean: -6, bend: -8, head: 8, armF: [160, 196], sword: 206, two: 1, footF: [0.3, 0], footB: [-0.32, 0] }),
  overEnd: P({ hip: [0.12, -0.66], lean: 30, bend: 10, head: -30, armF: [55, 70], sword: 46, two: 1, footF: [0.52, 0], footB: [-0.46, 0], footAB: 35 }),
  sweepWind: P({ hip: [-0.04, -0.76], lean: 12, bend: 4, head: -10, armF: [-42, -82], sword: -92, armB: [30, 62], footF: [0.36, 0], footB: [-0.4, 0], turn: -0.6 }),
  sweepEnd: P({ hip: [0.1, -0.74], lean: 14, bend: 4, head: -12, armF: [96, 100], sword: 96, armB: [-60, -85], footF: [0.44, 0], footB: [-0.4, 0], footAB: 25, turn: 0.6 }),
  block: P({ hip: [-0.04, -0.78], lean: 0, bend: -2, head: 0, armF: [72, 122], sword: 166, two: 1, footF: [0.32, 0], footB: [-0.42, 0], footAB: 15 }),
  knock: P({ hip: [-0.12, -0.7], lean: -18, bend: -10, head: 14, armF: [122, 152], sword: 182, armB: [-72, -102], footF: [0.46, 0], footB: [-0.36, 0], footAF: -26 }),
  gather: P({ hip: [0, -0.9], lean: -3, bend: -3, head: 2, armF: [166, 178], sword: 181, two: 1, footF: [0.2, 0], footB: [-0.22, 0] }),
  slam: P({ hip: [0.16, -0.56], lean: 42, bend: 14, head: -44, armF: [50, 56], sword: 36, two: 1, footF: [0.56, 0], footB: [-0.5, 0], footAB: 45 }),
  guardUp: P({ hip: [0, -0.82], lean: -8, bend: -8, head: -18, armF: [104, 142], sword: 166, two: 1, footF: [0.3, 0], footB: [-0.34, 0] }),
  struck: P({ hip: [0.04, -0.82], lean: 8, bend: 2, head: -6, armF: [112, 124], sword: 132, armB: [-20, -30], footF: [0.34, 0], footB: [-0.32, 0] }),
  kneel: P({ hip: [0, -0.44], lean: 22, bend: 20, head: 28, armF: [12, 22], sword: 24, armB: [4, 12], footF: [0.3, 0], footB: [-0.38, 0], footAB: 62 }),
};

export function lerpPose(a, b, u) {
  const o = {};
  for (const k in a) {
    const x = a[k], y = b[k];
    if (Array.isArray(x)) o[k] = [x[0] + (y[0] - x[0]) * u, x[1] + (y[1] - x[1]) * u];
    else o[k] = x + (y - x) * u;
  }
  o.two = u < 0.5 ? a.two : b.two;
  return o;
}
