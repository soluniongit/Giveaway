#!/usr/bin/env python3
"""Bildebene «Dokumentdetails» (Cashback-Status der AXA-Altersvorsorge) für den App-Teaser.

    python3 teaser/build-cashback.py <Screenshot Dokumentdetails AXA (942 × 2048)>

Der Screenshot wird auf App-Pixel @3x (1170 breit) skaliert. Die Statusleiste kommt aus dem
bereits bereinigten Dokumente-Screen (gleiche Uhrzeit wie dort), Fortschrittsring, «100%» und der
Betrag werden entfernt: die Komposition zeichnet sie animiert neu (SVG + Poppins).
Masse in App-Pixeln (Original × 1170/942): Ringmitte (584.4, 1189.9), Ring r 194.4,
Band r 202–217, Strichkreis r 230.4 (24 Striche), Betrag Grundlinie 1838.
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / 'img'
K = 1170 / 942
BG = (249, 250, 252)

src = Image.open(sys.argv[1]).convert('RGB')
im = src.resize((1170, round(src.height * K)), Image.LANCZOS).crop((0, 0, 1170, 2532))
d = ImageDraw.Draw(im)

# Statusleiste ersetzen (Dokumente-Screen, Hintergrund #F5F5F7 → #F9FAFC verschoben)
dok = Image.open(OUT / 'dokumente-anon.png').convert('RGB').crop((0, 30, 1170, 150))
shift = tuple(b - a for a, b in zip((245, 245, 247), BG))
dok = Image.eval(dok, lambda v: v)  # Kopie
px = dok.load()
for y in range(dok.height):
    for x in range(dok.width):
        r, g, b = px[x, y]
        px[x, y] = (min(255, r + shift[0]), min(255, g + shift[1]), min(255, b + shift[2]))
d.rectangle((0, 30, 1170, 150), fill=BG)
im.paste(dok, (0, 30))

# Ring + «100%» und Betrag entfernen (werden animiert gezeichnet)
cx, cy = 470.5 * K, 958 * K
r = 196 * K
d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=BG)
d.rectangle((355 * K, 1444 * K, 590 * K, 1490 * K), fill=BG)

im.save(OUT / 'doc-detail.png', optimize=True)
print(OUT / 'doc-detail.png')
