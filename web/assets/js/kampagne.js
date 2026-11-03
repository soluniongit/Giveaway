/*
 * Gemeinsames Seitenskript für weitere Gewinnspielseiten (steuern/, buergenstock/):
 * Hero-Intro, schwebende Bühne mit 3D-Neigung, Ticker, Schritte, Zähler und gemeinsames Verhalten aus core.js.
 * Der Kampagnen-Slug steht im <body data-slug="…">.
 */
import { boot, reduced, finePointer, $, $$ } from './core.js';

const { gsap, ScrollTrigger } = window;
const SLUG = document.body.dataset.slug;

function heroIntro() {
  if (reduced) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('.hero-title .line-mask > span', { yPercent: 115, duration: 1.3, stagger: 0.1 }, 0.1)
    .from('[data-hero] [data-intro]', { opacity: 0, y: 26, duration: 1.1, stagger: 0.08 }, 0.45)
    .from('[data-art]', { y: (i) => 90 + i * 30, rotation: (i) => (i % 2 ? 14 : -14), opacity: 0, duration: 1.5, stagger: 0.14 }, 0.25)
    .from('.stage-ring', { scale: 0.6, opacity: 0, duration: 1.6, stagger: 0.12 }, 0.1)
    .from('.hero-scene', { opacity: 0, y: 40, duration: 1.8, ease: 'power2.out' }, 0);
  // Stempel / Siegel knallt nach dem Intro drauf
  $$('[data-stamp]').forEach((el, i) => tl.from(el, { scale: 2.4, opacity: 0, rotation: -30, duration: 0.5, ease: 'back.out(2.2)' }, 1.15 + i * 0.25));
  $$('[data-strike]').forEach((el) => tl.from(el, { scaleX: 0, transformOrigin: '0 50%', duration: 0.4, ease: 'power2.out' }, 1.0));
}

/** Bühne schwebt leicht und neigt sich zum Mauszeiger; beim Scrollen gleitet sie langsamer weg. */
function stage() {
  const tiltEl = $('[data-tilt]');
  if (!tiltEl || reduced) return;
  $$('[data-float]').forEach((el, i) => gsap.to(el, { y: i % 2 ? 12 : -16, rotation: `+=${i % 2 ? -2 : 2}`, duration: 3 + i * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 }));
  if (finePointer) {
    const rx = gsap.quickTo(tiltEl, 'rotationX', { duration: 0.9, ease: 'power3' });
    const ry = gsap.quickTo(tiltEl, 'rotationY', { duration: 0.9, ease: 'power3' });
    addEventListener('pointermove', (e) => {
      ry((e.clientX / innerWidth - 0.5) * 20);
      rx(-(e.clientY / innerHeight - 0.5) * 12);
    }, { passive: true });
  }
  gsap.to('[data-stage]', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero-sun', { yPercent: -30, scale: 1.1, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });
}

/** Endlos-Ticker; schneller beim Scrollen. */
function ticker() {
  const track = $('[data-ticker]');
  if (!track || reduced) return;
  const loop = gsap.to(track, { xPercent: -50, duration: 24, ease: 'none', repeat: -1 });
  ScrollTrigger.create({
    trigger: '.ticker', start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => {
      gsap.to(loop, { timeScale: 1 + Math.min(4, Math.abs(self.getVelocity()) / 400), duration: 0.2, overwrite: true });
      gsap.to(loop, { timeScale: 1, duration: 1.2, delay: 0.2, overwrite: false });
    },
  });
}

/** Schritte leuchten nacheinander auf; Kacheln neigen sich zum Mauszeiger. */
function steps() {
  $$('[data-steps] .step').forEach((el, i) => {
    ScrollTrigger.create({ trigger: el, start: 'top 75%', once: true, onEnter: () => setTimeout(() => el.classList.add('is-on'), reduced ? 0 : i * 180) });
  });
  if (reduced || !finePointer) return;
  $$('.bento .tile').forEach((tile) => {
    const rx = gsap.quickTo(tile, 'rotationX', { duration: 0.6, ease: 'power3' });
    const ry = gsap.quickTo(tile, 'rotationY', { duration: 0.6, ease: 'power3' });
    gsap.set(tile, { transformPerspective: 900 });
    tile.addEventListener('pointermove', (e) => {
      const r = tile.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * 8);
      rx(-((e.clientY - r.top) / r.height - 0.5) * 8);
    });
    tile.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

/** Zahlen zählen hoch, sobald sie sichtbar werden: <span data-count="1000" data-prefix="CHF ">. */
function counters() {
  const fmt = (n) => new Intl.NumberFormat('de-CH').format(n).replace(/[’']/g, '\'');
  $$('[data-count]').forEach((el) => {
    const to = +el.dataset.count;
    const pre = el.dataset.prefix || '';
    const post = el.dataset.suffix || '';
    el.textContent = pre + fmt(to) + post;
    if (reduced) return;
    const o = { v: 0 };
    ScrollTrigger.create({
      trigger: el, start: 'top 88%', once: true,
      onEnter: () => gsap.to(o, { v: to, duration: 1.6, ease: 'power3.out', onUpdate: () => { el.textContent = pre + fmt(Math.round(o.v)) + post; } }),
    });
    el.textContent = pre + fmt(0) + post;
  });
}

heroIntro();
stage();
ticker();
steps();
counters();
boot({ slug: SLUG });
