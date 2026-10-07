#!/usr/bin/env python3
"""
Sounddesign für den allnova App-Teaser — vollständig synthetisch (keine Lizenzfragen).

  python3 sound/sounddesign.py            → out/sound/teaser.wav (48 kHz, Stereo, 30 s)

Aufbau pro Video:
  * Musikbett: warmer Pad-Akkord, Sub-Bass, Pluck-Arpeggio (Kalimba-artig), dezente Hi-Hats
    (Fahrstart zusätzlich ein weicher Puls-Kick), Ausklang über der statischen Endkarte.
  * Sound-Effekte synchron zur GSAP-Timeline (Zeiten = Sekunden in videos/<name>/index.html):
    Whooshes bei Szenenwechseln, Ticks bei Text-Reveals, Pops/Chimes bei Häkchen und Badges,
    Papier-Swishes bei Karten, ein weicher Impact auf der Endkarte.
Wird eine Timeline verschoben, hier die Cue-Zeiten mitziehen.
"""
import os
import wave
import numpy as np

SR = 48000
SFX = 0.07  # Effekte gegenüber der Musik (vorher 1.0 → 0.55 → 0.38 → 0.22; jetzt −10 dB) — dezent, nicht lauter als das Musikbett
DUR = 30.0
N = int(SR * DUR)
rng = np.random.default_rng(7)


# ------------------------------------------------------------------ Grundbausteine
def t_axis(d):
    return np.arange(int(d * SR)) / SR


def note(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)


def adsr(n, a, d, s, r, total):
    t = np.arange(n) / SR
    e = np.ones(n) * s
    e[t < a] = t[t < a] / max(a, 1e-4)
    m = (t >= a) & (t < a + d)
    e[m] = 1 - (1 - s) * (t[m] - a) / max(d, 1e-4)
    rel = t > total - r
    e[rel] *= np.clip((total - t[rel]) / max(r, 1e-4), 0, 1)
    return e


def pan(mono, p):
    """p: -1 links … +1 rechts (konstante Leistung)"""
    a = (np.asarray(p) + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=0)


def place(bus, sig, at, gain=1.0):
    i = int(at * SR)
    if i >= bus.shape[1]:
        return
    sig = sig[:, : bus.shape[1] - i] if sig.ndim == 2 else sig[: bus.shape[1] - i]
    if sig.ndim == 1:
        sig = np.stack([sig, sig])
    bus[:, i:i + sig.shape[1]] += sig * gain


def onepole_lp(x, fc):
    # vektorisierte Näherung über FFT (sanfter Tiefpass)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X / np.sqrt(1 + (f / fc) ** 2), n=len(x))


def shaped_noise(d, centers, widths, env):
    """STFT-Synthese: Rauschen mit zeitlich wanderndem Bandpass (für Whooshes)."""
    hop, win = 256, 1024
    frames = int(np.ceil(d * SR / hop)) + 4
    freqs = np.fft.rfftfreq(win, 1 / SR)
    out = np.zeros(frames * hop + win)
    w = np.hanning(win)
    pos = np.linspace(0, 1, frames)
    c = np.interp(pos, np.linspace(0, 1, len(centers)), centers)
    bw = np.interp(pos, np.linspace(0, 1, len(widths)), widths)
    g = np.interp(pos, np.linspace(0, 1, len(env)), env)
    for k in range(frames):
        mag = np.exp(-0.5 * ((np.log(freqs + 1) - np.log(c[k])) / bw[k]) ** 2) * g[k]
        spec = mag * np.exp(1j * rng.uniform(0, 2 * np.pi, len(freqs)))
        out[k * hop:k * hop + win] += np.fft.irfft(spec, n=win) * w
    out = out[: int(d * SR)]
    return out / (np.max(np.abs(out)) + 1e-9)


# ------------------------------------------------------------------ Instrumente
def pad_chord(freqs, d, bright=0.32):
    t = t_axis(d)
    out = np.zeros((2, len(t)))
    for j, f in enumerate(freqs):
        for det, p in ((-7, -0.6), (0, 0.0), (7, 0.6)):
            ff = f * 2 ** (det / 1200)
            sig = np.zeros(len(t))
            for h in range(1, 9):
                sig += np.sin(2 * np.pi * ff * h * t + rng.uniform(0, 6.28)) * np.exp(-h / (1 + bright * 6)) / h
            out += pan(sig, p * 0.8) / (len(freqs) * 3)
    trem = 1 + 0.06 * np.sin(2 * np.pi * 0.25 * t)
    return out * adsr(len(t), 1.4, 0.5, 0.85, 1.6, d) * trem


def sub(f, d):
    t = t_axis(d)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    return s * adsr(len(t), 0.25, 0.4, 0.8, 0.8, d)


def pluck(f, d=1.2, bright=1.0):
    t = t_axis(d)
    env = np.exp(-t / 0.32) * np.clip(t / 0.003, 0, 1)
    s = np.sin(2 * np.pi * f * t) + 0.35 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.12) \
        + 0.12 * bright * np.sin(6 * np.pi * f * t) * np.exp(-t / 0.06)
    return s * env


def hat(d=0.09, gain=1.0):
    n = shaped_noise(d, [9000, 9000], [0.35, 0.35], [1, 0])
    t = t_axis(d)
    return n * np.exp(-t / 0.018) * gain


def kick(d=0.45):
    t = t_axis(d)
    f = 45 + 75 * np.exp(-t / 0.03)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.16) * np.clip(t / 0.002, 0, 1)


def tick(f=2600, d=0.06):
    t = t_axis(d)
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.012) + 0.4 * np.sin(2 * np.pi * f * 1.5 * t) * np.exp(-t / 0.006)
    return s


def pop(f0=320, f1=760, d=0.14):
    t = t_axis(d)
    f = f0 + (f1 - f0) * (1 - np.exp(-t / 0.02))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.045) * np.clip(t / 0.002, 0, 1)


def chime(f, d=2.2):
    t = t_axis(d)
    idx = 2.2 * np.exp(-t / 0.25)
    s = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * 3.5 * t))
    s += 0.35 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / 0.5)
    return s * np.exp(-t / 0.75) * np.clip(t / 0.002, 0, 1)


def whoosh(d, f0, f1, peak=0.6, width=0.55):
    env = np.concatenate([np.linspace(0, 1, int(peak * 50)) ** 2, np.linspace(1, 0, 50 - int(peak * 50)) ** 1.6])
    n = shaped_noise(d, np.geomspace(f0, f1, 12), [width] * 2, env)
    p = np.linspace(-0.5, 0.5, len(n))
    return pan(n, p)


def swish(d=0.28):
    return whoosh(d, 2500, 6500, peak=0.35, width=0.45)


def impact(d=2.6):
    t = t_axis(d)
    low = np.sin(2 * np.pi * (48 + 30 * np.exp(-t / 0.06)) * t) * np.exp(-t / 0.55)
    body = shaped_noise(d, [900, 300], [0.6, 0.6], [1, 0.3, 0, 0, 0]) * np.exp(-t / 0.25) * 0.35
    return (low + body) * np.clip(t / 0.003, 0, 1)


def shimmer(freqs, d=2.5, spread=0.045):
    out = np.zeros((2, int(d * SR)))
    for k, f in enumerate(freqs):
        c = chime(f, d - k * spread) * 0.5
        place(out, pan(c, np.sin(k * 1.7) * 0.6), k * spread)
    return out


# ------------------------------------------------------------------ Musik
def music(chords, bpm, start_arp, stop_arp, hats=None, kicks=None, end_fade=(27.2, 30.0), arp_oct_up=True):
    bus = np.zeros((2, N))
    beat = 60 / bpm
    for (at, until, names) in chords:
        fr = [note(x) for x in names]
        place(bus, pad_chord(fr, until - at + 1.6), at, 0.55)
        place(bus, sub(fr[0] / 2, until - at + 0.6), at, 0.30)
    # Pluck-Arpeggio auf Achteln
    pattern = [0, 2, 1, 3, 2, 4, 1, 3]
    t = start_arp
    i = 0
    while t < stop_arp:
        names = next(c[2] for c in reversed(chords) if c[0] <= t + 1e-6)
        fr = [note(x) * (2 if arp_oct_up else 1) for x in names]
        f = fr[pattern[i % len(pattern)] % len(fr)]
        vel = 0.9 if i % 4 == 0 else 0.55 if i % 2 == 0 else 0.4
        place(bus, pan(pluck(f), 0.35 * np.sin(i * 0.9)), t, 0.16 * vel)
        t += beat / 2
        i += 1
    if hats:
        a, b = hats
        t = a + beat / 2
        while t < b:
            place(bus, pan(hat(gain=1.0), 0.25), t, 0.05)
            t += beat
    if kicks:
        a, b = kicks
        t = a
        while t < b:
            place(bus, kick(), t, 0.22)
            # Sidechain-Gefühl: Bett kurz ducken
            i0, i1 = int(t * SR), int((t + 0.22) * SR)
            if i1 < N:
                bus[:, i0:i1] *= np.linspace(0.6, 1.0, i1 - i0)
            t += beat
    # Ausklang über der statischen Endkarte
    f0, f1 = int(end_fade[0] * SR), int(end_fade[1] * SR)
    fade = np.ones(N)
    fade[f0:f1] = np.linspace(1, 0, f1 - f0) ** 1.5
    fade[f1:] = 0
    return bus * fade


# ------------------------------------------------------------------ Mischung
def master(mus, sfx, mus_gain, sfx_gain):
    mix = mus * mus_gain + sfx * sfx_gain
    # sanfter Kompressor/Limiter
    rms = np.sqrt(np.mean(mix ** 2))
    mix *= 10 ** (-17 / 20) / (rms + 1e-9)
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    peak = np.max(np.abs(mix))
    mix *= 10 ** (-1 / 20) / peak
    # 10 ms Fade-in/out gegen Klicks
    k = int(0.01 * SR)
    mix[:, :k] *= np.linspace(0, 1, k)
    mix[:, -k:] *= np.linspace(1, 0, k)
    return mix


def write(path, mix):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


# ------------------------------------------------------------------ App-Teaser (116 BPM, F-Dur, Puls)
def app():
    B = 60 / 116
    chords = [
        (0.0, 2.6, ['F2', 'C3', 'F3', 'A3', 'E4']),
        (2.6, 6.72, ['D2', 'A2', 'D3', 'F3', 'C4']),
        (6.72, 10.34, ['A#1', 'F2', 'A#2', 'D3', 'A3']),
        (10.34, 14.48, ['F2', 'C3', 'F3', 'A3', 'E4']),
        (14.48, 18.62, ['G2', 'D3', 'G3', 'A#3', 'F4']),   # Dokumente: offener, Puls pausiert
        (18.62, 21.72, ['A#1', 'F2', 'A#2', 'D3', 'A3']),
        (21.72, 25.34, ['C2', 'G2', 'C3', 'E3', 'D4']),
        (25.34, 30.0, ['F2', 'C3', 'F3', 'A3', 'E4']),
    ]
    mus = music(chords, 116, start_arp=2.6, stop_arp=25.3, hats=(2.6, 25.3), kicks=(2.6, 14.48), end_fade=(26.4, 30.0))
    # Puls nach der Dokumentenszene wieder aufnehmen
    t = 18.62
    while t < 25.3:
        place(mus, kick(), t, 0.22)
        i0, i1 = int(t * SR), int((t + 0.22) * SR)
        mus[:, i0:i1] *= np.linspace(0.6, 1.0, i1 - i0)
        t += B
    s = np.zeros((2, N))
    # 0–2.6 s: Hook — Swoosh ins Bild (Spitze bei ~0.15 s, wenn «Mehr» und der Markenstrom einlaufen)
    place(s, whoosh(0.5, 450, 3800, peak=0.3, width=0.6), 0.0, 0.34)
    place(s, whoosh(2.6, 400, 1800, peak=0.5, width=0.7), 0.0, 0.12)
    for at in (0.12, 0.32, 0.32 + 1.5 * B, 0.32 + 3 * B):
        place(s, pan(tick(1500), 0.1), at, 0.07)
    place(s, whoosh(0.7, 300, 4200, peak=0.7), 2.3, 0.42)
    # 2.6–6.7 s: Marken
    place(s, whoosh(0.9, 900, 250, peak=0.35), 2.55, 0.25)
    for i in range(6):
        place(s, pan(pop(300, 640, 0.1), -0.3 + 0.12 * i), 3.02 + i * B / 2, 0.20)
    for k, at in enumerate((3.3, 3.45, 3.7, 3.8)):
        place(s, swish(0.32), at, 0.16)
    place(s, pan(tick(1500), 0), 3.5, 0.06)
    # 6.7–10.3 s: Cashback — heller, warmer Ton (keine Kasse)
    for at, p_ in ((6.47, -0.5), (6.52, 0.5)):
        place(s, swish(0.35), at, 0.16)
    place(s, whoosh(1.0, 400, 3000, peak=0.6), 6.7, 0.36)
    place(s, chime(note('F5'), 2.6), 7.87, 0.15)
    place(s, chime(note('C6'), 2.2), 7.93, 0.06)
    place(s, shimmer([note('A5'), note('C6'), note('F6')], 1.4, 0.03), 7.84, 0.05)
    # 10.3–14.5 s: Wallet — weich, Puls ruhig
    place(s, whoosh(0.6, 2000, 6000, peak=0.5), 10.0, 0.20)
    place(s, swish(0.4), 10.39, 0.22)
    for at in (10.34 + 2 * B, 10.34 + 3 * B, 10.34 + 4 * B):
        place(s, pan(pop(240, 420, 0.09), 0.2), at + 0.05, 0.26)
    place(s, pan(tick(1400), -0.1), 11.14, 0.05)
    # 14.5–18.6 s: Dokumente — Rhythmus ausgedünnt, trockene Klicks
    place(s, whoosh(0.6, 2000, 6000, peak=0.5), 14.18, 0.20)
    place(s, whoosh(1.0, 300, 2400, peak=0.6), 14.45, 0.30)
    for k in range(3):
        at = 14.48 + 0.62 + k * B
        place(s, swish(0.3), at - 0.05, 0.14)
        place(s, pan(pop(220, 380, 0.08), 0.1), at + 0.18, 0.28)
    # 18.6–21.7 s: Kontakt — dezenter Ton zum Symbol
    place(s, whoosh(0.6, 2000, 6000, peak=0.5), 18.27, 0.20)
    place(s, swish(0.4), 18.67, 0.22)
    place(s, pan(tick(1500), 0.3), 18.62 + 2 * B, 0.07)
    place(s, chime(note('A4'), 1.8), 18.62 + 2 * B + 0.12, 0.10)
    # 21.7–25.3 s: Verdichtung — die drei Handys kommen ohne Klang-Akzente (nur Musik)
    place(s, whoosh(0.6, 2000, 6000, peak=0.5), 21.42, 0.20)
    # 25.3–30 s: Endkarte — Handys raus (fallender Whoosh), Logo/Text rein (Swoosh, Spitze ~25.55 s), Ausklang
    place(s, whoosh(0.8, 3000, 400, peak=0.4), 25.04, 0.28)
    place(s, whoosh(0.75, 420, 3400, peak=0.42, width=0.6), 25.24, 0.26)
    place(s, impact(), 25.44, 0.16)
    place(s, swish(0.32), 26.0, 0.12)   # Store-Badges
    # Effekte weicher: Höhen sanft absenken (weniger spitz/penetrant)
    s = np.stack([onepole_lp(ch, 4500) for ch in s])
    write('out/sound/teaser.wav', master(mus, s, 0.6, SFX))


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    app()
    print('out/sound/teaser.wav')
