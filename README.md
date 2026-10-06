# allnova Gewinnspiele: Videos, Webseiten, Datenbank

Umsetzung der beiden Gewinnspiele aus den Videoskripten und dem Marketingkonzept (Stand 06.10.2026).
Veranstalterin und Sponsorin ist die Allfinanz Consulting GmbH unter der Marke allnova.

| | Steuergewinnspiel | Fahrstart-Gewinnspiel |
|---|---|---|
| Leitidee | «3 Jahre. Steuererklärung. Gratis.» | «Dein Start. Dein Führerausweis.» |
| Gewinn | 1 Person: Erstellung und Einreichung je einer privaten Standard-Steuererklärung für die Steuerjahre 2026, 2027 und 2028 | 3 Personen: 2 × 2 Fahrlektionen à 50 Min. (Kat. B) + 1 × VKU-Kursplatz, je ein Preispool pro Anbieter |
| Laufzeit | 01.02.2027, 09:00 bis 28.02.2027, 23:59 | 02.11.2026, 09:00 bis 29.11.2026, 23:59 |
| Auslosung | 02.03.2027 | 01.12.2026 (Einlösung bis 31.05.2027) |
| Teilnahme | ab 18, Wohnsitz ZH, SZ, ZG oder SG | ab 18, Wohnsitz ZH, SZ, ZG oder SG |
| Seite | `/gewinnen/steuern` | `/gewinnen/fahrstart` |

Die Termine stammen aus dem Marketingkonzept (Planungsvorschläge, noch keine Zusagen). Sie sind an einer Stelle pro Medium hinterlegt: in der Datenbank (`campaigns`), im Video (Textobjekt `C`) und als Fallback in `web/gewinnen/assets/js/demo-data.js`.

```
videos/     Motion-Design-Animationen (HTML + GSAP) und Renderer → MP4
web/        Statische Gewinnspielseiten unter /gewinnen/ (kein Build nötig)
supabase/   Datenbank-Migrationen, Startdaten und Tests
docs/       Quellen und Referenzrechnung der Steuertarife 2026
```

---

## 1. Motion-Design-Videos

Fertige Exporte liegen in `videos/out/`:

- `allnova-steuergewinnspiel-30s.mp4`
- `allnova-fahrstart-gewinnspiel-30s.mp4`

Beide sind 1080 × 1920, 30 fps, H.264, 30 s lang, ohne Ton und ohne Musik. Dazu gibt es je ein Posterbild (Endkarte).

- **Gestaltung:** Elfenbein #F8F6F0, Anthrazit #111512 und Gold #B69A5C/#C9B68E nach Konzept. Schrift: Inter Tight, mit Akzenten in Instrument Serif.
- **Original-Logo:** unverändert aus dem PDF übernommen, auf Elfenbein in einer anthrazitfarbenen Fläche.
- **Endkarte:** die letzten 3 Sekunden sind vollständig statisch.
- **Sicherheitszonen:** Logo, Headline und CTA stehen in der mittleren sicheren Fläche.
- **Steuern:** grosse goldene 3, Dokumentkarten 2026–2028, goldener Paketrahmen mit «1 Person» und Häkchen/Sendepfeil. Der Hinweis «Deine Steuerrechnung bleibt bei dir» erscheint, danach die Schritte Öffnen → Ausfüllen → Bestätigen. Keine Partikel, kein Geldregen, nirgends «steuerfrei».
- **Fahrstart:** eine durchgehende goldene Weglinie mit Kamerafahrt durch alle fünf Szenen. Dazu kommen ein reduziertes blaues L-Schild, Gewinnkarten und die Erklärung «VKU = Verkehrskundekurs». Die Anbieter-Karten bleiben neutral (A/B/C, ohne Orte oder Logos), bis Zusagen vorliegen. Am Ende verwandelt sich das Formular in einen Umschlag mit Häkchen.

**Texte ändern:** In `videos/steuer/index.html` bzw. `videos/fahrstart/index.html` steht oben im Skript das Objekt `C` mit allen Bildschirmtexten (Datum, Region, Gewinne usw.).

**Neu rendern:**

```bash
cd videos
npm install
npm run render            # beide Videos (Motion-Blur 4×, ~6 min pro Video)
npm run render:steuer     # nur eines
node render.mjs steuer --stills=2,8,29   # Einzelbilder zur Kontrolle
npm run preview           # Live-Vorschau im Browser: http://localhost:8080/steuer/
```

Der Renderer (`render.mjs`) spielt die GSAP-Timeline Frame für Frame in Chromium ab (Playwright) und kodiert sie mit ffmpeg. Für Motion-Blur verwendet er 4 Teilbilder pro Frame.

Noch offen laut Konzept: 10-Sekunden-Schnitte und eine Version mit Voice-over (dann mit Untertiteln). Die Musikrechte sind zu klären, falls Musik gewünscht ist.

---

## 2. Gewinnspielseiten (`web/gewinnen/`)

| Seite | Inhalt |
|---|---|
| `steuern/` | Hero mit «werfbaren» Dokumentkarten (Drag & Throw) und eine Paket-Szene, die sich beim Scrollen zeichnet. Dazu: Leistungsumfang, **Steuerrechner 2026**, Ablauf mit Video, Teilnahmeformular, FAQ, Bedingungen |
| `fahrstart/` | Goldene Weglinie mit kleinem Auto, die beim Scrollen mitfährt, und ein L-Schild zum Umdrehen. Dazu: Gewinnkarten mit 3D-Neigung, **Roadmap «Wo stehst du?»** mit Gewinn-Empfehlung, **Anbieterwahl mit Karte der Pilotregion**, **Verkehrsquiz**, Formular mit Preispool-Auswahl |
| `bestaetigen/` | Ziel des Bestätigungslinks (Double-Opt-in). Danach: «Deine Teilnahme ist bestätigt.» mit App-CTA und «Später» |
| `index.html` | Übersicht beider Gewinnspiele |

Technik: statisches HTML/CSS/JS mit GSAP (ScrollTrigger, SplitText, DrawSVG, Draggable) und Lenis Smooth Scroll. Die Seiten sind Mobile-first, berücksichtigen `prefers-reduced-motion` und brauchen keinen Build-Schritt.

**Lokal ansehen:**

```bash
cd web
npx http-server . -p 8080 -c-1
# http://localhost:8080/gewinnen/steuern/?phase=open
```

`?phase=open|upcoming|closed` simuliert im Demo-Modus den Kampagnenstatus. Ohne den Parameter gilt das echte Datum: Beide Gewinnspiele sind aktuell «upcoming», das Formular ist also bis zum Start gesperrt.

**Konfiguration** (`web/gewinnen/assets/js/config.js`):

```js
supabaseUrl: 'https://<projekt>.supabase.co',
supabaseKey: '<publishable/anon key>',
appUrl: '<Link zur allnova App>',
```

Bleiben die Felder leer, läuft die Seite im **Demo-Modus**: Das Formular simuliert die Teilnahme, und es werden keine Daten gesendet.

**Steuerrechner:** Er rechnet die Einkommenssteuer 2026 (Bund, Kanton, Bezirk, Gemeinde, ZH-Personalsteuer; ohne Kirchensteuer) auf dem *steuerbaren* Einkommen. Abgedeckt sind die Gemeinden Zürich, Schwyz, Feusisberg (Schindellegi), Freienbach, Zug, St. Gallen und Rapperswil-Jona.

- **Daten:** Tarife und Steuerfüsse 2026 aus amtlichen Quellen, in `assets/data/steuertarife-2026.json`. Quellen und Herleitung stehen in `docs/steuerrechner-tarife-2026.md`.
- **Prüfung:** Die Ergebnisse sind gegen 196 Ergebnisse des ESTV-Steuerrechners geprüft (max. Abweichung 1.43 CHF). Ausnahme: der St.-Galler Spitzensatz für Verheiratete, wo bewusst Gesetz und amtliche Tabelle gelten; dort weicht der ESTV-Rechner um ca. 20 CHF ab.
- **Test:** `cd web && npm install && npm test`
- **Datenschutz:** Eingaben bleiben im Browser. Getrackt wird nur «Rechner genutzt» mit dem Kanton, ohne Beträge.

**Videos für das Web** (720p, MP4 + WebM, Poster als JPG) erzeugt `npm run vendor` aus `videos/out/`. Derselbe Befehl kopiert auch GSAP, Lenis, die Schriften und das Logo. `npm run map` erzeugt die Karte der Pilotregion (BFS/swisstopo-Grenzen via `swiss-maps`).

**Tracking** (anonym, ohne IP, über `track_event`): `page_view`, `video_play`, `calculator_used`, `roadmap_used`, `quiz_completed`, `pool_selected`, `form_started`, `form_submitted`, `app_cta_click`, `app_later_click`, `partner_link_click`, `share_click`. UTM-Parameter werden pro Sitzung gemerkt und mit der Teilnahme gespeichert.

**Konzept-Regeln umgesetzt:**

- Countdown erst in den letzten 7 Tagen
- Werbe-Opt-in freiwillig und standardmässig leer
- Pflicht-Checkbox mit Konzepttext
- Datenschutzhinweis direkt beim Formular
- keine zusätzlichen Lose für App/Newsletter
- Plattform-Hinweis (Instagram/Facebook)
- Anbieter neutral bis zur Zusage

---

## 3. Datenbank (Supabase)

Migrationen: `supabase/migrations/20261006120000_gewinnspiele_schema.sql` (Schema) und `…120100_gewinnspiele_seed.sql` (beide Kampagnen inkl. Seiteninhalten, FAQ, Bedingungen, Mail-Vorlagen).

**Tabellen** (alle mit RLS; Zugriff nur für Admins bzw. `service_role`):

| Tabelle | Zweck |
|---|---|
| `campaigns` | Gewinnspiel: Laufzeit, Region, Status (`draft`/`published`/`archived`), `test_mode` |
| `prize_pools` | Was gewonnen werden kann. Fahrstart: ein Pool pro Anbieter (A/B/C) |
| `partners` | Preispartner. Name, Ort und Logo sind erst öffentlich, wenn `status = 'zugesagt'` gesetzt ist |
| `landing_pages` | Seiteninhalte als JSON (Hero, Umfang, FAQ, Formular- und Rechtstexte) |
| `entries` | Teilnahmen, eine pro Person und Gewinnspiel. Gültig erst nach E-Mail-Bestätigung innerhalb der Frist |
| `marketing_consents` | Freiwillige Werbeeinwilligungen, getrennt dokumentiert |
| `events` | Anonyme Interaktionen, z. B. App-Klicks |
| `draws`, `draw_results` | Ziehungsprotokoll mit Gewinnern und Reserveliste |
| `email_templates`, `private.email_outbox` | Mail-Vorlagen und Warteschlange für Bestätigungsmails |
| `admins` | Supabase-Benutzer mit Admin-Rechten |

**Öffentliche RPCs** für die Seiten: `get_campaign`, `submit_entry`, `confirm_entry`, `track_event`.

- **Antwort auf `submit_entry`:** Die Funktion prüft Frist, Kanton, PLZ, E-Mail, Einwilligung und Pool serverseitig. Sie antwortet immer gleich, ob die Adresse schon erfasst ist oder nicht.
- **Bot-Bremse:** Honeypot, eine Mindestausfüllzeit von 3 s und maximal 10 Teilnahmen pro IP-Hash und Stunde.
- **Bestätigungslink:** Der Token wird nur gehasht gespeichert.

**Admin-RPCs:**

- `admin_draw('fahrstart-2026')` zieht je Pool mit kryptografischem Zufall und protokolliert die Ziehung.
- `admin_anonymize_campaign(...)` anonymisiert Nicht-Gewinner (Frist: 90 Tage).

Für die Auswertung gibt es die Views `campaign_stats`, `campaign_source_stats`, `campaign_event_stats` und `entries_export`.

**Lokal testen** (Postgres 16+):

```bash
psql -d test -f supabase/tests/local_supabase_shim.sql
psql -d test -f supabase/migrations/20261006120000_gewinnspiele_schema.sql
psql -d test -f supabase/migrations/20261006120100_gewinnspiele_seed.sql
psql -U authenticator -d test -f supabase/tests/rpc_tests.sql   # → ALL RPC TESTS PASSED
```

**Freischalten:**

```sql
update campaigns set test_mode = true where slug = 'steuern-2027';
update campaigns set status = 'published', test_mode = false where slug = 'steuern-2027';
```

- `test_mode = true` erlaubt Testteilnahmen vor dem Start (sie werden als Test markiert).
- `status = 'published'` schaltet live, nach den sechs Freigaben aus dem Konzept.

**Noch zu ergänzen:** der eigentliche Mailversand. Bestätigungsmails landen in `private.email_outbox`. Eine Edge Function oder ein Mail-Dienst mit `service_role` versendet sie mit den Vorlagen aus `email_templates` und ruft danach `private.mark_email_sent(id)` auf, das den Klartext-Token entfernt. Der Mail-Anbieter (z. B. Resend, Postmark, SMTP von allnova) ist noch festzulegen.

---

## 4. Offene Punkte vor dem Livegang

1. **Supabase-Projekt:** Die Migrationen sind bereit, aber noch auf kein Projekt angewendet. Die Organisation hat das Limit von 2 Gratisprojekten erreicht. Die Entscheidung steht noch aus.
2. **Partnerzusagen Fahrstart:** Namen, Orte, Getriebe, Sprache, Logo und Buchungslink in `partners` eintragen und `status = 'zugesagt'` setzen. Danach erscheinen sie automatisch auf Seite und Karte.
3. **Steuer-Team:** Leistungsumfang und Standard-Dossier für drei Jahre bestätigen, ebenso die Kantonsabdeckung.
4. **Mailversand** (siehe oben) und **App-Link** (`appUrl`) einrichten.
5. **Teilnahmebedingungen:** sind ein redaktioneller Entwurf aus dem Konzept und müssen fachlich geprüft werden. Dazu einen Link auf die vollständigen Datenschutzhinweise ergänzen.
6. **Domain:** `allnova.ch/gewinnen/steuern` und `/fahrstart` sind vorgeschlagen, aber noch nicht eingerichtet. Die Seiten sind statisch und lassen sich unter jedem Pfad hosten.
7. **Termine:** Die Konzept-Daten sind Vorschläge. Bei einer Verschiebung die ganze 28-Tage-Welle zusammen in DB, Video-Texten und Fallback-Daten ändern.
