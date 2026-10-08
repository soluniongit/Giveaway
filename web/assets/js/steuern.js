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
    const k = mobile() ? 0.44 : 1;
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
  const touch = matchMedia('(pointer: coarse)').matches;
  Draggable.create(docs, {
    type: touch ? 'x' : 'x,y',
    allowNativeTouchScrolling: true,
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

  // Desktop: an den Scroll gekoppelt; Mobile: einmal abspielen (die Karten stehen untereinander)
  const tl = gsap.timeline(mobile()
    ? { scrollTrigger: { trigger: pkg, start: 'top 80%', once: true }, defaults: { duration: 1 } }
    : { scrollTrigger: { trigger: pkg, start: 'top 82%', end: 'top 22%', scrub: 1 } });
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
const COLORS = { federal: '#111512', canton: '#b69a5c', district: '#c9b68e', municipality: '#ddd2b9', church: '#6f6a5d', personal: '#8f7642' };
const LABELS = { federal: 'Bund', canton: 'Kanton', district: 'Bezirk', municipality: 'Gemeinde', church: 'Kirche', personal: 'Personalsteuer' };
const CANTON_NAMES = { ZH: 'Kanton Zürich', SZ: 'Kanton Schwyz', ZG: 'Kanton Zug', SG: 'Kanton St. Gallen' };
const FEATURED = ['Zürich', 'Schwyz', 'Zug', 'St. Gallen', 'Küsnacht', 'Meilen', 'Stäfa', 'Horgen', 'Wädenswil', 'Richterswil', 'Freienbach', 'Feusisberg', 'Rapperswil-Jona'];
const PARTS = ['federal', 'canton', 'district', 'municipality', 'church', 'personal'];
const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

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
  const idxOf = (name, canton) => list.findIndex((p) => p.municipality === name && (!canton || p.canton === canton));
  const state = { place: Math.max(0, idxOf('Zürich', 'ZH')), married: false, kids: 0, income: 60000, church: '', ded3a: 0, dedx: 0, cmp: 'canton' };
  const shown = { total: 0, month: 0, save: 0 };
  const dur = reduced ? 0 : 0.8;
  let interacted = false;
  const calc = (placeIdx, income, extra = {}) => {
    const p = list[placeIdx];
    return calculate(T, { canton: p.canton, municipality: p.municipality, income, married: state.married, children: state.kids, confession: state.church || null, ...extra });
  };
  const touched = () => {
    if (interacted) return;
    interacted = true;
    track(SLUG, 'calculator_used', { canton: list[state.place].canton });
  };

  // ---------- Gemeindesuche (Combobox)
  const input = $('[data-calc-place]', root);
  const lb = $('[data-combo-list]', root);
  const ct = $('[data-combo-ct]', root);
  let hits = [];
  let active = 0;
  const showPlace = () => { input.value = list[state.place].municipality; ct.textContent = list[state.place].canton; };
  const renderList = () => {
    const q = fold(input.value);
    hits = list.map((p, i) => [p, i]).filter(([p]) => !q || fold(p.municipality).includes(q))
      .sort((a, b) => (fold(a[0].municipality).startsWith(q) ? 0 : 1) - (fold(b[0].municipality).startsWith(q) ? 0 : 1)).slice(0, 60);
    active = Math.min(active, Math.max(0, hits.length - 1));
    lb.innerHTML = hits.length
      ? hits.map(([p, i], k) => `<li role="option" id="opt-${i}" data-i="${i}" aria-selected="${k === active}">${p.municipality}<span>${p.canton}</span></li>`).join('')
      : '<li class="empty">Keine Gemeinde in ZH, SZ, ZG oder SG gefunden</li>';
    lb.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (hits[active]) input.setAttribute('aria-activedescendant', `opt-${hits[active][1]}`);
  };
  const close = () => { lb.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const choose = (i) => { state.place = i; showPlace(); close(); touched(); update(); };
  input.addEventListener('focus', () => { input.select(); active = 0; renderList(); });
  input.addEventListener('input', () => { active = 0; renderList(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(hits.length - 1, active + 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hits[active]) choose(hits[active][1]); }
    else if (e.key === 'Escape') { showPlace(); close(); input.blur(); }
  });
  lb.addEventListener('pointerdown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); choose(+li.dataset.i); } });
  input.addEventListener('blur', () => { setTimeout(() => { showPlace(); close(); }, 120); });
  showPlace();

  // ---------- Zivilstand, Kinder, Konfession, Einkommen
  const income = $('[data-calc-income]', root);
  const range = $('[data-calc-range]', root);
  const kidsField = $('[data-kids-field]', root);
  const kidsOut = $('[data-kids-out]', root);
  const thumb = $('.seg-thumb', root);
  const church = $('[data-calc-church]', root);
  const syncRange = () => {
    range.value = Math.min(state.income, +range.max);
    range.style.setProperty('--p', `${(range.value / range.max) * 100}%`);
  };
  $$('input[name="married"]', root).forEach((r) => r.addEventListener('change', () => {
    state.married = r.value === '1' && r.checked;
    if (!state.married) { state.kids = 0; kidsOut.textContent = '0'; }
    gsap.to(thumb, { x: state.married ? thumb.offsetWidth : 0, duration: reduced ? 0 : 0.5, ease: 'expo.out' });
    touched(); update();
  }));
  $$('[data-kids]', root).forEach((b) => b.addEventListener('click', () => {
    state.kids = gsap.utils.clamp(0, 9, state.kids + +b.dataset.kids);
    kidsOut.textContent = state.kids;
    touched(); update();
  }));
  church.addEventListener('change', () => { state.church = church.value; touched(); update(); });
  income.addEventListener('input', () => {
    const digits = income.value.replace(/\D/g, '').slice(0, 7);
    state.income = Math.min(2000000, +digits || 0);
    income.value = digits ? chf(state.income) : '';
    syncRange(); touched(); update();
  });
  income.addEventListener('blur', () => { income.value = chf(state.income); });
  range.addEventListener('input', () => { state.income = +range.value; income.value = chf(state.income); syncRange(); touched(); update(); });
  addEventListener('resize', () => { gsap.set(thumb, { x: state.married ? thumb.offsetWidth : 0 }); drawCurve(); });

  // ---------- Abzüge
  const p3a = T.pillar3a || null;
  const r3a = $('[data-ded3a]', root);
  const rx = $('[data-dedx]', root);
  r3a.max = p3a?.max_with_bvg_chf || 7258;
  $('[data-ded3a-note]', root).textContent = p3a?.max_with_bvg_chf
    ? `Maximal CHF ${chf(p3a.max_with_bvg_chf)} im Jahr ${p3a.year || 2026} (mit Pensionskasse)${p3a.max_without_bvg_chf ? `; ohne Pensionskasse 20 % des Erwerbseinkommens, höchstens CHF ${chf(p3a.max_without_bvg_chf)}` : ''}.`
    : 'Höchstbetrag gemäss den geltenden Vorgaben für Personen mit Pensionskasse.';
  const fill = (el) => el.style.setProperty('--p', `${(el.value / el.max) * 100}%`);
  [r3a, rx].forEach((el) => { fill(el); el.addEventListener('input', () => { fill(el); state.ded3a = +r3a.value; state.dedx = +rx.value; touched(); update(); }); });

  // ---------- Vergleich
  $$('[data-cmp]', root).forEach((b) => b.addEventListener('click', () => {
    state.cmp = b.dataset.cmp;
    $$('[data-cmp]', root).forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    update();
  }));
  const bars = $('[data-out-bars]', root);
  bars.addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) choose(+li.dataset.i); });

  // ---------- Steuerkurve (eine Serie: Durchschnittssatz; Hover-Tooltip)
  const curveBox = $('[data-curve]', root);
  const tip = document.createElement('div');
  tip.className = 'curve-tip';
  curveBox.appendChild(tip);
  let curve = null;
  function drawCurve() {
    const W = Math.max(320, curveBox.clientWidth);
    const H = Math.round(Math.min(320, Math.max(220, W * 0.32)));
    const m = { l: 44, r: 16, t: 18, b: 34 };
    const xMax = Math.max(300000, Math.ceil(state.income / 50000) * 50000);
    const pts = [];
    for (let x = 4000; x <= xMax; x += (xMax - 4000) / 150) {
      const r = calc(state.place, x);
      pts.push([x, r.effectiveRate * 100, r.total]);
    }
    const yMax = Math.max(5, Math.ceil(Math.max(...pts.map((p) => p[1])) / 5) * 5);
    const X = (v) => m.l + (v / xMax) * (W - m.l - m.r);
    const Y = (v) => H - m.b - (v / yMax) * (H - m.t - m.b);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ');
    const yt = [];
    for (let v = 0; v <= yMax; v += yMax > 20 ? 10 : 5) yt.push(v);
    const xt = [];
    for (let v = 0; v <= xMax; v += xMax > 300000 ? 100000 : 50000) xt.push(v);
    const you = calc(state.place, state.income);
    const ux = X(Math.min(state.income, xMax));
    const uy = Y(you.effectiveRate * 100);
    curveBox.querySelector('svg')?.remove();
    curveBox.insertAdjacentHTML('afterbegin', `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Durchschnittlicher Steuersatz nach steuerbarem Einkommen">
      <defs><linearGradient id="curveFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b69a5c" stop-opacity=".28"/><stop offset="1" stop-color="#b69a5c" stop-opacity="0"/></linearGradient></defs>
      <g class="grid">${yt.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v)}" y2="${Y(v)}"/>`).join('')}</g>
      <g class="axis">${yt.map((v) => `<text x="${m.l - 8}" y="${Y(v) + 4}" text-anchor="end">${v} %</text>`).join('')}
        ${xt.map((v) => `<text x="${X(v)}" y="${H - 10}" text-anchor="middle">${v ? `${v / 1000}k` : '0'}</text>`).join('')}</g>
      <path class="area" d="${d} L${X(xMax)} ${Y(0)} L${X(0)} ${Y(0)} Z"/>
      <path class="line" d="${d}"/>
      <line class="cross" y1="${m.t}" y2="${H - m.b}"/>
      <circle class="hov" r="6"/>
      <g class="you" transform="translate(${ux} ${uy})"><circle r="7"/><text x="${ux > W - 120 ? -12 : 12}" y="-12" text-anchor="${ux > W - 120 ? 'end' : 'start'}">Du: ${(you.effectiveRate * 100).toFixed(1)} %</text></g>
    </svg>`);
    curve = { pts, X, Y, m, W, H, xMax };
    if (!reduced && !drawCurve.done) {
      drawCurve.done = true;
      const line = curveBox.querySelector('.line');
      ScrollTrigger.create({ trigger: curveBox, start: 'top 85%', once: true, onEnter: () => gsap.from(line, { drawSVG: '0%', duration: 1.6, ease: 'power2.inOut' }) });
    }
  }
  const onCurve = (e) => {
    if (!curve) return;
    const svg = curveBox.querySelector('svg');
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * curve.W;
    const v = gsap.utils.clamp(0, curve.xMax, ((sx - curve.m.l) / (curve.W - curve.m.l - curve.m.r)) * curve.xMax);
    const p = curve.pts.reduce((a, b) => (Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a));
    const x = curve.X(p[0]);
    const y = curve.Y(p[1]);
    svg.querySelector('.cross').setAttribute('x1', x);
    svg.querySelector('.cross').setAttribute('x2', x);
    svg.querySelector('.cross').style.opacity = 0.5;
    const h = svg.querySelector('.hov');
    h.setAttribute('cx', x); h.setAttribute('cy', y); h.style.opacity = 1;
    tip.innerHTML = `Einkommen <b>CHF ${chf(Math.round(p[0] / 100) * 100)}</b><br>Steuern <b>CHF ${chf(Math.round(p[2]))}</b> · <b>${p[1].toFixed(1)} %</b>`;
    tip.style.left = `${(x / curve.W) * r.width}px`;
    tip.style.top = `${(y / curve.H) * r.height}px`;
    tip.style.opacity = 1;
  };
  curveBox.addEventListener('pointermove', onCurve);
  curveBox.addEventListener('pointerdown', onCurve);
  curveBox.addEventListener('pointerleave', () => {
    tip.style.opacity = 0;
    curveBox.querySelectorAll('.cross, .hov').forEach((el) => { el.style.opacity = 0; });
  });

  // ---------- Ausgabe
  const legend = $('[data-out-legend]', root);
  const stack = $('[data-out-stack]', root);
  const rw = $('[data-rw]', root);
  function update() {
    const p = list[state.place];
    const hasChurch = !!(p.church && Object.values(p.church).some((v) => v != null));
    $('[data-church-field]', root).hidden = !hasChurch && !state.church;
    const r = calc(state.place, state.income);
    gsap.to(shown, {
      total: r.total, month: r.total / 12, duration: dur, ease: 'power3.out', overwrite: 'auto',
      onUpdate: () => {
        $('[data-out-total]', root).textContent = chf(Math.round(shown.total));
        $('[data-out-month]', root).textContent = chf(Math.round(shown.month));
      },
    });
    $('[data-out-eff]', root).textContent = `${(r.effectiveRate * 100).toFixed(1)} %`;
    $('[data-out-marg]', root).textContent = `${(Math.max(0, r.marginalRate) * 100).toFixed(1)} %`;
    $('[data-out-placename]', root).textContent = p.municipality;

    const parts = PARTS.filter((k) => r[k] > 0.004);
    stack.innerHTML = parts.map((k) => `<i data-k="${k}" style="background:${COLORS[k]}"></i>`).join('');
    parts.forEach((k) => gsap.to($(`[data-k="${k}"]`, stack), { width: `${(r[k] / r.total) * 100}%`, duration: dur, ease: 'expo.out' }));
    legend.innerHTML = parts.map((k) => `<li><i style="background:${COLORS[k]}"></i><span>${LABELS[k]}</span><b>CHF ${chf(Math.round(r[k]))}</b></li>`).join('');
    if (state.church && r.church === 0) legend.insertAdjacentHTML('beforeend', '<li class="small" style="grid-column:1/-1">Für diese Gemeinde ist kein Kirchensteuerfuss hinterlegt.</li>');

    // Abzüge
    const ded = state.ded3a + state.dedx;
    const after = calc(state.place, Math.max(0, state.income - ded));
    const save = r.total - after.total;
    $('[data-ded3a-out]', root).textContent = `CHF ${chf(state.ded3a)}`;
    $('[data-dedx-out]', root).textContent = `CHF ${chf(state.dedx)}`;
    gsap.to(shown, { save, duration: dur, ease: 'power3.out', overwrite: 'auto', onUpdate: () => { $('[data-ded-save]', root).textContent = chf(Math.round(shown.save)); } });
    $('[data-ded-detail]', root).textContent = ded > 0
      ? `Bund CHF ${chf(Math.round(r.federal - after.federal))} · Kanton/Gemeinde CHF ${chf(Math.round(save - (r.federal - after.federal)))} · ${((save / ded) * 100).toFixed(0)} % deines Abzugs`
      : 'Schieb einen Regler, um den Effekt zu sehen.';

    // Vergleich
    const pool = state.cmp === 'canton'
      ? list.map((q, i) => i).filter((i) => list[i].canton === p.canton)
      : FEATURED.map((n) => (n.includes('(') ? idxOf(n.replace(/ \(.*/, ''), n.match(/\((\w+)\)/)[1]) : idxOf(n))).filter((i) => i >= 0);
    if (!pool.includes(state.place)) pool.push(state.place);
    const totals = new Map(pool.map((i) => [i, calc(i, state.income).total]));
    const order = [...pool].sort((a, b) => totals.get(a) - totals.get(b));
    const rank = order.indexOf(state.place) + 1;
    let rows = order;
    if (state.cmp === 'canton' && order.length > 11) {
      const head = order.slice(0, 4);
      const tail = order.slice(-4);
      const mid = order.slice(Math.max(4, rank - 2), Math.min(order.length - 4, rank + 1));
      rows = [...head, 'sep', ...mid.filter((i) => !head.includes(i) && !tail.includes(i)), 'sep', ...tail];
      rows = rows.filter((v, k, a) => !(v === 'sep' && (a[k + 1] === 'sep' || k === a.length - 1)));
    }
    const max = Math.max(...totals.values(), 1);
    bars.innerHTML = rows.map((i) => (i === 'sep' ? '<li class="sep" aria-hidden="true">· · ·</li>'
      : `<li data-i="${i}" tabindex="0" class="${i === state.place ? 'is-current' : ''}"><span class="t">${order.indexOf(i) + 1}. ${list[i].municipality} <span class="small">${list[i].canton}</span></span><span class="b"><i data-w="${(totals.get(i) / max) * 100}"></i></span><span class="v">CHF ${chf(Math.round(totals.get(i)))}</span></li>`)).join('');
    $$('.b i', bars).forEach((el) => gsap.fromTo(el, { width: '0%' }, { width: `${el.dataset.w}%`, duration: dur, ease: 'expo.out' }));
    const cheapest = list[order[0]];
    const diff = totals.get(state.place) - totals.get(order[0]);
    $('[data-rank]', root).textContent = state.cmp === 'canton'
      ? `${p.municipality} liegt auf Rang ${rank} von ${order.length} Gemeinden im ${CANTON_NAMES[p.canton]} (1 = tiefste Steuer).${diff > 1 ? ` In ${cheapest.municipality} wären es CHF ${chf(Math.round(diff))} weniger.` : ''}`
      : 'Ausgewählte Kantonshauptorte und Gemeinden am Zürichsee.';

    // Rechnungsweg
    const y100 = Math.floor(state.income / 100) * 100;
    const pct = (v) => (v == null ? '' : `${v} %`);
    rw.innerHTML = `<thead><tr><th>Position</th><th>Grundlage</th><th>Satz</th><th>CHF</th></tr></thead><tbody>
      <tr><td>Steuerbares Einkommen (gerundet)</td><td>${chf(y100)}</td><td>${state.married ? 'Verheiratet' : 'Alleinstehend'}</td><td></td></tr>
      <tr><td>Direkte Bundessteuer${state.kids ? ` (inkl. Elternabzug ${state.kids} × CHF ${T.federal.child_tax_credit_per_child_chf})` : ''}</td><td>Tarif Art. 36 DBG</td><td></td><td>${chf(Math.round(r.federal))}</td></tr>
      <tr><td>Einfache Steuer ${p.canton}</td><td>Tarif 2026</td><td></td><td>${chf(Math.round(r.simple))}</td></tr>
      <tr><td>Staats-/Kantonssteuer</td><td>einfache Steuer${p.canton === 'SZ' ? ' (§ 36a)' : ''}</td><td>${pct(r.rates.canton)}</td><td>${chf(Math.round(r.canton))}</td></tr>
      ${p.canton === 'SZ' ? `<tr><td>Bezirkssteuer ${p.district || ''}</td><td>einfache Steuer</td><td>${pct(r.rates.district)}</td><td>${chf(Math.round(r.district))}</td></tr>` : ''}
      <tr><td>Gemeindesteuer ${p.municipality}</td><td>einfache Steuer</td><td>${pct(r.rates.municipality)}</td><td>${chf(Math.round(r.municipality))}</td></tr>
      ${r.church ? `<tr><td>Kirchensteuer</td><td>einfache Steuer</td><td>${pct(r.rates.church)}</td><td>${chf(Math.round(r.church))}</td></tr>` : ''}
      ${r.personal ? `<tr><td>Personalsteuer</td><td>pro Person</td><td></td><td>${chf(r.personal)}</td></tr>` : ''}
      <tr class="sum"><td>Total</td><td></td><td>${(r.effectiveRate * 100).toFixed(2)} %</td><td>${chf(Math.round(r.total))}</td></tr></tbody>`;

    kidsField.hidden = !state.married;
    drawCurve();
  }

  // Quellen
  const srcs = [];
  const add = (s) => { (Array.isArray(s) ? s : [s]).forEach((x) => { if (x && x.url && !srcs.some((y) => y.url === x.url)) srcs.push(x); }); };
  add(T.federal.sources);
  add(T.pillar3a?.sources || T.pillar3a?.source);
  Object.values(T.cantons).forEach((c) => {
    add(c.tariff_sources);
    add(c.canton_multiplier_source);
    add(c.municipalities_source);
    add(c.church_source);
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
