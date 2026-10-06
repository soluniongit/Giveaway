// Fahrstart-Gewinnspiel: goldene Weglinie, L-Schild, Führerausweis-Roadmap, Anbieterwahl mit Karte, Verkehrsquiz.
import { boot, $, $$, reduced, finePointer, scrollTo, track } from './core.js';
import { DEMO_CAMPAIGNS } from './demo-data.js';

const { gsap, ScrollTrigger } = window;
const SLUG = 'fahrstart-2026';
const isMobile = () => innerWidth < 760;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ------------------------------------------------------------------ Weglinie
function road() {
  const main = $('main');
  const svg = $('.road', main);
  const paths = $$('.road-base, .road-glow, .road-line', svg);
  const [, glow, line] = paths;
  const car = $('.road-car', svg);
  let total = 0;
  let lens = [];
  let maxY = [];
  const proxy = { len: 0 };

  const railX = (W, pct) => {
    if (!isMobile()) return (W * pct) / 100;
    return 9; // mobil: eine ruhige Linie am linken Rand statt Kurven durch den Inhalt
  };

  // Catmull-Rom → kubische Bézier-Kurven
  const spline = (pts, W) => {
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const cx = (x) => Math.max(4, Math.min(W - 4, x));
      const c1 = [cx(p1[0] + (p2[0] - p0[0]) / 6), p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [cx(p2[0] - (p3[0] - p1[0]) / 6), p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };

  function build() {
    const W = main.offsetWidth;
    const H = main.offsetHeight;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.style.height = `${H}px`;
    const top = main.getBoundingClientRect().top + scrollY;
    const rel = (el) => { const r = el.getBoundingClientRect(); return { top: r.top + scrollY - top, bottom: r.bottom + scrollY - top, cx: r.left + r.width / 2, cy: r.top + scrollY - top + r.height / 2 }; };

    const plate = rel($('.lplate'));
    const pts = [[plate.cx, plate.cy], [plate.cx, plate.bottom + 90]];
    $$('[data-road]').forEach((sec) => {
      const r = rel(sec);
      const x = railX(W, +sec.dataset.road);
      if (sec.hasAttribute('data-road-end')) {
        pts.push([x, r.top + 40]);
      } else {
        pts.push([x, r.top + 110]);
        pts.push([x, r.bottom - 110]);
      }
    });
    const d = spline(pts, W);
    paths.forEach((p) => p.setAttribute('d', d));
    total = line.getTotalLength();
    lens = [];
    maxY = [];
    let m = -Infinity;
    for (let l = 0; l <= total; l += 6) {
      m = Math.max(m, line.getPointAtLength(l).y);
      lens.push(l);
      maxY.push(m);
    }
    paint();
  }

  const lenAtY = (y) => {
    let lo = 0;
    let hi = maxY.length - 1;
    if (y <= maxY[0]) return 0;
    if (y >= maxY[hi]) return total;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (maxY[mid] < y) lo = mid + 1; else hi = mid; }
    return lens[lo];
  };

  function paint() {
    const L = reduced ? total : Math.max(0, Math.min(total, proxy.len));
    const dash = `${L} ${total + 40}`;
    line.style.strokeDasharray = dash;
    glow.style.strokeDasharray = dash;
    const p = line.getPointAtLength(L);
    const q = line.getPointAtLength(Math.min(total, L + 2));
    const ang = (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI + 90;
    car.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(L >= total - 2 ? 180 : ang).toFixed(1)})`);
    car.style.opacity = L < 4 ? 0 : 1;
  }

  const follow = gsap.quickTo(proxy, 'len', { duration: 0.9, ease: 'power3', onUpdate: paint });
  const target = () => {
    const top = main.getBoundingClientRect().top + scrollY;
    return lenAtY(scrollY + innerHeight * 0.64 - top);
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: () => follow(target()) });
  ScrollTrigger.addEventListener('refresh', () => { build(); proxy.len = target(); paint(); });
  build();
  if (!reduced) {
    proxy.len = 0;
    gsap.to(proxy, { len: target(), duration: 2.2, delay: 0.6, ease: 'power2.inOut', onUpdate: paint });
  }
}

// ------------------------------------------------------------------ Hero
function hero() {
  const plate = $('[data-lplate]');
  let flipped = false;
  plate.addEventListener('click', () => {
    flipped = !flipped;
    gsap.to(plate, { rotationY: flipped ? 180 : 0, duration: reduced ? 0 : 1.1, ease: 'expo.out' });
    gsap.to('.lp-hint', { opacity: 0, duration: 0.4 });
  });

  if (!reduced) {
    const tl = gsap.timeline({ delay: 0.15 });
    tl.from('.hero-title .line-mask > span', { yPercent: 115, duration: 1.3, ease: 'expo.out', stagger: 0.12 }, 0.1)
      .from(plate, { scale: 0.4, rotationY: -120, rotationZ: -18, opacity: 0, duration: 1.6, ease: 'expo.out' }, 0.25)
      .from('.token', { opacity: 0, scale: 0.6, y: 30, duration: 1.1, ease: 'back.out(1.6)', stagger: 0.15 }, 0.9)
      .from('[data-intro]', { opacity: 0, y: 28, duration: 1.1, ease: 'expo.out', stagger: 0.08 }, 0.5)
      .from('.lp-hint', { opacity: 0, duration: 0.8 }, 1.8);
    gsap.to('.token--a', { y: -14, duration: 2.8, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to('.token--b', { y: 12, duration: 3.3, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: 0.4 });
  }
  if (finePointer && !reduced) {
    const rx = gsap.quickTo('.hero-visual', 'rotationX', { duration: 1, ease: 'power3' });
    const ry = gsap.quickTo('.hero-visual', 'rotationY', { duration: 1, ease: 'power3' });
    $('.hero').addEventListener('pointermove', (e) => {
      ry((e.clientX / innerWidth - 0.5) * 14);
      rx(-(e.clientY / innerHeight - 0.5) * 10);
    });
  }
}

// ------------------------------------------------------------------ Gewinnkarten neigen sich
function prizes() {
  if (!finePointer || reduced) return;
  $$('[data-tilt]').forEach((card) => {
    const rx = gsap.quickTo(card, 'rotationX', { duration: 0.8, ease: 'power3' });
    const ry = gsap.quickTo(card, 'rotationY', { duration: 0.8, ease: 'power3' });
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      ry((px - 0.5) * 10);
      rx(-(py - 0.5) * 8);
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
    });
    card.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
  ScrollTrigger.create({
    trigger: '.vku', start: 'top 80%', once: true,
    onEnter: () => gsap.from('.vku-chip, .vku-is', { scale: 0.5, opacity: 0, duration: 0.9, ease: 'back.out(2)', stagger: 0.15 }),
  });
}

// ------------------------------------------------------------------ Pool-Auswahl (Karte, Liste, Formular synchron)
const state = { pools: [], selected: null };
const poolMeta = (p) => {
  const d = p.details || {};
  if (d.type === 'vku') return 'Vollständiger, anerkannter Kurs';
  if (d.type === 'fahrlektionen') return `à ${d.minutes || 50} Minuten · Kategorie ${d.category || 'B'}`;
  return p.description || '';
};
const PIN = '<svg viewBox="0 0 26 26" aria-hidden="true"><path d="M13 24s-8-7.4-8-13a8 8 0 0 1 16 0c0 5.6-8 13-8 13z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="13" cy="11" r="2.8" fill="currentColor"/></svg>';
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="#111512" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function selectPool(key, { scroll = false, silent = false } = {}) {
  state.selected = key;
  $$('.prov').forEach((el) => {
    const on = el.dataset.pool === key;
    el.classList.toggle('is-selected', on);
    el.setAttribute('aria-checked', String(on));
  });
  $('[data-providers]')?.classList.toggle('has-selection', !!key);
  const radio = $(`input[name="pool"][value="${key}"]`);
  if (radio) radio.checked = true;
  const pool = state.pools.find((p) => p.key === key);
  $$('.map-pilot').forEach((m) => m.classList.toggle('is-hot', !!pool?.partner?.canton && m.dataset.canton === pool.partner.canton));
  if (!silent) track(SLUG, 'pool_selected', { pool: key });
  if (scroll) scrollTo('#teilnehmen');
}

function renderPools(pools) {
  state.pools = pools;
  const list = $('[data-providers]');
  list.innerHTML = pools.map((p) => {
    const partner = p.partner || {};
    const confirmed = !!partner.confirmed;
    const name = confirmed ? partner.name : (partner.label || `Anbieter ${p.key.toUpperCase()}`);
    const meta = confirmed
      ? [partner.city && `${partner.city}${partner.canton ? ` (${partner.canton})` : ''}`,
        partner.transmissions?.length && `Getriebe: ${partner.transmissions.join(', ')}`,
        partner.languages?.length && `Sprache: ${partner.languages.join(', ')}`].filter(Boolean).join(' · ')
      : 'Standort und Details folgen nach der Partnerzusage.';
    const link = confirmed && (partner.booking_url || partner.website_url)
      ? `<a class="small" href="${esc(partner.booking_url || partner.website_url)}" target="_blank" rel="noopener" data-partner-link>Zum Anbieter ↗</a>` : '';
    return `<div class="prov" role="radio" aria-checked="false" tabindex="0" data-pool="${esc(p.key)}">
      <span class="pin">${PIN}</span>
      <span><span class="nm">${esc(name)}</span><span class="prize-t">${esc(p.short_title || p.title)}</span><span class="meta">${esc(poolMeta(p))}<br>${esc(meta)}</span>${link}</span>
      <span class="ok">${CHECK}</span></div>`;
  }).join('');
  $$('.prov', list).forEach((el) => {
    const go = () => selectPool(el.dataset.pool, { scroll: false });
    el.addEventListener('click', (e) => { if (e.target.closest('[data-partner-link]')) { track(SLUG, 'partner_link_click', { pool: el.dataset.pool }); return; } go(); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });

  const opts = $('[data-pool-options]');
  opts.innerHTML = pools.map((p) => {
    const partner = p.partner || {};
    const name = partner.confirmed ? partner.name : (partner.label || `Anbieter ${p.key.toUpperCase()}`);
    return `<label class="pool-opt"><input type="radio" name="pool" value="${esc(p.key)}"><span class="in"><span class="k">${esc(name)}</span><span class="t">${esc(p.short_title || p.title)}</span><span class="s">${esc(poolMeta(p))}</span></span></label>`;
  }).join('');
  $$('input[name="pool"]', opts).forEach((r) => r.addEventListener('change', () => selectPool(r.value)));

  if (!reduced) {
    ScrollTrigger.create({
      trigger: list, start: 'top 85%', once: true,
      onEnter: () => gsap.from($$('.prov', list), { x: 60, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.12 }),
    });
  }
  ScrollTrigger.refresh();
}

async function map() {
  const box = $('[data-map]');
  try {
    box.innerHTML = await fetch('../assets/img/pilotregion.svg').then((r) => r.text());
  } catch (e) { return; }
  const svg = $('svg', box);
  const pilots = $$('.map-pilot', svg);
  const bb = pilots.reduce((a, p) => {
    const b = p.getBBox();
    return { x1: Math.min(a.x1, b.x), y1: Math.min(a.y1, b.y), x2: Math.max(a.x2, b.x + b.width), y2: Math.max(a.y2, b.y + b.height) };
  }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
  const pad = 40;
  let w = bb.x2 - bb.x1 + pad * 2;
  let h = bb.y2 - bb.y1 + pad * 2;
  const ratio = 1000 / 640;
  if (w / h < ratio) w = h * ratio; else h = w / ratio;
  const cx = (bb.x1 + bb.x2) / 2;
  const cy = (bb.y1 + bb.y2) / 2;
  const zoom = `${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`;
  const k = 1000 / w;
  $$('.map-label', svg).forEach((t) => { t.style.fontSize = `${(13 / k).toFixed(2)}px`; });
  $$('.map-lake-label', svg).forEach((t) => { t.style.fontSize = `${(15 / k).toFixed(2)}px`; });
  pilots.forEach((p) => { p.style.strokeWidth = `${(1.6 / k).toFixed(2)}`; });

  // Pins nur für zugesagte Partner mit Koordinaten
  try {
    const proj = await fetch('../assets/data/map-projection.json').then((r) => r.json());
    const project = (lon, lat) => {
      const l = (lon * Math.PI) / 180;
      const f = (lat * Math.PI) / 180;
      return [proj.translate[0] + proj.scale * l, proj.translate[1] - proj.scale * Math.log(Math.tan(Math.PI / 4 + f / 2))];
    };
    state.pools.forEach((p) => {
      const pa = p.partner;
      if (!pa?.confirmed || pa.longitude == null) return;
      const [x, y] = project(+pa.longitude, +pa.latitude);
      svg.insertAdjacentHTML('beforeend', `<g class="map-pin" transform="translate(${x} ${y})"><circle r="${(7 / k).toFixed(2)}"/></g>`);
    });
  } catch (e) { /* keine Pins */ }

  if (reduced) { svg.setAttribute('viewBox', zoom); return; }
  gsap.set(pilots, { drawSVG: '0%', fillOpacity: 0 });
  gsap.set($$('.map-label, .map-lake-label', svg), { opacity: 0 });
  ScrollTrigger.create({
    trigger: box, start: 'top 75%', once: true,
    onEnter: () => {
      const tl = gsap.timeline();
      tl.to(svg, { attr: { viewBox: zoom }, duration: 2.2, ease: 'expo.inOut' })
        .to(pilots, { drawSVG: '100%', duration: 1.6, ease: 'power2.inOut', stagger: 0.15 }, 0.6)
        .to(pilots, { fillOpacity: 1, duration: 1, stagger: 0.1 }, 1.4)
        .to($$('.map-label, .map-lake-label', svg), { opacity: 1, duration: 0.8, stagger: 0.08 }, 1.8);
    },
  });
}

// ------------------------------------------------------------------ Roadmap
const STEPS = [
  { t: 'Nothelferkurs', d: 'Pflicht, bevor du den Lernfahrausweis beantragen kannst.', reco: 'vku', r: 'VKU-Kursplatz', why: 'Plane den VKU schon jetzt ein – er folgt nach dem Lernfahrausweis.' },
  { t: 'Sehtest', d: 'Die Bestätigung vom Optiker oder Arzt brauchst du für dein Gesuch.', reco: 'vku', r: 'VKU-Kursplatz', why: 'Der VKU kommt bald – ein ganzer Kursplatz passt perfekt.' },
  { t: 'Lernfahrausweis', d: 'Gesuch beim Strassenverkehrsamt einreichen und die Basistheorieprüfung bestehen.', reco: 'vku', r: 'VKU-Kursplatz', why: 'Mit dem Lernfahrausweis bist du bereit für den Verkehrskundeunterricht.' },
  { t: 'VKU', d: 'Der Verkehrskundeunterricht ist Pflicht vor der praktischen Prüfung.', reco: 'vku', r: 'VKU-Kursplatz', why: 'Genau dein Schritt: Gewinne den kompletten Kursplatz.' },
  { t: 'Fahrlektionen', d: 'Mit Fahrlehrerin oder Fahrlehrer üben und auf Lernfahrten Erfahrung sammeln.', reco: 'fahrlektionen', r: '2 Fahrlektionen', why: 'Zwei Lektionen à 50 Minuten bringen dich weiter.' },
  { t: 'Praktische Prüfung', d: 'Die Führerprüfung beim Strassenverkehrsamt.', reco: 'fahrlektionen', r: '2 Fahrlektionen', why: 'Ideal zur Prüfungsvorbereitung.' },
  { t: 'Führerausweis auf Probe', d: 'Geschafft! Es folgt die Probezeit mit dem obligatorischen Weiterausbildungskurs (WAB).', reco: 'share', r: 'Teilen statt gewinnen', why: 'Kennst du jemanden, der gerade startet? Zeig ihm das Gewinnspiel.' },
];

function roadmap() {
  const items = $$('[data-rm-steps] li');
  const fill = $('.rm-fill');
  const car = $('.rm-car');
  const pick = $('[data-rm-pick]');
  let current = -1;
  let used = false;
  $('[data-rm-kicker]').textContent = 'Tippe auf deinen Schritt';
  $('[data-rm-title]').textContent = 'Wo stehst du gerade?';
  $('[data-rm-text]').textContent = 'Vom Nothelferkurs bis zum Führerausweis auf Probe – wähle oben deinen aktuellen Schritt.';
  $('.rm-reco').hidden = true;

  const set = (i) => {
    current = i;
    const s = STEPS[i];
    items.forEach((li, k) => { li.classList.toggle('is-done', k < i); li.classList.toggle('is-current', k === i); });
    const pct = (i / (STEPS.length - 1)) * 100;
    if (innerWidth < 900) gsap.to(fill, { height: `${pct}%`, width: '100%', duration: 0.8, ease: 'expo.out' });
    else {
      gsap.to(fill, { width: `${pct}%`, height: '100%', duration: 0.9, ease: 'expo.out' });
      gsap.to(car, { left: `${pct}%`, opacity: 1, duration: 0.9, ease: 'expo.out' });
    }
    $('[data-rm-kicker]').textContent = `Schritt ${i + 1} von ${STEPS.length}`;
    $('[data-rm-title]').textContent = s.t;
    $('[data-rm-text]').textContent = `${s.d} ${s.why}`;
    $('[data-rm-reco]').textContent = s.r;
    $('.rm-reco').hidden = false;
    pick.querySelector('.label').textContent = s.reco === 'share' ? 'Gewinnspiel teilen' : s.reco === 'vku' ? 'Diesen Gewinn wählen' : 'Passende Anbieter zeigen';
    if (!reduced) gsap.from('.rm-info > *, .rm-reco > *', { opacity: 0, y: 16, duration: 0.6, ease: 'expo.out', stagger: 0.05 });
    $$('.prov').forEach((el) => {
      const pool = state.pools.find((p) => p.key === el.dataset.pool);
      el.classList.toggle('is-match', s.reco !== 'share' && pool?.details?.type === s.reco);
    });
    if (!used) { used = true; track(SLUG, 'roadmap_used', { step: i }); }
  };
  items.forEach((li, i) => $('button', li).addEventListener('click', () => set(i)));
  pick.addEventListener('click', async () => {
    const s = STEPS[current];
    if (!s) return;
    if (s.reco === 'share') {
      const url = location.origin + location.pathname;
      track(SLUG, 'share_click');
      try { if (navigator.share) await navigator.share({ title: document.title, url }); else await navigator.clipboard.writeText(url); } catch (e) { /* abgebrochen */ }
      return;
    }
    const matches = state.pools.filter((p) => p.details?.type === s.reco);
    if (matches.length === 1) selectPool(matches[0].key);
    scrollTo('#anbieter');
  });
}

// ------------------------------------------------------------------ Quiz
const QUIZ = [
  { q: 'Wie schnell darfst du innerorts generell fahren?', a: ['30 km/h', '50 km/h', '60 km/h'], ok: 1, x: 'Innerorts gilt generell 50 km/h – sofern nichts anderes signalisiert ist.' },
  { q: 'Und auf der Autobahn?', a: ['100 km/h', '120 km/h', '130 km/h'], ok: 1, x: 'Auf Autobahnen gilt generell 120 km/h.' },
  { q: 'Was zeigt das blaue «L» am Auto?', a: ['Eine Lernfahrt', 'Ein Leasingauto', 'Einen Lieferwagen'], ok: 0, x: 'Das L-Schild kennzeichnet Lernfahrten – genau dein Fahrstart.' },
  { q: 'Welche Alkoholgrenze gilt mit dem Führerausweis auf Probe?', a: ['0,1 Promille', '0,5 Promille', '0,8 Promille'], ok: 0, x: 'Für Neulenkende gilt 0,1 Promille – faktisch ein Alkoholverbot am Steuer.' },
  { q: 'Wie lange dauert die Probezeit?', a: ['1 Jahr', '2 Jahre', '3 Jahre'], ok: 2, x: 'Der Führerausweis auf Probe gilt drei Jahre.' },
];

function quiz() {
  const body = $('[data-quiz-body]');
  const dots = $('[data-quiz-dots]');
  let i = 0;
  let score = 0;
  dots.innerHTML = QUIZ.map(() => '<i></i>').join('');
  const paintDots = () => $$('i', dots).forEach((d, k) => { d.classList.toggle('is-done', k < i); d.classList.toggle('is-now', k === i); });

  const show = () => {
    paintDots();
    if (i >= QUIZ.length) {
      const msg = score === QUIZ.length ? 'Ready für die Strasse!' : score >= 3 ? 'Starke Basis!' : 'Da geht noch was – genau dafür gibt es Fahrlektionen.';
      body.innerHTML = `<div class="quiz-result"><span class="quiz-score gold">${score}/${QUIZ.length}</span><p class="h3">${msg}</p>
        <div class="hero-cta"><a class="btn btn--gold" href="#anbieter"><span class="label">Gewinn auswählen</span><span class="arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a>
        <button class="btn btn--ghost" type="button" data-quiz-again><span class="label">Nochmals spielen</span></button></div></div>`;
      $('[data-quiz-again]', body).addEventListener('click', () => { i = 0; score = 0; show(); });
      if (!reduced) gsap.from('.quiz-result > *', { opacity: 0, y: 30, duration: 1, ease: 'expo.out', stagger: 0.1 });
      track(SLUG, 'quiz_completed', { score });
      return;
    }
    const item = QUIZ[i];
    body.innerHTML = `<p class="quiz-q">${item.q}</p><div class="quiz-opts">${item.a.map((a, k) => `<button type="button" data-k="${k}">${a}</button>`).join('')}</div><p class="quiz-explain" data-explain></p>`;
    if (!reduced) gsap.from([...body.children, ...$$('.quiz-opts button', body)], { opacity: 0, y: 24, duration: 0.8, ease: 'expo.out', stagger: 0.05 });
    $$('.quiz-opts button', body).forEach((b) => b.addEventListener('click', () => {
      const k = +b.dataset.k;
      $$('.quiz-opts button', body).forEach((x) => { x.disabled = true; });
      $(`.quiz-opts button[data-k="${item.ok}"]`, body).classList.add('is-right');
      if (k === item.ok) score++;
      else b.classList.add('is-wrong');
      if (!reduced) gsap.fromTo($(`.quiz-opts button[data-k="${item.ok}"]`, body), { scale: 0.96 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, .5)' });
      const ex = $('[data-explain]', body);
      ex.textContent = (k === item.ok ? 'Richtig! ' : 'Knapp daneben. ') + item.x;
      ex.insertAdjacentHTML('afterend', `<button class="btn btn--ghost btn--sm quiz-next" type="button"><span class="label">${i === QUIZ.length - 1 ? 'Resultat ansehen' : 'Weiter'}</span></button>`);
      $('.quiz-next', body).addEventListener('click', () => { i++; show(); });
    }));
  };
  show();
}

// ------------------------------------------------------------------ Ablauf
function flowSteps() {
  $$('[data-step-flow]').forEach((step) => {
    ScrollTrigger.create({ trigger: step, start: 'top 72%', onEnter: () => step.classList.add('is-on'), onLeaveBack: () => step.classList.remove('is-on') });
  });
}

hero();
prizes();
roadmap();
quiz();
flowSteps();
boot({ slug: SLUG, requirePool: true }).then((data) => {
  const pools = data?.ok ? data.pools : DEMO_CAMPAIGNS[SLUG].pools;
  renderPools(pools);
  return map();
}).then(() => {
  road();
  ScrollTrigger.refresh();
});
