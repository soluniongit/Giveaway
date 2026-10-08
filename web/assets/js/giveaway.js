/*
 * Giveaway PS5 Pro + GTA VI: Hero-Intro, 3D-Neigung der Konsole, Ticker, Schritte,
 * Instagram-Einbettung (erst nach Klick, Datenschutz) und gemeinsames Verhalten aus core.js.
 */
import { boot, reduced, finePointer, $, $$, track } from './core.js';

const { gsap, ScrollTrigger } = window;
const SLUG = 'ps5-gta6-2026';

function heroIntro() {
  if (reduced) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from('.hero-title .line-mask > span', { yPercent: 115, duration: 1.3, stagger: 0.1 }, 0.1)
    .from('[data-hero] [data-intro]', { opacity: 0, y: 26, duration: 1.1, stagger: 0.08 }, 0.45)
    .from('.prod-ps5', { y: 120, opacity: 0, duration: 1.6 }, 0.2)
    .from('[data-case]', { x: -80, y: 60, rotation: -24, opacity: 0, duration: 1.5 }, 0.45)
    .from('.stage-ring', { scale: 0.6, opacity: 0, duration: 1.6, stagger: 0.12 }, 0.1)
    .from('.hero-grid-lines', { opacity: 0, duration: 1.6, ease: 'power2.out' }, 0);
}

/** Konsole schwebt leicht und neigt sich zum Mauszeiger; beim Scrollen gleitet die Bühne langsamer weg. */
function stage() {
  const tiltEl = $('[data-tilt]');
  if (!tiltEl || reduced) return;
  gsap.to('[data-float]', { y: -16, duration: 3.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.to('[data-case]', { rotation: -6, duration: 4.2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  if (finePointer) {
    const rx = gsap.quickTo(tiltEl, 'rotationX', { duration: 0.9, ease: 'power3' });
    const ry = gsap.quickTo(tiltEl, 'rotationY', { duration: 0.9, ease: 'power3' });
    addEventListener('pointermove', (e) => {
      const x = e.clientX / innerWidth - 0.5;
      const y = e.clientY / innerHeight - 0.5;
      ry(x * 22);
      rx(-y * 14);
    }, { passive: true });
  }
  gsap.to('[data-stage]', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });
  gsap.to('.hero-sun', { yPercent: -30, scale: 1.1, ease: 'none', scrollTrigger: { trigger: '[data-hero]', start: 'top top', end: 'bottom top', scrub: true } });
}

/** Endlos-Ticker; schneller beim Scrollen. */
function ticker() {
  const track = $('[data-ticker]');
  if (!track || reduced) return;
  const loop = gsap.to(track, { xPercent: -50, duration: 22, ease: 'none', repeat: -1 });
  let boost = 0;
  ScrollTrigger.create({
    trigger: '.ticker', start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => {
      boost = Math.min(4, Math.abs(self.getVelocity()) / 400);
      gsap.to(loop, { timeScale: 1 + boost, duration: 0.2, overwrite: true });
      gsap.to(loop, { timeScale: 1, duration: 1.2, delay: 0.2, overwrite: false });
    },
  });
}

/** Schritte leuchten der Reihe nach auf, sobald sie in den Blick kommen. */
function steps() {
  $$('[data-steps] .step').forEach((el, i) => {
    ScrollTrigger.create({ trigger: el, start: 'top 75%', once: true, onEnter: () => setTimeout(() => el.classList.add('is-on'), reduced ? 0 : i * 180) });
  });
  if (reduced) return;
  $$('.bento .tile').forEach((tile) => {
    if (!finePointer) return;
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

// ---------------------------------------------------------------- Instagram
const IG_RE = /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/([A-Za-z0-9_-]+)\/?/;
let igScript = null;
function loadEmbedScript() {
  if (window.instgrm) return Promise.resolve();
  if (!igScript) {
    igScript = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.instagram.com/embed.js';
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }
  return igScript;
}

function instagram() {
  const cfg = window.ALLNOVA_CONFIG || {};
  const profile = cfg.instagramProfileUrl || 'https://www.instagram.com/allnova.ch/';
  $$('[data-ig-profile]').forEach((a) => {
    a.href = profile;
    a.addEventListener('click', () => track(SLUG, 'instagram_click'));
  });
  const m = (cfg.instagramPostUrl || '').trim().match(IG_RE);
  if (!m) return; // kein (gültiger) Link → Platzhalter «Beitrag ist bald live»
  const permalink = `https://www.instagram.com/${m[2]}/${m[3]}/`;
  const pending = $('[data-ig-pending]');
  const consent = $('[data-ig-consent]');
  const embed = $('[data-ig-embed]');
  pending.hidden = true;
  consent.hidden = false;
  $('[data-ig-direct]').href = permalink;
  $('[data-ig-direct]').addEventListener('click', () => track(SLUG, 'instagram_click'));

  const load = (byClick) => {
    consent.hidden = true;
    embed.hidden = false;
    embed.innerHTML = `<blockquote class="instagram-media" data-instgrm-permalink="${permalink}?utm_source=ig_embed" data-instgrm-version="14"><a href="${permalink}" target="_blank" rel="noopener">Beitrag auf Instagram ansehen</a></blockquote>`;
    loadEmbedScript().then(() => window.instgrm?.Embeds.process()).catch(() => {
      embed.innerHTML = `<div class="ig-state"><p class="small">Instagram konnte nicht geladen werden.</p><a class="btn btn--ghost btn--sm" href="${permalink}" target="_blank" rel="noopener"><span class="label">Auf Instagram öffnen</span></a></div>`;
    });
    new ResizeObserver(() => ScrollTrigger.refresh()).observe(embed);
    if (byClick) {
      track(SLUG, 'instagram_embed_load');
      try { localStorage.setItem('allnova_ig_consent', '1'); } catch (e) { /* storage blocked */ }
    }
  };
  $('[data-ig-load]').addEventListener('click', () => load(true));
  // einmal zugestimmt → beim nächsten Besuch direkt laden (nur in diesem Browser gemerkt)
  try { if (localStorage.getItem('allnova_ig_consent') === '1') load(false); } catch (e) { /* storage blocked */ }
}

heroIntro();
stage();
ticker();
steps();
instagram();
boot({ slug: SLUG });
