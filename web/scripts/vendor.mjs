// Copies third-party libraries, fonts, the logo and the rendered videos into gewinnen/assets.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const A = path.join(root, 'gewinnen/assets');
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('  ', path.relative(root, to));
};

for (const f of ['gsap', 'ScrollTrigger', 'SplitText', 'DrawSVGPlugin', 'MotionPathPlugin', 'Draggable', 'InertiaPlugin', 'ScrollToPlugin']) {
  copy(path.join(root, `node_modules/gsap/dist/${f}.min.js`), path.join(A, `vendor/${f}.min.js`));
}
copy(path.join(root, 'node_modules/lenis/dist/lenis.min.js'), path.join(A, 'vendor/lenis.min.js'));

// Videos (Schriften, Logo, Master-MP4s) liegen im Repository soluniongit/Video-Giveaway.
// Standard: Klon «Video-Giveaway» neben diesem Repository; sonst VIDEOS_DIR=/pfad/zu/Video-Giveaway/videos
const videos = process.env.VIDEOS_DIR ? path.resolve(process.env.VIDEOS_DIR) : path.join(root, '../../Video-Giveaway/videos');
if (!fs.existsSync(path.join(videos, 'out'))) {
  console.error(`Video-Ordner nicht gefunden: ${videos}\nRepository soluniongit/Video-Giveaway klonen oder VIDEOS_DIR setzen.`);
  process.exit(1);
}
for (const f of fs.readdirSync(path.join(videos, 'assets/fonts'))) copy(path.join(videos, 'assets/fonts', f), path.join(A, 'fonts', f));
copy(path.join(videos, 'assets/brand/allnova-logo.png'), path.join(A, 'brand/allnova-logo.png'));
// Web versions: 720 × 1280 WebM/VP9 + H.264 (the 1080 × 1920 masters stay in videos/out) + JPEG posters
fs.mkdirSync(path.join(A, 'video'), { recursive: true });
for (const f of fs.readdirSync(path.join(videos, 'out')).filter((f) => f.endsWith('.mp4') && !f.includes('-ohne-ton'))) {
  const src = path.join(videos, 'out', f);
  const base = f.replace(/\.mp4$/, '');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=720:-2:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', path.join(A, 'video', f)]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=720:-2:flags=lanczos', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34',
    '-deadline', 'good', '-cpu-used', '3', '-row-mt', '1', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '96k', path.join(A, 'video', `${base}.webm`)]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path.join(videos, 'out', `${base}-poster.png`), '-vf', 'scale=720:-2:flags=lanczos', '-q:v', '3', path.join(A, 'video', `${base}-poster.jpg`)]);
  console.log('   video', f);
}
