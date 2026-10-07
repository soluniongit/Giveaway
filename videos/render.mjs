#!/usr/bin/env node
/*
 * Renders the HTML/GSAP compositions to MP4 (1080×1920, 30 fps, H.264).
 *
 *   node render.mjs                     → both videos
 *   node render.mjs steuer              → only one
 *   node render.mjs steuer --stills=1,5.5,29   → PNG stills to out/stills (for review)
 *   node render.mjs --mux                → only re-attach out/sound/<name>.wav to the silent export
 *
 * Output: <name>.mp4 (with sound design) and <name>-ohne-ton.mp4 (silent).
 * Options: --mb=8        sub-frames per frame for motion blur (1 = off)
 *          --workers=8   parallel browser instances
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');

const COMPOSITIONS = {
  steuer: { page: 'steuer/index.html', file: 'allnova-steuergewinnspiel-30s' },
  fahrstart: { page: 'fahrstart/index.html', file: 'allnova-fahrstart-gewinnspiel-30s' },
  app: { page: 'app/index.html', file: 'allnova-app-teaser-30s' },
};

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};
const names = args.filter((a) => !a.startsWith('--'));
const targets = names.length ? names : Object.keys(COMPOSITIONS);
const MB = parseInt(opt('mb', '8'), 10);
const SHUTTER = 0.5; // 180° shutter
const WORKERS = parseInt(opt('workers', String(Math.max(1, Math.min(8, os.cpus().length - 2)))), 10);
const STILLS = opt('stills', null);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function openPage(url) {
  const browser = await chromium.launch({
    args: ['--force-color-profile=srgb', '--disable-lcd-text', '--font-render-hinting=none', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('  page error:', e.message));
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => window.composition.ready);
  const cdp = await page.context().newCDPSession(page);
  const capture = async (t) => {
    await page.evaluate((tt) => window.composition.seek(tt), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true });
    return Buffer.from(data, 'base64');
  };
  const meta = await page.evaluate(() => ({ duration: window.composition.duration, fps: window.composition.fps }));
  return { browser, capture, ...meta };
}

function ffmpeg(argv) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  return { p, done };
}

async function write(stream, buf) {
  if (!stream.write(buf)) await new Promise((r) => stream.once('drain', r));
}

async function renderSegment(url, f0, f1, segPath, onFrame) {
  const { browser, capture, fps } = await openPage(url);
  const vf = MB > 1 ? `format=rgb24,tmix=frames=${MB},select=eq(mod(n\\,${MB})\\,${MB - 1}),setpts=N/${fps}/TB` : 'format=rgb24';
  const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(fps * MB), '-c:v', 'png', '-i', '-', '-vf', vf, '-r', String(fps), '-c:v', 'libx264rgb', '-preset', 'ultrafast', '-qp', '0', segPath]);
  for (let f = f0; f < f1; f++) {
    for (let k = 0; k < MB; k++) {
      const t = MB > 1 ? f / fps + ((k + 0.5) / MB - 0.5) * (SHUTTER / fps) : f / fps;
      await write(enc.p.stdin, await capture(Math.max(0, t)));
    }
    onFrame();
  }
  enc.p.stdin.end();
  await enc.done;
  await browser.close();
}

async function renderVideo(name, base) {
  const comp = COMPOSITIONS[name];
  const url = `${base}/${comp.page}?render`;
  const probe = await openPage(url);
  const total = Math.round(probe.duration * probe.fps);
  await probe.browser.close();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `render-${name}-`));
  const per = Math.ceil(total / WORKERS);
  let doneFrames = 0;
  const started = Date.now();
  const tick = () => {
    doneFrames++;
    if (doneFrames % 30 === 0 || doneFrames === total) {
      const el = (Date.now() - started) / 1000;
      process.stdout.write(`\r  ${name}: ${doneFrames}/${total} Frames (${el.toFixed(0)} s)   `);
    }
  };
  const segs = [];
  const jobs = [];
  for (let i = 0; i < WORKERS; i++) {
    const f0 = i * per;
    const f1 = Math.min(total, f0 + per);
    if (f0 >= f1) break;
    const seg = path.join(tmp, `seg-${String(i).padStart(2, '0')}.mkv`);
    segs.push(seg);
    jobs.push(renderSegment(url, f0, f1, seg, tick));
  }
  await Promise.all(jobs);
  process.stdout.write('\n');

  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
  const out = path.join(OUT, `${comp.file}-ohne-ton.mp4`);
  const final = ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', list,
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-tune', 'animation', '-profile:v', 'high',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', '30', '-movflags', '+faststart', out,
  ]);
  await final.done;
  fs.rmSync(tmp, { recursive: true, force: true });

  // Poster = static end card
  const poster = await openPage(url);
  fs.writeFileSync(path.join(OUT, `${comp.file}-poster.png`), await poster.capture(poster.duration - 0.5));
  await poster.browser.close();
  console.log(`  → ${path.relative(ROOT, out)}`);
  await mux(name);
}

// Tonspur (sound/sounddesign.py → out/sound/<name>.wav) unter das stumme Video legen
async function mux(name) {
  const comp = COMPOSITIONS[name];
  const silent = path.join(OUT, `${comp.file}-ohne-ton.mp4`);
  const wav = path.join(OUT, 'sound', `${name}.wav`);
  if (!fs.existsSync(wav)) { console.log(`  (keine Tonspur ${path.relative(ROOT, wav)} — nur stumme Fassung)`); return; }
  const out = path.join(OUT, `${comp.file}.mp4`);
  await ffmpeg(['-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', '-movflags', '+faststart', out]).done;
  console.log(`  → ${path.relative(ROOT, out)} (mit Sounddesign)`);
}

async function renderStills(name, base, times) {
  const comp = COMPOSITIONS[name];
  const dir = path.join(OUT, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  const { browser, capture } = await openPage(`${base}/${comp.page}?render`);
  for (const t of times) {
    const file = path.join(dir, `${name}-${t.toFixed(2)}.png`);
    fs.writeFileSync(file, await capture(t));
    console.log('  ', path.relative(ROOT, file));
  }
  await browser.close();
}

const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
fs.mkdirSync(OUT, { recursive: true });
try {
  for (const name of targets) {
    if (!COMPOSITIONS[name]) throw new Error(`Unbekannte Komposition: ${name}`);
    if (STILLS) await renderStills(name, base, STILLS.split(',').map(Number));
    else if (args.includes('--mux')) await mux(name);
    else {
      console.log(`Rendere ${name} (Motion-Blur ${MB}×, ${WORKERS} Worker)…`);
      await renderVideo(name, base);
    }
  }
} finally {
  server.close();
}
