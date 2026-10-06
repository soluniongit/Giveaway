/*
 * Gemeinsames Verhalten beider Gewinnspielseiten:
 * Smooth Scroll, Header, Reveal-/Text-Animationen, magnetische Buttons, Akkordeons,
 * Video-Autoplay, Kampagnenstatus (Laufzeit, Phase, Countdown), Teilnahmeformular, Tracking.
 * Benötigt global: gsap, ScrollTrigger, SplitText, Lenis (siehe <script>-Tags der Seiten).
 */
import { DEMO, getCampaign, submitEntry, source, track } from './api.js';

const { gsap, ScrollTrigger, SplitText } = window;
gsap.registerPlugin(ScrollTrigger, SplitText);
if (window.DrawSVGPlugin) gsap.registerPlugin(window.DrawSVGPlugin);

export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const chf = (v, digits = 0) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let lenis = null;
export const scrollTo = (target, offset = -90) => {
  const el = typeof target === 'string' ? $(target) : target;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.4 });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
};

function smoothScroll() {
  if (reduced || !window.Lenis) return;
  lenis = new window.Lenis({ duration: 1.15, easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

function anchors() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').length < 2) return;
    const el = $(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    scrollTo(el);
    history.replaceState(null, '', a.getAttribute('href'));
  });
}

function header() {
  const h = $('.site-header');
  if (!h) return;
  let last = 0;
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      h.classList.toggle('is-scrolled', y > 24);
      h.classList.toggle('is-hidden', y > 600 && y > last + 4);
      if (y < last - 4) h.classList.remove('is-hidden');
      last = y;
    },
  });
}

function glow() {
  const g = $('.glow');
  if (!g || !finePointer || reduced) return;
  const x = gsap.quickTo(g, 'x', { duration: 0.9, ease: 'power3' });
  const y = gsap.quickTo(g, 'y', { duration: 0.9, ease: 'power3' });
  addEventListener('pointermove', (e) => { g.classList.add('is-on'); x(e.clientX); y(e.clientY); }, { passive: true });
}

/** Buttons ziehen sich leicht zum Mauszeiger. */
function magnetic() {
  if (!finePointer || reduced) return;
  $$('[data-magnetic]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3' });
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.25);
      y((e.clientY - r.top - r.height / 2) * 0.35);
    });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });
}

/** Text-Reveal: [data-split] zeilenweise maskiert; [data-reveal] blendet weich ein. */
export function splitReveal(el, opts = {}) {
  const split = SplitText.create(el, { type: 'lines,words', mask: 'lines', linesClass: 'ln', wordsClass: 'w' });
  // background-clip:text greift nicht über die gesplitteten Wörter hinweg → Gold-Verlauf je Wort setzen
  $$('.gold', el).forEach((g) => {
    if (g.classList.contains('w')) return;
    $$('.w', g).forEach((w) => w.classList.add('gold'));
    g.classList.remove('gold');
  });
  // nach dem Reveal zurück zum ursprünglichen Markup, damit der Text bei Resize normal umbricht
  return gsap.from(split.lines, { yPercent: 110, duration: 1.2, ease: 'expo.out', stagger: 0.08, onComplete: () => split.revert(), ...opts });
}

function reveals() {
  if (reduced) return;
  $$('[data-split]').forEach((el) => {
    if (el.closest('[data-hero]')) return; // hero runs its own intro
    const tw = splitReveal(el, { paused: true });
    ScrollTrigger.create({ trigger: el, start: 'top 88%', once: true, onEnter: () => tw.play() });
  });
  ScrollTrigger.batch('[data-reveal]', {
    start: 'top 90%',
    once: true,
    onEnter: (els) => gsap.to(els, { opacity: 1, y: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, overwrite: true }),
  });
}

/** Akkordeon mit weicher Höhenanimation. */
export function accordion(root = document) {
  $$('.acc-btn', root).forEach((btn) => {
    if (btn.dataset.ready) return;
    btn.dataset.ready = '1';
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      gsap.to(panel, { height: open ? 0 : 'auto', duration: reduced ? 0 : 0.6, ease: 'expo.out', onComplete: () => ScrollTrigger.refresh() });
    });
  });
}

function renderAccordion(container, items, prefix, titleKey, bodyKey) {
  container.innerHTML = items.map((it, i) => `
    <div class="acc-item">
      <h3><button class="acc-btn" type="button" aria-expanded="false" aria-controls="${prefix}-${i}">
        <span>${escapeHtml(it[titleKey])}</span><span class="pm" aria-hidden="true"></span></button></h3>
      <div class="acc-panel" id="${prefix}-${i}" role="region"><div class="in">${escapeHtml(it[bodyKey])}</div></div>
    </div>`).join('');
  accordion(container);
}

function videos(slug) {
  $$('.video-frame').forEach((frame) => {
    const v = $('video', frame);
    let tracked = false;
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        v.play().catch(() => {});
        if (!tracked) { tracked = true; track(slug, 'video_play'); }
      } else v.pause();
    }, { threshold: 0.35 }).observe(frame);
    $('.replay', frame)?.addEventListener('click', () => { v.currentTime = 0; v.play().catch(() => {}); });
    const snd = $('.sound', frame);
    snd?.addEventListener('click', () => {
      v.muted = !v.muted;
      snd.setAttribute('aria-pressed', String(!v.muted));
      snd.setAttribute('aria-label', v.muted ? 'Ton einschalten' : 'Ton ausschalten');
      if (!v.muted) { v.currentTime = 0; v.play().catch(() => {}); }
    });
  });
}

// ---------------------------------------------------------------- Kampagnenstatus
const PHASE_TEXT = {
  upcoming: (c) => `Start am ${c.starts_at_label}`,
  open: (c) => `Teilnahme offen bis ${c.ends_at_label}`,
  closed: () => 'Teilnahme beendet',
};

function countdown(c, phase) {
  const box = $('[data-countdown]');
  if (!box) return;
  const end = Date.parse(c.ends_at);
  // Konzept: kein künstlicher Countdown — nur in der echten Schlussphase (letzte 7 Tage)
  if (phase !== 'open' || end - Date.now() > 7 * 864e5) { box.hidden = true; return; }
  box.hidden = false;
  const vals = $$('.v', box);
  const tick = () => {
    const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
    [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
      .forEach((n, i) => { vals[i].textContent = String(n).padStart(2, '0'); });
  };
  tick();
  setInterval(tick, 1000);
}

function applyCampaign(data) {
  const c = data.campaign;
  $$('[data-bind]').forEach((el) => {
    const v = el.dataset.bind.split('.').reduce((o, k) => (o ? o[k] : undefined), { campaign: c, phase: data.phase });
    if (v !== undefined && v !== null) el.textContent = v;
  });
  $$('[data-phase-text]').forEach((el) => { el.textContent = PHASE_TEXT[data.phase](c); });
  $$('.status-chip').forEach((el) => { el.dataset.phase = data.phase; });
  document.documentElement.dataset.phase = data.phase;
  countdown(c, data.phase);

  const content = data.page?.content;
  if (content?.faq?.length && $('[data-faq]')) renderAccordion($('[data-faq]'), content.faq, 'faq', 'q', 'a');
  if (content?.terms?.length && $('[data-terms]')) renderAccordion($('[data-terms]'), content.terms, 'terms', 'title', 'text');
}

// ---------------------------------------------------------------- Formular
const ERRORS = {
  invalid_name: ['first_name', 'Bitte gib deinen Vor- und Nachnamen an.'],
  invalid_email: ['email', 'Bitte prüfe deine E-Mail-Adresse.'],
  invalid_postal_code: ['postal_code', 'Bitte gib eine Schweizer PLZ (4 Ziffern) an.'],
  invalid_canton: ['canton', 'Teilnahme nur mit Wohnsitz in ZH, SZ, ZG oder SG.'],
  consent_required: ['consent_terms', 'Bitte bestätige die Teilnahmebedingungen.'],
  invalid_pool: ['pool', 'Bitte wähle einen Anbieter bzw. Gewinn.'],
  too_fast: [null, 'Bitte nimm dir einen kurzen Moment und sende das Formular erneut.'],
  rate_limited: [null, 'Zu viele Versuche. Bitte versuche es später noch einmal.'],
  closed: [null, 'Die Teilnahmefrist ist abgelaufen.'],
  not_started: [null, 'Die Teilnahme ist noch nicht geöffnet.'],
  not_found: [null, 'Dieses Gewinnspiel ist derzeit nicht verfügbar.'],
};

function validate(form, requirePool) {
  const v = Object.fromEntries(new FormData(form));
  const errs = {};
  if (!v.first_name?.trim()) errs.first_name = 'Bitte gib deinen Vornamen an.';
  if (!v.last_name?.trim()) errs.last_name = 'Bitte gib deinen Nachnamen an.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test((v.email || '').trim())) errs.email = 'Bitte prüfe deine E-Mail-Adresse.';
  if (!/^[1-9]\d{3}$/.test((v.postal_code || '').trim())) errs.postal_code = 'Bitte gib eine Schweizer PLZ (4 Ziffern) an.';
  if (!['ZH', 'SZ', 'ZG', 'SG'].includes(v.canton)) errs.canton = 'Bitte wähle deinen Wohnkanton.';
  if (!v.consent_terms) errs.consent_terms = 'Bitte bestätige die Teilnahmebedingungen.';
  if (requirePool && !v.pool) errs.pool = 'Bitte wähle einen Anbieter bzw. Gewinn.';
  return { v, errs };
}

function showErrors(form, errs) {
  $$('.has-error', form).forEach((el) => el.classList.remove('has-error'));
  $$('[data-err]', form).forEach((el) => { el.textContent = ''; });
  Object.entries(errs).forEach(([k, msg]) => {
    const wrap = $(`[data-field="${k}"]`, form);
    if (wrap) wrap.classList.add('has-error');
    const out = $(`[data-err="${k}"]`, form);
    if (out) out.textContent = msg;
  });
  const first = Object.keys(errs)[0];
  if (first) form.querySelector(`[name="${first}"]`)?.focus({ preventScroll: true });
}

function entryForm(slug, getPhase, requirePool) {
  const form = $('form[data-entry-form]');
  if (!form) return;
  const msg = $('[data-form-msg]', form);
  const btn = $('button[type="submit"]', form);
  let started = null;
  form.addEventListener('input', () => {
    if (!started) { started = new Date().toISOString(); track(slug, 'form_started'); }
  });
  if (DEMO) $$('[data-demo-only]').forEach((el) => { el.hidden = false; });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.textContent = '';
    msg.classList.remove('is-error');
    if (getPhase() !== 'open') {
      msg.textContent = getPhase() === 'upcoming' ? 'Die Teilnahme ist noch nicht geöffnet.' : 'Die Teilnahmefrist ist abgelaufen.';
      msg.classList.add('is-error');
      return;
    }
    const { v, errs } = validate(form, requirePool);
    showErrors(form, errs);
    if (Object.keys(errs).length) return;

    btn.disabled = true;
    const label = $('.label', btn);
    const oldLabel = label.textContent;
    label.textContent = 'Wird gesendet …';
    try {
      const res = await submitEntry(slug, {
        first_name: v.first_name.trim(), last_name: v.last_name.trim(), email: v.email.trim(),
        postal_code: v.postal_code.trim(), canton: v.canton,
        consent_terms: !!v.consent_terms, marketing_opt_in: !!v.marketing_opt_in,
        pool: v.pool || null, source: source(), form_started_at: started, website: v.website,
      });
      if (res.ok) {
        track(slug, 'form_submitted');
        success(form);
      } else {
        const [field, text] = ERRORS[res.error] || [null, 'Das hat nicht geklappt. Bitte versuche es erneut.'];
        if (field) showErrors(form, { [field]: text });
        else { msg.textContent = text; msg.classList.add('is-error'); }
      }
    } catch (err) {
      msg.textContent = 'Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es erneut.';
      msg.classList.add('is-error');
    } finally {
      btn.disabled = false;
      label.textContent = oldLabel;
    }
  });
}

function success(form) {
  const panel = $('[data-success]');
  const fields = $('[data-form-fields]', form);
  gsap.to(fields, {
    opacity: 0, y: -20, duration: reduced ? 0 : 0.45, ease: 'power2.in',
    onComplete: () => {
      fields.hidden = true;
      panel.classList.add('is-visible');
      if (!reduced) {
        const tl = gsap.timeline();
        tl.from(panel.children, { opacity: 0, y: 30, duration: 1, ease: 'expo.out', stagger: 0.08 });
        tl.from($$('.env-flap, .env-check', panel), { drawSVG: '0%', duration: 0.9, ease: 'power2.inOut', stagger: 0.25 }, 0.2);
      }
      ScrollTrigger.refresh();
      scrollTo(panel, -140);
    },
  });
}

// ---------------------------------------------------------------- Teilen
function share(slug) {
  $$('[data-share]').forEach((btn) => btn.addEventListener('click', async () => {
    const url = location.origin + location.pathname;
    track(slug, 'share_click');
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else {
        await navigator.clipboard.writeText(url);
        const t = btn.querySelector('.label') || btn;
        const old = t.textContent;
        t.textContent = 'Link kopiert';
        setTimeout(() => { t.textContent = old; }, 1800);
      }
    } catch (e) { /* abgebrochen */ }
  }));
}

// ---------------------------------------------------------------- Boot
export async function boot({ slug, requirePool = false }) {
  document.documentElement.classList.add('js');
  smoothScroll();
  anchors();
  header();
  glow();
  magnetic();
  reveals();
  accordion();
  videos(slug);
  share(slug);
  source();

  let phase = 'upcoming';
  entryForm(slug, () => phase, requirePool);
  track(slug, 'page_view');

  let data;
  try {
    data = await getCampaign(slug);
  } catch (e) {
    data = null;
  }
  if (data?.ok) {
    phase = data.phase;
    applyCampaign(data);
    const form = $('form[data-entry-form]');
    if (form) {
      form.dataset.phase = phase;
      const closed = $('[data-form-closed]');
      if (closed) {
        closed.hidden = phase === 'open';
        closed.textContent = phase === 'upcoming'
          ? `Die Teilnahme ist vom ${data.campaign.starts_at_label} bis ${data.campaign.ends_at_label} möglich. Schau dann wieder vorbei!`
          : 'Die Teilnahmefrist ist abgelaufen. Danke fürs Interesse!';
      }
      $$('[data-form-fields] input, [data-form-fields] select, [data-form-fields] button').forEach((el) => { el.disabled = phase !== 'open'; });
    }
  }
  ScrollTrigger.refresh();
  return data;
}

export { track, DEMO };
