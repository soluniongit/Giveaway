/*
 * Steuerrechner 2026 — Einkommenssteuer auf dem STEUERBAREN Einkommen
 * (direkte Bundessteuer + Staats-/Kantons-, Bezirks- und Gemeindesteuer, ZH-Personalsteuer).
 * Ohne Kirchen- und Vermögenssteuer. Port der Referenz docs/steuerrechner-referenz.py,
 * Daten: assets/data/steuertarife-2026.json (Quellen + Prüfung: docs/steuerrechner-tarife-2026.md).
 */
const floor100 = (x) => Math.floor(x / 100) * 100;

function stepTax(steps, x, topRate = null) {
  let t = 0;
  let lo = 0;
  for (const s of steps) {
    const hi = lo + s.width;
    if (x > lo) t += ((Math.min(x, hi) - lo) * s.rate_percent) / 100;
    lo = hi;
  }
  if (topRate !== null && x > lo) t += ((x - lo) * topRate) / 100;
  return t;
}

export function federalTax(T, income, married = false, children = 0) {
  const fed = T.federal;
  const tbl = fed[married ? 'married' : 'single'];
  const y = floor100(income);
  let tax;
  if (y >= tbl.flat_rate_threshold) {
    tax = (y * tbl.flat_rate_percent_on_total_income) / 100;
  } else {
    let row = tbl.brackets[0];
    for (const r of tbl.brackets) if (r.from_income <= y) row = r;
    tax = row.base_tax_at_from + Math.floor((y - row.from_income) / 100) * row.chf_per_100_above;
  }
  tax = Math.max(0, tax - children * fed.child_tax_credit_per_child_chf);
  if (tax < fed.minimum_tax_chf) tax = 0;
  return tax;
}

function szT36(C, x) {
  const t = C.tariffs.base_36;
  if (x > t.above_rule.from_income_exclusive) return (x * t.above_rule.flat_rate_percent_on_total_income) / 100;
  return stepTax(t.steps, x);
}

function szT36a(C, x) {
  const t36 = C.tariffs.base_36;
  const a = C.tariffs.canton_36a;
  if (x > a.above_rule.from_income_exclusive) return (x * a.above_rule.flat_rate_percent_on_total_income) / 100;
  if (x <= t36.above_rule.from_income_exclusive) return stepTax(t36.steps, x);
  const st = a.additional_step;
  return st.base_tax_at_from + ((x - st.from_income) * st.rate_percent) / 100;
}

function sgT(C, x) {
  const t = C.tariffs.single;
  if (x > t.above_rule.from_income_exclusive) return (x * t.above_rule.flat_rate_percent_on_total_income) / 100;
  return stepTax(t.steps, x);
}

const round05 = (v) => Math.floor(v * 20 + 0.5) / 20;

/**
 * Kantons-, Bezirks-, Gemeinde- und (optional) Kirchensteuer.
 * confession: null | 'ref' | 'kath' | 'christkath' — Kirchensteuer = einfache Steuer × Kirchensteuerfuss
 * der Gemeinde (siehe docs/steuerrechner-tarife-2026.md).
 */
export function cantonalTax(T, canton, municipality, income, married = false, confession = null) {
  const C = T.cantons[canton];
  const M = C.municipalities[municipality];
  const y = floor100(income);
  const out = { canton: 0, district: 0, municipality: 0, personal: 0, church: 0, simple: 0, simpleCanton: 0, rates: {} };
  let esLocal;
  let esCanton;
  if (canton === 'ZH') {
    const tar = C.tariffs[married ? 'married' : 'single'];
    esLocal = esCanton = stepTax(tar.steps, y, tar.top.rate_percent);
    out.personal = C.personal_tax.chf_per_person * (married ? 2 : 1);
  } else if (canton === 'SZ') {
    if (!married) {
      esLocal = szT36(C, y);
      esCanton = szT36a(C, y);
    } else {
      const q = floor100(y / 1.9);
      esLocal = q > 0 ? (y * szT36(C, q)) / q : 0;
      esCanton = q > 0 ? (y * szT36a(C, q)) / q : 0;
    }
  } else if (canton === 'ZG') {
    const tar = C.tariffs[married ? 'married' : 'single'];
    esLocal = esCanton = stepTax(tar.steps, y, tar.top.rate_percent);
  } else if (canton === 'SG') {
    if (!married) esLocal = sgT(C, y);
    else {
      const q = floor100(y / 2);
      esLocal = q > 0 ? round05((y * sgT(C, q)) / q) : 0;
    }
    esCanton = esLocal;
  } else {
    throw new Error(`Kanton ${canton} nicht unterstützt`);
  }
  out.simple = esLocal;
  out.simpleCanton = esCanton;
  out.rates.canton = C.canton_multiplier_percent;
  out.rates.municipality = M.municipal_multiplier_percent;
  out.canton = (esCanton * C.canton_multiplier_percent) / 100;
  out.municipality = (esLocal * M.municipal_multiplier_percent) / 100;
  if (canton === 'SZ') {
    out.rates.district = M.district_multiplier_percent;
    out.district = (esLocal * M.district_multiplier_percent) / 100;
  }
  const cp = confession && M.church ? M.church[confession] : null;
  if (cp != null) {
    out.rates.church = cp;
    out.church = (esLocal * cp) / 100;
  }
  return out;
}

/** Alle Gemeinden, für die Steuerfüsse vorliegen: [{ canton, municipality, label }] */
export function places(T) {
  const list = [];
  for (const [canton, C] of Object.entries(T.cantons)) {
    for (const [name, M] of Object.entries(C.municipalities)) {
      list.push({ canton, municipality: name, label: `${name} (${canton})`, church: M.church || null, district: M.district || null });
    }
  }
  return list.sort((a, b) => a.municipality.localeCompare(b.municipality, 'de-CH'));
}

/** Gesamtrechnung inkl. Durchschnitts- und Grenzsteuersatz. */
export function calculate(T, { canton, municipality, income, married = false, children = 0, confession = null }) {
  const inc = Math.max(0, Number(income) || 0);
  const kids = married ? Math.max(0, Math.floor(children)) : 0;
  const one = (y) => {
    const fed = federalTax(T, y, married, kids);
    const cl = cantonalTax(T, canton, municipality, y, married, confession);
    return { federal: fed, ...cl, total: fed + cl.canton + cl.district + cl.municipality + cl.personal + cl.church };
  };
  const r = one(inc);
  const step = one(inc + 1000);
  return {
    ...r,
    income: inc,
    effectiveRate: inc > 0 ? r.total / inc : 0,
    marginalRate: (step.total - r.total) / 1000,
  };
}
