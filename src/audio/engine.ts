/**
 * Therapy Tycoon II — procedural audio engine.
 *
 * There are no audio assets and none may ever be fetched: every sound in the
 * game is synthesised here with the Web Audio API. The palette is deliberately
 * small and warm — sines and triangles, gently filtered noise, short
 * Karplus-Strong plucks — fed through a soft compressor and a cheap generated
 * reverb so nothing ever sounds clinical or sharp.
 *
 * Nothing in here imports React, Pixi or the sim. It is a dumb instrument;
 * `sounds.ts` writes the parts and `useAudio.ts` conducts.
 */

export type BusName = 'sfx' | 'music';

/** Oscillator shapes we actually use (no PeriodicWave support needed). */
export type WaveType = Exclude<OscillatorType, 'custom'>;

/** Options every voice shares. */
interface VoiceOpts {
  /** Seconds from "now" to schedule the voice at. */
  when?: number;
  /** −1..1 stereo position. Added to the group's pan bias. */
  pan?: number;
  /** Which sub-bus to play on. Defaults to 'sfx'. */
  bus?: BusName;
  /** 0..1 send into the reverb. */
  reverb?: number;
}

export interface ToneOpts extends VoiceOpts {
  freq: number;
  type?: WaveType;
  /** Total length including the attack. */
  dur?: number;
  attack?: number;
  /** Explicit release length; defaults to `dur - attack`. */
  decay?: number;
  gain?: number;
  detune?: number;
  /** Lowpass cutoff applied to the voice. Omit for none. */
  filter?: number;
  q?: number;
  /** Glide to this frequency over `slideTime` (default: the whole voice). */
  slideTo?: number;
  slideTime?: number;
}

export interface NoiseOpts extends VoiceOpts {
  dur?: number;
  /** Cutoff / centre frequency of the shaping filter. */
  filterFreq?: number;
  gain?: number;
  /** Filter shape. 'lowpass' by default — noise is never allowed to be bright. */
  type?: BiquadFilterType;
  q?: number;
  attack?: number;
  /** Sweep the filter to this frequency across the voice. */
  filterTo?: number;
}

export interface PluckOpts extends VoiceOpts {
  dur?: number;
  gain?: number;
  attack?: number;
  /** 0.9 (thuddy) .. 0.999 (long, bell-like). */
  damping?: number;
  /** Lowpass on the pluck. Lower = softer, more nylon than steel. */
  filter?: number;
}

export interface ChordOpts extends Omit<ToneOpts, 'freq'> {
  /** Seconds between successive notes — a tiny strum keeps chords human. */
  spread?: number;
  /** Symmetric detune spread across the voices, in cents. */
  detuneSpread?: number;
}

/** Per-trigger modifiers handed to a sound function. */
export interface PlayOpts {
  /** Multiplies every voice in the sound. */
  gain?: number;
  /** Stereo bias applied to every voice in the sound. */
  pan?: number;
  /** Ask for the darker / lower variant, where a sound has one. */
  low?: boolean;
  /** Bypass the voice rate limiter (used for the rare "must be heard" sounds). */
  force?: boolean;
}

export type SoundFn = (e: AudioEngine, o?: PlayOpts) => void;

const MAX_VOICES_PER_WINDOW = 6;
const VOICE_WINDOW_MS = 80;
const REVERB_SECONDS = 1.2;
const NOISE_SECONDS = 2;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

interface Graph {
  masterPre: GainNode;
  comp: DynamicsCompressorNode;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  reverbIn: GainNode;
  reverbTone: BiquadFilterNode;
  conv: ConvolverNode;
  reverbOut: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private dead = false;

  private volume = 0.7;
  private sfxOn = true;
  private musicOn = true;

  /** Multiplies the gain of every voice scheduled inside the current group. */
  private scale = 1;
  /** Stereo bias applied to every voice scheduled inside the current group. */
  private panBias = 0;

  /** Timestamps (ms) of recently started sfx voices, for rate limiting. */
  private starts: number[] = [];
  private timers = new Set<ReturnType<typeof setTimeout>>();

  private noiseBuf: AudioBuffer | null = null;
  private ksCache = new Map<string, AudioBuffer>();

  // ───────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Create (or resume) the AudioContext. Must be called from a user gesture —
   * browsers refuse to start audio otherwise. Safe to call repeatedly.
   * Returns false if this environment has no usable Web Audio.
   */
  unlock(): boolean {
    if (this.dead) return false;
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return true;
      }
      const w = globalThis as unknown as {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) {
        this.dead = true;
        return false;
      }
      this.ctx = new Ctor({ latencyHint: 'interactive' });
      this.graph = this.build(this.ctx);
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    } catch {
      this.dead = true;
      this.ctx = null;
      this.graph = null;
      return false;
    }
  }

  /** True once the context exists and the mixer is wired up. */
  get ready(): boolean {
    return !!this.ctx && !!this.graph && !this.dead;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  get currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** Input node of a sub-bus, for callers that build their own graphs (ambience). */
  busNode(bus: BusName): GainNode | null {
    if (!this.graph) return null;
    return bus === 'music' ? this.graph.music : this.graph.sfx;
  }

  /** Input node of the shared reverb. */
  reverbNode(): GainNode | null {
    return this.graph ? this.graph.reverbIn : null;
  }

  private build(ctx: AudioContext): Graph {
    const master = ctx.createGain();
    master.gain.value = this.masterLevel();
    master.connect(ctx.destination);

    // Gentle glue, not a limiter — it should never be audibly "working".
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 24;
    comp.ratio.value = 3;
    comp.attack.value = 0.006;
    comp.release.value = 0.24;
    comp.connect(master);

    const masterPre = ctx.createGain();
    masterPre.gain.value = 1;
    masterPre.connect(comp);

    const sfx = ctx.createGain();
    sfx.gain.value = this.sfxOn ? 1 : 0;
    sfx.connect(masterPre);

    const music = ctx.createGain();
    music.gain.value = this.musicOn ? 1 : 0;
    music.connect(masterPre);

    // Cheap warm room: a decaying-noise impulse response, no assets involved.
    const conv = ctx.createConvolver();
    conv.buffer = this.makeImpulse(ctx);

    const reverbIn = ctx.createGain();
    reverbIn.gain.value = 1;

    // Roll the top off the tail so reverb reads as "wooden room", not "cathedral".
    const reverbTone = ctx.createBiquadFilter();
    reverbTone.type = 'lowpass';
    reverbTone.frequency.value = 2600;
    reverbTone.Q.value = 0.4;

    const reverbOut = ctx.createGain();
    reverbOut.gain.value = 0.85;

    reverbIn.connect(reverbTone);
    reverbTone.connect(conv);
    conv.connect(reverbOut);
    reverbOut.connect(masterPre);

    return { masterPre, comp, master, sfx, music, reverbIn, reverbTone, conv, reverbOut };
  }

  private masterLevel(): number {
    // Perceptual-ish curve, and never quite full scale.
    return Math.pow(clamp(this.volume, 0, 1), 1.35) * 0.9;
  }

  setVolume(v: number): void {
    this.volume = clamp(Number.isFinite(v) ? v : 0.7, 0, 1);
    if (this.graph && this.ctx) {
      this.graph.master.gain.setTargetAtTime(this.masterLevel(), this.ctx.currentTime, 0.05);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  setSfxEnabled(b: boolean): void {
    this.sfxOn = b;
    if (this.graph && this.ctx) {
      this.graph.sfx.gain.setTargetAtTime(b ? 1 : 0, this.ctx.currentTime, 0.04);
    }
  }

  setMusicEnabled(b: boolean): void {
    this.musicOn = b;
    if (this.graph && this.ctx) {
      this.graph.music.gain.setTargetAtTime(b ? 1 : 0, this.ctx.currentTime, 0.25);
    }
  }

  get sfxEnabled(): boolean {
    return this.sfxOn;
  }

  get musicEnabled(): boolean {
    return this.musicOn;
  }

  dispose(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.ksCache.clear();
    this.noiseBuf = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.graph = null;
    if (ctx) {
      try {
        void ctx.close();
      } catch {
        /* already closed */
      }
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Triggering
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Play a named sound as one group. The rate limiter is checked once per
   * group rather than once per voice, so a busy day drops whole sounds instead
   * of chopping chords in half — but every voice the group schedules still
   * counts toward the budget, so big sounds naturally crowd out small ones.
   */
  play(fn: SoundFn, o?: PlayOpts): void {
    if (!this.ready || !this.sfxOn) return;
    if (!o?.force && !this.allow()) return;
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();

    const prevScale = this.scale;
    const prevPan = this.panBias;
    this.scale = prevScale * (o?.gain ?? 1);
    this.panBias = clamp(prevPan + (o?.pan ?? 0), -1, 1);
    try {
      fn(this, o);
    } catch (err) {
      console.warn('[audio] sound threw', err);
    } finally {
      this.scale = prevScale;
      this.panBias = prevPan;
    }
  }

  /** Schedule `fn` after a delay, preserving the current group's gain/pan. */
  at(delaySec: number, fn: () => void): () => void {
    const scale = this.scale;
    const pan = this.panBias;
    const id = setTimeout(
      () => {
        this.timers.delete(id);
        const ps = this.scale;
        const pp = this.panBias;
        this.scale = scale;
        this.panBias = pan;
        try {
          fn();
        } catch (err) {
          console.warn('[audio] scheduled callback threw', err);
        } finally {
          this.scale = ps;
          this.panBias = pp;
        }
      },
      Math.max(0, delaySec * 1000),
    );
    this.timers.add(id);
    return () => {
      clearTimeout(id);
      this.timers.delete(id);
    };
  }

  private allow(): boolean {
    const now = Date.now();
    const cutoff = now - VOICE_WINDOW_MS;
    while (this.starts.length && this.starts[0]! < cutoff) this.starts.shift();
    return this.starts.length < MAX_VOICES_PER_WINDOW;
  }

  private mark(bus: BusName | undefined): void {
    if (bus === 'music') return;
    this.starts.push(Date.now());
    if (this.starts.length > 64) this.starts.splice(0, this.starts.length - 64);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Primitives
  // ───────────────────────────────────────────────────────────────────────────

  /** A single enveloped oscillator. The workhorse. */
  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    if (!Number.isFinite(o.freq) || o.freq <= 0) return;

    const peak = (o.gain ?? 0.2) * this.scale;
    if (peak <= 0.0004) return;

    const t = ctx.currentTime + Math.max(0, o.when ?? 0);
    const dur = Math.max(0.03, o.dur ?? 0.3);
    const attack = clamp(o.attack ?? 0.012, 0.001, dur * 0.9);
    const release = Math.max(0.02, o.decay ?? dur - attack);
    const end = t + attack + release;

    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.detune) osc.detune.setValueAtTime(o.detune, t);
    if (o.slideTo && o.slideTo > 0) {
      const st = Math.max(0.02, o.slideTime ?? attack + release);
      osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + st);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    let head: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.filter, t);
      f.Q.value = o.q ?? 0.6;
      osc.connect(f);
      head = f;
    }
    head.connect(env);
    this.route(env, o, t);

    osc.start(t);
    osc.stop(end + 0.03);
    osc.onended = () => {
      try {
        env.disconnect();
        osc.disconnect();
      } catch {
        /* torn down */
      }
    };
    this.mark(o.bus);
  }

  /** Filtered noise — breath, thunks, room texture, tiny UI ticks. */
  noise(o: NoiseOpts = {}): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;

    const peak = (o.gain ?? 0.1) * this.scale;
    if (peak <= 0.0004) return;

    const t = ctx.currentTime + Math.max(0, o.when ?? 0);
    const dur = Math.max(0.02, o.dur ?? 0.2);
    const attack = clamp(o.attack ?? 0.006, 0.001, dur * 0.9);

    const buf = this.getNoiseBuffer();
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    if (dur > buf.duration - 0.05) src.loop = true;

    const filt = ctx.createBiquadFilter();
    filt.type = o.type ?? 'lowpass';
    filt.frequency.setValueAtTime(Math.max(30, o.filterFreq ?? 800), t);
    filt.Q.value = o.q ?? 0.8;
    if (o.filterTo && o.filterTo > 30) {
      filt.frequency.exponentialRampToValueAtTime(o.filterTo, t + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filt);
    filt.connect(env);
    this.route(env, o, t);

    const offset = Math.max(0, Math.random() * (buf.duration - Math.min(dur, buf.duration)));
    src.start(t, offset);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      try {
        env.disconnect();
        filt.disconnect();
        src.disconnect();
      } catch {
        /* torn down */
      }
    };
    this.mark(o.bus);
  }

  /** Several tones at once, lightly strummed and detuned so they breathe. */
  chord(freqs: number[], o: ChordOpts = {}): void {
    const spread = o.spread ?? 0.018;
    const det = o.detuneSpread ?? 5;
    const n = Math.max(1, freqs.length);
    freqs.forEach((f, i) => {
      const k = n === 1 ? 0 : i / (n - 1) - 0.5;
      this.tone({
        ...o,
        freq: f,
        when: (o.when ?? 0) + i * spread,
        detune: (o.detune ?? 0) + k * det * 2,
        // Upper voices sit back a touch so chords don't get shrill.
        gain: (o.gain ?? 0.12) * (1 - i * 0.08),
      });
    });
  }

  /**
   * Karplus-Strong pluck rendered into a buffer. A feedback DelayNode can't do
   * this (graph cycles are quantised to a render block), and rendering ~0.5s of
   * samples in JS is far cheaper than it sounds.
   */
  pluck(freq: number, o: PluckOpts = {}): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;
    if (!Number.isFinite(freq) || freq <= 20) return;

    const peak = (o.gain ?? 0.18) * this.scale;
    if (peak <= 0.0004) return;

    const t = ctx.currentTime + Math.max(0, o.when ?? 0);
    const dur = Math.max(0.06, o.dur ?? 0.5);
    const attack = clamp(o.attack ?? 0.004, 0.001, dur * 0.5);
    const buf = this.ksBuffer(ctx, freq, dur, o.damping ?? 0.9965);
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(o.filter ?? 3200, t);
    filt.Q.value = 0.5;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filt);
    filt.connect(env);
    this.route(env, o, t);

    src.start(t);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      try {
        env.disconnect();
        filt.disconnect();
        src.disconnect();
      } catch {
        /* torn down */
      }
    };
    this.mark(o.bus);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Buffers
  // ───────────────────────────────────────────────────────────────────────────

  /** Looping stereo white noise, shared by every noise voice. */
  getNoiseBuffer(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (this.noiseBuf) return this.noiseBuf;
    const len = Math.floor(ctx.sampleRate * NOISE_SECONDS);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuf = buf;
    return buf;
  }

  private makeImpulse(ctx: AudioContext): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * REVERB_SECONDS));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        // Exponential decay with a short soft "build" so it isn't a click.
        const env = Math.pow(1 - x, 2.6) * Math.min(1, i / (ctx.sampleRate * 0.008));
        lp = lp * 0.68 + (Math.random() * 2 - 1) * 0.32;
        data[i] = lp * env;
      }
    }
    return buf;
  }

  private ksBuffer(ctx: AudioContext, freq: number, dur: number, damping: number): AudioBuffer | null {
    const key = `${freq.toFixed(1)}|${dur.toFixed(2)}|${damping.toFixed(4)}`;
    const hit = this.ksCache.get(key);
    if (hit) return hit;

    const sr = ctx.sampleRate;
    const n = Math.max(2, Math.round(sr / freq));
    const len = Math.max(n + 2, Math.floor(sr * dur));
    const buf = ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);

    // Lowpassed noise excitation — a softer, woodier pick than raw white.
    const ring = new Float32Array(n);
    let lp = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      lp = lp * 0.6 + (Math.random() * 2 - 1) * 0.4;
      ring[i] = lp;
      sum += lp;
    }
    const dc = sum / n;
    for (let i = 0; i < n; i++) ring[i] = ring[i]! - dc;

    let p = 0;
    let peak = 0;
    const d = clamp(damping, 0.5, 0.9999);
    for (let i = 0; i < len; i++) {
      const cur = ring[p]!;
      const next = ring[(p + 1) % n]!;
      out[i] = cur;
      if (cur > peak) peak = cur;
      else if (-cur > peak) peak = -cur;
      ring[p] = (cur + next) * 0.5 * d;
      p = (p + 1) % n;
    }

    const norm = peak > 0.0001 ? 1 / peak : 1;
    const fade = Math.min(len, Math.floor(sr * 0.02));
    for (let i = 0; i < len; i++) {
      const tail = i > len - fade ? (len - i) / fade : 1;
      out[i] = out[i]! * norm * tail;
    }

    if (this.ksCache.size > 72) {
      const oldest = this.ksCache.keys().next();
      if (!oldest.done) this.ksCache.delete(oldest.value);
    }
    this.ksCache.set(key, buf);
    return buf;
  }

  // ───────────────────────────────────────────────────────────────────────────

  /** Pan a finished voice and connect it to its bus (+ reverb send). */
  private route(node: AudioNode, o: VoiceOpts, _t: number): void {
    const ctx = this.ctx;
    const g = this.graph;
    if (!ctx || !g) return;

    const target = o.bus === 'music' ? g.music : g.sfx;
    const pan = clamp((o.pan ?? 0) + this.panBias, -1, 1);

    let out: AudioNode = node;
    if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      out = p;
    }
    out.connect(target);

    const send = o.reverb ?? 0;
    if (send > 0) {
      const s = ctx.createGain();
      s.gain.value = clamp(send, 0, 1);
      out.connect(s);
      s.connect(g.reverbIn);
    }
  }
}
