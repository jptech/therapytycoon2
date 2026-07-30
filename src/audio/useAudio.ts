/**
 * Therapy Tycoon II — the conductor.
 *
 * `useAudio()` is called exactly once, high in the React tree. It owns the
 * module-singleton AudioEngine, unlocks it on the player's first gesture, wires
 * every sim event to a sound, and keeps the mixer in step with the player's
 * settings. If Web Audio is unavailable for any reason the whole layer degrades
 * to silence with a single console warning — the game never breaks over audio.
 */

import { useEffect } from 'react';
import { bus } from '../sim/bus';
import { DAY_LENGTH_MINUTES } from '../sim/balance';
import { getSim, useStore } from '../store';
import { AudioEngine, type PlayOpts } from './engine';
import { SOUNDS, isAmbienceRunning, setAmbienceTime, startAmbience, type SoundName } from './sounds';

// ─────────────────────────────────────────────────────────────────────────────
// Singleton + safety net
// ─────────────────────────────────────────────────────────────────────────────

let engine: AudioEngine | null = null;
let dead = false;
let warned = false;

function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  console.warn('[audio] sound disabled — Web Audio is unavailable here:', err);
}

function getEngine(): AudioEngine | null {
  if (dead) return null;
  if (!engine) {
    try {
      engine = new AudioEngine();
    } catch (err) {
      dead = true;
      warnOnce(err);
      return null;
    }
  }
  return engine;
}

/** Run an audio operation; a single failure retires the whole layer quietly. */
function safe(fn: () => void): void {
  if (dead) return;
  try {
    fn();
  } catch (err) {
    dead = true;
    warnOnce(err);
  }
}

function play(name: SoundName, o?: PlayOpts): void {
  const e = getEngine();
  if (!e || !e.ready) return;
  safe(() => e.play(SOUNDS[name], o));
}

/** Fire a UI sound straight from a React component (button presses, panels). */
export function playUi(name: SoundName, o?: PlayOpts): void {
  play(name, o);
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings / ambience sync
// ─────────────────────────────────────────────────────────────────────────────

let ambienceStop: (() => void) | null = null;
let lastVolume = -1;
let lastSound: boolean | null = null;
let lastMusic: boolean | null = null;

function sync(): void {
  const e = getEngine();
  if (!e) return;
  safe(() => {
    const settings = getSim().settings;
    const volume = (settings?.volume ?? 0.7) * (settings?.calmMode ? 0.85 : 1);
    if (volume !== lastVolume) {
      lastVolume = volume;
      e.setVolume(volume);
    }
    const sound = settings?.sound !== false;
    if (sound !== lastSound) {
      lastSound = sound;
      e.setSfxEnabled(sound);
    }
    const music = settings?.music !== false;
    if (music !== lastMusic) {
      lastMusic = music;
      e.setMusicEnabled(music);
    }

    // The bed only runs while the office is actually on screen.
    const playing = useStore.getState().ui.screen === 'playing';
    const want = music && playing && e.ready;
    if (want && !ambienceStop) {
      const stop = startAmbience(e);
      ambienceStop = isAmbienceRunning() ? stop : null;
    } else if (!want && ambienceStop) {
      ambienceStop();
      ambienceStop = null;
    }

    if (playing) {
      const minute = getSim().minute;
      const t = Math.min(1, Math.max(0, minute / DAY_LENGTH_MINUTES));
      setAmbienceTime(t);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The hook
// ─────────────────────────────────────────────────────────────────────────────

const MONEY_MIN_GAP_MS = 420;

export function useAudio(): void {
  useEffect(() => {
    const e = getEngine();
    if (!e) return;

    // ── Unlock on the first gesture (and re-resume after tab switches). ──
    const onGesture = (): void => {
      safe(() => {
        if (e.unlock()) sync();
      });
    };
    window.addEventListener('pointerdown', onGesture, true);
    window.addEventListener('keydown', onGesture, true);
    window.addEventListener('touchstart', onGesture, true);

    // ── Sim events → sounds ──
    let lastMoneyAt = 0;
    const offs: (() => void)[] = [];

    offs.push(bus.on('DAY_STARTED', () => play('dayStart')));
    offs.push(bus.on('DAY_ENDED', () => play('dayEnd')));
    offs.push(bus.on('SESSION_STARTED', () => play('sessionStart', { gain: 0.8 })));

    offs.push(
      bus.on('SESSION_COMPLETED', ({ result }) => {
        if (result.breakthrough || result.grade === 'breakthrough') {
          play('breakthrough', { force: true });
        } else if (result.grade === 'excellent') {
          play('sessionEndGood');
        } else if (result.grade === 'good') {
          play('sessionEndGood', { gain: 0.82 });
        } else if (result.grade === 'mixed') {
          play('sessionEndMixed', { gain: 0.85 });
        } else {
          play('sessionEndPoor', { gain: 0.85 });
        }
      }),
    );

    offs.push(bus.on('CLIENT_CURED', () => play('cure', { force: true })));
    offs.push(bus.on('CLIENT_ARRIVED', () => play('toast', { gain: 0.45 })));
    offs.push(bus.on('CLIENT_DROPPED', () => play('warning', { gain: 0.45 })));

    offs.push(bus.on('PRACTICE_LEVELED', () => play('levelUp', { force: true })));
    offs.push(bus.on('THERAPIST_LEVELED', () => play('milestone', { gain: 0.55 })));
    offs.push(bus.on('MILESTONE_EARNED', () => play('milestone')));
    offs.push(bus.on('CAMPAIGN_STAGE', () => play('milestone', { force: true })));

    offs.push(bus.on('EVENT_RAISED', () => play('eventRaised')));
    offs.push(bus.on('THERAPIST_HIRED', () => play('hire')));
    offs.push(bus.on('THERAPIST_BURNOUT', () => play('warning')));
    offs.push(bus.on('PROGRAM_LAUNCHED', () => play('levelUp', { gain: 0.9 })));

    offs.push(
      bus.on('MONEY_CHANGED', ({ delta }) => {
        if (!delta) return;
        const now = Date.now();
        if (now - lastMoneyAt < MONEY_MIN_GAP_MS) return;
        lastMoneyAt = now;
        const out = delta < 0;
        play('money', { gain: out ? 0.5 : 0.85, low: out });
      }),
    );

    // The run is over: a longer version of the cure phrase, or a soft landing.
    offs.push(
      bus.on('RUN_ENDED', ({ kind }) => {
        const eng = getEngine();
        if (!eng || !eng.ready) return;
        if (kind === 'collapsed') {
          play('dayEnd', { force: true });
          safe(() => eng.at(0.9, () => eng.play(SOUNDS.warning, { gain: 0.5, force: true })));
        } else {
          play('cure', { force: true });
          safe(() => eng.at(1.15, () => eng.play(SOUNDS.levelUp, { gain: 0.85, force: true })));
          safe(() => eng.at(2.3, () => eng.play(SOUNDS.milestone, { gain: 0.7, force: true })));
        }
      }),
    );

    // ── Settings + ambience follow the store ──
    const unsubStore = useStore.subscribe(() => sync());
    sync();

    return () => {
      for (const off of offs) off();
      offs.length = 0;
      unsubStore();
      window.removeEventListener('pointerdown', onGesture, true);
      window.removeEventListener('keydown', onGesture, true);
      window.removeEventListener('touchstart', onGesture, true);
      if (ambienceStop) {
        const stop = ambienceStop;
        ambienceStop = null;
        safe(stop);
      }
      // The engine itself is a singleton and outlives the mount: disposing it
      // would throw away the user gesture that unlocked the AudioContext.
    };
  }, []);
}
