#!/usr/bin/env python3
"""
Generates the background tracks for the Instagram reels from scratch (numpy
synthesis, no samples), so there are no third-party rights on them.

    python3 scripts/music/generate-reel-tracks.py [outdir]

Writes one WAV per track to outdir (default: a temp folder) and, when ffmpeg
is installed, an MP3 normalised to -18 LUFS (like rustig-01.mp3) into
remotion/public/music. Every track is seeded, so a rerun gives the same file.
"""

import os
import shutil
import subprocess
import sys
import tempfile
import wave

import numpy as np

SR = 48000
SECONDS = 32.0
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MUSIC_DIR = os.path.join(ROOT, "remotion", "public", "music")

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6,
        "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def midi(name: str) -> int:
    """'C4' -> 60, 'F#3' -> 54."""
    pitch, octave = name[:-1], int(name[-1])
    return 12 * (octave + 1) + NOTE[pitch]


def freq(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


CHORD = {"": [0, 4, 7], "m": [0, 3, 7], "7": [0, 4, 7, 10], "maj7": [0, 4, 7, 11],
         "m7": [0, 3, 7, 10], "sus2": [0, 2, 7], "add9": [0, 4, 7, 14], "m9": [0, 3, 7, 10, 14]}


def chord(name: str, octave: int = 3) -> list[int]:
    """'Am7' -> midi notes from the root in the given octave."""
    root = name[:2] if len(name) > 1 and name[1] in "#b" else name[:1]
    return [midi(root + str(octave)) + i for i in CHORD[name[len(root):]]]


# ---------------------------------------------------------------- DSP helpers


def t_axis(n: int) -> np.ndarray:
    return np.arange(n) / SR


def env_adsr(n: int, a: float, d: float, s: float, r: float, hold: float) -> np.ndarray:
    """Attack/decay/sustain level/release in seconds; `hold` = gate length."""
    t = t_axis(n)
    e = np.where(t < a, t / max(a, 1e-4), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4)))
    rel = t > hold
    e[rel] *= np.exp(-(t[rel] - hold) / max(r, 1e-4))
    return e


def onepole_lp(x: np.ndarray, cutoff: float) -> np.ndarray:
    """Cheap 12 dB lowpass via FFT mask (fine for whole stems)."""
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    mask = 1 / (1 + (f / cutoff) ** 4) ** 0.5
    if x.ndim == 2:
        mask = mask[:, None]
    return np.fft.irfft(spec * mask, n=x.shape[0], axis=0)


def highpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    spec = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(x.shape[0], 1 / SR)
    mask = 1 - 1 / (1 + (f / cutoff) ** 4) ** 0.5
    if x.ndim == 2:
        mask = mask[:, None]
    return np.fft.irfft(spec * mask, n=x.shape[0], axis=0)


def fft_convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    n = x.shape[0] + ir.shape[0] - 1
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: x.shape[0]]


def reverb(stereo: np.ndarray, seconds: float, mix: float, seed: int, damp: float = 6000) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = t_axis(n)
    out = np.zeros_like(stereo)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-6.9 * t / seconds)
        ir[: int(0.012 * SR)] = 0  # pre-delay
        ir = onepole_lp(ir, damp)
        ir /= np.sqrt(np.sum(ir**2))
        out[:, ch] = fft_convolve(stereo[:, ch], ir)
    return stereo * (1 - mix) + out * mix * 0.8


def pan(mono: np.ndarray, p: float) -> np.ndarray:
    """p from -1 (left) to 1 (right), constant power."""
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)], axis=1)


# ---------------------------------------------------------------- instruments
# Each returns a mono note of `dur` seconds (+ its tail).


def epiano(f: float, dur: float, vel: float) -> np.ndarray:
    n = int((dur + 1.2) * SR)
    t = t_axis(n)
    index = 1.6 * vel * np.exp(-t * 3.0)
    tone = np.sin(2 * np.pi * f * t + index * np.sin(2 * np.pi * f * t))
    bell = 0.12 * np.sin(2 * np.pi * f * 14 * t) * np.exp(-t * 18)
    return (tone + bell) * env_adsr(n, 0.004, 1.4, 0.0, 0.25, dur) * vel


def piano_note(f: float, dur: float, vel: float) -> np.ndarray:
    n = int((dur + 1.8) * SR)
    t = t_axis(n)
    out = np.zeros(n)
    for k in range(1, 9):
        fk = f * k * np.sqrt(1 + 0.0004 * k * k)
        if fk > 12000:
            break
        out += np.sin(2 * np.pi * fk * t + k) * np.exp(-t * (0.9 + 0.55 * k)) / k**1.15
    # two slightly detuned strings
    out += 0.5 * np.sin(2 * np.pi * f * 1.0015 * t) * np.exp(-t * 1.1)
    out *= env_adsr(n, 0.003, 9, 1.0, 0.18, dur)
    return out * vel * 0.6


def marimba(f: float, dur: float, vel: float) -> np.ndarray:
    n = int(0.9 * SR)
    t = t_axis(n)
    out = (np.sin(2 * np.pi * f * t) * np.exp(-t * 5)
           + 0.35 * np.sin(2 * np.pi * f * 3.93 * t) * np.exp(-t * 16)
           + 0.12 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t * 40))
    out[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return out * vel


def bell(f: float, dur: float, vel: float) -> np.ndarray:
    n = int(2.2 * SR)
    t = t_axis(n)
    ratios = [(1, 1.0, 1.4), (2.0, 0.4, 2.2), (2.76, 0.3, 3.0), (5.4, 0.12, 5.5), (8.9, 0.05, 8)]
    out = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t * d) for r, a, d in ratios)
    out[: int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
    return out * vel * 0.6


def pluck(f: float, dur: float, vel: float, bright: float = 0.5, seed: int = 0) -> np.ndarray:
    """Karplus-Strong string (guitar / ukulele-ish)."""
    n = int((dur + 0.8) * SR)
    period = SR / f
    p = int(period)
    frac = period - p
    rng = np.random.default_rng(seed)
    burst = rng.uniform(-1, 1, p)
    burst = onepole_lp(np.concatenate([burst, np.zeros(p)]), 1500 + 6000 * bright)[:p]
    y = np.zeros(n + p + 2)
    y[:p] = burst
    loss = 0.996
    for start in range(p, n, p):
        end = min(start + p, n)
        a = y[start - p : end - p]
        b = y[start - p - 1 : end - p - 1] if start > p else np.concatenate([[0], y[: end - p - 1]])
        y[start:end] = loss * ((1 - frac) * 0.5 * (a + b) + frac * b)
    y = y[:n]
    y *= env_adsr(n, 0.001, 9, 1.0, 0.08, dur)
    y /= max(1e-6, np.max(np.abs(y)))
    return y * vel


def pad(freqs: list[float], dur: float, vel: float, cutoff: float = 1800) -> np.ndarray:
    n = int((dur + 1.5) * SR)
    t = t_axis(n)
    out = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):  # semitone cents-ish detune
            fd = f * 2 ** (det / 12)
            for k in range(1, 7):
                out += np.sin(2 * np.pi * fd * k * t + det * 7 + k) / k
    out = onepole_lp(out, cutoff)
    out *= env_adsr(n, 0.9, 2, 0.85, 1.0, dur)
    return out * vel / (len(freqs) * 6)


def bass(f: float, dur: float, vel: float, growl: float = 0.25) -> np.ndarray:
    n = int((dur + 0.15) * SR)
    t = t_axis(n)
    out = np.sin(2 * np.pi * f * t) + growl * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 6)
    out += growl * 0.4 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t * 10)
    return out * env_adsr(n, 0.006, 0.5, 0.7, 0.05, dur) * vel


def kick(vel: float = 1.0) -> np.ndarray:
    n = int(0.45 * SR)
    t = t_axis(n)
    f = 45 + 90 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t * 7) * vel


def noise_hit(seed: int, decay: float, lo: float, hi: float, length: float = 0.3) -> np.ndarray:
    n = int(length * SR)
    t = t_axis(n)
    x = np.random.default_rng(seed).standard_normal(n)
    x = highpass(onepole_lp(x, hi), lo)
    return x * np.exp(-t * decay) / 3


def hat(vel=1.0, open_=False, seed=1):
    return noise_hit(seed, 18 if open_ else 60, 7000, 15000) * vel


def shaker(vel=1.0, seed=2):
    h = noise_hit(seed, 35, 4500, 11000, 0.15)
    h[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
    return h * vel


def clap(vel=1.0, seed=3):
    base = noise_hit(seed, 22, 900, 5000, 0.35)
    out = base.copy()
    for k, ms in enumerate((9, 18)):  # the little flam of a hand clap
        d = int(ms / 1000 * SR)
        out[d:] += base[: len(base) - d] * (0.6 - 0.15 * k)
    return out * vel * 0.8


def snare(vel=1.0, seed=4):
    n = int(0.3 * SR)
    t = t_axis(n)
    body = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    return (body * 0.6 + noise_hit(seed, 20, 1500, 9000, 0.3)) * vel


def rim(vel=1.0):
    n = int(0.08 * SR)
    t = t_axis(n)
    return (np.sin(2 * np.pi * 1700 * t) + 0.5 * np.sin(2 * np.pi * 820 * t)) * np.exp(-t * 90) * vel * 0.5


# ---------------------------------------------------------------- arranging


class Mix:
    def __init__(self, bpm: float, seed: int):
        self.n = int(SECONDS * SR)
        self.beat = 60 / bpm
        self.bus = {}
        self.rng = np.random.default_rng(seed)

    def add(self, bus: str, sound: np.ndarray, at_beat: float, p: float = 0.0, swing: float = 0.0):
        # light humanising: a few ms of timing jitter
        at = at_beat * self.beat + self.rng.normal(0, 0.004) + swing
        start = int(max(0, at) * SR)
        if start >= self.n:
            return
        if bus not in self.bus:
            self.bus[bus] = np.zeros((self.n, 2))
        st = pan(sound, p)
        end = min(self.n, start + len(st))
        self.bus[bus][start:end] += st[: end - start]

    def get(self, bus: str) -> np.ndarray:
        return self.bus.get(bus, np.zeros((self.n, 2)))

    @property
    def beats(self) -> int:
        return int(SECONDS / self.beat)


def duck(stereo: np.ndarray, mix: Mix, every: float, depth: float) -> np.ndarray:
    """Sidechain-style pumping on every `every` beats."""
    t = t_axis(stereo.shape[0])
    phase = (t / (mix.beat * every)) % 1
    g = 1 - depth * np.exp(-phase * mix.beat * every * 9)
    return stereo * g[:, None]


def master(stems: list[tuple[np.ndarray, float]], verb: tuple[float, float] | None, seed: int) -> np.ndarray:
    out = sum(s * g for s, g in stems)
    if verb:
        out = reverb(out, verb[0], verb[1], seed)
    out = highpass(out, 30)
    # soft saturation as gentle glue
    peak = np.max(np.abs(out))
    out = np.tanh(out / peak * 1.2) / np.tanh(1.2)
    return out


def progression_beats(prog: list[str], beats_per_chord: int, total: int):
    """Yields (beat, chord name) over the whole track."""
    b = 0
    while b < total:
        for c in prog:
            if b >= total:
                return
            yield b, c
            b += beats_per_chord


# ---------------------------------------------------------------- the tracks


def zonnig(seed=2):
    """Bright, plucky marimba pop. C major, 112 bpm."""
    m = Mix(112, seed)
    prog = ["C", "G", "Am", "F"]
    for b, c in progression_beats(prog, 4, m.beats):
        notes = chord(c, 4)
        pattern = [0, 2, 1, 2, 0, 2, 1, 2]
        for i, k in enumerate(pattern):
            m.add("keys", marimba(freq(notes[k] + (12 if i in (3, 7) else 0)), 0.3, 0.55), b + i * 0.5,
                  p=-0.3 + 0.6 * (i % 2))
        m.add("pad", pad([freq(x) for x in chord(c, 3)], 4 * m.beat, 0.9, 1400), b)
        root = chord(c, 2)[0]
        for k, off in enumerate((0, 1.5, 2, 3.5)):
            m.add("bass", bass(freq(root), 0.35 if k % 2 else 0.6, 0.8), b + off)
    for b in range(m.beats):
        if b >= 8:
            if b % 2 == 0:
                m.add("drums", kick(0.9), b)
            else:
                m.add("drums", clap(0.5), b, p=0.05)
        m.add("drums", shaker(0.35, seed=b), b + 0.5, p=0.4)
        m.add("drums", shaker(0.2, seed=b + 99), b, p=0.4)
    stems = [(m.get("keys"), 0.45), (m.get("pad"), 0.25), (m.get("bass"), 0.55), (m.get("drums"), 0.6)]
    return master(stems, (1.6, 0.18), seed)


def lounge(seed=3):
    """Jazzy Rhodes over brushes. D minor-ish ii-V-I, 88 bpm, swung."""
    m = Mix(88, seed)
    prog = ["Dm9", "G7", "Cmaj7", "Am7"]
    for b, c in progression_beats(prog, 4, m.beats):
        notes = chord(c, 3)
        for off, length in ((0, 1.4), (2.5, 1.2)):
            for j, x in enumerate(notes[1:]):
                m.add("keys", epiano(freq(x), length * m.beat, 0.33), b + off + j * 0.012, p=-0.2 + j * 0.15)
        root = notes[0] - 12
        walk = [root, root + 7, root + 12, root + 10]
        for i, x in enumerate(walk):
            m.add("bass", bass(freq(x), 0.8 * m.beat, 0.75, growl=0.15), b + i)
    melody = ["A4", "F4", "E4", "D4", "B4", "A4", "G4", "F4", "E4", "G4", "B4", "D5", "C5", "A4", "E4", "G4"]
    if m.beats > 16:
        for i in range(16, m.beats - 2, 2):
            note = melody[(i // 2) % len(melody)]
            m.add("lead", epiano(freq(midi(note) + 12), 0.9 * m.beat, 0.22), i + (0.66 if i % 4 else 0), p=0.25)
    for b in range(m.beats):
        m.add("drums", shaker(0.3, seed=b), b, p=0.3)
        m.add("drums", shaker(0.22, seed=b + 50), b + 0.66, p=0.3)
        if b % 2 == 1 and b >= 4:
            m.add("drums", rim(0.5), b, p=-0.1)
        if b % 4 == 0 and b >= 4:
            m.add("drums", kick(0.55), b)
    stems = [(m.get("keys"), 0.5), (m.get("lead"), 0.35), (m.get("bass"), 0.55), (m.get("drums"), 0.5)]
    return master(stems, (2.0, 0.22), seed)


def piano(seed=4):
    """Warm solo piano arpeggios with a soft pad. F major, 76 bpm, no drums."""
    m = Mix(76, seed)
    prog = ["Dm", "Bb", "F", "C"]
    for b, c in progression_beats(prog, 4, m.beats):
        notes = chord(c, 3)
        arp = [notes[0] - 12, notes[0], notes[1] + 12, notes[2], notes[0] + 12, notes[2], notes[1] + 12, notes[2]]
        for i, x in enumerate(arp):
            m.add("piano", piano_note(freq(x), 0.9, 0.55 if i == 0 else 0.4), b + i * 0.5, p=-0.25 + (x - 48) / 80)
        m.add("pad", pad([freq(x) for x in chord(c, 4)], 4 * m.beat, 0.6, 1200), b)
    top = ["A5", "G5", "F5", "C5", "D5", "F5", "E5", "C5"]
    for i, b in enumerate(range(8, m.beats - 4, 2)):
        m.add("piano", piano_note(freq(midi(top[i % len(top)])), 1.4, 0.45), b + 1, p=0.2)
    stems = [(m.get("piano"), 0.7), (m.get("pad"), 0.3)]
    return master(stems, (2.6, 0.3), seed)


def avond(seed=5):
    """Soft deep house: four-on-the-floor, offbeat bass, chord stabs. A minor, 118 bpm."""
    m = Mix(118, seed)
    prog = ["Am7", "Fmaj7", "C", "G"]
    for b, c in progression_beats(prog, 4, m.beats):
        notes = chord(c, 4)
        for off in (0.5, 1.75, 3.0):
            for x in notes[:3]:
                m.add("stab", epiano(freq(x), 0.18, 0.35), b + off)
        root = chord(c, 2)[0]
        for i in range(4):
            m.add("bass", bass(freq(root + (12 if i == 3 else 0)), 0.22, 0.85, growl=0.35), b + i + 0.5)
        m.add("pad", pad([freq(x) for x in chord(c, 3)], 4 * m.beat, 0.7, 900), b)
    for b in range(m.beats):
        m.add("kick", kick(1.0), b)
        if b >= 8:
            m.add("drums", hat(0.55, open_=True, seed=b), b + 0.5, p=0.25)
            if b % 2 == 1:
                m.add("drums", clap(0.45), b)
        m.add("drums", hat(0.25, seed=b + 300), b + 0.25, p=-0.3)
        m.add("drums", hat(0.25, seed=b + 400), b + 0.75, p=-0.3)
    music = m.get("stab") * 0.4 + m.get("bass") * 0.6 + m.get("pad") * 0.35
    music = duck(music, m, 1, 0.55)
    stems = [(music, 1.0), (m.get("kick"), 0.75), (m.get("drums"), 0.5)]
    return master(stems, (1.2, 0.12), seed)


def akoestisch(seed=6):
    """Strummed acoustic strings and handclaps. G major, 100 bpm."""
    m = Mix(100, seed)
    prog = ["G", "D", "Em", "C"]
    strum = [(0, 1, 0.9), (1, -1, 0.5), (1.5, 1, 0.6), (2.5, -1, 0.5), (3, 1, 0.7), (3.5, -1, 0.45)]
    for b, c in progression_beats(prog, 4, m.beats):
        notes = chord(c, 3) + [chord(c, 4)[0], chord(c, 4)[1]]
        for off, direction, vel in strum:
            order = notes if direction > 0 else notes[::-1]
            for j, x in enumerate(order):
                m.add("gtr", pluck(freq(x), 0.45 * m.beat * 2, vel * 0.5, bright=0.55, seed=int(b * 10 + off * 4 + j)),
                      b + off + j * 0.012 * 100 / 60, p=-0.35 + j * 0.15)
        root = chord(c, 2)[0]
        m.add("bass", bass(freq(root), 1.6 * m.beat, 0.7, growl=0.1), b)
        m.add("bass", bass(freq(root + 7), 1.2 * m.beat, 0.6, growl=0.1), b + 2.5)
    lead = ["B4", "D5", "A4", "F#4", "G4", "B4", "E5", "D5", "C5", "E5", "D5", "B4"]
    for i, b in enumerate(range(16, m.beats - 2, 1)):
        if b % 4 in (0, 2):
            m.add("lead", marimba(freq(midi(lead[i % len(lead)]) + 12), 0.3, 0.3), b + (0.5 if b % 4 == 2 else 0), p=0.3)
    for b in range(m.beats):
        m.add("drums", shaker(0.3, seed=b), b + 0.5, p=0.35)
        if b >= 8 and b % 2 == 1:
            m.add("drums", clap(0.55, seed=b), b, p=-0.05)
        if b >= 8 and b % 4 == 0:
            m.add("drums", kick(0.6), b)
    stems = [(m.get("gtr"), 0.55), (m.get("lead"), 0.35), (m.get("bass"), 0.5), (m.get("drums"), 0.55)]
    return master(stems, (1.4, 0.16), seed)


def dromerig(seed=7):
    """Dreamy bells over a lofi beat. Eb major, 82 bpm."""
    m = Mix(82, seed)
    prog = ["Ebmaj7", "Cm7", "Abmaj7", "Bb"]
    for b, c in progression_beats(prog, 4, m.beats):
        m.add("pad", pad([freq(x) for x in chord(c, 3)], 4 * m.beat, 1.0, 1100), b)
        root = chord(c, 2)[0]
        m.add("bass", bass(freq(root), 1.8 * m.beat, 0.75, growl=0.05), b)
        m.add("bass", bass(freq(root), 0.8 * m.beat, 0.55, growl=0.05), b + 2.5)
        notes = chord(c, 4)
        for i, k in enumerate([0, 2, 1, 3 if len(notes) > 3 else 2]):
            m.add("bells", bell(freq(notes[k] + 12), 0.4, 0.3), b + i, p=-0.4 + 0.27 * i)
    for b in range(m.beats):
        if b < 8:
            continue
        if b % 4 in (0,):
            m.add("drums", kick(0.85), b)
        if b % 4 == 2:
            m.add("drums", kick(0.6), b + 0.5)
        if b % 2 == 1:
            m.add("drums", snare(0.45, seed=b), b, p=0.05)
        m.add("drums", hat(0.25, seed=b), b, p=0.3)
        m.add("drums", hat(0.18, seed=b + 7), b + 0.62, p=0.3)
    drums = onepole_lp(m.get("drums"), 7000)  # lofi
    stems = [(m.get("pad"), 0.35), (m.get("bass"), 0.55), (m.get("bells"), 0.4), (drums, 0.55)]
    return master(stems, (2.4, 0.25), seed)


def funky(seed=8):
    """Muted guitar plucks and a bouncy bass. E minor, 102 bpm."""
    m = Mix(102, seed)
    prog = ["Em7", "Em7", "Am7", "Bm7"]
    for b, c in progression_beats(prog, 4, m.beats):
        notes = chord(c, 4)
        for off in (0.5, 1.25, 2.5, 3.25, 3.75):
            for j, x in enumerate(notes[1:]):
                m.add("gtr", pluck(freq(x), 0.09, 0.4, bright=0.8, seed=int(b * 7 + off * 8 + j)), b + off + j * 0.004, p=0.35)
        root = chord(c, 2)[0]
        line = [(0, root, 0.5), (0.75, root, 0.2), (1.5, root + 12, 0.2), (2, root + 10, 0.4), (3, root + 7, 0.3), (3.5, root + 5, 0.2)]
        for off, x, length in line:
            m.add("bass", bass(freq(x), length, 0.8, growl=0.45), b + off)
        m.add("keys", epiano(freq(notes[0] - 12), 3 * m.beat, 0.22), b, p=-0.3)
        m.add("keys", epiano(freq(notes[2] - 12), 3 * m.beat, 0.22), b, p=-0.3)
    for b in range(m.beats):
        if b >= 4:
            m.add("drums", kick(0.85), b if b % 2 == 0 else b + 0.5)
            if b % 2 == 1:
                m.add("drums", snare(0.5, seed=b), b)
        for q in (0, 0.25, 0.5, 0.75):
            m.add("drums", hat(0.35 if q == 0.5 else 0.18, seed=int(b * 4 + q * 4)), b + q, p=-0.25)
    stems = [(m.get("gtr"), 0.45), (m.get("bass"), 0.55), (m.get("keys"), 0.4), (m.get("drums"), 0.55)]
    return master(stems, (1.1, 0.12), seed)


def zomeravond(seed=9):
    """Laid-back marimba and Rhodes. D major, 96 bpm, lightly swung."""
    m = Mix(96, seed)
    prog = ["Dmaj7", "Bm7", "Gmaj7", "A"]
    for b, c in progression_beats(prog, 4, m.beats):
        notes = chord(c, 3)
        m.add("keys", sum_notes([epiano(freq(x + 12), 3.5 * m.beat, 0.25) for x in notes[1:]]), b, p=-0.25)
        root = notes[0] - 12
        for off, x in ((0, root), (1.5, root), (2.5, root + 7), (3.5, root + 12)):
            m.add("bass", bass(freq(x), 0.4, 0.75, growl=0.2), b + off)
    riff = ["F#5", "A5", "E5", "D5", "B4", "D5", "A4", "B4"]
    for i, b in enumerate(range(8, m.beats - 2)):
        x = riff[i % len(riff)]
        m.add("lead", marimba(freq(midi(x)), 0.3, 0.38), b + (0.6 if i % 2 else 0), p=0.3)
    for b in range(m.beats):
        if b % 4 in (0, 2) and b >= 4:
            m.add("drums", kick(0.7), b)
        if b % 2 == 1 and b >= 4:
            m.add("drums", rim(0.6), b, p=0.1)
        m.add("drums", shaker(0.25, seed=b), b + 0.6, p=0.35)
    stems = [(m.get("keys"), 0.5), (m.get("lead"), 0.4), (m.get("bass"), 0.55), (m.get("drums"), 0.5)]
    return master(stems, (1.8, 0.2), seed)


def sum_notes(notes: list[np.ndarray]) -> np.ndarray:
    n = max(len(x) for x in notes)
    out = np.zeros(n)
    for x in notes:
        out[: len(x)] += x
    return out


TRACKS = {
    "zonnig-02": zonnig,
    "lounge-03": lounge,
    "piano-04": piano,
    "avond-05": avond,
    "akoestisch-06": akoestisch,
    "dromerig-07": dromerig,
    "funky-08": funky,
    "zomeravond-09": zomeravond,
}


def write_wav(path: str, stereo: np.ndarray):
    data = (np.clip(stereo, -1, 1) * 32767 * 0.9).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp(prefix="reel-tracks-")
    os.makedirs(outdir, exist_ok=True)
    only = set(sys.argv[2:])
    for name, fn in TRACKS.items():
        if only and name not in only:
            continue
        wav = os.path.join(outdir, f"{name}.wav")
        write_wav(wav, fn())
        print(f"{name}: {wav}")
        if shutil.which("ffmpeg"):
            mp3 = os.path.join(MUSIC_DIR, f"{name}.mp3")
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", wav,
                 "-af", "loudnorm=I=-18:TP=-2:LRA=7", "-ar", str(SR), "-b:a", "192k", mp3],
                check=True,
            )
            print(f"  -> {os.path.relpath(mp3, ROOT)}")


if __name__ == "__main__":
    main()
