// Dedicated close-up drawings (designed on a 1920x1080 board).
import { TAU, clamp, lerp, smoothstep, RNG, noise1, smoothPath, poly, rgba } from './util.js';

const P = (pts, closed = true) => poly(new Path2D(), pts, closed);
const B = (pts, tension = 0.5, closed = true) => smoothPath(new Path2D(), pts, closed, tension);

function eye(ctx, glow, cx, cy, side, o, t) {
  // side: +1 = eye on screen right (outer corner to the right), -1 = mirrored
  const open = clamp(o.open, 0, 1);
  const X = (x) => cx + x * side;
  const inner = [X(-158), cy + 26], outer = [X(172), cy - 8];
  const upC = [X(-30), cy + 26 - 150 * open], loC = [X(40), cy + 20 + 78 * open];
  const shape = new Path2D();
  shape.moveTo(inner[0], inner[1]); shape.quadraticCurveTo(upC[0], upC[1], outer[0], outer[1]); shape.quadraticCurveTo(loC[0], loC[1], inner[0], inner[1]); shape.closePath();
  if (open > 0.08) {
    ctx.save(); ctx.clip(shape);
    const wg = ctx.createLinearGradient(0, cy - 90, 0, cy + 70);
    wg.addColorStop(0, '#9aa2cf'); wg.addColorStop(0.45, '#eef1ff'); wg.addColorStop(1, '#d5daf5');
    ctx.fillStyle = wg; ctx.fillRect(cx - 220, cy - 140, 440, 280);
    // iris
    const ix = X(8), iy = cy - 6, R = 96;
    const ig = ctx.createLinearGradient(0, iy - R, 0, iy + R);
    ig.addColorStop(0, '#072436'); ig.addColorStop(0.45, '#0f7f8c'); ig.addColorStop(0.8, '#35d8c8'); ig.addColorStop(1, '#b9fff0');
    ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(ix, iy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#06202e'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(ix, iy, R - 3, 0, TAU); ctx.stroke();
    // striations
    ctx.strokeStyle = 'rgba(190,255,245,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU; ctx.beginPath(); ctx.moveTo(ix + Math.cos(a) * 38, iy + Math.sin(a) * 38); ctx.lineTo(ix + Math.cos(a) * (70 + 14 * Math.sin(i * 2.3)), iy + Math.sin(a) * (70 + 14 * Math.sin(i * 2.3))); ctx.stroke(); }
    ctx.fillStyle = '#041622'; ctx.beginPath(); ctx.ellipse(ix, iy, 34, 40, 0, 0, TAU); ctx.fill();
    // aurora reflected in the iris
    if (o.glow > 0.01) {
      ctx.save(); ctx.beginPath(); ctx.arc(ix, iy, R - 4, 0, TAU); ctx.clip(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 3; k++) {
        const yy = iy + 30 - k * 30 + Math.sin(t * 2 + k) * 6;
        const g = ctx.createLinearGradient(0, yy + 26, 0, yy - 40);
        g.addColorStop(0, `rgba(80,255,210,${0.55 * o.glow})`); g.addColorStop(0.5, `rgba(110,150,255,${0.35 * o.glow})`); g.addColorStop(1, 'rgba(210,100,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(ix - R, yy + 26);
        for (let x = -R; x <= R; x += 12) ctx.lineTo(ix + x, yy + Math.sin(x * 0.05 + t * 3 + k * 2) * 12 - 40);
        ctx.lineTo(ix + R, yy + 26); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // highlights
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(ix - 34 * side - 6, iy - 44, 30, 22, -0.5 * side, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ix + 40 * side, iy + 44, 10, 0, TAU); ctx.fill();
    // shadow cast by the upper lid
    const sh = ctx.createLinearGradient(0, cy - 120, 0, cy - 10);
    sh.addColorStop(0, 'rgba(20,24,70,0.6)'); sh.addColorStop(1, 'rgba(20,24,70,0)');
    ctx.fillStyle = sh; ctx.fillRect(cx - 220, cy - 140, 440, 140);
    ctx.restore();
  }
  // upper lash line (thick, winged)
  ctx.fillStyle = '#0b1026';
  const lash = new Path2D();
  lash.moveTo(inner[0] - 8 * side, inner[1] + 4);
  lash.quadraticCurveTo(upC[0], upC[1] - 16, outer[0] + 34 * side, outer[1] - 34 - 10 * open);
  lash.lineTo(outer[0] + 14 * side, outer[1] + 2);
  lash.lineTo(outer[0] + 44 * side, outer[1] + 6 - 12 * open);
  lash.lineTo(outer[0] - 6 * side, outer[1] + 12);
  lash.quadraticCurveTo(upC[0] + 6 * side, upC[1] + 22, inner[0], inner[1] + 2);
  lash.closePath(); ctx.fill(lash);
  // lower lid + crease
  ctx.strokeStyle = '#0b1026'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  if (open > 0.1) { ctx.beginPath(); ctx.moveTo(X(120), cy + 34 * open + 18); ctx.quadraticCurveTo(X(50), cy + 60 * open + 22, X(-40), cy + 46 * open + 20); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(70,50,110,0.6)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(X(-120), cy - 22 - 70 * open); ctx.quadraticCurveTo(X(-10), cy - 80 - 96 * open, X(150), cy - 60 - 40 * open); ctx.stroke();
  // brow: a slim tapered stroke, lowered toward the nose when she focuses
  const by = cy - 182 + (o.brow || 0) * 22, bi = (o.brow || 0) * 30;
  const brow = P([[X(-150), by + 36 + bi], [X(-60), by + 6 + bi * 0.3], [X(170), by - 10], [X(178), by - 2], [X(-50), by + 22 + bi * 0.3], [X(-146), by + 50 + bi]]);
  ctx.fillStyle = '#6f7bab'; ctx.fill(brow);
  if (glow && o.glow > 0.05 && open > 0.3) { glow.save(); glow.clip(shape); glow.fillStyle = `rgba(60,230,210,${0.75 * o.glow})`; glow.beginPath(); glow.arc(X(8), cy - 6, 96, 0, TAU); glow.fill(); glow.restore(); }
}

export function drawHeroEyes(ctx, glow, W, H, t, o) {
  const s = W / 1920;
  for (const c of [ctx, glow]) { c.setTransform(s, 0, 0, s, 0, 0); c.translate(960, 540); c.scale(o.push || 1, o.push || 1); c.rotate(-0.035); c.translate(-960, -540); }
  // skin
  const sg = ctx.createLinearGradient(0, 0, 0, 1080);
  sg.addColorStop(0, '#8f7fb0'); sg.addColorStop(0.3, '#cdb9cf'); sg.addColorStop(0.75, '#e2d0dc'); sg.addColorStop(1, '#c4afc9');
  ctx.fillStyle = sg; ctx.fillRect(-200, -200, 2320, 1480);
  // soft shadow of the nose bridge + under-brow shading
  ctx.fillStyle = 'rgba(150,120,170,0.35)';
  ctx.fill(B([[905, 430], [960, 400], [1015, 430], [1000, 800], [960, 900], [925, 800]], 0.5));
  ctx.fillStyle = 'rgba(120,100,165,0.3)';
  for (const sx of [-1, 1]) ctx.fill(B([[960 + sx * 100, 420], [960 + sx * 330, 330], [960 + sx * 560, 400], [960 + sx * 520, 480], [960 + sx * 300, 430], [960 + sx * 140, 470]], 0.5));
  // cheeks: teal light from below when the aurora wakes
  if (o.glow > 0.01) { const lg = ctx.createLinearGradient(0, 1080, 0, 520); lg.addColorStop(0, `rgba(70,240,215,${0.4 * o.glow})`); lg.addColorStop(1, 'rgba(70,240,215,0)'); ctx.fillStyle = lg; ctx.fillRect(-200, 400, 2320, 900); }
  eye(ctx, glow, 600, 585, -1, o, t);
  eye(ctx, glow, 1320, 585, 1, o, t);
  // nose hint
  ctx.strokeStyle = 'rgba(90,60,110,0.7)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(975, 905); ctx.quadraticCurveTo(992, 950, 962, 968); ctx.stroke();
  // hair: curved strands with pointed tips, swaying in the wind
  const sw = Math.sin(t * 2.2) * 14 + (o.wind || 0) * 26, sw2 = Math.sin(t * 2.9 + 1) * 11 + (o.wind || 0) * 20;
  const strand = (x0, x1, tx, ty, bulge) => { const p = new Path2D(); p.moveTo(x0, -60); p.quadraticCurveTo(x0 + (tx - x0) * 0.15 - bulge, ty * 0.62, tx, ty); p.quadraticCurveTo(x1 + (tx - x1) * 0.2 + bulge * 0.6, ty * 0.5, x1, -60); p.closePath(); return p; };
  const strands = [
    [strand(-80, 250, 70 + sw * 1.3, 1160, -30), 1], [strand(1680, 2000, 1850 + sw2 * 1.3, 1160, 30), 1],
    [strand(-60, 330, 215 + sw, 800, 10), 0], [strand(1600, 1980, 1705 + sw2, 780, -10), 0],
    [strand(210, 560, 372 + sw2 * 0.7, 462, 26), 0], [strand(1380, 1720, 1570 + sw * 0.7, 440, -22), 0],
    [strand(470, 800, 706 + sw * 0.6, 392, 30), 0], [strand(1130, 1460, 1236 + sw2 * 0.6, 404, -30), 0],
    [strand(720, 1040, 938 + sw * 0.9, 566, 34), 0], [strand(930, 1210, 1052 + sw2 * 0.8, 430, -18), 0],
  ];
  for (const [path] of strands) {
    const hg = ctx.createLinearGradient(0, -60, 0, 760);
    hg.addColorStop(0, '#f6f8ff'); hg.addColorStop(0.45, '#e2e8f9'); hg.addColorStop(1, '#a6b2d9');
    ctx.fillStyle = hg; ctx.fill(path);
    ctx.save(); ctx.clip(path);
    // shaded underside and a soft highlight band
    ctx.fillStyle = 'rgba(112,128,188,0.45)'; ctx.translate(46, 70); ctx.fill(path); ctx.translate(-46, -70);
    const band = ctx.createLinearGradient(0, 80, 0, 190);
    band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(0.5, 'rgba(255,255,255,0.85)'); band.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = band; ctx.fillRect(-200, 80, 2320, 110);
    ctx.restore();
    ctx.strokeStyle = '#0b1026'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.stroke(path);
  }
  // cool night grade
  ctx.fillStyle = 'rgba(30,40,120,0.22)'; ctx.fillRect(-200, -200, 2320, 1480);
}

export function drawRivalMask(ctx, glow, W, H, t, o) {
  const s = W / 1920;
  const shake = o.shake || 0;
  for (const c of [ctx, glow]) { c.setTransform(s, 0, 0, s, 0, 0); c.translate(960 + noise1(t * 40, 1) * shake, 540 + noise1(t * 40, 2) * shake); c.scale(o.push || 1, o.push || 1); c.rotate(0.03); c.translate(-960, -540); }
  // background: ink-dark with crimson vapour
  const bgG = ctx.createLinearGradient(0, 0, 1920, 1080);
  bgG.addColorStop(0, '#07050b'); bgG.addColorStop(0.6, '#150a14'); bgG.addColorStop(1, '#2a0d18');
  ctx.fillStyle = bgG; ctx.fillRect(-300, -300, 2520, 1680);
  const rr = new RNG(8);
  ctx.save(); ctx.filter = 'blur(30px)';
  for (let i = 0; i < 14; i++) { const x = rr.range(0, 1920), y = rr.range(0, 1080) + Math.sin(t * 0.8 + i) * 30; ctx.fillStyle = i % 3 === 0 ? 'rgba(140,16,40,0.3)' : 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(x - t * 30 * (i % 2 ? 1 : -0.6), y, rr.range(120, 320), rr.range(60, 150), rr.range(0, 3), 0, TAU); ctx.fill(); }
  ctx.restore();
  const eyeK = clamp(o.eye, 0, 1), split = o.split || 0;
  // helmet shell behind the mask
  const helm = B([[560, 330], [700, 120], [960, 40], [1250, 110], [1400, 330], [1440, 640], [1380, 900], [1300, 1000], [620, 1000], [540, 900], [500, 620]], 0.45);
  ctx.fillStyle = '#17131d'; ctx.fill(helm);
  ctx.save(); ctx.clip(helm); ctx.fillStyle = '#2b2634'; ctx.fill(B([[700, 60], [1000, 20], [1300, 100], [1420, 330], [1200, 260], [900, 230], [640, 300]], 0.45)); ctx.restore();
  ctx.strokeStyle = '#050308'; ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.stroke(helm);
  // crest horns + plume
  const crest = P([[1040, 150], [1130, -260 + Math.sin(t * 2) * 6], [1210, 120], [1150, 190]]);
  ctx.fillStyle = '#b8142f'; ctx.fill(crest); ctx.stroke(crest);
  const crest2 = P([[760, 170], [640, -200], [900, 110], [840, 200]]);
  ctx.fillStyle = '#3d3745'; ctx.fill(crest2); ctx.stroke(crest2);
  const pl = B([[900, 60], [700, -80 + Math.sin(t * 3) * 14], [380, -40 + Math.sin(t * 2.4 + 1) * 24], [80, 80 + Math.sin(t * 2 + 2) * 30], [-200, 60], [-200, -200], [900, -200]], 0.5);
  ctx.fillStyle = '#7a0e25'; ctx.fill(pl); ctx.save(); ctx.clip(pl); ctx.fillStyle = '#c91c3e'; ctx.fill(B([[900, 0], [650, -150], [300, -120], [0, 0], [-200, -40], [-200, -300], [900, -300]], 0.5)); ctx.restore(); ctx.stroke(pl);

  // the mask: two halves that slide apart when it splits
  const maskPts = [[960, 150], [1180, 190], [1310, 340], [1320, 600], [1240, 830], [1090, 990], [960, 1040], [830, 990], [680, 830], [600, 600], [610, 340], [740, 190]];
  const crackLine = [[700, 215], [820, 330], [800, 430], [930, 520], [905, 610], [1040, 700], [1020, 800], [1150, 905], [1200, 960]];
  const drawMask = () => {
    const mask = B(maskPts, 0.42);
    const mg = ctx.createLinearGradient(620, 0, 1320, 0);
    mg.addColorStop(0, '#9c90ab'); mg.addColorStop(0.42, '#e9e2e0'); mg.addColorStop(0.8, '#fbf7f0'); mg.addColorStop(1, '#ffd9d6');
    ctx.fillStyle = mg; ctx.fill(mask);
    ctx.save(); ctx.clip(mask);
    ctx.fillStyle = 'rgba(110,96,140,0.35)'; ctx.fill(B([[600, 150], [900, 150], [860, 500], [930, 800], [900, 1060], [600, 1060]], 0.4));
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fill(B([[1010, 200], [1180, 230], [1240, 380], [1100, 330]], 0.5));
    // painted brush stroke across the left eye
    ctx.fillStyle = '#0a070e';
    ctx.fill(B([[705, 330], [760, 300], [800, 420], [815, 620], [790, 800], [760, 880], [742, 700], [735, 500]], 0.5));
    const r2 = new RNG(3); for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.arc(760 + r2.range(-60, 70), 880 + r2.range(0, 110), r2.range(3, 11), 0, TAU); ctx.fill(); }
    // slit eye on the right
    const slit = B([[1010, 505], [1100, 450], [1235, 430], [1262, 452], [1150, 505], [1040, 540]], 0.45);
    ctx.fillStyle = '#12060a'; ctx.fill(slit);
    if (eyeK > 0.01) {
      ctx.save(); ctx.clip(slit);
      const eg = ctx.createRadialGradient(1140, 480, 4, 1140, 480, 150);
      eg.addColorStop(0, `rgba(255,235,225,${eyeK})`); eg.addColorStop(0.25, `rgba(255,60,90,${eyeK})`); eg.addColorStop(1, `rgba(140,0,30,${eyeK * 0.6})`);
      ctx.fillStyle = eg; ctx.fillRect(980, 400, 320, 180);
      ctx.restore();
    }
    ctx.strokeStyle = '#050308'; ctx.lineWidth = 6; ctx.stroke(slit);
    // ink tear
    const drip = clamp(o.drip || 0, 0, 1);
    if (drip > 0.01) { ctx.fillStyle = '#0a070e'; const L = 300 * drip; ctx.fill(B([[1110, 520], [1128, 522], [1130, 520 + L * 0.8], [1120, 520 + L], [1110, 520 + L * 0.8]], 0.5)); ctx.beginPath(); ctx.arc(1120, 520 + L, 11 + 5 * drip, 0, TAU); ctx.fill(); }
    // nose ridge + chin mark
    ctx.strokeStyle = 'rgba(90,70,110,0.5)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(962, 430); ctx.quadraticCurveTo(978, 640, 960, 790); ctx.stroke();
    ctx.strokeStyle = '#b8142f'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(960, 880); ctx.lineTo(960, 990); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = '#050308'; ctx.lineWidth = 9; ctx.stroke(mask);
  };
  const halfClip = (upper) => {
    const pts = upper ? [[-400, -400], [2400, -400], [2400, 1600], ...crackLine.slice().reverse(), [560, 60]] : [[-400, 1700], [-400, -400], [560, 60], ...crackLine, [2400, 1600], [2400, 1700]];
    return P(pts);
  };
  if (split > 0.001) {
    for (const upper of [true, false]) {
      ctx.save();
      const d = split * 46 * (upper ? 1 : -1);
      ctx.translate(d * 0.75, -d * 0.6); ctx.rotate((upper ? 1 : -1) * split * 0.035);
      ctx.clip(halfClip(upper)); drawMask(); ctx.restore();
    }
  } else drawMask();
  // crack
  const ck = clamp(o.crack || 0, 0, 1);
  if (ck > 0.001) {
    const total = crackLine.length - 1, upto = ck * total;
    for (const c of [ctx, glow]) {
      c.lineJoin = 'miter'; c.lineCap = 'round';
      for (const [w, col] of c === ctx ? [[16 + split * 50, 'rgba(90,255,225,0.9)'], [5 + split * 20, '#ffffff']] : [[22 + split * 70, 'rgba(90,255,225,0.9)']]) {
        c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(crackLine[0][0], crackLine[0][1]);
        for (let i = 1; i <= total; i++) {
          if (i <= upto) c.lineTo(crackLine[i][0], crackLine[i][1]);
          else { const f = upto - (i - 1); if (f > 0) c.lineTo(lerp(crackLine[i - 1][0], crackLine[i][0], f), lerp(crackLine[i - 1][1], crackLine[i][1], f)); break; }
        }
        c.stroke();
      }
    }
    // branch cracks
    ctx.strokeStyle = '#1a1420'; ctx.lineWidth = 3;
    for (const [i, dx, dy] of [[2, 70, -40], [4, -80, 30], [5, 90, -20], [6, -60, 60]]) if (upto > i) { ctx.beginPath(); ctx.moveTo(crackLine[i][0], crackLine[i][1]); ctx.lineTo(crackLine[i][0] + dx * 0.5, crackLine[i][1] + dy * 0.2); ctx.lineTo(crackLine[i][0] + dx, crackLine[i][1] + dy); ctx.stroke(); }
  }
  // eye glow on the bloom layer
  if (eyeK > 0.01) { glow.fillStyle = `rgba(255,40,80,${eyeK})`; glow.fill(B([[1010, 505], [1100, 450], [1235, 430], [1262, 452], [1150, 505], [1040, 540]], 0.45)); }
  // crimson rim light
  const rg = ctx.createLinearGradient(1300, 0, 1920, 0);
  rg.addColorStop(0, 'rgba(255,40,80,0)'); rg.addColorStop(1, `rgba(255,40,80,${0.12 + 0.2 * eyeK})`);
  ctx.fillStyle = rg; ctx.fillRect(1300, -300, 900, 1700);
}
