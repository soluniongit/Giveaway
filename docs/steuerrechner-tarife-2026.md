# Swiss income tax estimator: tariff data for 2026, with notes

Everything here is for **tax year 2026**. Every 2026 value was published, so nothing falls back to 2025.
Scope: income tax on **taxable income** (steuerbares Einkommen). It covers direkte Bundessteuer, Staats-/Kantonssteuer, Bezirkssteuer (SZ only) and Gemeindesteuer. It also covers the Zürich Personalsteuer. Church tax and wealth tax are excluded.

Machine-readable data: `tariffs.json` (same folder). Reference implementation: `scripts/calc.py`. Cross-check script: `scripts/compare_estv.py`. Raw ESTV results: `estv_compare.json`. Downloaded source documents: `dl/`.

---

## 1. Direkte Bundessteuer 2026 (DBG Art. 36). Verified.

Source: ESTV Rundschreiben 2-215-D-2025 (11.09.2025) with its attachment "Tarif 2026 (Art. 36 DBG)". Also DBG Art. 36 on fedlex, in the version set by the EFD ordinance of 10.09.2025 (AS 2025 579).

| Single (Grundtarif): from income | tax at threshold | CHF per extra 100 |
|---:|---:|---:|
| 0 | 0.00 | 0 |
| 15'200 | 0.00 | 0.77 |
| 33'200 | 138.60 | 0.88 |
| 43'500 | 229.20 | 2.64 |
| 58'000 | 612.00 | 2.97 |
| 76'200 | 1'152.50 | 5.94 |
| 82'100 | 1'502.95 | 6.60 |
| 108'900 | 3'271.75 | 8.80 |
| 141'500 | 6'140.55 | 11.00 |
| 185'100 | 10'936.55 | 13.20 |
| 793'900 | 91'298.15 | – |
| **≥ 794'000** | **11.5 % of the total income** (794'000 → 91'310) | |

| Married / single parent: from income | tax at threshold | CHF per extra 100 |
|---:|---:|---:|
| 0 | 0 | 0 |
| 29'700 | 0 | 1 |
| 53'400 | 237 | 2 |
| 61'300 | 395 | 3 |
| 79'100 | 929 | 4 |
| 94'900 | 1'561 | 5 |
| 108'700 | 2'251 | 6 |
| 120'600 | 2'965 | 7 |
| 130'500 | 3'658 | 8 |
| 138'400 | 4'290 | 9 |
| 144'300 | 4'821 | 10 |
| 148'300 | 5'221 | 11 |
| 150'400 | 5'452 | 12 |
| 152'400 | 5'692 | 13 |
| 941'300 | 108'249 | – |
| **≥ 941'400** | **11.5 % of the total income** (941'400 → 108'261) | |

- **Elternabzug** (Art. 36 Abs. 2bis): the tax amount is reduced by **CHF 263 per child or supported person**, with a floor of 0. Single parents use the married tariff (Abs. 2bis).
- **Minimum** (Abs. 3): a tax amount below CHF 25 is not levied.
- **Rounding:** the tariff is defined "für je weitere 100 Franken", so round the income down to a full 100. No separate rounding rule exists in the DBG. The ESTV calculator gives the same results.

Algorithm: `y = floor(y/100)*100; if y >= flat_threshold: tax = 0.115*y else tax = base + (y - from)/100 * rate; tax = max(0, tax - 263*children); if tax < 25: tax = 0`.

---

## 2. Kanton Zürich. Verified.

- **Tariff 2026** (§ 35 StG, indexed by 1.3 % with effect from 1.1.2026). Source: Verordnung über den Ausgleich der kalten Progression ab 1.1.2026 (30.06.2025, OS 80, 273). The consolidated StG (LS 631.1, Nachtrag 132) is identical.
  - Grundtarif steps: 0 % for the first 7'000, then 2 % 5'000 · 3 % 4'800 · 4 % 8'000 · 5 % 9'700 · 6 % 11'200 · 7 % 13'100 · 8 % 17'600 · 9 % 34'000 · 10 % 33'700 · 11 % 53'300 · 12 % 69'300 · **13 % on the part above 266'700** (marginal).
  - Verheiratetentarif: 0 % for the first 14'100, then 2 % 6'400 · 3 % 8'100 · 4 % 9'800 · 5 % 11'200 · 6 % 14'500 · 7 % 32'200 · 8 % 32'400 · 9 % 48'500 · 10 % 57'900 · 11 % 62'900 · 12 % 72'600 · **13 % above 370'600**. It also applies to single parents who live with their children.
  - Married couples use their own tariff. There is no splitting divisor.
- **Staatssteuerfuss 2026: 95 %** (2026–2027; it was 98 % before). Sources: RRB 2026/0042 and the zh.ch Steuerfuss page.
- **Stadt Zürich Gemeindesteuerfuss 2026: 119 %** without church tax. Source: Statistisches Amt ZH open data CSV, "definitiv", 24.03.2026. The ESTV calculator also shows 95/119.
- **Personalsteuer** (§§ 199–200 StG): CHF 24 per person who has reached the age of majority. Each spouse pays the full amount, so CHF 48 for a couple. It is a flat amount and does not depend on the Steuerfuss.
- **Rounding:** no rule found in the StG or StV. The ESTV calculator rounds the taxable income down to 100 (tested with 60'099, which gives the same result as 60'000).

Algorithm: `es = tariff(floor100(y))`; `Staat = es*0.95`; `Gemeinde = es*1.19`; `+ 24` per adult.

## 3. Kanton Schwyz. Verified.

- **Tariff 2026** (StG § 36 Abs. 1, amended 21.05.2025, in force 1.1.2026). It applies to the Kanton, the Bezirke and the Gemeinden. The einfache Steuer is:
  0.25 % for the first 1'500, then 0.50 % 1'300 · 0.75 % 1'100 · 1.00 % 1'000 · 1.25 % 1'000 · 1.50 % 1'100 · 1.75 % 1'300 · 2.00 % 1'800 · 2.25 % 2'400 · 2.50 % 3'600 · 2.75 % 5'900 · 3.00 % 8'200 · 3.25 % 10'500 · 3.50 % 11'600 · 3.65 % 9'300 · 3.90 % 197'200. The tax at 258'800 is 9'446.00. **Above 258'800 the rate is 3.65 % on the total income.**
- **§ 36a Kantonstarif** applies only to the cantonal tax. It equals § 36 plus a further step of **7 % for the next 174'700** (258'800 → 433'500). **Above 433'500 the rate is 5 % on the total income.** Up to 258'800, the cantonal and the local simple tax are identical.
- Check against the official tables: the law's steps reproduce all 2'589 rows of the Steuerbuch 90.10 § 36 table and all 1'747 rows of the § 36a table exactly, to the Rappen.
- **Married couples:** Teilsplitting with **divisor 1.9** (§ 36 Abs. 2). The calculation is `q = floor100(y/1.9)`, then `rate = T(q)/q`, then `es = rate × y`. This applies to both T36 and T36a. The ESTV calculator rounds q down to 100; the law only says that the taxable income is rounded. Single parents get no special tariff, only a higher deduction.
- **Rounding:** § 36 Abs. 3 says the taxable income is rounded down to the next 100.
- **Steuerfüsse 2026**, in % of the einfache Steuer. Source: SZ Steuerfusstabelle 2026 with the detail table per body. Kanton 110 % is also confirmed by the media release of 17.09.2026 ("Steuerfüsse 2027 bei 110 % belassen").
  - Gemeinde Schwyz: Kanton **110** + Bezirk Schwyz **35** + Gemeinde **140** = 285
  - Feusisberg (including Schindellegi, PLZ 8834, BFS 1321): 110 + Bezirk Höfe **14** + Gemeinde **55** = 179
  - Freienbach: 110 + Bezirk Höfe **14** + Gemeinde **50** = 174
  - Schwyz has no "Einheiten" in the income tax. All rates are percentages of the einfache Steuer. The Bezirkssteuer is a separate layer, so show it as part of the "Gemeindesteuer" or as its own line.
- No Personalsteuer.

## 4. Kanton Zug. Grundtarif verified; married tariff derived and confirmed by ESTV.

- **Grundtarif 2026**: indexed values published by the Steuerverwaltung Zug in "Grundtarif 2001 bis 2026" (index 110.2, unchanged from 2025):
  0.5 % 1'100 · 1 % 2'200 · 2 % 2'800 · 3 % 4'000 · 3.25 % 5'200 · 3.5 % 5'800 · 4 % 5'800 · 4.5 % 8'000 · 5.5 % 11'500 · 5.5 % 13'300 · 6.5 % 15'000 · 8 % 20'100 · 10 % 25'300 · 9 % 29'800. This reaches 149'900, where the tax is 10'326.50. **Above that, 8 % applies as a marginal rate.** At 149'900 the average rate is 6.89 %, so a flat 8 % on the whole income would cause a jump; that reading is ruled out. The ESTV results for 150k to 1M confirm the marginal reading. The marginal rates really do fall from 10 % to 9 % to 8 %.
  - Warning: the law text in § 35 StG still shows the **unindexed** base steps (top bracket "über 145'300"). For 2026, use the indexed table above.
- **Mehrpersonentarif** (married couples and single parents): § 35 Abs. 2 makes every step exactly twice as wide. That is the same as full splitting: `MPT(y) = 2 × GT(y/2)`, with the top at 299'800. The official MPT PDF was only found for 2024 (it confirms "2 × GT"). The 2026 values are derived from the law, and the ESTV calculator 2026 confirms them.
- **Kantonssteuerfuss 2026: 78 %**. Source: StG § 2 Abs. 2b, which applies for 2026–2029 and was adopted by popular vote on 30.11.2025. The Steuerverwaltung list shows the same. **Stadt Zug 2026: 52 %**, with no rebate. Source: "Steuerfüsse der Gemeinden 2023–2026".
- **Rounding:** no rule found in the StG. The ESTV calculator rounds down to 100 (85'550 gives the same result as 85'500).
- No Personalsteuer.

## 5. Kanton St. Gallen. Verified.

- **Tariff 2026** (Art. 50 StG, in force from 1.1.2026 under the cold-progression ordinance of 7.10.2025, nGS 2025-044):
  0 % for the first 11'600, then 4 % 4'200 · 6 % 18'000 · 8 % 26'500 · 9.2 % 38'100 · 9.4 % 166'100. **Above 264'500 the rate is 8.5 % on the total income.**
- **Married couples and single parents:** full splitting (Art. 50 Abs. 3/4). The official "Tarif 2026" table says the rate is "auf der Hälfte des gesamten Einkommens (abgerundet auf hundert Franken)". So `q = floor100(y/2)`, then `es = y × T(q)/q`, **rounded to 5 Rappen**. For couples the flat 8.5 % applies above 529'000.
- Check against the official table: all 5'190 rows of the SG "Tarif 2026" (10'000–529'000) are reproduced. The single column matches exactly; the married column matches after rounding to 5 Rappen.
- **Staatssteuerfuss 2026: 105 %.** Stadt St. Gallen **138 %**, Rapperswil-Jona **74 %**. Source: Kantonales Steueramt, "Steuerfüsse der Gemeinden 2026". In Rapperswil-Jona the city council had proposed 79 %, but the official 2026 list shows 74 %.
- No Personalsteuer. The "Grundsteuer" in the SG list is a property tax, not an income tax.

---

## 6. Sanity check against the official ESTV tax calculator (2026)

There is a difference from the brief here. The brief asked for a comparison with ESTV's "Steuerbelastung in den Kantonshauptorten". That publication is based on **gross** income, so it cannot be compared directly with taxable income. Instead, the comparison uses the **ESTV Steuerrechner** (swisstaxcalculator.estv.admin.ch, endpoint `API_calculateSimpleTaxes`), which takes taxable income directly. The settings were TaxYear 2026 and confession "keine".

The ESTV calculator shows whole francs. Each component is rounded separately, so the totals differ by up to about CHF 1.

| Place | Case | Bund | Kanton | Bezirk + Gemeinde | Personalsteuer | **Total (ours)** | **Total ESTV** |
|---|---|---:|---:|---:|---:|---:|---:|
| Zürich | single 60'000 | 671.40 | 2'597.30 | 3'253.46 | 24 | **6'546.16** | 6'545 |
| Zürich | married 100'000 | 1'816.00 | 4'505.85 | 5'644.17 | 48 | **12'014.02** | 12'014 |
| Schwyz | single 60'000 | 671.40 | 1'866.48 | 2'969.40 | – | **5'507.28** | 5'506 |
| Schwyz | married 100'000 | 1'816.00 | 2'983.59 | 4'746.63 | – | **9'546.22** | 9'547 |
| Feusisberg | single 60'000 | 671.40 | 1'866.48 | 1'170.79 | – | **3'708.67** | 3'708 |
| Feusisberg | married 100'000 | 1'816.00 | 2'983.59 | 1'871.53 | – | **6'671.12** | 6'672 |
| Freienbach | single 60'000 | 671.40 | 1'866.48 | 1'085.95 | – | **3'623.83** | 3'623 |
| Freienbach | married 100'000 | 1'816.00 | 2'983.59 | 1'735.91 | – | **6'535.50** | 6'536 |
| Zug | single 60'000 | 671.40 | 1'989.78 | 1'326.52 | – | **3'987.70** | 3'988 |
| Zug | married 100'000 | 1'816.00 | 3'116.88 | 2'077.92 | – | **7'010.80** | 7'011 |
| St. Gallen | single 60'000 | 671.40 | 3'511.20 | 4'614.72 | – | **8'797.32** | 8'797 |
| St. Gallen | married 100'000 | 1'816.00 | 5'342.40 | 7'021.44 | – | **14'179.84** | 14'179 |
| Rapperswil-Jona | single 60'000 | 671.40 | 3'511.20 | 2'474.56 | – | **6'657.16** | 6'657 |
| Rapperswil-Jona | married 100'000 | 1'816.00 | 5'342.40 | 3'765.12 | – | **10'923.52** | 10'923 |

**Broader test:** 196 cases covering 7 places, single and married, and 14 incomes from 15'000 to 1'000'000. The incomes include values that are not multiples of 100. The largest deviation per component is **≤ 1 CHF** everywhere except in one case:

- **St. Gallen above 264'500** (for couples: half the income above 264'500). Here the ESTV calculator is **4.10 CHF higher in einfache Steuer** (8.20 for couples). That means about 6–11 CHF in total. ESTV appears to apply 8.5 % only to the excess. **The law and the official SG table both apply 8.5 % to the whole income.** For example, 300'000 gives 25'500.00 in the official SG table and 25'504 in ESTV. Our data follows the law.

The test also confirmed some details empirically:
- ESTV rounds the taxable income down to 100 in all four cantons and in the Bund.
- ESTV rounds the rate-determining income (y/1.9 in SZ, y/2 in SG) down to 100.
- ZH, SZ (Bezirk + Gemeinde) and ZG Steuerfüsse are as listed above.

---

## 7. Caveats and open points (not invented: either flagged here or set to `null` in the JSON)

1. **Rounding without an explicit legal basis.** ZH, ZG, SG and the DBG have no explicit rule to round the taxable income down to 100. It is implied by the tariff structure and the 100-CHF tables, and the ESTV calculator does it. The effect is at most one 100-CHF step × marginal rate × multiplier, which is a few francs.
2. **SZ married: rounding of y/1.9.** Rounding down to 100 is ESTV practice. It is not stated explicitly in the StG; § 36 Abs. 3 only covers the taxable income. Without this rounding the result differs by at most about 2 CHF in einfache Steuer.
3. **ZG married tariff 2026.** No official 2026 table was found, only the 2024 one. The 2026 values are derived from § 35 Abs. 2 (all steps × 2) and the ESTV calculator matches them exactly. The legal basis for indexing the Zug tariff was not looked up separately; the indexed steps come from the official Steuerverwaltung table.
4. **ZG law text vs. practice.** § 35 StG shows unindexed steps (top 145'300). Use the indexed values from the Steuerverwaltung (top 149'900).
5. **SG top tariff.** The ESTV calculator and the law differ by about 4 CHF in einfache Steuer (see section 6). Law and official table are used.
6. **Single parents.** The tool only offers single and married. Note that single parents get the married tariff in ZH, ZG, SG and the Bund (plus 263 per child in the Bund). In SZ they keep the Grundtarif and only get a higher deduction. A "single" input therefore understates the advantage for single parents.
7. **Church tax is excluded.** The "without church" Steuerfüsse are used. In Zug, some municipalities give rebates (footnotes in the ZG list); Stadt Zug 2026 has none.
8. **Personalsteuer ZH** (24 per adult) is included. It belongs to the Gemeinde, so you can show it under the municipal line.
9. **Display rounding.** The ESTV calculator shows whole francs. Tax bills usually round to 5 Rappen. For a landing page, whole francs are enough.
10. **Steuerfuss changes.** ZH 95 % applies to 2026–2027, ZG 78 % to 2026–2029, and SZ plans 110 % for 2027. Municipal rates change every year, so read them from the JSON.
11. **The tool computes taxes only.** It covers no deductions, no wealth tax and no capital-withdrawal tax. The user enters taxable income separately for the Kanton and for the Bund; the two can differ.

## 8. Main sources (all official)

- ESTV Rundschreiben Tarif 2026: https://www.estv.admin.ch/dam/de/sd-web/vFK3ntWLQ4s4/2-215-D-2025-d.pdf
- DBG (fedlex): https://www.fedlex.admin.ch/eli/cc/1991/1184_1184_1184/de
- ZH cold-progression ordinance 2026 (OS 80, 273): https://www.zh.ch/de/politik-staat/gesetze-beschluesse/gesetzessammlung/zhlex-os/erlass-631_1-80-273.html
- ZH StG (LS 631.1, Nachtrag 132): https://www.zh.ch/de/politik-staat/gesetze-beschluesse/gesetzessammlung/zhlex-ls/erlass-631_1-1997_06_08-1999_01_01-132.html
- ZH RRB 2026/0042 (Steuerfuss 95 %): https://www.zh.ch/bin/zhweb/publish/regierungsratsbeschluss-unterlagen./2026/42/RRB-2026-0042.pdf
- ZH Gemeindesteuerfüsse 2026 (OGD CSV): https://www.web.statistik.zh.ch/ogd/data/steuerfuesse/kanton_zuerich_stf_aktuell.csv
- SZ StG 172.200 (consolidated, 2026): https://www.sz.ch/public/upload/assets/29694/172_200.pdf?fp=13
- SZ Amtsblatt Nr. 22/2025 (StG amendment): https://www.sz.ch/public/upload/assets/90956/Steuergesetz_Auszug_Amtsblatt_Nr_22.pdf?fp=2
- SZ tariff tables § 36 / § 36a (2026): https://www.sz.ch/public/upload/assets/18207/Schwyzer_Steuerbuch_90_10_Einkommenssteuertarif_gemaess_Paragraph_36_Abs_1_StG_gueltig_ab_2026.pdf?fp=9 and https://www.sz.ch/public/upload/assets/18208/Schwyzer_Steuerbuch_90_10_Einkommenssteuertarif_gemaess_Paragraph_36a_StG_gueltig_ab_2026_nur_fuer_Kanton.pdf?fp=9
- SZ Steuerfusstabelle 2026 (detail): https://www.sz.ch/public/upload/assets/90947/Steuerfusstabelle_2026.pdf?fp=4
- ZG Grundtarif 2001–2026: https://cdn.zg.ch/dam/jcr:96c7eef4-eb2f-4f8a-a4c4-dad209249598/Grundtarif%202001%20bis%202026.pdf
- ZG StG 632.1 (as of 1.1.2026): https://zg.lexwork.naz.ch/de/dta/632.1.pdf
- ZG Steuerfüsse 2026: https://cdn.zg.ch/dam/jcr:24fb8832-3383-4718-9a48-9461bc7501fc/Steuerf%C3%BCsse%202026_effektiv%2021.1.26.pdf
- SG StG 811.1 (as of 1.1.2026): https://www.gesetzessammlung.sg.ch/app/de/texts_of_law/811.1
- SG Tarif 2026 (table): https://www.sg.ch/content/dam/sgch/steuern-finanzen/steuern/formulare-und-wegleitungen/einkommens-und-vermoegenssteuer/tarife-und-steuerfuesse/tarife-privatpersonen-gueltig-ab/Tarif_2026_SG_DEF.pdf
- SG Steuerfüsse 2026: https://www.sg.ch/content/dam/sgch/steuern-finanzen/steuern/formulare-und-wegleitungen/einkommens-und-vermoegenssteuer/tarife-und-steuerfuesse/steuerfuesse-st-gallische-gemeinden/Steuerf%C3%BCsse%202026%20f%C3%BCr%20Versand.pdf
- ESTV Steuerrechner: https://swisstaxcalculator.estv.admin.ch/
