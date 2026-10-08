// Kopiert die Drittbibliotheken (GSAP, Lenis) nach assets/vendor. Schriften und Logo liegen bereits in assets/.
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const A = path.join(root, 'assets');
const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  console.log('  ', path.relative(root, to));
};

for (const f of ['gsap', 'ScrollTrigger', 'SplitText', 'DrawSVGPlugin']) {
  copy(path.join(root, `node_modules/gsap/dist/${f}.min.js`), path.join(A, `vendor/${f}.min.js`));
}
copy(path.join(root, 'node_modules/lenis/dist/lenis.min.js'), path.join(A, 'vendor/lenis.min.js'));
