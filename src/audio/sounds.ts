/**
 * Therapy Tycoon II — the sound book.
 *
 * Every sound is tuned to an F major pentatonic scale (F G A C D). There are no
 * semitone clashes anywhere in that scale, so however many sounds pile up on a
 * busy Thursday the result is still consonant. The tonal target is the visual
 * palette: lamplight amber and paper cream, never chrome and glass. Nothing is
 * bright, nothing is percussive-sharp, and warnings are low rather than loud.
 */

import type { AudioEngine, SoundFn } from './engine';

// ─────────────────────────────────────────────────────────────────────────────
// The scale
// ─────────────────────────────────────────────────────────────────────────────

const F2 = 87.31;
const A2 = 110.0;
const C3 = 130.81;
const D3 = 146.83;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const C4 = 261.63;
const D4 = 293.66;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;
const C5 = 523.25;
const D5 = 587.33;
const F5 = 698.46;
const G5 = 783.99;
const A5 = 880.0;
const C6 = 1046.5;
const D6 = 1174.66;

/** Every pitch the game is allowed to use, low to high. */
export const SCALE = [F2, A2, C3, D3, F3, G3, A3, C4, D4, F4, G4, A4, C5, D5, F5, G5, A5, C6, D6];

// ─────────────────────────────────────────────────────────────────────────────
// Sounds
// ─────────────────────────────────────────────────────────────────────────────

/** A soft wooden tick — the "physical" half of a UI press. */
function tick(e: AudioEngine, gain = 0.035, freq = 2400): void {
  e.noise({ dur: 0.032, filterFreq: freq, type: 'bandpass', q: 1.1, gain, attack: 0.002 });
}

export const SOUNDS = {
  // ── UI ────────────────────────────────────────────────────────────────────

  uiTap(e) {
    tick(e, 0.03);
    e.tone({ freq: C5, type: 'sine', dur: 0.085, attack: 0.003, gain: 0.075, filter: 3000 });
  },

  uiOpen(e) {
    tick(e, 0.022, 2000);
    e.tone({ freq: A4, type: 'triangle', dur: 0.11, gain: 0.06, filter: 2200 });
    e.tone({ freq: C5, type: 'triangle', dur: 0.18, when: 0.055, gain: 0.065, filter: 2400, reverb: 0.12 });
  },

  uiClose(e) {
    tick(e, 0.02, 1700);
    e.tone({ freq: C5, type: 'triangle', dur: 0.1, gain: 0.055, filter: 2000 });
    e.tone({ freq: A4, type: 'triangle', dur: 0.16, when: 0.05, gain: 0.055, filter: 1800 });
  },

  bookSession(e) {
    tick(e, 0.028, 2600);
    e.pluck(C5, { dur: 0.42, gain: 0.11, filter: 2600, reverb: 0.14 });
    e.tone({ freq: F3, type: 'sine', dur: 0.3, gain: 0.05, attack: 0.02 });
  },

  unbook(e) {
    tick(e, 0.018, 1400);
    e.tone({ freq: D4, type: 'sine', dur: 0.26, gain: 0.07, filter: 1100, slideTo: A3, slideTime: 0.2 });
  },

  // ── Sessions ──────────────────────────────────────────────────────────────

  /** A door easing shut, then the room settling around a low warm note. */
  sessionStart(e) {
    e.noise({ dur: 0.14, filterFreq: 260, filterTo: 120, type: 'lowpass', gain: 0.24, attack: 0.004 });
    e.tone({ freq: F2, type: 'sine', dur: 0.75, gain: 0.15, attack: 0.03, when: 0.02, reverb: 0.16 });
    e.tone({ freq: F3, type: 'triangle', dur: 0.55, gain: 0.05, attack: 0.05, when: 0.04, filter: 900 });
  },

  sessionEndGood(e) {
    e.chord([F4, A4, C5], {
      type: 'triangle',
      dur: 0.6,
      attack: 0.02,
      gain: 0.085,
      filter: 2600,
      reverb: 0.26,
      spread: 0.028,
    });
  },

  sessionEndMixed(e) {
    e.chord([G4, C5], {
      type: 'triangle',
      dur: 0.5,
      attack: 0.024,
      gain: 0.075,
      filter: 2000,
      reverb: 0.2,
      spread: 0.03,
    });
  },

  /** Disappointed, never scolding: a short warm sigh downward. */
  sessionEndPoor(e) {
    e.tone({ freq: D4, type: 'sine', dur: 0.34, gain: 0.075, filter: 1200, reverb: 0.16 });
    e.tone({ freq: C4, type: 'sine', dur: 0.5, when: 0.14, gain: 0.07, filter: 1000, reverb: 0.2 });
    e.tone({ freq: F3, type: 'sine', dur: 0.55, when: 0.16, gain: 0.05, filter: 700 });
  },

  /** The moment something lands — a bright rising arpeggio, well wet. */
  breakthrough(e) {
    const notes = [F4, A4, C5, D5, F5];
    notes.forEach((f, i) => {
      e.pluck(f, {
        when: i * 0.072,
        dur: 0.7,
        gain: 0.115 - i * 0.008,
        filter: 3600,
        reverb: 0.4,
        pan: (i - 2) * 0.07,
      });
    });
    e.tone({ freq: C6, type: 'sine', dur: 0.9, when: 0.3, gain: 0.03, attack: 0.16, reverb: 0.55 });
    e.tone({ freq: F3, type: 'sine', dur: 0.8, gain: 0.06, attack: 0.05, reverb: 0.2 });
  },

  /** The best sound in the game: four notes home, then a shimmer tail. */
  cure(e) {
    const phrase = [F4, A4, C5, F5];
    phrase.forEach((f, i) => {
      e.pluck(f, {
        when: i * 0.155,
        dur: 1.5,
        gain: 0.13,
        filter: 3400,
        damping: 0.998,
        reverb: 0.42,
        pan: (i - 1.5) * 0.06,
      });
      e.tone({
        freq: f,
        type: 'sine',
        dur: 0.7,
        when: i * 0.155,
        gain: 0.045,
        attack: 0.06,
        reverb: 0.35,
      });
    });
    // A pad underneath so the phrase has floor to stand on.
    e.chord([F3, C4, A4], {
      dur: 2.6,
      attack: 0.4,
      gain: 0.05,
      type: 'sine',
      filter: 1600,
      reverb: 0.5,
      spread: 0.05,
      when: 0.1,
    });
    e.tone({ freq: F2, type: 'sine', dur: 2.2, gain: 0.07, attack: 0.25, when: 0.1 });
    // Shimmer: high, slow, almost all reverb.
    e.chord([C6, D6, F5], {
      dur: 1.9,
      attack: 0.5,
      gain: 0.026,
      type: 'sine',
      reverb: 0.75,
      spread: 0.12,
      when: 0.66,
    });
  },

  levelUp(e) {
    e.chord([F4, C5], { type: 'triangle', dur: 0.5, gain: 0.09, filter: 2600, reverb: 0.28 });
    e.pluck(F5, { when: 0.14, dur: 0.9, gain: 0.12, filter: 3400, reverb: 0.38 });
    e.pluck(C6, { when: 0.26, dur: 1.0, gain: 0.09, filter: 3800, reverb: 0.45 });
    e.tone({ freq: F3, type: 'sine', dur: 1.3, gain: 0.06, attack: 0.16, reverb: 0.3 });
    e.tone({ freq: A5, type: 'sine', dur: 1.0, when: 0.42, gain: 0.024, attack: 0.3, reverb: 0.6 });
  },

  milestone(e) {
    e.tone({ freq: A4, type: 'sine', dur: 0.42, gain: 0.085, attack: 0.006, reverb: 0.32 });
    e.tone({ freq: A4 * 2, type: 'sine', dur: 0.3, gain: 0.02, attack: 0.006, reverb: 0.3 });
    e.tone({ freq: D5, type: 'sine', dur: 0.62, when: 0.13, gain: 0.08, attack: 0.006, reverb: 0.36 });
    e.tone({ freq: F3, type: 'sine', dur: 0.6, gain: 0.045, attack: 0.05 });
  },

  /** Barely there — this rides under a toast that is already visible. */
  toast(e) {
    e.tone({ freq: C5, type: 'sine', dur: 0.2, gain: 0.05, attack: 0.012, filter: 2400, reverb: 0.18 });
    e.tone({ freq: F5, type: 'sine', dur: 0.16, when: 0.03, gain: 0.018, reverb: 0.2 });
  },

  /** Never harsh: two low, soft, felt-mallet thuds. */
  warning(e) {
    for (let i = 0; i < 2; i++) {
      const w = i * 0.155;
      const k = i === 0 ? 1 : 0.78;
      e.noise({ dur: 0.11, when: w, filterFreq: 190, filterTo: 90, type: 'lowpass', gain: 0.16 * k });
      e.tone({ freq: F2, type: 'sine', dur: 0.24, when: w, gain: 0.15 * k, attack: 0.008, filter: 400 });
      e.tone({ freq: C3, type: 'sine', dur: 0.18, when: w, gain: 0.05 * k, filter: 500 });
    }
  },

  /** A little coin turning over. Lower and quieter when money leaves. */
  money(e, o) {
    const down = o?.low === true;
    const a = down ? C5 : C6;
    const b = down ? D5 : D6;
    e.pluck(a, { dur: 0.24, gain: down ? 0.075 : 0.095, filter: 4200, damping: 0.985, reverb: 0.16 });
    e.pluck(b, { when: 0.048, dur: 0.3, gain: down ? 0.06 : 0.08, filter: 4400, damping: 0.988, reverb: 0.2 });
    if (down) e.tone({ freq: F2, type: 'sine', dur: 0.2, gain: 0.05, filter: 400 });
  },

  hire(e) {
    [F3, A3, C4].forEach((f, i) => {
      e.pluck(f, { when: i * 0.095, dur: 0.7, gain: 0.11, filter: 2600, reverb: 0.26 });
    });
    e.chord([F3, C4], { dur: 0.95, attack: 0.2, gain: 0.045, type: 'sine', filter: 1400, reverb: 0.3 });
  },

  /** "Good morning" — two notes and the room waking up. */
  dayStart(e) {
    e.noise({ dur: 0.6, filterFreq: 300, filterTo: 700, type: 'lowpass', gain: 0.03, attack: 0.25 });
    e.tone({ freq: C4, type: 'triangle', dur: 0.5, gain: 0.085, attack: 0.045, filter: 1500, reverb: 0.28 });
    e.tone({ freq: F4, type: 'triangle', dur: 0.8, when: 0.27, gain: 0.08, attack: 0.05, filter: 1700, reverb: 0.34 });
    e.tone({ freq: F3, type: 'sine', dur: 1.0, gain: 0.05, attack: 0.12, reverb: 0.24 });
  },

  /** Lamps off, chairs squared: a descending settle. */
  dayEnd(e) {
    [C5, A4, F4].forEach((f, i) => {
      e.tone({
        freq: f,
        type: 'sine',
        dur: 0.6,
        when: i * 0.16,
        gain: 0.075,
        attack: 0.02,
        filter: 2000,
        reverb: 0.34,
      });
    });
    e.tone({ freq: F2, type: 'sine', dur: 1.1, when: 0.3, gain: 0.07, attack: 0.14, reverb: 0.28 });
  },

  /** Curious, not alarming: a small upward question. */
  eventRaised(e) {
    e.tone({ freq: G4, type: 'triangle', dur: 0.16, gain: 0.08, filter: 2200, reverb: 0.2 });
    e.tone({ freq: D5, type: 'triangle', dur: 0.32, when: 0.1, gain: 0.08, filter: 2400, reverb: 0.28 });
  },

  techniqueChosen(e) {
    tick(e, 0.026, 2200);
    e.pluck(A4, { dur: 0.5, gain: 0.11, filter: 2800, reverb: 0.22 });
    e.tone({ freq: A3, type: 'sine', dur: 0.34, gain: 0.045, attack: 0.02 });
  },

  /** A leaf unfurling — breath plus a tiny upward slide. */
  plantGrow(e) {
    e.noise({ dur: 0.34, filterFreq: 700, filterTo: 1500, type: 'bandpass', q: 1.4, gain: 0.03, attack: 0.09 });
    e.tone({ freq: C5, type: 'sine', dur: 0.3, gain: 0.045, attack: 0.06, slideTo: D5, slideTime: 0.26, reverb: 0.24 });
  },

  /** A polite "not that one". Low, muted, over quickly. */
  error(e) {
    for (let i = 0; i < 2; i++) {
      e.tone({ freq: D3, type: 'sine', dur: 0.11, when: i * 0.125, gain: 0.1, attack: 0.006, filter: 600 });
      e.tone({ freq: A2, type: 'sine', dur: 0.14, when: i * 0.125, gain: 0.06, filter: 400 });
    }
  },
} satisfies Record<string, SoundFn>;

export type SoundName = keyof typeof SOUNDS;

// ─────────────────────────────────────────────────────────────────────────────
// Ambience
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The bed has three parts, all on the music bus:
 *   1. room tone — filtered noise at the very edge of audibility,
 *   2. an occasional pentatonic pad chord (every 18–40s),
 *   3. a filter position tied to the time of day, so morning is open and
 *      airy and evening closes in warm around the lamp.
 * This plays for hours, so every level here is deliberately tiny.
 */

const PAD_MIN_GAP = 18;
const PAD_MAX_GAP = 40;

/** Voicings, low to high. Evening picks from the top of the list (lower/warmer). */
const PAD_CHORDS: number[][] = [
  [F3, C4, A4],
  [F3, A3, D4],
  [C3, G3, C4],
  [F2, C3, A3],
  [C3, F3, G3],
];

interface AmbienceHandle {
  stop: () => void;
  setTime: (t01: number) => void;
}

let active: AmbienceHandle | null = null;
/** 0 = morning, 1 = evening. Mirrors the scene's `--ambient` CSS variable. */
let timeOfDay = 0.25;

function padGain(t01: number): number {
  // Slightly more present in the evening, when the office is quiet.
  return 0.02 + t01 * 0.008;
}

function roomCutoff(t01: number): number {
  // Morning ~880Hz (open, airy) → evening ~320Hz (closed in, warm).
  return 880 - t01 * 560;
}

/**
 * Start the ambient bed. Returns a stop function; calling it twice is safe.
 * Returns a no-op if the engine has not been unlocked yet — call again after
 * the first user gesture.
 */
export function startAmbience(e: AudioEngine): () => void {
  if (active) return active.stop;

  const ctx = e.context;
  const music = e.busNode('music');
  const buf = e.getNoiseBuffer();
  if (!ctx || !music || !buf) return () => {};

  const now = ctx.currentTime;

  // ── Room tone ──
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(roomCutoff(timeOfDay), now);
  lp.Q.value = 0.5;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 70;
  hp.Q.value = 0.4;

  const bedGain = ctx.createGain();
  bedGain.gain.setValueAtTime(0.0001, now);
  bedGain.gain.exponentialRampToValueAtTime(0.014, now + 3.5);

  // A very slow breath on the cutoff so the room never feels frozen.
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.045;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 70;
  lfo.connect(lfoAmt);
  lfoAmt.connect(lp.frequency);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(bedGain);
  bedGain.connect(music);

  src.start(now);
  lfo.start(now);

  // ── Pad chords ──
  let cancelPad: (() => void) | null = null;
  let stopped = false;

  const schedulePad = (): void => {
    const gap = PAD_MIN_GAP + Math.random() * (PAD_MAX_GAP - PAD_MIN_GAP);
    cancelPad = e.at(gap, () => {
      if (stopped) return;
      // Later in the day, favour the lower voicings.
      const bias = Math.min(PAD_CHORDS.length - 1, Math.floor(timeOfDay * PAD_CHORDS.length));
      const idx = Math.random() < 0.6 ? bias : Math.floor(Math.random() * PAD_CHORDS.length);
      const chord = PAD_CHORDS[idx] ?? PAD_CHORDS[0]!;
      e.chord(chord, {
        bus: 'music',
        type: 'sine',
        dur: 7.5 + Math.random() * 3,
        attack: 2.4,
        gain: padGain(timeOfDay),
        filter: 1000 + (1 - timeOfDay) * 700,
        reverb: 0.65,
        spread: 0.18,
        detuneSpread: 7,
        pan: (Math.random() - 0.5) * 0.7,
      });
      schedulePad();
    });
  };
  schedulePad();

  const handle: AmbienceHandle = {
    setTime(t01: number) {
      if (stopped) return;
      const c = e.context;
      if (!c) return;
      lp.frequency.setTargetAtTime(roomCutoff(t01), c.currentTime, 2.5);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      if (active === handle) active = null;
      if (cancelPad) cancelPad();
      const c = e.context;
      const t = c ? c.currentTime : 0;
      try {
        bedGain.gain.cancelScheduledValues(t);
        bedGain.gain.setTargetAtTime(0.0001, t, 0.5);
        src.stop(t + 2.2);
        lfo.stop(t + 2.2);
      } catch {
        /* context already gone */
      }
      setTimeout(() => {
        try {
          src.disconnect();
          lfo.disconnect();
          lfoAmt.disconnect();
          hp.disconnect();
          lp.disconnect();
          bedGain.disconnect();
        } catch {
          /* torn down */
        }
      }, 2600);
    },
  };

  active = handle;
  handle.setTime(timeOfDay);
  return handle.stop;
}

/**
 * Move the bed along the day/night curve. 0 = morning (open and airy),
 * 1 = evening (warm, closed in around the lamp). Safe to call every frame.
 */
export function setAmbienceTime(t01: number): void {
  const t = Number.isFinite(t01) ? Math.min(1, Math.max(0, t01)) : 0;
  if (Math.abs(t - timeOfDay) < 0.005) return;
  timeOfDay = t;
  if (active) active.setTime(t);
}

/** True while the bed is running. */
export function isAmbienceRunning(): boolean {
  return active !== null;
}
