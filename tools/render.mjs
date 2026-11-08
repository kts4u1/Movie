// Renders frames of the scene with headless Chromium.
//   node tools/render.mjs --frames 0-449 --out frames          (full film, 30 fps)
//   node tools/render.mjs --times 1.0,4.1 --out previews --w 960 --h 408
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const W = parseInt(args.w || 1920, 10), H = parseInt(args.h || 816, 10);
const FPS = parseFloat(args.fps || 30);
const out = path.resolve(ROOT, args.out || 'frames');
const workers = parseInt(args.workers || 1, 10);
fs.mkdirSync(out, { recursive: true });

let jobs = [];
if (args.times) {
  jobs = String(args.times).split(',').map((s) => ({ t: parseFloat(s), file: `t_${parseFloat(s).toFixed(2)}.png` }));
} else {
  const [a, b] = String(args.frames || '0-449').split('-').map((x) => parseInt(x, 10));
  const step = parseInt(args.step || 1, 10);
  for (let f = a; f <= b; f += step) {
    const file = `${String(f).padStart(4, '0')}.png`;
    if (args.skipExisting && fs.existsSync(path.join(out, file))) continue;
    jobs.push({ t: f / FPS, file });
  }
}

const mime = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

async function worker(id, list) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[w${id} ${m.type()}]`, m.text()); });
  page.on('pageerror', (e) => console.log(`[w${id} pageerror]`, e.message));
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/src/index.html?w=${W}&h=${H}&dbg=${args.dbg || ""}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 300000 });
  console.log(`[w${id}] ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (args.info) {
    const info = await page.evaluate(() => window.__info());
    fs.writeFileSync(path.resolve(ROOT, args.info), JSON.stringify(info, null, 1));
    console.log('wrote', args.info);
  }
  for (const job of list) {
    const s = Date.now();
    await page.evaluate((t) => window.__renderAt(t), job.t);
    await page.screenshot({ path: path.join(out, job.file), type: 'png' });
    console.log(`[w${id}] ${job.file} t=${job.t.toFixed(3)} ${(Date.now() - s)}ms`);
  }
  await browser.close();
}

const lists = Array.from({ length: workers }, () => []);
jobs.forEach((j, i) => lists[i % workers].push(j));
const T = Date.now();
await Promise.all(lists.map((l, i) => worker(i, l)));
console.log(`done ${jobs.length} frames in ${((Date.now() - T) / 1000).toFixed(1)}s`);
server.close();
