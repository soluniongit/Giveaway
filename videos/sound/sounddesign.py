#!/usr/bin/env python3
"""
Sounddesign für die beiden Gewinnspiel-Videos — vollständig synthetisch (keine Lizenzfragen).

  python3 sound/sounddesign.py            → out/sound/<video>.wav (48 kHz, Stereo, 30 s)

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


# ------------------------------------------------------------------ Steuergewinnspiel (96 BPM, D-Dur)
def steuer():
    chords = [
        (0.0, 5.0, ['D3', 'F#3', 'A3', 'C#4', 'E4']),
        (5.0, 10.0, ['B2', 'D3', 'F#3', 'A3', 'C#4']),
        (10.0, 15.0, ['G2', 'B2', 'D3', 'F#3', 'A3']),
        (15.0, 20.0, ['E3', 'G3', 'B3', 'D4', 'F#4']),
        (20.0, 23.45, ['A2', 'C#3', 'E3', 'G3', 'B3']),
        (23.45, 30.0, ['D3', 'F#3', 'A3', 'C#4', 'E4']),
    ]
    mus = music(chords, 96, start_arp=0.25, stop_arp=26.6, hats=(4.0, 22.4))
    s = np.zeros((2, N))
    # 0–4 s: Hook
    place(s, impact(), 0.25, 0.55)
    place(s, shimmer([note('A5'), note('D6'), note('F#6'), note('A6')]), 0.3, 0.25)
    for k, at in enumerate((0.75, 0.84, 0.93)):
        place(s, swish(), at, 0.30)
    for at in (0.2, 0.95, 1.55, 2.15):
        place(s, pan(tick(), 0.1), at, 0.18)
    # 4–10 s: Paket
    place(s, whoosh(1.0, 300, 3500, peak=0.55), 3.55, 0.45)
    place(s, swish(0.45), 4.0, 0.25)
    place(s, pan(tick(), -0.1), 4.55, 0.18)
    place(s, whoosh(1.3, 800, 7000, peak=0.85, width=0.4), 5.15, 0.18)
    place(s, pan(pop(), 0), 6.05, 0.40)
    place(s, chime(note('D6')), 6.1, 0.22)
    place(s, pan(tick(), 0.1), 6.5, 0.18)
    # 10–16 s: Leistung
    place(s, whoosh(1.0, 300, 3500, peak=0.5), 9.45, 0.45)
    place(s, whoosh(1.0, 1200, 300, peak=0.4), 9.85, 0.20)
    place(s, pan(tick(), -0.1), 10.9, 0.16)
    place(s, pan(pop(), -0.15), 11.45, 0.35)
    place(s, chime(note('F#6')), 11.5, 0.22)
    place(s, pan(pop(480, 980, 0.1), 0), 11.75, 0.18)
    place(s, pan(tick(), 0.1), 12.0, 0.16)
    place(s, pan(pop(), 0.15), 12.55, 0.35)
    place(s, chime(note('A6')), 12.6, 0.22)
    place(s, whoosh(0.5, 1500, 6000, peak=0.4), 12.75, 0.18)
    place(s, whoosh(0.9, 500, 2500, peak=0.5), 13.2, 0.22)
    place(s, whoosh(0.45, 2000, 7000, peak=0.5), 14.3, 0.16)
    # 16–23 s: Teilnahme
    place(s, whoosh(1.0, 300, 3500, peak=0.5), 15.45, 0.45)
    place(s, pan(tick(), 0), 16.05, 0.16)
    for k, at in enumerate((16.25, 16.37, 16.49)):
        place(s, pan(pop(260, 520, 0.12), -0.3 + 0.3 * k), at, 0.22)
    for at, n in ((17.0, 'D6'), (18.45, 'F#6'), (19.9, 'A6')):
        place(s, pan(pop(), 0), at, 0.30)
        place(s, chime(note(n)), at + 0.02, 0.24)
    for at in (17.55, 19.0):
        place(s, whoosh(1.0, 400, 2400, peak=0.8, width=0.4), at, 0.14)
    place(s, pan(pop(500, 1100, 0.1), 0.2), 20.3, 0.25)
    place(s, swish(0.4), 20.85, 0.22)
    place(s, pan(tick(), 0), 21.05, 0.16)
    # 23–30 s: Endkarte
    place(s, whoosh(1.0, 300, 3500, peak=0.5), 22.75, 0.40)
    place(s, impact(), 23.45, 0.65)
    place(s, shimmer([note('D5'), note('A5'), note('D6'), note('F#6'), note('A6'), note('D7')], 3.4), 23.5, 0.30)
    for at in (23.7, 23.85, 24.0):
        place(s, pan(tick(2200), 0), at, 0.12)
    place(s, whoosh(0.8, 600, 4000, peak=0.6), 24.4, 0.30)
    place(s, pan(pop(380, 900, 0.12), 0.3), 24.95, 0.30)
    place(s, pan(tick(2200), 0), 25.2, 0.12)
    write('out/sound/steuer.wav', master(mus, s, 0.62, 1.0))


# ------------------------------------------------------------------ Fahrstart (104 BPM, A-Dur, Puls)
def fahrstart():
    chords = [
        (0.0, 3.85, ['A2', 'E3', 'A3', 'C#4', 'E4']),
        (3.85, 9.75, ['F#2', 'C#3', 'F#3', 'A3', 'E4']),
        (9.75, 15.75, ['D3', 'F#3', 'A3', 'C#4', 'E4']),
        (15.75, 22.85, ['E3', 'G#3', 'B3', 'D4', 'F#4']),
        (22.85, 30.0, ['A2', 'E3', 'A3', 'C#4', 'E4']),
    ]
    mus = music(chords, 104, start_arp=0.35, stop_arp=26.4, hats=(3.85, 22.6), kicks=(3.85, 22.6))
    s = np.zeros((2, N))
    # 0–4 s: Weglinie zeichnet sich, L-Schild
    place(s, whoosh(2.2, 200, 1800, peak=0.7, width=0.45), 0.05, 0.40)
    place(s, impact(), 0.35, 0.45)
    place(s, pan(pop(260, 620, 0.16), -0.3), 0.4, 0.40)
    for at in (0.55, 0.9, 1.25, 1.6, 1.75):
        place(s, pan(tick(), 0.1), at, 0.16)
    # Kamerafahrten (Szenenwechsel)
    for at in (3.5, 9.4, 15.4, 22.5):
        place(s, whoosh(1.6, 180, 2800, peak=0.55, width=0.6), at, 0.50)
    # 4–10 s: Gewinne
    place(s, swish(0.45), 4.45, 0.30)
    place(s, swish(0.45), 4.6, 0.28)
    for at in (4.5, 4.65):
        place(s, pan(tick(), 0), at, 0.14)
    place(s, pan(pop(), 0), 5.3, 0.35)
    place(s, pan(pop(300, 700, 0.15), -0.2), 6.25, 0.35)
    place(s, chime(note('E6')), 6.3, 0.18)
    for at in (6.65, 7.2):
        place(s, pan(tick(), 0.1), at, 0.15)
    # 10–16 s: Anbieter
    for at in (10.3, 10.45):
        place(s, pan(tick(), 0), at, 0.15)
    for k, at in enumerate((10.55, 10.67, 10.79)):
        place(s, swish(0.35), at, 0.20)
    for at, n in ((11.3, 'A5'), (11.8, 'C#6'), (12.3, 'E6')):
        place(s, chime(note(n), 1.6), at, 0.22)
        place(s, pan(pop(400, 900, 0.1), -0.4), at, 0.18)
    place(s, whoosh(1.0, 800, 6000, peak=0.85, width=0.4), 12.75, 0.18)
    place(s, pan(pop(), 0.3), 13.5, 0.35)
    place(s, chime(note('A6')), 13.52, 0.22)
    for at in (13.6, 13.8):
        place(s, pan(tick(), 0), at, 0.14)
    # 16–23 s: Formular → Umschlag
    place(s, pan(pop(220, 480, 0.16), 0), 16.35, 0.30)
    place(s, pan(tick(), -0.1), 16.6, 0.14)
    for base in (16.95, 17.33, 17.71):
        for j in range(5):
            place(s, pan(tick(3400 + 400 * (j % 2), 0.03), 0.2), base + j * 0.07, 0.07)
    place(s, pan(pop(600, 400, 0.08), 0), 18.2, 0.30)
    place(s, whoosh(0.9, 3000, 700, peak=0.4, width=0.5), 18.55, 0.30)
    place(s, whoosh(0.6, 1500, 5000, peak=0.6), 19.25, 0.16)
    place(s, pan(tick(), 0), 19.45, 0.14)
    place(s, pan(pop(), 0.2), 19.75, 0.38)
    place(s, chime(note('E6')), 19.77, 0.24)
    place(s, chime(note('A6')), 19.9, 0.18)
    for at in (20.5, 20.65):
        place(s, pan(pop(330, 700, 0.12), -0.2), at, 0.22)
    # 23–30 s: Endkarte
    place(s, impact(), 23.55, 0.65)
    place(s, shimmer([note('A4'), note('E5'), note('A5'), note('C#6'), note('E6'), note('A6')], 3.4), 23.6, 0.30)
    for at in (23.75, 23.9):
        place(s, pan(tick(2200), 0), at, 0.12)
    place(s, whoosh(0.9, 500, 4000, peak=0.7), 24.35, 0.30)
    place(s, pan(pop(380, 900, 0.12), 0.3), 24.55, 0.30)
    for at in (24.85, 25.0, 25.2):
        place(s, pan(tick(2200), 0), at, 0.11)
    write('out/sound/fahrstart.wav', master(mus, s, 0.62, 1.0))


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    steuer()
    fahrstart()
    print('out/sound/steuer.wav, out/sound/fahrstart.wav')
