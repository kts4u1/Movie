// Painted-style background: twilight sky, giant moon, clouds, mountains and a pampas-grass
// field built from parallax layers. Everything is deterministic in time.
import { TAU, clamp, lerp, smoothstep, RNG, noise1, fbm1, rgba, mixHex } from './util.js';

export const PPM = 230; // pixels per meter at zoom 1

function offscreen(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export class Background {
  constructor(W, H) {
    this.W = W; this.H = H; this.S = W / 1920;
    const rng = new RNG(42);
    // ---- moon texture
    this.moon = offscreen(640, 640);
    {
      const g = this.moon.getContext('2d');
      const r = 300, c = 320;
      const grad = g.createRadialGradient(c - 60, c - 70, 20, c, c, r);
      grad.addColorStop(0, '#eef2ff'); grad.addColorStop(0.65, '#cfd9f6'); grad.addColorStop(1, '#a3b2e4');
      g.fillStyle = grad; g.beginPath(); g.arc(c, c, r, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.arc(c, c, r, 0, TAU); g.clip();
      g.filter = 'blur(10px)';
      for (let i = 0; i < 22; i++) {
        g.fillStyle = `rgba(104,120,178,${rng.range(0.16, 0.4)})`;
        g.beginPath(); g.ellipse(c + rng.range(-220, 220), c + rng.range(-220, 220), rng.range(20, 90), rng.range(15, 60), rng.range(0, 3), 0, TAU); g.fill();
      }
      g.restore();
    }
    // ---- stars
    this.stars = Array.from({ length: 260 }, () => ({ x: rng.range(-9, 9), y: rng.range(-6.5, -0.2), r: rng.range(0.004, 0.012), p: rng.range(0, 6), tw: rng.range(0.5, 3) }));
    // ---- clouds (pre-blurred)
    this.clouds = offscreen(3200, 900);
    {
      const g = this.clouds.getContext('2d');
      g.filter = 'blur(14px)';
      for (let k = 0; k < 9; k++) {
        const cx = rng.range(100, 3100), cy = rng.range(180, 760), L = rng.range(400, 1100);
        for (let i = 0; i < 26; i++) {
          const u = rng.next();
          const x = cx + (u - 0.5) * L, y = cy + rng.gauss() * 26 + Math.sin(u * 6) * 14;
          const rx = rng.range(60, 190) * (1 - Math.abs(u - 0.5) * 1.2), ry = rng.range(14, 44);
          const gr = g.createLinearGradient(0, y - ry, 0, y + ry);
          gr.addColorStop(0, 'rgba(196,206,246,0.5)'); gr.addColorStop(0.5, 'rgba(92,104,170,0.42)'); gr.addColorStop(1, 'rgba(34,40,92,0.38)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, Math.max(rx, 20), ry, 0, 0, TAU); g.fill();
        }
      }
    }
    // ---- mountain profiles
    const ridge = (seed, amp, base, n = 220, span = 60) => Array.from({ length: n }, (_, i) => { const x = -span / 2 + (i / (n - 1)) * span; return [x, base - Math.abs(fbm1(x * 0.22 + seed, seed, 4)) * amp - Math.max(0, fbm1(x * 0.07 + seed * 3, seed + 1, 2)) * amp * 0.8]; });
    this.ridges = [
      { pts: ridge(1.3, 1.9, -0.25), p: 0.1, top: '#3c4a86', bot: '#4e5fa0' },
      { pts: ridge(5.1, 1.3, -0.12), p: 0.18, top: '#283266', bot: '#3b4a85' },
      { pts: ridge(9.7, 0.7, -0.04), p: 0.3, top: '#1a2149', bot: '#28336a' },
    ];
    // ---- grass tiles (one per depth row)
    this.rows = [
      { p: 0.14, h: 0.5, den: 190, col: ['#3a4b88', '#4b62a2'], plume: '#9fb0e2', blur: 0 },
      { p: 0.22, h: 0.6, den: 175, col: ['#35467f', '#465c9c'], plume: '#a4b3e4', blur: 0 },
      { p: 0.31, h: 0.68, den: 160, col: ['#31417a', '#415797'], plume: '#a7b5e5', blur: 0 },
      { p: 0.42, h: 0.75, den: 150, col: ['#2d3d74', '#3d5390'], plume: '#aab8e6', blur: 0 },
      { p: 0.55, h: 0.85, den: 135, col: ['#25346a', '#365089'], plume: '#bcc8f0', blur: 0 },
      { p: 0.7, h: 0.95, den: 120, col: ['#1c2a5c', '#2f4a82'], plume: '#d0daf8', blur: 0 },
      { p: 0.86, h: 1.05, den: 105, col: ['#15214e', '#2a447c'], plume: '#e2e9ff', blur: 0 },
      { p: 1.13, h: 0.55, den: 120, col: ['#0d163c', '#1d3468'], plume: '#eef2ff', blur: 0, front: true, short: true },
      { p: 1.5, h: 1.2, den: 46, col: ['#070d28', '#122250'], plume: '#c9d4f5', blur: 3, front: true },
      { p: 2.1, h: 1.5, den: 22, col: ['#040818', '#0a1436'], plume: '#9aa8d8', blur: 7, front: true },
    ];
    this.tileW = 8; // meters per tile
    for (const row of this.rows) row.tile = this.makeGrassTile(row, rng);
  }

  makeGrassTile(row, rng) {
    const pxm = 150, w = Math.round(this.tileW * pxm), hM = row.h * 1.9 + 0.3, h = Math.round(hM * pxm);
    const c = offscreen(w, h), g = c.getContext('2d');
    if (row.blur) g.filter = `blur(${row.blur}px)`;
    const base = h;
    const blade = (x, len, bend, wid, col) => {
      const tipX = x + bend * len, tipY = base - len * Math.sqrt(Math.max(1 - bend * bend * 0.5, 0.3));
      g.fillStyle = col; g.beginPath(); g.moveTo(x - wid, base); g.quadraticCurveTo(x - wid * 0.4 + bend * len * 0.25, base - len * 0.6, tipX, tipY); g.quadraticCurveTo(x + wid * 0.6 + bend * len * 0.3, base - len * 0.55, x + wid, base); g.fill();
      return [tipX, tipY];
    };
    for (const wrap of [0, -w, w]) {
      const r2 = new RNG(Math.round(row.p * 1000));
      for (let i = 0; i < row.den; i++) {
        const x = r2.range(0, w) + wrap, len = r2.range(0.35, 1) * row.h * pxm, bend = r2.range(-0.55, 0.55);
        const col = mixHex(row.col[0], row.col[1], r2.next() * r2.next() * 1.6 > 1 ? 1 : r2.next() * 0.8);
        blade(x, len, bend, r2.range(2.5, 6), col);
      }
      // pampas stalks with feathery plumes
      const stalks = row.short ? 0 : Math.round(row.den * 0.16);
      for (let i = 0; i < stalks; i++) {
        const x = r2.range(0, w) + wrap, len = r2.range(1.1, 1.75) * row.h * pxm, bend = r2.range(-0.25, 0.35);
        const [tx, ty] = blade(x, len, bend, 1.6, row.col[1]);
        const pl = r2.range(0.22, 0.4) * row.h * pxm, ang = Math.atan2(-1, bend * 1.4) + r2.range(-0.2, 0.2);
        g.save(); g.translate(tx, ty); g.rotate(ang + Math.PI / 2);
        const gr = g.createLinearGradient(0, -pl, 0, 0);
        gr.addColorStop(0, rgba('#ffffff', 0.0)); gr.addColorStop(0.3, row.plume); gr.addColorStop(1, rgba(row.col[1], 0.9));
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-pl * 0.2, -pl * 0.5, 0, -pl); g.quadraticCurveTo(pl * 0.2, -pl * 0.5, 0, 0); g.fill();
        g.restore();
      }
    }
    return { c, pxm, hM };
  }

  // transform for a layer at parallax depth p (ground-attached world coordinates)
  ground(ctx, cam, p) {
    const Z = cam.zoom * PPM * this.S, E = cam.eye == null ? cam.y : cam.eye;
    ctx.setTransform(1, 0, 0, 1, this.W / 2, this.H / 2);
    ctx.rotate(cam.rot || 0); ctx.scale(Z, Z); ctx.translate(0, E - cam.y); ctx.scale(p, p); ctx.translate(-cam.x, -E);
  }
  // transform for sky-space layers: coordinates are meters relative to the horizon line
  sky(ctx, cam, p) {
    const Z = cam.zoom * PPM * this.S, E = cam.eye == null ? cam.y : cam.eye;
    ctx.setTransform(1, 0, 0, 1, this.W / 2, this.H / 2);
    ctx.rotate(cam.rot || 0); ctx.scale(Z, Z); ctx.translate(-cam.x * p, E - cam.y);
  }

  drawBack(ctx, glow, cam, t, o = {}) {
    const { W, H } = this;
    // ---- sky gradient
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const Z = cam.zoom * PPM * this.S, E = cam.eye == null ? cam.y : cam.eye;
    const hy = H / 2 + (E - cam.y) * Z; // horizon on screen
    const sg = ctx.createLinearGradient(0, hy - 1500, 0, hy + 40);
    sg.addColorStop(0, '#070a24'); sg.addColorStop(0.45, '#151d52'); sg.addColorStop(0.78, '#2f3f8a'); sg.addColorStop(0.93, '#5a64b4'); sg.addColorStop(1, '#8f8fd0');
    ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
    // ---- stars
    this.sky(ctx, cam, 0.02);
    for (const s of this.stars) {
      const a = 0.45 + 0.55 * Math.sin(t * s.tw + s.p);
      ctx.fillStyle = `rgba(230,238,255,${0.25 + 0.6 * a})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r * (0.8 + 0.4 * a), 0, TAU); ctx.fill();
    }
    // ---- aurora
    if (o.aurora > 0.01) this.drawAurora(ctx, glow, cam, t, o.aurora, o.auroraY || 0);
    // ---- moon
    const m = o.moon || { x: 0.4, y: -2.25, r: 1.25 };
    for (const [c, k] of [[ctx, 1], [glow, 1]]) {
      if (!c) continue;
      this.sky(c, cam, 0.04);
      const hg = c.createRadialGradient(m.x, m.y, m.r * 0.97, m.x, m.y, m.r * 3.2);
      // on the bloom layer the halo is a ring outside the disc so the moon keeps its surface detail
      hg.addColorStop(0, c === glow ? 'rgba(190,205,255,0)' : 'rgba(190,205,255,0.3)'); hg.addColorStop(0.03, c === glow ? 'rgba(190,205,255,0.22)' : 'rgba(190,205,255,0.3)'); hg.addColorStop(0.35, 'rgba(120,140,230,0.1)'); hg.addColorStop(1, 'rgba(90,110,220,0)');
      c.fillStyle = hg; c.beginPath(); c.arc(m.x, m.y, m.r * 3.2, 0, TAU); c.fill();
      if (c !== glow) c.drawImage(this.moon, m.x - m.r * 1.066, m.y - m.r * 1.066, m.r * 2.133, m.r * 2.133);
    }
    // ---- clouds
    this.sky(ctx, cam, 0.07);
    const cw = 22, chh = cw * 900 / 3200, drift = (t * 0.06) % cw;
    ctx.globalAlpha = 0.9;
    for (const ox of [-cw, 0, cw]) ctx.drawImage(this.clouds, -cw / 2 + ox - drift, -5.6, cw, chh);
    ctx.globalAlpha = 1;
    // ---- mountains
    for (const r of this.ridges) {
      for (const c of [ctx, glow]) {
        if (!c) continue;
        this.sky(c, cam, r.p);
        const g = c.createLinearGradient(0, -3, 0, 0.2);
        g.addColorStop(0, r.top); g.addColorStop(1, r.bot);
        c.fillStyle = c === glow ? '#000' : g; c.beginPath(); c.moveTo(-40, 1);
        for (const pt of r.pts) c.lineTo(pt[0], pt[1]);
        c.lineTo(40, 1); c.closePath(); c.fill();
      }
    }
    // horizon haze
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const hz = ctx.createLinearGradient(0, hy - 150, 0, hy + 60);
    hz.addColorStop(0, 'rgba(140,150,220,0)'); hz.addColorStop(0.75, 'rgba(150,160,230,0.3)'); hz.addColorStop(1, 'rgba(120,130,210,0)');
    ctx.fillStyle = hz; ctx.fillRect(0, hy - 150, W, 210);
    // ---- ground plane
    const gg = ctx.createLinearGradient(0, hy, 0, hy + 700);
    gg.addColorStop(0, '#34447f'); gg.addColorStop(0.12, '#223062'); gg.addColorStop(0.5, '#131d48'); gg.addColorStop(1, '#0a1232');
    ctx.fillStyle = gg; ctx.fillRect(0, hy, W, Math.max(H - hy, 0) + 2);
    if (glow) { glow.setTransform(1, 0, 0, 1, 0, 0); glow.fillStyle = '#000'; glow.fillRect(0, hy, W, Math.max(H - hy, 0) + 2); }
    // ---- grass rows behind the characters
    for (const row of this.rows) if (!row.front) this.drawRow(ctx, cam, t, row, o);
  }

  drawFront(ctx, cam, t, o = {}) {
    for (const row of this.rows) if (row.front && !(o.noNear && row.p > 1.2)) this.drawRow(ctx, cam, t, row, o);
  }

  drawRow(ctx, cam, t, row, o) {
    const { tile } = row, tw = this.tileW;
    const Z = cam.zoom * PPM * this.S;
    const halfVis = this.W / 2 / (Z * row.p) + 1.5;
    const x0 = Math.floor((cam.x - halfVis) / tw) * tw, x1 = cam.x + halfVis;
    const strips = 10, sw = tile.c.width / strips, swM = tw / strips;
    const gust = o.gust || 0;
    this.ground(ctx, cam, row.p);
    const base = ctx.getTransform();
    for (let tx = x0; tx < x1; tx += tw) {
      for (let i = 0; i < strips; i++) {
        const wx = tx + i * swM;
        if (wx + swM < cam.x - halfVis || wx > cam.x + halfVis) continue;
        const shear = Math.sin(t * 1.6 + wx * 0.55 + row.p * 9) * 0.05 + Math.sin(t * 0.9 - wx * 0.21) * 0.035
          + gust * (0.2 + 0.25 * Math.sin(t * 5 - wx * 0.9 + row.p * 4)) + (o.wave ? o.wave(wx, row.p) : 0);
        ctx.setTransform(base);
        ctx.transform(1, 0, -shear, 1, wx, 0);
        ctx.drawImage(tile.c, i * sw, 0, sw + 1, tile.c.height, 0, -tile.hM, swM + 0.02, tile.hM);
      }
    }
  }

  drawAurora(ctx, glow, cam, t, k, dy = 0) {
    for (const c of [ctx, glow]) {
      if (!c) continue;
      this.sky(c, cam, 0.03);
      c.globalCompositeOperation = 'lighter';
      const bands = [{ y: -3.3, h: 2.6, a: 0.16, sp: 0.5, ph: 0, col: ['60,255,200', '90,150,255', '200,90,255'] }, { y: -2.6, h: 2.0, a: 0.13, sp: 0.7, ph: 2.1, col: ['80,255,230', '80,200,255', '160,110,255'] }, { y: -4.1, h: 2.2, a: 0.1, sp: 0.4, ph: 4.4, col: ['120,255,180', '120,120,255', '255,100,220'] }];
      for (const b of bands) {
        const step = 0.09;
        for (let x = -10; x < 10; x += step) {
          const base = dy + b.y + Math.sin(x * 0.55 + t * b.sp + b.ph) * 0.45 + Math.sin(x * 1.7 - t * b.sp * 1.3 + b.ph) * 0.16;
          const ray = 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.sin(x * 9.0 + Math.sin(x * 2.3 + t) * 3 + b.ph), 2);
          const env = smoothstep(-10, -5, x) * (1 - smoothstep(5, 10, x));
          const al = b.a * ray * env * k;
          const g = c.createLinearGradient(0, base, 0, base - b.h);
          g.addColorStop(0, `rgba(${b.col[0]},${al})`); g.addColorStop(0.35, `rgba(${b.col[1]},${al * 0.7})`); g.addColorStop(1, `rgba(${b.col[2]},0)`);
          c.fillStyle = g; c.fillRect(x, base - b.h, step * 1.25, b.h);
        }
      }
      c.globalCompositeOperation = 'source-over';
    }
  }
}
