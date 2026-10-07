#!/usr/bin/env node
// Rendert tiles.html → ../img/brand-<name>.png (542 × 379, transparente Ecken)
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MIME = { '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png', '.js': 'text/javascript' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p)) return res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.on('listening', r));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1800, height: 2400 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.error(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/brands/tiles.html`);
await p.waitForSelector('body[data-ready="1"]');
const names = await p.evaluate(() => window.BRANDS.map((x) => x.n));
for (const n of names) {
  await p.locator(`#t-${n}`).screenshot({ path: path.join(ROOT, 'img', `brand-${n}.png`), omitBackground: true });
}
await p.screenshot({ path: path.join(HERE, 'vorschau.png'), fullPage: true });
console.log(names.length, 'Kacheln → teaser/img/brand-*.png');
await b.close(); server.close();
