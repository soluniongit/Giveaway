/*
 * Gemeinsames Verhalten der Gewinnspielseiten:
 * Smooth Scroll, Header, Reveal-/Text-Animationen, magnetische Buttons, Akkordeons,
 * Video-Autoplay, Kampagnenstatus (Laufzeit, Phase, Countdown), Teilnahmeformular, Tracking.
 * Benötigt global: gsap, ScrollTrigger, SplitText, Lenis (siehe <script>-Tags der Seiten).
 */
import { DEMO, getCampaign, submitEntry, smsStart, smsCheck, source, referral, track } from './api.js';

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

function mobileNav() {
  const h = $('.site-header');
  const nav = $('.nav', h || document);
  if (!h || !nav) return;
  const links = $$('a[href^="#"]:not(.btn)', nav);
  const panel = document.createElement('div');
  panel.className = 'nav-panel';
  panel.id = 'nav-panel';
  panel.innerHTML = links.map((a) => `<a href="${a.getAttribute('href')}">${a.textContent}</a>`).join('');
  const btn = document.createElement('button');
  btn.className = 'nav-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Menü öffnen');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-controls', 'nav-panel');
  btn.innerHTML = '<i></i><i></i><i></i>';
  nav.appendChild(btn);
  h.appendChild(panel);
  const set = (open) => {
    h.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Menü schliessen' : 'Menü öffnen');
  };
  btn.addEventListener('click', () => set(!h.classList.contains('nav-open')));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
}

function header() {
  const h = $('.site-header');
  if (!h) return;
  // Runter scrollen → ausblenden; erst bei bewusstem Hochscrollen (> 60 px am Stück) wieder einblenden
  let last = scrollY;
  let upRun = 0;
  let scrolled = null;
  let hidden = false;
  const onScroll = () => {
    if (ScrollTrigger.isRefreshing) { last = scrollY; return; }
    const y = scrollY;
    const dy = y - last;
    last = y;
    const s = y > 24;
    if (s !== scrolled) { scrolled = s; h.classList.toggle('is-scrolled', s); }
    if (h.classList.contains('nav-open')) return;
    let hide = hidden;
    if (y < 120) { hide = false; upRun = 0; }
    else if (dy > 0) { upRun = 0; if (y > 240) hide = true; }
    else if (dy < 0) { upRun -= dy; if (upRun > 60) hide = false; }
    if (hide !== hidden) { hidden = hide; h.classList.toggle('is-hidden', hide); }
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
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

// Mehrere Layout-Änderungen kurz hintereinander → nur ein ScrollTrigger.refresh
let refreshTimer = 0;
const refreshSoon = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150); };

/** Akkordeon mit weicher Höhenanimation. */
export function accordion(root = document) {
  $$('.acc-btn', root).forEach((btn) => {
    if (btn.dataset.ready) return;
    btn.dataset.ready = '1';
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      gsap.to(panel, { height: open ? 0 : 'auto', duration: reduced ? 0 : 0.55, ease: 'expo.out', onComplete: refreshSoon });
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
  const end = Date.parse(c.ends_at);
  $$('[data-countdown]').forEach((box) => {
    // Standard: nur in der echten Schlussphase (letzte 7 Tage); data-countdown="always" → während der ganzen Laufzeit
    const always = box.dataset.countdown === 'always';
    if (phase !== 'open' || (!always && end - Date.now() > 7 * 864e5)) { box.hidden = true; return; }
    box.hidden = false;
    const vals = $$('.v', box);
    const tick = () => {
      const s = Math.max(0, Math.floor((end - Date.now()) / 1000));
      [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60]
        .forEach((n, i) => { if (vals[i]) vals[i].textContent = String(n).padStart(2, '0'); });
    };
    tick();
    setInterval(tick, 1000);
  });
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
  invalid_canton: ['canton', 'Teilnahme nur mit Wohnsitz in einem zugelassenen Kanton.'],
  invalid_instagram: ['instagram', 'Bitte prüfe deinen Instagram-Namen (nur Buchstaben, Zahlen, Punkt und Unterstrich).'],
  invalid_phone: ['phone', 'Bitte gib eine gültige Telefonnummer an, z. B. 079 123 45 67.'],
  invalid_birth_date: ['birth_date', 'Bitte gib dein Geburtsdatum an.'],
  too_young: ['birth_date', 'Teilnahme ab 18 Jahren.'],
  consent_required: ['consent_terms', 'Bitte bestätige die Teilnahmebedingungen.'],
  invalid_pool: ['pool', 'Bitte wähle einen Anbieter bzw. Gewinn.'],
  too_fast: [null, 'Bitte nimm dir einen kurzen Moment und sende das Formular erneut.'],
  rate_limited: [null, 'Zu viele Versuche. Bitte versuche es später noch einmal.'],
  closed: [null, 'Die Teilnahmefrist ist abgelaufen.'],
  not_started: [null, 'Die Teilnahme ist noch nicht geöffnet.'],
  not_found: [null, 'Dieses Gewinnspiel ist derzeit nicht verfügbar.'],
  phone_not_verified: ['phone', 'Bitte bestätige deine Handynummer mit dem SMS-Code.'],
  phone_in_use: ['phone', 'Diese Handynummer wird bereits für eine andere Teilnahme verwendet.'],
};

// Meldungen der SMS-Bestätigung (Edge Function sms-verify)
const SMS_ERRORS = {
  invalid_phone: 'Bitte gib eine gültige Handynummer an, z. B. 079 123 45 67.',
  phone_not_mobile: 'Bitte gib eine Schweizer Handynummer an (074 bis 079).',
  rate_limited: 'Zu viele Codes angefordert. Bitte versuche es in 15 Minuten noch einmal.',
  busy: 'Gerade sind sehr viele Anfragen unterwegs. Bitte versuche es in ein paar Minuten noch einmal.',
  blocked: 'An diese Nummer können wir leider keine SMS senden.',
  sms_failed: 'Die SMS konnte nicht gesendet werden. Bitte prüfe die Nummer und versuche es erneut.',
  invalid_code: 'Der Code stimmt nicht. Bitte prüfe die SMS.',
  code_expired: 'Der Code ist abgelaufen. Bitte fordere einen neuen an.',
  closed: 'Die Teilnahmefrist ist abgelaufen.',
  not_started: 'Die Teilnahme ist noch nicht geöffnet.',
  not_found: 'Dieses Gewinnspiel ist derzeit nicht verfügbar.',
};

/**
 * SMS-Bestätigung der Handynummer: «Code per SMS senden» → Code eingeben → Einmal-Token für submit_entry.
 * Wird erst aktiv, wenn das Gewinnspiel es verlangt (campaign.requires_phone_verification).
 */
function smsVerify(form, slug) {
  const field = $('[data-field="phone"]', form);
  const input = form.elements.phone;
  const state = { required: false, token: null, phone: null, sentTo: null, timer: 0 };
  if (!field || !input) return { get required() { return false; }, token: () => null, phone: () => null, reset() {}, activate() {} };

  const box = document.createElement('div');
  box.className = 'sms';
  box.hidden = true;
  box.innerHTML = `
    <button type="button" class="sms-send" data-sms-send><span>Code per SMS senden</span></button>
    <div class="sms-code" data-sms-code hidden>
      <label for="f-sms">SMS-Code</label>
      <div class="sms-row">
        <input class="input" id="f-sms" name="sms_code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="6-stelliger Code">
        <button type="button" class="sms-check" data-sms-check>Bestätigen</button>
      </div>
      <button type="button" class="sms-resend" data-sms-resend disabled></button>
    </div>
    <p class="sms-ok" data-sms-ok hidden><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Handynummer bestätigt</span></p>
    <p class="sms-msg" data-sms-msg aria-live="polite"></p>`;
  field.insertBefore(box, $('[data-err="phone"]', field));
  const sendBtn = $('[data-sms-send]', box);
  const codeWrap = $('[data-sms-code]', box);
  const codeIn = $('#f-sms', box);
  const checkBtn = $('[data-sms-check]', box);
  const resend = $('[data-sms-resend]', box);
  const ok = $('[data-sms-ok]', box);
  const msg = $('[data-sms-msg]', box);
  const say = (text, isError = false) => { msg.textContent = text || ''; msg.classList.toggle('is-error', !!isError); };

  function cooldown(sec) {
    clearInterval(state.timer);
    let left = sec;
    const tick = () => {
      resend.disabled = left > 0;
      resend.textContent = left > 0 ? `Neuen Code senden (${left} s)` : 'Neuen Code senden';
      if (left-- <= 0) clearInterval(state.timer);
    };
    tick();
    state.timer = setInterval(tick, 1000);
  }

  function reset() {
    state.token = null; state.phone = null; state.sentTo = null;
    clearInterval(state.timer);
    codeWrap.hidden = true; ok.hidden = true; sendBtn.hidden = false; sendBtn.disabled = false;
    codeIn.value = '';
    field.classList.remove('is-verified');
    say('');
  }

  async function send() {
    const phone = normPhone(input.value);
    if (!phone) { showErrors(form, { phone: SMS_ERRORS.invalid_phone }); return; }
    showErrors(form, {});
    sendBtn.disabled = true; resend.disabled = true;
    say('SMS wird gesendet …');
    try {
      const r = await smsStart(slug, phone);
      if (!r.ok) { say(SMS_ERRORS[r.error] || SMS_ERRORS.sms_failed, true); sendBtn.disabled = false; resend.disabled = false; return; }
      state.sentTo = phone;
      sendBtn.hidden = true; codeWrap.hidden = false;
      say(r.demo ? 'Vorschau: Es wird keine SMS gesendet. Code 123456 eingeben.' : `Wir haben dir einen Code an ${input.value.trim()} gesendet.`);
      track(slug, 'sms_sent');
      cooldown(30);
      codeIn.focus({ preventScroll: true });
      refreshSoon();
    } catch (e) {
      say('Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es erneut.', true);
      sendBtn.disabled = false; resend.disabled = false;
    }
  }

  async function check() {
    const code = codeIn.value.replace(/\D/g, '');
    if (code.length < 4) { say('Bitte gib den Code aus der SMS ein.', true); codeIn.focus(); return; }
    checkBtn.disabled = true;
    say('Code wird geprüft …');
    try {
      const r = await smsCheck(slug, state.sentTo, code);
      if (!r.ok) { say(SMS_ERRORS[r.error] || SMS_ERRORS.invalid_code, true); return; }
      state.token = r.token; state.phone = state.sentTo;
      clearInterval(state.timer);
      codeWrap.hidden = true; ok.hidden = false;
      field.classList.add('is-verified');
      showErrors(form, {});
      say('');
      track(slug, 'sms_verified');
      refreshSoon();
    } catch (e) {
      say('Das hat nicht geklappt. Bitte prüfe deine Verbindung und versuche es erneut.', true);
    } finally {
      checkBtn.disabled = false;
    }
  }

  sendBtn.addEventListener('click', send);
  resend.addEventListener('click', send);
  checkBtn.addEventListener('click', check);
  codeIn.addEventListener('input', () => {
    codeIn.value = codeIn.value.replace(/\D/g, '').slice(0, 6);
    if (codeIn.value.length === 6) check();
  });
  codeIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && state.required && !state.token) { e.preventDefault(); send(); } });
  // Nummer geändert → neu bestätigen
  input.addEventListener('input', () => { if (state.sentTo && normPhone(input.value) !== state.sentTo) reset(); });

  return {
    get required() { return state.required; },
    token: () => state.token,
    phone: () => state.phone,
    reset,
    activate() {
      state.required = true;
      box.hidden = false;
      field.classList.add('field--full', 'has-sms');
      const help = $('label', field);
      if (help && !$('.opt', help)) help.insertAdjacentHTML('beforeend', ' <span class="opt">(Bestätigung per SMS)</span>');
    },
  };
}

/** Telefon wie in submit_entry normalisieren: 079 … / 0041 … / +41 (0)… → +41…; ungültig → null */
export function normPhone(raw) {
  let p = String(raw || '').replace(/[^0-9+]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (/^0[1-9]/.test(p)) p = `+41${p.slice(1)}`;
  p = p.replace(/^\+410/, '+41');
  if (!/^\+[1-9]\d{7,14}$/.test(p)) return null;
  if (p.startsWith('+41') && !/^\+41[1-9]\d{8}$/.test(p)) return null;
  return p;
}

/** Alter in ganzen Jahren am heutigen Tag; ungültiges Datum → null */
function ageOn(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const now = new Date();
  if (y < 1900 || new Date(y, mo - 1, d) > now) return null;
  return now.getFullYear() - y - (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d) ? 1 : 0);
}

function validate(form, requirePool) {
  const v = Object.fromEntries(new FormData(form));
  const errs = {};
  if (!v.first_name?.trim()) errs.first_name = 'Bitte gib deinen Vornamen an.';
  if (!v.last_name?.trim()) errs.last_name = 'Bitte gib deinen Nachnamen an.';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test((v.email || '').trim())) errs.email = 'Bitte prüfe deine E-Mail-Adresse.';
  if (!/^[1-9]\d{3}$/.test((v.postal_code || '').trim())) errs.postal_code = 'Bitte gib eine Schweizer PLZ (4 Ziffern) an.';
  if (form.elements.canton && !v.canton) errs.canton = 'Bitte wähle deinen Wohnkanton.';
  if (form.elements.phone) {
    const p = normPhone(v.phone);
    if (!p) errs.phone = 'Bitte gib eine gültige Telefonnummer an, z. B. 079 123 45 67.';
    else if (form._sms?.required && (!form._sms.token() || form._sms.phone() !== p)) errs.phone = 'Bitte bestätige deine Handynummer mit dem SMS-Code.';
  }
  if (form.elements.birth_date) {
    const age = ageOn(v.birth_date);
    if (age === null) errs.birth_date = 'Bitte gib dein Geburtsdatum an.';
    else if (age < 18) errs.birth_date = 'Teilnahme ab 18 Jahren.';
  }
  const ig = (v.instagram || '').trim().replace(/^@/, '');
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) errs.instagram = 'Bitte prüfe deinen Instagram-Namen (nur Buchstaben, Zahlen, Punkt und Unterstrich).';
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
  form._sms = smsVerify(form, slug);
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
        postal_code: v.postal_code.trim(), canton: v.canton || null,
        phone: form.elements.phone ? normPhone(v.phone) : null, birth_date: v.birth_date || null,
        phone_token: form._sms?.token() || null,
        instagram: (v.instagram || '').trim().replace(/^@/, '').toLowerCase() || null,
        consent_terms: !!v.consent_terms, marketing_opt_in: !!v.marketing_opt_in,
        pool: v.pool || null, source: source(), form_started_at: started, website: v.website,
      });
      if (res.ok) {
        track(slug, 'form_submitted');
        success(form);
      } else {
        // Token verbraucht oder abgelaufen → Nummer neu bestätigen lassen
        if (res.error === 'phone_not_verified' || res.error === 'phone_in_use') form._sms?.reset();
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

// ---------------------------------------------------------------- Einladung (doppelte Chance)
function invite(slug) {
  const ref = referral();
  const note = $('[data-invite]');
  if (ref && note) note.hidden = false;
  if (ref && new URLSearchParams(location.search).has('ref')) track(slug, 'referral_visit');
  const tickets = $('[data-bonus] .tickets');
  if (!tickets || reduced) return;
  gsap.timeline({ scrollTrigger: { trigger: tickets, start: 'top 85%', once: true } })
    .from(tickets.querySelector('g'), { y: 18, rotation: -20, opacity: 0, transformOrigin: '50% 50%', duration: 0.9, ease: 'expo.out' })
    .from(tickets.querySelector('.t2g'), { x: -26, rotation: -10, opacity: 0, transformOrigin: '50% 50%', duration: 1, ease: 'back.out(1.7)' }, 0.25)
    .to(tickets.querySelector('.t2'), { strokeDashoffset: -18, duration: 1.6, ease: 'none', repeat: 2 }, 0.6);
}

// ---------------------------------------------------------------- Boot
export async function boot({ slug, requirePool = false }) {
  document.documentElement.classList.add('js');
  smoothScroll();
  anchors();
  mobileNav();
  header();
  glow();
  magnetic();
  reveals();
  accordion();
  videos(slug);
  share(slug);
  source();
  invite(slug);

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
    if (data.campaign.referral_bonus_max === 0) {
      $$('[data-bonus], [data-invite], .success-bonus').forEach((el) => { el.hidden = true; });
    }
    const form = $('form[data-entry-form]');
    if (form?._sms && data.campaign.requires_phone_verification) form._sms.activate();
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
