# Tax research, part 2: all municipalities, church tax, Säule 3a (tax year 2026)

Generated on 2026-10-06. The deliverables are in this folder:

- `municipalities.json`: 276 municipalities (ZH 160, SZ 30, ZG 11, SG 75)
- `pillar3a.json`
- `crosscheck.json`: 10 new municipalities × 2 cases, plus 9 church tax cases, compared with ESTV
- `estv_sweep.json`: every municipality compared with the ESTV calculator
- Scripts are in `scripts/`; downloaded sources are in `dl/`.

The repository files were **not** changed. `crosscheck_tmpdata.json` is the temporary copy of `steuertarife-2026.json` with the 10 test municipalities added.

## 1. Municipalities: verified

| Canton | Count | Source | Check |
|---|---|---|---|
| ZH | 160 (= BFS 01.01.2026) | OGD CSV `kanton_zuerich_stf_aktuell.csv` (24.03.2026, all "definitiv") plus XLSX "Steuerfüsse seit 2012", sheet STFUSS2026 (components) | CSV and XLSX agree for all 160 (0 differences) |
| SZ | 30 | Steuerfusstabelle 2026, page "Details je Gemeinwesen" | 110 + district + municipality (+ church) matches all 40 published totals (0 differences) |
| ZG | 11 | Steuerfüsse 2023–2026 (effective 21.1.26) | Values after discount, read by hand from the PDF |
| SG | 75 (= BFS) | Steuerfüsse 2026 (Steueramt, dated 30.9.2026) | 105 + municipality + church matches the published total for all 116 rows (0 differences) |

BFS numbers come from the official BFS municipality register (snapshot 01.01.2026); every number was matched against it. The values for the 7 municipalities already in the data file are identical to the existing ones.

**ESTV sweep.** For all 276 municipalities, the ESTV calculator at 200k (single, reformed and catholic) was used to work out the effective local and church multipliers. All of them match our data, with **1 exception**: Wettswil a.A. (ZH), catholic. ESTV uses 12 %, while both official ZH files give 11 % (100 − 89). The official value was kept.

### How the ZH CSV is decoded (checked against the XLSX)
- `STF_O_KIRCHE1/2/3`: total municipal tax rate **without** church (political municipality + school municipalities) for area 1/2/3. Canton (95 %) is not included.
- `STF_REF*`, `STF_KATH*`, `STF_CKRKATH*`: the same total **including** the church tax of that confession. The church rate is the difference, e.g. `STF_REF1 − STF_O_KIRCHE1`.
- `DIFF_*`: change from the previous year in percentage points. `JUR_PERS`: weighted rate for legal entities.
- Municipalities with two areas: Uster (112/110) and Turbenthal (122/112) for the municipal rate. Bubikon, Turbenthal, Wädenswil and Wiesendangen have a second church area. Area 1 is used, and area 2 is stored separately (`*_second_area`). For Uster 8610, ESTV uses area 1.
- Christ-catholic: 14 % throughout the canton.

## 2. Church tax: how each canton calculates it
All four cantons apply the church tax rate to the **same simple tax** that the municipal tax uses. That makes church tax = simple tax × rate.

- **ZH:** percent of the einfache Staatssteuer (StG §§ 2, 188, 201–204). Mixed-confession couples pay half to each church; if only one spouse belongs to a recognised church, half the tax is charged (§ 202).
- **SZ:** percent of the simple tax under **§ 36** (the tariff for districts, municipalities and church communities). That is the same as the district and municipal tax, **not** the cantonal tariff § 36a. Couples use partial splitting with divisor 1.9. Where family members belong to different churches, the tax is split by the number of members (§ 9 Abs. 4). No christ-catholic rate is published, so it is null.
- **ZG:** percent of the simple tax (§ 169: "Steuern wie der Kanton"). Catholic rates are set per municipality. Reformed is **one cantonal church community**: 8.5 % minus a 2.5-point discount gives **6 %**. Several rates are discounted rates; the effective value is given. Christ-catholic is null. Special case: the **Bürgergemeindesteuer** (§ 170) applies only to local citizens (Menzingen 2.5, Baar 2, Ober-/Unterägeri 0, Walchwil special rule). It is not included in the calculator.
- **SG:** percent of the simple tax (Art. 6 Abs. 2 lit. b StG). The published catholic rates **already include 4 % Zentralsteuer**, and the reformed rates **already include 3.1 % Zentralsteuer**, so do not add them again. Christ-catholic: 24 % throughout the canton. Church areas often do not match the municipal boundaries. Where there is no main church community, the value is set only if all sub-areas are equal, otherwise null plus a range. Cases: St. Gallen reformed 25/26 (kath 26), Vilters-Wangs kath 21/24, Wildhaus-Alt St. Johann kath 24/26, Neckertal kath 22/24, Gaiserwald kath 21/23. The SG rule for mixed-confession couples was **not researched**.
- **SZ multi-area:** Wollerau, Feusisberg (Schindellegi), Küssnacht (Merlischachen, Immensee), Unteriberg (Studen), Galgenen, Wangen and Schübelbach (Siebnen, Nuolen, Buttikon). The value is the row with the municipality's name, and the sub-areas are in `church_sub_areas`.
- **SZ single-district municipalities:** Einsiedeln (170), Küssnacht (145) and Gersau (145) are both district and municipality, and only the combined rate is published. It is stored as `municipal_multiplier_percent` with `district_multiplier_percent = 0` and the flag `combined_district_and_municipality`. ESTV gives the same total.

## 3. Säule 3a 2026: verified
- **With 2nd pillar: CHF 7'258.**
- **Without 2nd pillar: 20 % of earned income, up to CHF 36'288.**
- Source: the ESTV table "Höchstabzüge Säule 3a" (2026 column; 2027 is already listed as 7'373 / 36'864), the EFD/ESTV notice of 17.11.2025 ("unverändert"), the BSV FAQ, and BVV 3 Art. 7.
- The limit applies per person.
- Buy-ins into 3a are possible from 2026. They are only mentioned briefly here, not researched in detail.

## 4. Cross-check with the ESTV calculator (TaxYear 2026, confession "keine")
The existing `taxcalc.js` was run with node on a temporary data copy.

| Municipality | Single 60k: ours / ESTV | Married 100k: ours / ESTV |
|---|---|---|
| Winterthur ZH | 6710.20 / 6710 | 12298.60 / 12299 |
| Uster ZH | 6354.78 / 6354 | 11682.01 / 11682 |
| Küsnacht ZH | 5288.52 / 5288 | 9832.24 / 9832 |
| Einsiedeln SZ | 5422.44 / 5422 | 9410.60 / 9411 |
| Küssnacht SZ | 4998.24 / 4997 | 8732.51 / 8733 |
| Lachen SZ | 4658.88 / 4658 | 8190.04 / 8190 |
| Baar ZG | 3873.67 / 3873 | 6832.18 / 6832 |
| Walchwil ZG | 3962.19 / 3962 | 6970.84 / 6971 |
| Wil SG | 8028.20 / 8028 | 13009.60 / 13009 |
| Gossau SG | 8061.64 / 8061 | 13060.48 / 13060 |

The largest difference is **1.24 CHF**. That is only rounding: ESTV rounds each component to whole francs. The components are in `crosscheck.json`.

**Church tax.** The ESTV API takes `Confession1/2` (1 = reformed, 2 = roman-catholic, 3 = christ-catholic, 4 = none). I tested 9 cases: Uster ref, Winterthur christ-catholic married, Lachen kath, Einsiedeln ref married, Baar kath married, Walchwil ref, Wil ref married, Gossau kath, and Gossau christ-catholic. Our results (simple tax × rate) differ from ESTV by at most **0.44 CHF**. This confirms the base for each canton, including that SZ uses the § 36 tariff.

## 5. Uncertain or open
1. Wettswil a.A., catholic: ESTV uses 12 % and the official source 11 %. The official value is used.
2. SG: the church rate is null for 5 municipalities without a main church community (range given). For St. Gallen city, reformed is 25 % in 2 of 3 church communities and 26 % in Straubenzell.
3. ZH and SG multi-area municipalities: the rate depends on the address. We use area 1 or the main area.
4. The SG list is dated 30.9.2026, which suggests it was revised during the year. The values for St. Gallen and Rapperswil-Jona did not change compared with the data file.
5. Rules for mixed-confession couples in SG were not researched. In ZG and SZ the tax is split by number of members; in ZH it is split in half.
6. The ZG Bürgergemeindesteuer and the Walchwil footnote 3 are not modelled.
7. Säule 3a buy-in details (how many years back, conditions) were not verified.
