#!/usr/bin/env python3
"""Bereinigte Bildebenen für den App-Teaser aus den Original-Screenshots erzeugen.

    python3 teaser/build-assets.py <Ordner 02_Screenshots_Originale> [<Screenshot Nikin/IKEA>] [<Screenshot MediaMarkt>]

Die Originale enthalten persönliche Daten und gehören NICHT ins Repository. Dieses Skript
schreibt nur Ausschnitte ohne persönliche Daten nach app/img/. Persönliche Felder werden
physisch aus den Pixeln entfernt (mit der umgebenden Fläche rekonstruiert); die Demowerte setzt
die Komposition als eigene Textebene in Poppins darüber (Masse per Pixelvergleich kalibriert).
Koordinaten in Original-Pixeln (iPhone @3x, 1170 × 2532).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path(sys.argv[1])
OUT = Path(__file__).resolve().parent / 'img'
OUT.mkdir(exist_ok=True)
JPG_TO_3X = 1170 / 710  # die JPEG-Screenshots sind kleiner exportiert


def load(name):
    return Image.open(SRC / name).convert('RGB')


def rounded(im, r):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), r, fill=255)
    out = im.convert('RGBA')
    out.putalpha(m)
    return out


def erase(im, box, sample_y):
    """Bereich mit der Pixelzeile `sample_y` (gleiche Spalten) auffüllen — erhält Verläufe/Kanten."""
    x0, y0, x1, y1 = box
    row = im.crop((x0, sample_y, x1, sample_y + 1))
    for y in range(y0, y1):
        im.paste(row, (x0, y))


def save(im, name):
    im.save(OUT / name, optimize=True)
    print('  ', name, im.size)


# --- Entdecken: Gutscheinkacheln (keine persönlichen Daten) ---------------------------
ent = load('IMG_5412(1).png')
save(ent, 'entdecken.png')
names = [['decathlon', 'sony'], ['sky', 'hm'], ['xbox', 'zalando']]
for r, ty in enumerate([142, 857, 1572]):
    for c, tx in enumerate([36, 592]):
        n = names[r][c]
        save(rounded(ent.crop((tx, ty, tx + 542, ty + 379)), 26), f'tile-{n}.png')
        save(rounded(ent.crop((tx, ty + 555, tx + 303, ty + 631)), 24), f'badge-{n}.png')

# Kartenblöcke (Kachel + Titel + Text + Badge) einzeln + leerer Raster-Hintergrund
for r, ty in enumerate([142, 857, 1572]):
    for c, tx in enumerate([36, 592]):
        save(ent.crop((tx - 6, ty - 6, tx + 548, ty + 640)), f'ent-card-{names[r][c]}.png')
eb = ent.copy()
erase(eb, (0, 128, 1170, 2216), 120)
save(eb, 'entdecken-base.png')

# --- Login / Willkommen (keine persönlichen Daten) -----------------------------------
save(load('IMG_5405(1).png'), 'login.png')

# --- Dokumente: Policennummer, Ablaufdatum, Prämie entfernt -------------------------------
doc = load('IMG_5407(1).png')
for k in range(3):
    dy = 315 * k
    erase(doc, (462, 764 + dy, 704, 808 + dy), 762 + dy)   # Policen-Nr. (Wert)
    erase(doc, (449, 830 + dy, 634, 874 + dy), 828 + dy)   # Ablaufdatum
    erase(doc, (770, 824 + dy, 1094, 878 + dy), 822 + dy)  # Prämie CHF/Jahr
save(doc, 'dokumente-anon.png')
# einzeln animierbare Karten (inkl. Schatten) + Hintergrund ohne Karten
for k, cy in enumerate([618, 933, 1248]):
    save(doc.crop((30, cy - 14, 1140, cy + 311)), f'doc-card-{k + 1}.png')
base = doc.copy()
erase(base, (0, 600, 1170, 1575), 1590)
save(base, 'dokumente-base.png')

# --- Wallet: nur Kopf + Buttons + Tabs, Punktestand entfernt, Diagramme nicht verwendet ---------
wal = load('IMG_5408(1).png')
erase(wal, (36, 380, 650, 474), 376)      # Punktestand
erase(wal, (36, 520, 470, 576), 516)      # Monatswert
save(wal.crop((0, 196, 1170, 500)), 'wallet-head.png')
save(wal.crop((0, 852, 1170, 1014)), 'wallet-buttons.png')
save(wal.crop((0, 1100, 1170, 1262)), 'wallet-tabs.png')
save(wal.crop((0, 2330, 1170, 2532)), 'nav-brieftasche.png')

# --- Navigationsleisten ------------------------------------------------------------
save(load('IMG_5406(2).png').crop((0, 2330, 1170, 2532)), 'nav-startseite.png')
save(doc.crop((0, 2330, 1170, 2532)), 'nav-dokumente.png')
save(ent.crop((0, 2330, 1170, 2532)), 'nav-entdecken.png')

# --- Startseite-Kopf: nur Icons (Name/Avatar werden neu gesetzt: «Alex», «A») --------------
home = load('IMG_5404(1).jpeg')
for n, box in [('icon-contacts', (550, 138, 598, 186)), ('emoji-wave', (262, 166, 296, 199))]:
    t = home.crop(box)
    save(t.resize((round(t.width * JPG_TO_3X), round(t.height * JPG_TO_3X)), Image.LANCZOS), f'{n}.png')

# --- Weitere Gutscheinkacheln (Entdecken, Screenshots 924 × 2000) -------------------------
# argv[2]: Screenshot mit Nikin/IKEA, argv[3]: Screenshot mit MediaMarkt
K = 542 / 429  # auf @3x-Kachelgrösse
MORE = [
    (2, 'nikin', (28, 483), ((310, 0, 429, 34), (38, 48, 40))),  # Betragsangabe oben rechts abgedeckt
    (2, 'ikea', (467, 483), None),
    (3, 'mediamarkt', (28, 408), None),
]
for arg, n, (x, y), cover in MORE:
    if len(sys.argv) <= arg:
        continue
    t = Image.open(sys.argv[arg]).convert('RGB').crop((x + 1, y + 2, x + 429, y + 300))  # 1–2 px Rand weglassen
    if cover:
        ImageDraw.Draw(t).rectangle(cover[0], fill=cover[1])
    save(rounded(t.resize((542, 380), Image.LANCZOS), 26), f'tile-{n}.png')
