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

export function cantonalTax(T, canton, municipality, income, married = false) {
  const C = T.cantons[canton];
  const M = C.municipalities[municipality];
  const y = floor100(income);
  const out = { canton: 0, district: 0, municipality: 0, personal: 0 };
  if (canton === 'ZH') {
    const tar = C.tariffs[married ? 'married' : 'single'];
    const es = stepTax(tar.steps, y, tar.top.rate_percent);
    out.canton = (es * C.canton_multiplier_percent) / 100;
    out.municipality = (es * M.municipal_multiplier_percent) / 100;
    out.personal = C.personal_tax.chf_per_person * (married ? 2 : 1);
  } else if (canton === 'SZ') {
    let esL, esK;
    if (!married) {
      esL = szT36(C, y);
      esK = szT36a(C, y);
    } else {
      const q = floor100(y / 1.9);
      esL = q > 0 ? (y * szT36(C, q)) / q : 0;
      esK = q > 0 ? (y * szT36a(C, q)) / q : 0;
    }
    out.canton = (esK * C.canton_multiplier_percent) / 100;
    out.district = (esL * M.district_multiplier_percent) / 100;
    out.municipality = (esL * M.municipal_multiplier_percent) / 100;
  } else if (canton === 'ZG') {
    const tar = C.tariffs[married ? 'married' : 'single'];
    const es = stepTax(tar.steps, y, tar.top.rate_percent);
    out.canton = (es * C.canton_multiplier_percent) / 100;
    out.municipality = (es * M.municipal_multiplier_percent) / 100;
  } else if (canton === 'SG') {
    let es;
    if (!married) es = sgT(C, y);
    else {
      const q = floor100(y / 2);
      es = q > 0 ? round05((y * sgT(C, q)) / q) : 0;
    }
    out.canton = (es * C.canton_multiplier_percent) / 100;
    out.municipality = (es * M.municipal_multiplier_percent) / 100;
  } else {
    throw new Error(`Kanton ${canton} nicht unterstützt`);
  }
  return out;
}

/** Alle Gemeinden, für die Steuerfüsse vorliegen: [{ canton, municipality, label }] */
export function places(T) {
  const list = [];
  for (const [canton, C] of Object.entries(T.cantons)) {
    for (const name of Object.keys(C.municipalities)) list.push({ canton, municipality: name, label: `${name} (${canton})` });
  }
  return list;
}

/** Gesamtrechnung inkl. Durchschnitts- und Grenzsteuersatz. */
export function calculate(T, { canton, municipality, income, married = false, children = 0 }) {
  const inc = Math.max(0, Number(income) || 0);
  const kids = married ? Math.max(0, Math.floor(children)) : 0;
  const one = (y) => {
    const fed = federalTax(T, y, married, kids);
    const cl = cantonalTax(T, canton, municipality, y, married);
    return { federal: fed, ...cl, total: fed + cl.canton + cl.district + cl.municipality + cl.personal };
  };
  const r = one(inc);
  const step = one(inc + 1000);
  return {
    ...r,
    effectiveRate: inc > 0 ? r.total / inc : 0,
    marginalRate: (step.total - r.total) / 1000,
  };
}
