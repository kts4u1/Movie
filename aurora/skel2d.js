// 2D skeleton solve (sagittal plane) shared with the 3D renderer: poses are authored as
// planar angles, solved here, then lifted to 3D joints in char3d.js.
import { add, sub, mul, dirA, dirUp, ik2 } from './util.js';

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

