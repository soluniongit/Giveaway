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
process.exit(fails ? 1 : 0);
