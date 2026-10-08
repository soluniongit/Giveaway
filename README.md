# allnova Giveaway: PS5 Pro + GTA VI (gewinnspiel.allnova.ch)

Webseite und Datenbank für das Giveaway von allnova. Veranstalterin und Sponsorin ist die Allfinanz Consulting GmbH unter der Marke allnova.

| | |
|---|---|
| Gewinn | 1 Person: PlayStation 5 Pro (mit DualSense-Controller) + Grand Theft Auto VI für PS5 |
| Teilnahme | ab sofort bis **18.11.2026, 23:59 Uhr** (Europe/Zurich), E-Mail-Bestätigung nötig |
| Auslosung | 19.11.2026, unter allen gültigen Teilnahmen |
| Wer | ab 18 Jahren, Wohnsitz in der Schweiz; eine Teilnahme pro Person, gratis und ohne Kauf |
| Bonus | «Doppelte Chance»: 1 Bonuslos, wenn jemand über den persönlichen Einladungslink gültig teilnimmt |
| Domain | `https://gewinnspiel.allnova.ch/` (Seite liegt im Web-Root) |

Die Daten stehen pro Medium an einer Stelle: in der Datenbank (`campaigns`), als Fallback in `web/assets/js/demo-data.js` und als Text in `web/index.html` (Hero, Fakten, FAQ, Bedingungen).

```
web/        Statische Giveaway-Seite (kein Build nötig) + Bestätigungsseite
supabase/   Datenbank-Migrationen, Startdaten und Tests
```

Die Motion-Design-Videos und Instagram-Visuals liegen im Repository [soluniongit/Video-Giveaway](https://github.com/soluniongit/Video-Giveaway). Die früheren Gewinnspiele (Steuern, Fahrstart) sind entfernt; sie sind im Git-Verlauf erhalten.

---

## 1. Webseite (`web/`)

| Datei | Inhalt |
|---|---|
| `index.html` | Giveaway-Seite: Hero mit Live-Countdown bis Teilnahmeschluss, Produktbildern (PS5 Pro, GTA VI) mit 3D-Neigung, Ticker, Gewinn-Kacheln, «So geht's» in 3 Schritten mit «Doppelte Chance», **Instagram-Einbettung**, Teilnahmeformular, FAQ, Teilnahmebedingungen, Datenschutz |
| `bestaetigen/` | Ziel des Bestätigungslinks (Double-Opt-in): «Deine Teilnahme ist bestätigt.», persönlicher Einladungslink, App-CTA |
| `assets/` | `css/site.css` (Design-System), `css/giveaway.css`, `js/` (Seite, Formular, API), `img/` (Produktbilder), `brand/` (Logo, Profilbild), `fonts/`, `vendor/` (GSAP, Lenis) |

Technik: statisches HTML/CSS/JS mit GSAP (ScrollTrigger, SplitText, DrawSVG) und Lenis Smooth Scroll. Mobile-first, berücksichtigt `prefers-reduced-motion`, kein Build-Schritt. Gestaltung im allnova-CI (Anthrazit, Gold, Inter Tight + Instrument Serif) mit Sonnenuntergang als Akzent.

**Formular:** Vorname, Nachname, E-Mail, PLZ, Instagram-Name (freiwillig), Pflicht-Checkbox (18+, Wohnsitz Schweiz, Bedingungen), freiwilliges Werbe-Opt-in. Validierung im Browser und nochmals serverseitig.

**Instagram-Einbettung:** Der Link zum Giveaway-Beitrag wird in `web/assets/js/config.js` eingetragen:

```js
instagramPostUrl: 'https://www.instagram.com/p/<ID>/',   // auch /reel/<ID>/
```

- Leer → Platzhalter «Der Beitrag ist bald live» mit Link zum Profil @allnova.ch.
- Gesetzt → Vorschaukarte mit «Instagram-Beitrag laden». Erst nach dem Klick wird das Skript von Instagram geladen (Datenschutz: keine Daten an Meta ohne Klick). Die Zustimmung merkt sich der Browser für spätere Besuche.

**Lokal ansehen:**

```bash
cd web
npx http-server . -p 8080 -c-1
# http://localhost:8080/            ?phase=upcoming|open|closed simuliert den Status (Demo-Modus)
# http://localhost:8080/bestaetigen/?token=demo   (&bonus=1 zeigt das aktive Bonuslos)
```

**Konfiguration** (`web/assets/js/config.js`):

```js
supabaseUrl: 'https://<projekt>.supabase.co',
supabaseKey: '<publishable/anon key>',
appUrl: '<Link zur allnova App>',
instagramPostUrl: '<Link zum Instagram-Beitrag>',
```

Bleiben `supabaseUrl`/`supabaseKey` leer, läuft die Seite im **Demo-Modus**: Das Formular simuliert die Teilnahme, es werden **keine Daten gesendet**.

**Vendor-Dateien** aktualisieren (GSAP, Lenis): `cd web && npm install && npm run vendor`.

**Tracking** (anonym, ohne IP, über `track_event`): `page_view`, `form_started`, `form_submitted`, `share_click`, `instagram_click`, `instagram_embed_load`, `referral_visit`, `invite_share`, `invite_copy`, `invite_whatsapp`, `app_cta_click`, `app_later_click`. UTM-Parameter werden pro Sitzung gemerkt und mit der Teilnahme gespeichert.

**Hosting (Vercel):** Projekt-Root `web/`. `vercel.json` leitet alte `/gewinnen/…`-Pfade auf `/` um und setzt `noindex` nur für die Bestätigungsseite. Domain `gewinnspiel.allnova.ch` im Vercel-Projekt hinzufügen und beim DNS-Anbieter von allnova.ch einen CNAME `gewinnspiel` → `cname.vercel-dns.com` setzen.

**Marken:** PlayStation/PS5 (Sony Interactive Entertainment) und Grand Theft Auto (Take-Two Interactive) werden nur zur Beschreibung des Preises genannt; Hinweis im Footer und in Ziffer 8 der Bedingungen.

---

## 2. Datenbank (Supabase)

Migrationen:

- `20261006120000_gewinnspiele_schema.sql`: Schema, RLS, RPCs
- `20261006120100_gewinnspiele_seed.sql`: Kampagne `ps5-gta6-2026`, Preis, Formular-/Bestätigungstexte, Mail-Vorlagen
- `20261006120200_einladung_bonuslos.sql`: Einladungslink und Bonuslos («Doppelte Chance»)

Die Migrationen sind noch auf **kein** Supabase-Projekt angewendet.

**Tabellen** (alle mit RLS; Zugriff nur für Admins bzw. `service_role`):

| Tabelle | Zweck |
|---|---|
| `campaigns` | Giveaway: Laufzeit, zugelassene Kantone (leer = ganze Schweiz), Status (`draft`/`published`/`archived`), `test_mode` |
| `prize_pools` | Was gewonnen werden kann (hier ein Pool `hauptpreis`) |
| `landing_pages` | Texte für Formular und Bestätigung als JSON |
| `entries` | Teilnahmen, eine pro Person. Gültig erst nach E-Mail-Bestätigung innerhalb der Frist. Mit freiwilligem `instagram_handle`, Einladungscode (`share_code`) und Herkunft (`referred_by`) |
| `marketing_consents` | Freiwillige Werbeeinwilligungen, getrennt dokumentiert |
| `events` | Anonyme Interaktionen |
| `draws`, `draw_results` | Ziehungsprotokoll mit Gewinnperson und Reserveliste |
| `email_templates`, `private.email_outbox` | Mail-Vorlagen und Warteschlange für Bestätigungsmails |
| `partners`, `admins` | Optionale Preispartner; Supabase-Benutzer mit Admin-Rechten |

**Öffentliche RPCs:** `get_campaign`, `submit_entry`, `confirm_entry`, `track_event`.

- `submit_entry` prüft Frist, PLZ, E-Mail, Instagram-Name, Einwilligung und (falls konfiguriert) Kanton serverseitig und antwortet immer gleich, ob die Adresse schon erfasst ist oder nicht.
- Bot-Bremse: Honeypot, Mindestausfüllzeit 3 s, max. 10 Teilnahmen pro IP-Hash und Stunde.
- Bestätigungstoken nur gehasht gespeichert.

**Admin-RPCs:** `admin_draw('ps5-gta6-2026')` zieht gewichtet (Schlüssel `-ln(u)/Lose`, CSPRNG) und protokolliert; `admin_anonymize_campaign('ps5-gta6-2026')` anonymisiert Nicht-Gewinner inkl. Instagram-Name (Frist: 90 Tage). Auswertungs-Views: `campaign_stats`, `campaign_source_stats`, `campaign_event_stats`, `campaign_referral_stats`, `entries_export`.

**Doppelte Chance:** Ein Bonuslos gibt es erst, wenn eine andere Person über den Link teilnimmt **und** bestätigt; höchstens 1 pro Person. Nicht gezählt: eigene E-Mail, derselbe Internetanschluss, fremde Codes, Testteilnahmen. In Instagram-Posts daher «Lade Freunde ein» schreiben, nicht «Teile diesen Beitrag für ein Extralos» (Meta-Promotion-Regeln).

**Lokal testen** (Postgres 16+):

```bash
psql -d test -f supabase/tests/local_supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -d test -f "$f"; done
psql -U authenticator -d test -f supabase/tests/rpc_tests.sql        # → ALL RPC TESTS PASSED
# auf einer zweiten, frisch aufgesetzten DB:
psql -U authenticator -d test2 -f supabase/tests/referral_tests.sql  # → ALL REFERRAL TESTS PASSED
```

**Freischalten:**

```sql
update campaigns set test_mode = true where slug = 'ps5-gta6-2026';                      -- Testteilnahmen
update campaigns set status = 'published', test_mode = false where slug = 'ps5-gta6-2026'; -- live
```

**Noch zu ergänzen: Mailversand.** Bestätigungsmails landen in `private.email_outbox`. Eine Edge Function oder ein Mail-Dienst mit `service_role` versendet sie mit den Vorlagen aus `email_templates` und ruft danach `private.mark_email_sent(id)` auf. Ohne Mailversand kann niemand seine Teilnahme bestätigen.

---

## 3. Offene Punkte vor dem Livegang

1. **Supabase-Projekt** anlegen, Migrationen anwenden, `supabaseUrl`/`supabaseKey` in `config.js` eintragen. Bis dahin sendet das Formular keine Daten (Demo-Modus).
2. **Mailversand** einrichten (Anbieter festlegen, z. B. Resend, Postmark oder SMTP von allnova) und testen.
3. **Instagram-Link** in `config.js` (`instagramPostUrl`) eintragen, sobald der Beitrag live ist.
4. **Domain** `gewinnspiel.allnova.ch` in Vercel verbinden (CNAME, siehe oben).
5. **Teilnahmebedingungen** sind ein redaktioneller Entwurf und müssen fachlich geprüft werden (u. a. Start, Auslosung 19.11.2026, Versand, Markenhinweis). Link auf die vollständigen Datenschutzhinweise ergänzen (`privacyUrl`).
6. **App-Link** (`appUrl`) für die Bestätigungsseite eintragen.
