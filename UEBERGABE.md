# Übergabe an den Hoster – Gewinnspielseiten

Stand: 03.11.2026. Alle Gewinnspielseiten liegen im Ordner **`web/`**. Er ist eine fertige, statische Website: kein Build nötig, einfach den ganzen Ordner ausliefern. Auf allnova.ch läuft er unter `/gewinnspiele/`.

## Aufbau

```
web/
├── index.html            Übersicht «Mitmachen. Gewinnen.» – zeigt alle Gewinnspiele als Karten
├── ps5-gta6/index.html   Gewinnspiel PS5 + GTA VI            (bestehend, unverändert)
├── steuern/index.html    Gewinnspiel Gratis-Steuererklärung + CHF 1'000   ← NEU
├── buergenstock/index.html  Gewinnspiel Bürgenstock-Gutschein CHF 150     ← NEU
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
