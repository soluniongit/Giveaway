# Übergabe an den Hoster – Gewinnspielseiten

Stand: 03.11.2026. Alle Gewinnspielseiten liegen im Ordner **`web/`**. Er ist eine fertige, statische Website: kein Build nötig, einfach den ganzen Ordner ausliefern. Auf allnova.ch läuft er unter `/gewinnspiele/`.

## Aufbau

```
web/
├── index.html            Übersicht «Mitmachen. Gewinnen.» – zeigt alle Gewinnspiele als Karten
├── ps5-gta6/index.html   Gewinnspiel PS5 + GTA VI            (bestehend, unverändert)
├── steuern/index.html    Gewinnspiel Gratis-Steuererklärung + CHF 1'000   ← NEU
├── buergenstock/index.html  Gewinnspiel Bürgenstock: 1 Nacht für 2 (CHF 500) ← NEU
├── bestaetigen/index.html   Bestätigungsseite (Link aus der Mail), für alle Gewinnspiele gemeinsam
├── assets/               gemeinsame Dateien aller Seiten (CSS, JS, Schriften, Bilder)
└── vercel.json           Weiterleitungen/Header (nur bei Vercel nötig)
```

Jedes Gewinnspiel ist **ein eigener Ordner mit einer `index.html`**. Die Seiten teilen sich `assets/`, darum immer den ganzen `web/`-Ordner übernehmen. Die Übersicht verlinkt die Ordner relativ (`steuern/`, `buergenstock/`), es braucht also keine weitere Konfiguration.

## Was zu welcher Seite gehört

| Seite | URL | eigene Datei | nutzt aus `assets/` |
|---|---|---|---|
| Übersicht | `/gewinnspiele/` | `index.html` | `css/site.css`, Bilder, Schriften, `vendor/gsap.min.js` |
| PS5 + GTA VI | `/gewinnspiele/ps5-gta6/` | `ps5-gta6/index.html` | `css/site.css`, `css/giveaway.css`, `js/giveaway.js`, `js/core.js`, `js/api.js`, `js/demo-data.js`, `js/config.js`, `vendor/*`, `img/ps5-pro.webp`, `img/gta6-ps5.webp` |
| **Steuern** | `/gewinnspiele/steuern/` | `steuern/index.html` | `css/site.css`, `css/giveaway.css`, **`css/kampagne.css`**, **`js/kampagne.js`**, `js/core.js`, `js/api.js`, `js/demo-data.js`, `js/config.js`, `vendor/*`, `brand/allnova-logo-hell.png`, **`img/og-steuern.jpg`** |
| **Bürgenstock** | `/gewinnspiele/buergenstock/` | `buergenstock/index.html` | wie Steuern, dazu `brand/allnova-logo.png` und **`img/og-buergenstock.jpg`** |
| Bestätigung | `/gewinnspiele/bestaetigen/` | `bestaetigen/index.html` | wie PS5 |

## Was sich gegenüber dem PS5-Stand geändert hat

Wer den PS5-Stand schon online hat, ergänzt bzw. ersetzt nur diese Dateien:

**Neu**
- `web/steuern/index.html`
- `web/buergenstock/index.html`
- `web/assets/css/kampagne.css`
- `web/assets/js/kampagne.js`
- `web/assets/img/og-steuern.jpg`, `web/assets/img/og-buergenstock.jpg` (Vorschaubilder beim Teilen)

**Geändert** (die PS5-Seite funktioniert damit unverändert weiter)
- `web/index.html` – zwei neue Karten in der Übersicht
- `web/bestaetigen/index.html` – Texte je Gewinnspiel (Termin-Hinweis bei Steuern, Teilen-Text)
- `web/assets/js/core.js` – Formular prüft Telefon und Geburtsdatum (18+), falls die Felder vorhanden sind
- `web/assets/js/api.js` – sendet Telefon und Geburtsdatum mit
- `web/assets/js/demo-data.js` – Daten der zwei neuen Gewinnspiele für den Vorschau-Modus

**Datenbank (Supabase)** – in dieser Reihenfolge einspielen, danach die Kampagnen freischalten:
1. `supabase/migrations/20261103120000_telefon_geburtsdatum_termin.sql` – Telefon/Geburtsdatum, Termin-Regel für die Ziehung
2. `supabase/migrations/20261103120100_seed_steuern_buergenstock.sql` – die zwei Kampagnen (als Entwurf)
3. Freischalten: `update public.campaigns set status = 'published' where slug in ('steuern-2027', 'buergenstock-2026');`

Ohne Supabase-Zugangsdaten in `web/assets/js/config.js` laufen alle Seiten im Vorschau-Modus (Formular simuliert, keine Daten werden gesendet).

## Laufzeiten

| Gewinnspiel | Start | Teilnahmeschluss | Auslosung |
|---|---|---|---|
| Steuern (`steuern-2027`) | 05.11.2026, 00:00 | 31.03.2027, 23:59 (Termin bis 15.04.2027 wahrnehmen) | 20.04.2027 |
| Bürgenstock (`buergenstock-2026`) | 05.11.2026, 00:00 | 14.12.2026, 23:59 | 15.12.2026 |

Vor dem Start zeigen die Seiten «Start am 05.11.2026», das Formular ist gesperrt. Zum Testen vorher: `?phase=open` an die URL hängen.

## Vor dem Livegang prüfen

- Teilnahmebedingungen fachlich/rechtlich prüfen (u. a. Verlosung mit Termin als Bedingung, Bürgenstock-Markenhinweis).
- Datenschutzerklärung von allnova um Telefon, Geburtsdatum und KI-gestützte Bearbeitung der Steuerunterlagen ergänzen.
- Termine der Steuer-Kampagne nach dem Gespräch markieren: `select admin_mark_appointment('steuern-2027', 'mail@beispiel.ch');` – nur markierte Teilnahmen kommen in die Ziehung.

## SMS-Bestätigung der Handynummer (Twilio) – Stand 10.11.2026

Für **alle** Gewinnspiele (PS5, Steuern, Bürgenstock) muss die Handynummer im Formular per SMS-Code bestätigt werden. Die Bestätigung per E-Mail-Link bleibt zusätzlich bestehen. Ablauf für Teilnehmende: Handynummer eintragen → «Code per SMS senden» → 6-stelligen Code eingeben → Formular absenden → Link in der Mail klicken.

### Geänderte und neue Dateien

**Web** (zusammen mit dem restlichen `web/`-Ordner ausliefern)
- `web/assets/js/core.js` – SMS-Block im Telefonfeld, Prüfung vor dem Absenden
- `web/assets/js/api.js` – Aufrufe der Edge Function `sms-verify`, Token an `submit_entry`
- `web/assets/js/config.js` – neues Feld `smsVerifyUrl` (leer lassen = `<supabaseUrl>/functions/v1/sms-verify`)
- `web/assets/js/demo-data.js` – Vorschau-Modus: SMS wird simuliert, Code ist immer `123456`
- `web/assets/css/site.css` – Gestaltung des SMS-Blocks
- `web/ps5-gta6/index.html` – neues Pflichtfeld Handynummer; Texte (So geht's, FAQ, Bedingungen, Datenschutz)
- `web/steuern/index.html`, `web/buergenstock/index.html` – Texte (So geht's, FAQ, Bedingungen, Datenschutz)

**Supabase**
- `supabase/migrations/20261110120000_sms_bestaetigung.sql` – Datenbank (nach den bisherigen Migrationen einspielen)
- `supabase/functions/sms-verify/` – Edge Function, spricht mit Twilio

### Einrichtung

1. **Twilio** (twilio.com, Konto mit Guthaben):
   - Console → Verify → Services → *Create new*: Name «allnova» (steht in der SMS), Code-Länge 6. Die **Service SID** (`VA…`) notieren.
   - Zugangsdaten: Account SID + Auth Token, besser einen eigenen API-Key (Account → API keys).
   - Verify → Settings → **Geo permissions**: nur **Schweiz** erlauben. **Fraud Guard** eingeschaltet lassen.
2. **Migration** einspielen: `supabase/migrations/20261110120000_sms_bestaetigung.sql`.
3. **Edge Function** deployen und Secrets setzen (Supabase CLI im Repo-Ordner):
   ```bash
   supabase functions deploy sms-verify --no-verify-jwt
   supabase secrets set TWILIO_VERIFY_SERVICE_SID=VA… TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=…
   # statt Auth Token auch möglich: TWILIO_API_KEY_SID=SK… TWILIO_API_KEY_SECRET=…
   # optional, falls die Seiten unter einer anderen Domain laufen (Komma-getrennt):
   supabase secrets set ALLOWED_ORIGINS=https://gewinnspiel.allnova.ch,https://www.allnova.ch
   ```
   `--no-verify-jwt` ist nötig, weil die Seiten ohne Login aufrufen; die Funktion prüft die Herkunft (`ALLOWED_ORIGINS`) und die Datenbank begrenzt die Anzahl SMS.
4. **Testen ohne SMS-Kosten:** `supabase secrets set SMS_TEST_CODE=1` → für Gewinnspiele im **Testmodus** (`test_mode = true`, nicht veröffentlicht) wird keine SMS gesendet, der Code ist `123456`. Für veröffentlichte Gewinnspiele gilt das nie. Vor dem Livegang wieder entfernen: `supabase secrets unset SMS_TEST_CODE`.

### Schutz vor Missbrauch und Kosten

- Nur Schweizer Handynummern (074–079); Festnetz und Auslandsnummern werden abgelehnt.
- Pro Nummer höchstens 3 Codes in 15 Minuten und 6 pro Tag, pro Internetanschluss 10 pro Stunde, pro Gewinnspiel 300 pro Stunde.
- Eine bestätigte Nummer gilt nur für **eine** Teilnahme pro Gewinnspiel.
- Twilio-Zugangsdaten liegen nur in den Supabase Secrets, nie im Browser. Nummern werden in den SMS-Tabellen nur gehasht gespeichert und nach 2 Tagen gelöscht.
- Kosten: rund 5 US-Cent pro erfolgreicher Bestätigung plus SMS-Gebühr in die Schweiz (aktuelle Preise: twilio.com/verify/pricing).

### Rechtliches

- Twilio (USA) erhält die Telefonnummer zum Versand des Codes. Der Hinweis steht im Formular und im Abschnitt Datenschutz jeder Seite. Die Datenschutzerklärung von allnova entsprechend ergänzen und den Auftragsverarbeitungsvertrag (Data Protection Addendum) von Twilio abschliessen.
- In den Teilnahmebedingungen steht jetzt: «Pro Person und Handynummer ist eine Teilnahme erlaubt», gültig erst nach Bestätigung von Handynummer und E-Mail.

### Tests

```bash
psql -U authenticator -d <frische_db> -f supabase/tests/sms_tests.sql   # → ALL SMS TESTS PASSED
node supabase/tests/sms_verify_function.test.ts                          # → ALL EDGE FUNCTION TESTS PASSED
```
