// 2D overlay on top of the film: name cards, technique callouts, subtitles in the letterbox,
// the title, impact focus lines. Restrained typography: thin rules, wide tracking, no cartoon swashes.
import { clamp, lerp, smoothstep, ease } from './util.js';

const KR = '"WenQuanYi Zen Hei", sans-serif';
const EN = '"Inter Display", "Inter", sans-serif';

export class Overlay {
  constructor(canvas, W, H, top, gh) {
    this.c = canvas; this.g = canvas.getContext('2d'); this.W = W; this.H = H; this.top = top; this.gh = gh;
    this.S = W / 1920; this.T = top / this.S; this.G = gh / this.S; this.Hs = H / this.S;
  }
  clear() { const g = this.g; g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, this.W, this.H); }
  track(px) { try { this.g.letterSpacing = `${px * this.S}px`; } catch (e) { /* engines without letterSpacing */ } }

  // name card: a vertical rule, the name, ghosted hanja, the epithet
  nameCard(t, o) {
    const a = t - o.t0; if (a < 0) return;
    const g = this.g, S = this.S, k = ease.out(clamp(a / 0.35, 0, 1)), k2 = ease.out(clamp((a - 0.1) / 0.4, 0, 1));
    const left = o.side > 0, x = left ? 210 : 1710, y = this.T + this.G * 0.5;
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    // dark wash for legibility
    const wash = g.createLinearGradient(left ? 0 : 1920, 0, left ? 900 : 1020, 0);
    wash.addColorStop(0, `rgba(2,3,8,${0.55 * k})`); wash.addColorStop(1, 'rgba(2,3,8,0)');
    g.fillStyle = wash; g.fillRect(left ? 0 : 1020, this.T, 900, this.G);
    // ghost hanja
    g.textBaseline = 'middle'; g.textAlign = left ? 'left' : 'right';
    g.font = `700 330px ${KR}`; this.track(30);
    g.strokeStyle = `rgba(255,255,255,${0.1 * k2})`; g.lineWidth = 1.5;
    g.strokeText(o.hanja, x + (left ? -40 : 40) + (1 - k2) * 40 * o.side, y - 10);
    // rule
    const rx = left ? x - 34 : x + 34;
    g.fillStyle = o.accent; g.fillRect(rx - 2, y - 150 * k, 3, 300 * k);
    // name
    g.globalAlpha = k2; g.fillStyle = '#f1f3f8';
    g.font = `700 128px ${KR}`; this.track(26);
    g.fillText(o.name, x + (1 - k2) * -30 * o.side, y - 32);
    g.font = `300 24px ${EN}`; this.track(14); g.fillStyle = 'rgba(225,230,240,0.8)';
    g.fillText(o.en, x, y + 66);
    g.font = `400 28px ${KR}`; this.track(8); g.fillStyle = o.accent;
    g.fillText(o.title, x, y + 112);
    g.restore();
  }
  // technique name: a thin light sweep, white type, coloured rule, hanja beneath
  callout(t, o) {
    const a = t - o.t0; if (a < 0 || a > o.dur + 0.2) return;
    const g = this.g, S = this.S, k = ease.out(clamp(a / 0.12, 0, 1)) * (1 - smoothstep(o.dur, o.dur + 0.2, a));
    const size = o.size || 92, x = o.x, y = this.T + o.y;
    g.save(); g.setTransform(S, 0, 0, S, 0, 0);
    g.textBaseline = 'alphabetic'; g.textAlign = o.align || 'left';
    g.font = `700 ${size}px ${KR}`; this.track(size * 0.12);
    const w = g.measureText(o.text).width;
    const x0 = g.textAlign === 'center' ? x - w / 2 : g.textAlign === 'right' ? x - w : x;
    const band = g.createLinearGradient(x0 - 120, 0, x0 + w + 160, 0);
    band.addColorStop(0, 'rgba(2,3,8,0)'); band.addColorStop(0.15, `rgba(2,3,8,${0.6 * k})`); band.addColorStop(0.85, `rgba(2,3,8,${0.6 * k})`); band.addColorStop(1, 'rgba(2,3,8,0)');
    g.fillStyle = band; g.fillRect(x0 - 120, y - size * 1.05, w + 280, size * 1.75);
    const slide = (1 - ease.out(clamp(a / 0.25, 0, 1))) * 50 * (o.from || 1);
    g.globalAlpha = k; g.fillStyle = '#f4f6fb';
    g.fillText(o.text, x + slide, y);
    // rule + sweep highlight
    const rw = w * ease.out(clamp((a - 0.04) / 0.3, 0, 1));
    g.fillStyle = o.col; g.fillRect(x0, y + 18, rw, 3);
    const sx = x0 + (w + 200) * clamp(a / 0.35, 0, 1) - 100;
    const sw = g.createLinearGradient(sx - 90, 0, sx + 90, 0); sw.addColorStop(0, 'rgba(255,255,255,0)'); sw.addColorStop(0.5, `rgba(255,255,255,${0.9 * k})`); sw.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sw; g.fillRect(sx - 90, y + 17, 180, 5);
    g.font = `400 30px ${KR}`; this.track(16); g.fillStyle = 'rgba(230,235,245,0.85)';
    g.fillText(o.sub, x + slide * 0.5, y + 62);
    g.restore();
  }
  subtitle(t, s) {
    const a = t - s.t0; if (a < 0 || a > s.dur + 0.15) return;
    const g = this.g, S = this.S, k = smoothstep(0, 0.08, a) * (1 - smoothstep(s.dur, s.dur + 0.15, a));
    const y = this.T + this.G + (this.Hs - this.T - this.G) * 0.5;
    g.save(); g.setTransform(S, 0, 0, S, 0, 0); g.globalAlpha = k; g.textBaseline = 'middle';
    g.font = `400 40px ${KR}`; this.track(2);
    const wt = g.measureText(s.text).width;
    g.font = `700 30px ${KR}`; this.track(6);
    const ww = g.measureText(s.who).width, gap = 34, total = ww + gap + wt, x0 = 960 - total / 2;
    g.textAlign = 'left'; g.fillStyle = s.whoCol; g.fillText(s.who, x0, y + 2);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 + ww + gap / 2 - 1, y - 14, 1.5, 28);
    g.font = `400 40px ${KR}`; this.track(2); g.fillStyle = '#eef1f7'; g.fillText(s.text, x0 + ww + gap, y);
    g.restore();
  }
  title(t, t0) {
    const k = smoothstep(t0, t0 + 0.6, t); if (k <= 0) return;
    const g = this.g, S = this.S, y = this.T + this.G * 0.36, x = 760;
    g.save(); g.setTransform(S, 0, 0, S, 0, 0); g.textAlign = 'center'; g.textBaseline = 'middle';
    const band = g.createRadialGradient(x, y + 40, 40, x, y + 40, 700);
    band.addColorStop(0, `rgba(2,4,10,${0.45 * k})`); band.addColorStop(1, 'rgba(2,4,10,0)');
    g.fillStyle = band; g.fillRect(x - 760, y - 260, 1520, 560);
    g.globalAlpha = k;
    g.font = `300 118px ${EN}`; this.track(lerp(70, 44, ease.out(k)));
    const grd = g.createLinearGradient(x - 560, 0, x + 560, 0);
    grd.addColorStop(0, '#9ff3e6'); grd.addColorStop(0.5, '#ffffff'); grd.addColorStop(1, '#c4b2ff');
    g.fillStyle = grd; g.fillText('AURORA BLADE', x + 22, y);
    const lw = 430 * ease.out(smoothstep(t0 + 0.15, t0 + 0.8, t));
    const lg = g.createLinearGradient(x - lw, 0, x + lw, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.9)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lg; g.fillRect(x - lw, y + 74, lw * 2, 1.5);
    g.font = `400 38px ${KR}`; this.track(34); g.fillStyle = 'rgba(236,240,248,0.92)';
    g.globalAlpha = k * smoothstep(t0 + 0.25, t0 + 0.8, t);
    g.fillText('오로라의 검', x + 17, y + 128);
    g.restore();
  }
  // radial speed lines toward a focus point (impact frames)
  focusLines(fx, fy, col, n = 70, seed = 1, inner = 0.32) {
    const g = this.g, S = this.S; let s = seed * 7919 + 1;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath(); g.rect(0, this.top, this.W, this.gh); g.clip();
    g.fillStyle = col;
    const R = Math.hypot(this.W, this.H);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, w = (0.004 + rnd() * 0.012), r0 = (inner + rnd() * 0.25) * this.gh;
      g.beginPath();
      g.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
      g.lineTo(fx + Math.cos(a - w) * R, fy + Math.sin(a - w) * R);
      g.lineTo(fx + Math.cos(a + w) * R, fy + Math.sin(a + w) * R);
      g.fill();
    }
    g.restore();
  }
  // the opening frames of the final cut: black, a single blinding diagonal line
  beamFrame(fi) {
    const g = this.g, S = this.S;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, this.W, this.H);
    const k = [0.5, 1, 1][fi];
    const p0 = [-40 * S, this.top - 60 * S], p1 = [p0[0] + (this.W + 80 * S) * k, p0[1] + (this.gh + 120 * S) * k];
    const wid = (fi === 2 ? 26 : 70) * S;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L;
    g.beginPath(); g.rect(0, this.top, this.W, this.gh); g.clip();
    for (const [w, c] of [[wid * 6, 'rgba(60,220,200,0.16)'], [wid * 2.4, 'rgba(120,255,235,0.45)'], [wid, '#ffffff']]) {
      g.fillStyle = c; g.beginPath();
      g.moveTo(p0[0] + nx * w * 0.5, p0[1] + ny * w * 0.5); g.lineTo(p1[0] + nx * w * 0.08, p1[1] + ny * w * 0.08);
      g.lineTo(p1[0] - nx * w * 0.08, p1[1] - ny * w * 0.08); g.lineTo(p0[0] - nx * w * 0.5, p0[1] - ny * w * 0.5); g.fill();
    }
    let s = fi * 31 + 5; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    for (let i = 0; i < 16; i++) {
      const o = (rnd() * 2 - 1) * 380 * S, a = rnd() * 0.6, b = a + 0.12 + rnd() * 0.3;
      g.lineWidth = (1 + rnd() * 3) * S; g.beginPath();
      g.moveTo(p0[0] + dx * a + nx * o, p0[1] + dy * a + ny * o); g.lineTo(p0[0] + dx * b + nx * o, p0[1] + dy * b + ny * o); g.stroke();
    }
    g.restore();
  }
}
