// Compares the browser calculator against 196 results of the official ESTV tax calculator 2026.
import fs from 'node:fs';
import { federalTax, cantonalTax } from '../gewinnen/assets/js/taxcalc.js';

const T = JSON.parse(fs.readFileSync(new URL('../gewinnen/assets/data/steuertarife-2026.json', import.meta.url)));
const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/estv-vergleich-2026.json', import.meta.url)));
let worst = 0, fails = 0;
for (const c of cases) {
  const fed = federalTax(T, c.taxable_income, c.married);
  const cl = cantonalTax(T, c.canton, c.municipality, c.taxable_income, c.married);
  const total = fed + cl.canton + cl.district + cl.municipality + cl.personal;
  // ESTV rounds every component to whole francs; SG above 264'500 deviates by design (law/official table used)
  const sgTop = c.canton === 'SG' && c.taxable_income / (c.married ? 2 : 1) > 264500;
  const tol = sgTop ? 25 : 3; // SG: ESTV applies 8.5 % only to the excess (see docs)
  const d = Math.abs(total - c.estv.total);
  if (!sgTop) worst = Math.max(worst, d);
  if (d > tol) { fails++; console.log('FAIL', c.canton, c.municipality, c.married ? 'verh.' : 'ledig', c.taxable_income, total.toFixed(2), 'vs ESTV', c.estv.total); }
}
console.log(`${cases.length} Fälle, max. Abweichung (ohne SG-Spitzensatz) ${worst.toFixed(2)} CHF, ${fails} Fehler`);

// Zusätzliche Gemeinden + Kirchensteuer (ESTV-Rechner 2026)
const extra = JSON.parse(fs.readFileSync(new URL('./fixtures/estv-gemeinden-2026.json', import.meta.url)));
const CONF = { reformiert: 'ref', roemisch_katholisch: 'kath', christkatholisch: 'christkath' };
let w2 = 0;
for (const c of extra.cases) {
  const married = c.status === 'married';
  const fed = federalTax(T, c.taxable_income, married);
  const cl = cantonalTax(T, c.canton, c.municipality, c.taxable_income, married);
  const total = fed + cl.canton + cl.district + cl.municipality + cl.personal;
  const d = Math.abs(total - c.estv_calculator.total);
  w2 = Math.max(w2, d);
  if (d > 3) { fails++; console.log('FAIL Gemeinde', c.municipality, c.status, total.toFixed(2), 'vs ESTV', c.estv_calculator.total); }
}
let w3 = 0;
for (const c of extra.church) {
  const cl = cantonalTax(T, c.canton, c.municipality, c.taxable_income, c.status === 'married', CONF[c.confession]);
  const d = Math.abs(cl.church - c.estv_church_tax);
  w3 = Math.max(w3, d);
  if (d > 2) { fails++; console.log('FAIL Kirche', c.municipality, c.confession, cl.church.toFixed(2), 'vs ESTV', c.estv_church_tax); }
}
// Steuerfüsse aller Gemeinden gegen die ESTV-Datenbank (Hauptstandort)
const sweep = JSON.parse(fs.readFileSync(new URL('./fixtures/estv-sweep-2026.json', import.meta.url)));
let rateDiffs = 0;
for (const m of sweep) {
  const M = T.cantons[m.canton].municipalities[m.name];
  const loc = m.locations?.[0];
  if (!M || !loc) { rateDiffs++; console.log('FEHLT', m.canton, m.name); continue; }
  const local = (M.municipal_multiplier_percent || 0) + (M.district_multiplier_percent || 0);
  if (loc.local_pct != null && Math.abs(local - loc.local_pct) > 0.02) { rateDiffs++; console.log('Steuerfuss', m.name, local, 'vs ESTV', loc.local_pct); }
}
console.log(`${extra.cases.length} weitere Gemeindefälle (max. ${w2.toFixed(2)} CHF), ${extra.church.length} Kirchensteuerfälle (max. ${w3.toFixed(2)} CHF), ${sweep.length} Gemeinden Steuerfuss-Abgleich: ${rateDiffs} Abweichungen`);
process.exit(fails ? 1 : 0);
