#!/usr/bin/env node
// Exportiert die Instagram-Visuals als PNG (+ JPG) nach out/instagram/ und eine Rastervorschau (Profil, 3:4-Kacheln).
//   node instagram/export.mjs
import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'out', 'instagram');
fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.on('listening', r));
const base = `http://127.0.0.1:${server.address().port}/instagram/`;

const JOBS = [
  ['post-links.html', 'allnova-ig-1-links-allnova', 1080, 1350],
  ['reel-cover.html', 'allnova-ig-2-mitte-reel-cover', 1080, 1920],
  ['post-rechts.html', 'allnova-ig-3-rechts-app', 1080, 1350],
];
const b = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
for (const [page, file, w, h] of JOBS) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.error('  page error:', e.message));
  await p.goto(base + page, { waitUntil: 'load' });
  await p.waitForSelector('body[data-ready="1"]');
  await p.locator('#stage').screenshot({ path: path.join(OUT, `${file}.png`) });
  spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', path.join(OUT, `${file}.png`), '-q:v', '1', path.join(OUT, `${file}.jpg`)]);
  console.log('  →', path.relative(ROOT, path.join(OUT, `${file}.png`)));
  await p.close();
}
await b.close();
server.close();

// Rastervorschau: so erscheinen die drei fixierten Beiträge im Profil (je 3:4 mittig beschnitten)
const tile = (f) => `[${f}]crop='min(iw,ih*3/4)':'min(ih,iw*4/3)',scale=600:800,setsar=1`;
spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
  '-i', path.join(OUT, 'allnova-ig-1-links-allnova.png'), '-i', path.join(OUT, 'allnova-ig-2-mitte-reel-cover.png'), '-i', path.join(OUT, 'allnova-ig-3-rechts-app.png'),
  '-filter_complex', `${tile('0:v')}[a];${tile('1:v')}[b];${tile('2:v')}[c];[a]pad=606:800:0:0:white[a2];[b]pad=606:800:0:0:white[b2];[a2][b2][c]hstack=3`,
  path.join(OUT, 'vorschau-profilraster.png')], { stdio: 'inherit' });
console.log('  → out/instagram/vorschau-profilraster.png');
