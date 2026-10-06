// Steuergewinnspiel: Hero mit werfbaren Dokumentkarten, Paket-Szene, Steuerrechner.
import { boot, $, $$, reduced, finePointer, chf, track } from './core.js';
import { calculate, places } from './taxcalc.js';

const { gsap, ScrollTrigger, Draggable } = window;
gsap.registerPlugin(Draggable, window.InertiaPlugin);
const SLUG = 'steuern-2027';
const mobile = () => innerWidth < 980;

// ------------------------------------------------------------------ Hero
function hero() {
  const stage = $('.hero-stage');
  const docs = $$('.doc', stage);
  const fan = () => {
    const k = mobile() ? 0.52 : 1;
    return [
      { x: -168 * k, y: 26 * k, rotation: -13 },
      { x: 0, y: -18 * k, rotation: 2 },
      { x: 168 * k, y: 40 * k, rotation: 12 },
    ];
  };
  docs.forEach((d, i) => gsap.set(d, fan()[i]));

  if (!reduced) {
    const tl = gsap.timeline({ delay: 0.15 });
    tl.from('.stage-glow', { opacity: 0, scale: 0.6, duration: 2, ease: 'expo.out' }, 0);
    tl.from('.stage-ring', { opacity: 0, scale: 0.5, duration: 1.8, ease: 'expo.out' }, 0.1);
    tl.from(docs, { y: '+=520', rotation: (i) => [-34, 8, 30][i], opacity: 0, duration: 1.5, ease: 'expo.out', stagger: 0.11 }, 0.25);
    tl.from('.hero-title .line-mask > span', { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.1 }, 0.1);
    tl.from('[data-intro]', { opacity: 0, y: 28, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, 0.55);
    tl.from('.drag-hint', { opacity: 0, x: -10, duration: 0.8 }, 1.6);
    tl.fromTo('.hero-title .gold', { backgroundPosition: '0% 0' }, { backgroundPosition: '100% 0', duration: 3, ease: 'sine.inOut' }, 0.6);
  }

  // Bühne neigt sich mit der Maus
  if (finePointer && !reduced) {
    const rx = gsap.quickTo(stage, 'rotationX', { duration: 1, ease: 'power3' });
    const ry = gsap.quickTo(stage, 'rotationY', { duration: 1, ease: 'power3' });
    const tx = gsap.quickTo('.stage-glow', 'x', { duration: 1.2, ease: 'power3' });
    $('.hero').addEventListener('pointermove', (e) => {
      const px = e.clientX / innerWidth - 0.5;
      const py = e.clientY / innerHeight - 0.5;
      ry(px * 10);
      rx(-py * 7);
      tx(-px * 30);
    });
  }

  // Karten lassen sich werfen und kehren elastisch zurück
  Draggable.create(docs, {
    type: 'x,y',
    inertia: true,
    bounds: '.hero',
    edgeResistance: 0.75,
    zIndexBoost: true,
    onPress() {
      gsap.killTweensOf(this.target);
      gsap.to('.drag-hint', { opacity: 0, duration: 0.4 });
      gsap.to(this.target, { scale: 1.05, duration: 0.3, ease: 'power2.out' });
    },
    onDrag() {
      gsap.to(this.target, { rotation: gsap.utils.clamp(-28, 28, this.deltaX * 1.6), duration: 0.5, ease: 'power2.out' });
    },
    onRelease() {
      gsap.to(this.target, { scale: 1, duration: 0.5, ease: 'power2.out' });
    },
    onThrowComplete() { home(this.target); },
    onDragEnd() { if (!this.tween) home(this.target); },
  });
  function home(el) {
    const i = docs.indexOf(el);
    gsap.to(el, { ...fan()[i], duration: 1.6, delay: 1.1, ease: 'elastic.out(1, 0.55)' });
  }
  addEventListener('resize', () => docs.forEach((d, i) => gsap.to(d, { ...fan()[i], duration: 0.6 })));

  // Beim Scrollen gleitet die Bühne leicht nach oben weg
  if (!reduced) {
    gsap.to('.hero-stage', { yPercent: -10, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  }
}

// ------------------------------------------------------------------ Paket
function packageScene() {
  const pkg = $('[data-pkg]');
  const svg = $('.pkg-frame', pkg);
  const rect = $('.pkg-rect', pkg);
  const size = () => {
    const w = pkg.offsetWidth;
    const h = pkg.offsetHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    rect.setAttribute('width', w - 4);
    rect.setAttribute('height', h - 4);
  };
  size();
  ScrollTrigger.addEventListener('refreshInit', size);
  if (reduced) return;

  const tl = gsap.timeline({ scrollTrigger: { trigger: pkg, start: 'top 82%', end: 'top 22%', scrub: 1 } });
  tl.from('.year-card', { y: 140, opacity: 0, rotation: (i) => [-6, 0, 6][i], stagger: 0.15, duration: 1, ease: 'power3.out' }, 0)
    .fromTo(rect, { drawSVG: '50% 50%' }, { drawSVG: '0% 100%', duration: 1.4, ease: 'power2.inOut' }, 0.3)
    .from('.year-card .arrow-line', { scaleX: 0, stagger: 0.15, duration: 0.8 }, 0.8)
    .from('.pkg-badge', { scale: 0.4, opacity: 0, duration: 0.6, ease: 'back.out(2)' }, 1.4);
}

// ------------------------------------------------------------------ Umfang & Ablauf
function scopeAndFlow() {
  if (!reduced) {
    ScrollTrigger.create({
      trigger: '.scope-grid', start: 'top 75%', once: true,
      onEnter: () => gsap.from('.ticks .tick', { drawSVG: '0%', duration: 0.6, ease: 'power2.out', stagger: 0.12, delay: 0.3 }),
    });
  }
  $$('[data-step]').forEach((step) => {
    ScrollTrigger.create({
      trigger: step, start: 'top 72%',
      onEnter: () => step.classList.add('is-on'),
      onLeaveBack: () => step.classList.remove('is-on'),
    });
  });
}

// ------------------------------------------------------------------ Steuerrechner
const COLORS = { federal: '#111512', canton: '#b69a5c', district: '#c9b68e', municipality: '#ddd2b9', personal: '#8f7642' };
const LABELS = { federal: 'Bund', canton: 'Kanton', district: 'Bezirk', municipality: 'Gemeinde', personal: 'Personalsteuer' };
const CANTON_NAMES = { ZH: 'Kanton Zürich', SZ: 'Kanton Schwyz', ZG: 'Kanton Zug', SG: 'Kanton St. Gallen' };

async function calculator() {
  const root = $('[data-calc]');
  let T;
  try {
    T = await fetch('../assets/data/steuertarife-2026.json').then((r) => r.json());
  } catch (e) {
    root.querySelector('.calc-result').innerHTML = '<p class="small">Der Rechner konnte nicht geladen werden.</p>';
    return;
  }
  const list = places(T);
  const sel = $('[data-calc-place]', root);
  sel.innerHTML = Object.entries(CANTON_NAMES).map(([c, n]) =>
    `<optgroup label="${n}">${list.map((p, i) => (p.canton === c ? `<option value="${i}">${p.municipality}</option>` : '')).join('')}</optgroup>`).join('');
  sel.value = String(list.findIndex((p) => p.municipality === 'Zürich'));

  const input = $('[data-calc-income]', root);
  const range = $('[data-calc-range]', root);
  const kidsField = $('[data-kids-field]', root);
  const kidsOut = $('[data-kids-out]', root);
  const thumb = $('.seg-thumb', root);
  const state = { place: +sel.value, married: false, kids: 0, income: 60000 };
  const shown = { total: 0, month: 0 };
  let interacted = false;

  const fmtIncome = (n) => chf(n);
  const syncRange = () => {
    range.value = Math.min(state.income, +range.max);
    range.style.setProperty('--p', `${(range.value / range.max) * 100}%`);
  };

  // Vergleichsbalken einmal anlegen
  const bars = $('[data-out-bars]', root);
  bars.innerHTML = list.map((p, i) => `<li data-i="${i}" tabindex="0"><span class="t">${p.municipality} <span class="small">${p.canton}</span></span><span class="b"><i></i></span><span class="v">0</span></li>`).join('');
  $$('li', bars).forEach((li) => {
    const pick = () => { state.place = +li.dataset.i; sel.value = li.dataset.i; update(); };
    li.addEventListener('click', pick);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });

  const legend = $('[data-out-legend]', root);
  const stack = $('[data-out-stack]', root);

  function update() {
    const p = list[state.place];
    const r = calculate(T, { canton: p.canton, municipality: p.municipality, income: state.income, married: state.married, children: state.kids });
    gsap.to(shown, {
      total: r.total, month: r.total / 12, duration: reduced ? 0 : 0.9, ease: 'power3.out', overwrite: true,
      onUpdate: () => {
        $('[data-out-total]', root).textContent = chf(Math.round(shown.total));
        $('[data-out-month]', root).textContent = chf(Math.round(shown.month));
      },
    });
    $('[data-out-eff]', root).textContent = `${(r.effectiveRate * 100).toFixed(1)} %`;
    $('[data-out-marg]', root).textContent = `${(Math.max(0, r.marginalRate) * 100).toFixed(1)} %`;

    const parts = ['federal', 'canton', 'district', 'municipality', 'personal'].filter((k) => r[k] > 0.004);
    stack.innerHTML = parts.map((k) => `<i data-k="${k}" style="background:${COLORS[k]}"></i>`).join('');
    parts.forEach((k) => gsap.to($(`[data-k="${k}"]`, stack), { width: `${(r[k] / r.total) * 100}%`, duration: reduced ? 0 : 0.9, ease: 'expo.out' }));
    legend.innerHTML = parts.map((k) => `<li><i style="background:${COLORS[k]}"></i><span>${LABELS[k]}</span><b>CHF ${chf(Math.round(r[k]))}</b></li>`).join('');

    const totals = list.map((q) => calculate(T, { canton: q.canton, municipality: q.municipality, income: state.income, married: state.married, children: state.kids }).total);
    const max = Math.max(...totals, 1);
    const order = totals.map((t, i) => [t, i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
    const items = order.map((i) => bars.querySelector(`li[data-i="${i}"]`));
    const before = items.map((li) => li.getBoundingClientRect().top);
    items.forEach((li) => bars.appendChild(li));
    items.forEach((li, k) => {
      const i = +li.dataset.i;
      li.classList.toggle('is-current', i === state.place);
      $('.v', li).textContent = `CHF ${chf(Math.round(totals[i]))}`;
      gsap.to($('.b i', li), { width: `${(totals[i] / max) * 100}%`, duration: reduced ? 0 : 0.9, ease: 'expo.out' });
      const dy = before[k] - li.getBoundingClientRect().top;
      if (dy && !reduced) gsap.fromTo(li, { y: dy }, { y: 0, duration: 0.6, ease: 'expo.out' });
    });

    kidsField.hidden = !state.married;
  }

  const touched = () => {
    if (interacted) return;
    interacted = true;
    track(SLUG, 'calculator_used', { canton: list[state.place].canton });
  };

  sel.addEventListener('change', () => { state.place = +sel.value; touched(); update(); });
  $$('input[name="married"]', root).forEach((r) => r.addEventListener('change', () => {
    state.married = r.value === '1' && r.checked;
    if (!state.married) { state.kids = 0; kidsOut.textContent = '0'; }
    gsap.to(thumb, { x: state.married ? thumb.offsetWidth : 0, duration: reduced ? 0 : 0.5, ease: 'expo.out' });
    touched();
    update();
  }));
  $$('[data-kids]', root).forEach((b) => b.addEventListener('click', () => {
    state.kids = gsap.utils.clamp(0, 9, state.kids + +b.dataset.kids);
    kidsOut.textContent = state.kids;
    touched();
    update();
  }));
  input.addEventListener('input', () => {
    const digits = input.value.replace(/\D/g, '').slice(0, 7);
    state.income = Math.min(2000000, +digits || 0);
    input.value = digits ? fmtIncome(state.income) : '';
    syncRange();
    touched();
    update();
  });
  input.addEventListener('blur', () => { input.value = fmtIncome(state.income); });
  range.addEventListener('input', () => {
    state.income = +range.value;
    input.value = fmtIncome(state.income);
    syncRange();
    touched();
    update();
  });
  addEventListener('resize', () => gsap.set(thumb, { x: state.married ? thumb.offsetWidth : 0 }));

  // Quellen
  const srcs = [];
  const add = (s) => { (Array.isArray(s) ? s : [s]).forEach((x) => { if (x && x.url && !srcs.some((y) => y.url === x.url)) srcs.push(x); }); };
  add(T.federal.sources);
  Object.values(T.cantons).forEach((c) => {
    add(c.tariff_sources);
    add(c.canton_multiplier_source);
    Object.values(c.municipalities).forEach((m) => add(m.source));
  });
  $('[data-out-sources]', root).innerHTML = srcs.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></li>`).join('');

  syncRange();
  update();
}

// ------------------------------------------------------------------ CTA
function ctaThree() {
  gsap.set('.cta-three', { y: 0, yPercent: -52 });
  if (reduced) return;
  gsap.fromTo('.cta-three', { yPercent: -30 }, { yPercent: -70, ease: 'none', scrollTrigger: { trigger: '.cta-band', start: 'top bottom', end: 'bottom top', scrub: true } });
}

hero();
packageScene();
scopeAndFlow();
ctaThree();
calculator().then(() => ScrollTrigger.refresh());
boot({ slug: SLUG });
