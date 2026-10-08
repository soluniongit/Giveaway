# allnova App-Kampagne

Getrennt von den Gewinnspielen (`../videos`, `../web`, `../supabase`): App-Teaser-Video und die drei fixierten Instagram-Beiträge. Der Ordner hat eine eigene Render-Pipeline und eigene Assets.

```
teaser/      App-Teaser 33.6 s, 9:16 (HTML + GSAP), Asset-Skripte (build-assets.py, build-cashback.py), bereinigte App-Ausschnitte (img/)
instagram/   Instagram-Visuals (HTML) + Export-Skript
sound/       synthetisches Sounddesign für den Teaser (116 BPM)
assets/      Schriften (Inter Tight, Instrument Serif, Poppins), Logos, offizielle Store-Badges, Runtime
out/         fertige Exporte
```

## Fertige Dateien (`out/`)

| Datei | Verwendung |
|---|---|
| `allnova-app-teaser-30s.mp4` | Reel, 1080 × 1920, 30 fps, 33.6 s (Dateiname historisch), mit Sounddesign |
| `allnova-app-teaser-30s-ohne-ton.mp4` | stumme Fassung |
| `instagram/allnova-ig-1-links-allnova.png/.jpg` | Post **links** (1080 × 1350): «Finanzen. einfach im Griff.» + Telefon (Dokumente, Demodaten) |
| `instagram/allnova-ig-2-mitte-reel-cover.png/.jpg` | **Cover** für das Reel in der Mitte (1080 × 1920, beim Hochladen als Titelbild wählen) |
| `instagram/allnova-ig-3-rechts-app.png/.jpg` | Post **rechts** (1080 × 1350): «Alles an einem Ort.» + Telefon (Entdecken) + Store-Badges |
| `instagram/vorschau-profilraster.png` | Vorschau, wie die drei Kacheln im Profil erscheinen (3:4-Ausschnitt) |
| `instagram/allnova-ig-profil-iphone-mockup.png/.jpg` | Präsentation (1440 × 1800): nachgebautes Instagram-Profil (Besucheransicht) auf dem iPhone mit den drei fixierten Beiträgen |

**Reihenfolge beim Fixieren:** Instagram zeigt die zuletzt fixierten Beiträge zuerst. Damit die Reihe «links – Reel – rechts» entsteht, die drei Beiträge in der Reihenfolge **rechts → Reel → links** fixieren (bei Bedarf in der Vorschau prüfen).

**Gestaltung:** bewusst reduziert und plakativ, je Kachel eine Aussage. Links und rechts dunkel (Anthrazit/Gold), das Reel hell in der Mitte. Die Telefone ragen jeweils vom Rand zur Mitte hin und führen so zum Video. Alle wichtigen Inhalte liegen im 3:4-Ausschnitt, den das Profilraster zeigt.

**Inhalte:** Die Claims stammen von allnova.ch («Finanzen. Einfach im Griff.», «Alles an einem Ort»). Die Store-Badges sind die von allnova.ch (`/app/appstore.png`, `/app/googleplay.png`). Sie liegen nur in 240 × 80 vor; für die Endkarte des Videos sind sie leicht vergrössert. Für maximale Schärfe die offiziellen Vektor-Badges von Apple/Google einsetzen.

## App-Teaser

33.6 s, schnell geschnitten im 116-BPM-Takt: dunkler Hook mit Gutscheinkacheln → Entdecken-Screen («Über 100 Marken») → Match-Cut auf Zalando mit Cashback-Moment → Wallet → Dokumente → Tipp auf die 100%-Police: Cashback-Status (Ring auf 100 %, 30.00 CHF) → Kontakt (WhatsApp) → Montage → Endkarte mit App-Store- und Google-Play-Badge.

- **1:1 App-Oberfläche:** Die echten Screenshots sind feste Bildebenen. Animiert werden nur Position, Grösse, Ausschnitt und Masken, die Markenlogos bleiben unverändert.
- **Anonymisierung:** Persönliche Felder sind in den Pixeln selbst entfernt (`teaser/build-assets.py`), darunter liegt also nichts, das in Zooms oder in der Bewegungsunschärfe durchscheinen könnte. Ersetzt wurden: Name und Avatar («Alex», «A»), Policennummern (DEMO-001 bis DEMO-003), Ablaufdaten (••.••.••••), Prämien (•••.•• CHF/Jahr) und der Punktestand (Demowert, als «Demodaten» gekennzeichnet). Die Ersatztexte sind in Poppins gesetzt; Grösse, Gewicht und Grundlinie habe ich per Pixelvergleich mit dem Original kalibriert.
- **Originale:** Die Original-Screenshots enthalten persönliche Daten und liegen **nicht** im Repository. Neu erzeugen: `python3 teaser/build-assets.py <Ordner 02_Screenshots_Originale> <Screenshot Nikin/IKEA> <Screenshot MediaMarkt>`.
- **Vor Veröffentlichung:** Die gezeigten Cashback-Sätze mit den aktuellen Angeboten in der App abgleichen. Die Fussnote «*Cashback je nach Angebot und Bedingungen.» ist im Video und im rechten Post enthalten.

## Markenlogos

- **Hook:** 20 einheitliche Markenkacheln (`teaser/img/brand-*.png`, erzeugt mit `node teaser/brands/build-tiles.mjs` aus `teaser/brands/tiles.html`). Alle haben dasselbe Format (542 × 379, wie die App-Kacheln) und dieselbe optische Logofläche.
- **Herkunft der Logos (`teaser/brands/logos/`):**
  - von den Websites der Marken: Rituals, Manor, Orell Füssli, IKEA, MediaMarkt, Airbnb, Mobility, Tchibo und PowerFood
  - Simple Icons (offizielle Markenformen, einfarbig): Adidas, Sony, Sky, Nintendo und Just Eat (nur Haus-Symbol)
  - worldvectorlogo: H&M und Swarovski
  - Decathlon und Zalando: Original-Kacheln aus der App
- **Globus und Ticketcorner:** Logos von allnova geliefert (freigestellt).
- **App-Szene:** Swarovski, PowerFood, Manor, Orell Füssli, IKEA und Zalando, Texte und Cashback aus den App-Screenshots. PowerFood, Manor und Orell Füssli haben die neuen Logo-Kacheln, weil auf den App-Kacheln das Logo nicht vollständig zu sehen war.

## Bauen

```bash
cd app-kampagne
npm install
npm run render                         # Ton + Teaser (Motion-Blur 8×, ca. 11 min)
node render.mjs teaser --stills=2,8,28 # Einzelbilder zur Kontrolle
node render.mjs --mux                  # nur Ton neu unter das Video legen
npm run instagram                      # Instagram-Visuals + Rastervorschau exportieren
npm run preview                        # Vorschau: http://localhost:8090/teaser/ bzw. /instagram/post-links.html
```

Texte ändern: im Teaser oben im Objekt `C` (`teaser/index.html`), in den Posts im Objekt `T` der jeweiligen HTML-Datei.
