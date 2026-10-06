// Detects clipped text: compares each frame with masks/overflow opened up (only for revealed elements).
// usage: node clipcheck.mjs <steuer|fahrstart> t1,t2,...
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const [name, ts] = process.argv.slice(2);
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.writeHead(404).end();
  const ext = path.extname(p);
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' }[ext] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0);
await new Promise((r) => server.on('listening', r));
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`http://127.0.0.1:${server.address().port}/${name}/index.html?render`);
await page.evaluate(() => window.composition.ready);
let problems = 0;
for (const t of ts.split(',').map(Number)) {
  const res = await page.evaluate((tt) => {
    window.composition.seek(tt);
    const out = [];
    const stage = document.getElementById('stage').getBoundingClientRect();
    const visible = (el) => { for (let e = el; e && e.id !== 'stage'; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.opacity === '0' || cs.visibility === 'hidden' || cs.display === 'none') return false; } return true; };
    document.querySelectorAll('#stage *').forEach((el) => {
      const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!tn.length || !visible(el)) return;
      const range = document.createRange(); range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width === 0) return;
      // revealed? (masked child must be at its resting position)
      const m = new DOMMatrix(getComputedStyle(el.closest('.mask > *') || el).transform);
      if (Math.abs(m.m42) > 2) return;
      for (let a = el.parentElement; a && a.id !== 'stage'; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') {
          const ar = a.getBoundingClientRect();
          const pad = 0.5;
          if (r.left < ar.left - pad || r.right > ar.right + pad || r.top < ar.top - pad || r.bottom > ar.bottom + pad)
            out.push(`${el.textContent.trim().slice(0, 30)} | box clipped by ${a.id || a.className} (${Math.round(r.left)}-${Math.round(r.right)} x ${Math.round(r.top)}-${Math.round(r.bottom)} vs ${Math.round(ar.left)}-${Math.round(ar.right)} x ${Math.round(ar.top)}-${Math.round(ar.bottom)})`);
        }
      }
      if (r.left < stage.left + 40 || r.right > stage.right - 40) out.push(`${el.textContent.trim().slice(0, 30)} | near/over stage edge (${Math.round(r.left)}-${Math.round(r.right)})`);
    });
    return out;
  }, t);
  // pixel test for ink overflow (italic overhangs, descenders): open revealed masks and diff
  const a = await page.screenshot({ type: 'png' });
  await page.evaluate(() => {
    document.querySelectorAll('.mask').forEach((mk) => {
      const c = mk.firstElementChild; if (!c) return;
      const m = new DOMMatrix(getComputedStyle(c).transform);
      if (Math.abs(m.m42) <= 2) { mk.dataset.ov = '1'; mk.style.clipPath = 'none'; mk.style.overflow = 'visible'; }
    });
  });
  const bshot = await page.screenshot({ type: 'png' });
  const diffRegions = await page.evaluate(async ([pa, pb]) => {
    const load = (b64) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64; });
    const [ia, ib] = await Promise.all([load(pa), load(pb)]);
    const cv = (img) => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
    const da = cv(ia), db = cv(ib);
    let n = 0; let minY = 1e9, maxY = -1, minX = 1e9, maxX = -1;
    for (let i = 0; i < da.length; i += 4) { const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); if (d > 40) { n++; const p = i / 4; const y = Math.floor(p / ia.width), x = p % ia.width; minY = Math.min(minY, y); maxY = Math.max(maxY, y); minX = Math.min(minX, x); maxX = Math.max(maxX, x); } }
    return n ? `${n} px differ in x ${minX}-${maxX}, y ${minY}-${maxY}` : null;
  }, [a.toString('base64'), bshot.toString('base64')]);
  await page.evaluate(() => document.querySelectorAll('.mask').forEach((mk) => { if ('ov' in mk.dataset) { mk.style.clipPath = ''; mk.style.overflow = ''; delete mk.dataset.ov; } }));
  if (diffRegions) res.push(`INK CLIPPED: ${diffRegions}`);
  problems += res.length;
  console.log(`t=${t}: ${res.length ? '\n  ' + res.join('\n  ') : 'ok'}`);
}
await b.close();
server.close();
process.exit(problems ? 1 : 0);
