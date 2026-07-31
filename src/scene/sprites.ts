/**
 * Procedural art for the living office.
 *
 * Everything here is drawn with Pixi Graphics primitives or a one-off Canvas 2D
 * texture — there are no image assets and no network requests. Nothing in this
 * file touches React or the game state; it is a pure drawing toolkit that
 * `office.ts` composes into rooms and people.
 *
 * Coordinate conventions
 * ─────────────────────
 * • People are drawn with their FEET at the local origin (0, 0) and their head
 *   above it at negative y. A standing figure is ~21 wide × ~46 tall.
 * • Props are drawn standing on the local origin too, so a prop can be dropped
 *   straight onto a room's floor line.
 */

import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { PortraitSeed } from '../sim/types';

// ─────────────────────────────────────────────────────────────────────────────
// Palette — mirrors src/ui/theme.css so the canvas and the panels agree.
// ─────────────────────────────────────────────────────────────────────────────

export const PAL = {
  ink: 0x1e3a3a,
  inkSoft: 0x33534f,
  inkFaint: 0x6b8785,
  amber: 0xe8a94c,
  amberDeep: 0xc9873a,
  amberGlow: 0xf6d79b,
  paper: 0xfaf5ec,
  paperWarm: 0xf3e9d8,
  paperDeep: 0xe8dbc4,
  sage: 0x8faf8b,
  sageDeep: 0x5f8460,
  plum: 0x8b6b8f,
  plumDeep: 0x6a4f6e,
  brick: 0xc2634f,
  brickSoft: 0xdd9683,
  night: 0x16292c,
  nightSoft: 0x22393c,
  wood: 0xc09566,
  woodDeep: 0x8d6743,
} as const;

/** Linear blend between two packed 0xRRGGBB colours. */
export function mix(a: number, b: number, t: number): number {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  return (
    ((ar + (br - ar) * k) << 16) |
    ((ag + (bg - ag) * k) << 8) |
    (ab + (bb - ab) * k)
  ) & 0xffffff;
}

export const darken = (c: number, t: number): number => mix(c, 0x000000, t);
export const lighten = (c: number, t: number): number => mix(c, 0xffffff, t);

/** Sample a colour ramp of `{ t, c }` stops. */
export function rampColor(stops: { t: number; c: number }[], t: number): number {
  if (t <= stops[0].t) return stops[0].c;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1];
      const b = stops[i];
      return mix(a.c, b.c, (t - a.t) / Math.max(1e-6, b.t - a.t));
    }
  }
  return stops[stops.length - 1].c;
}

/** Sample a scalar ramp of `{ t, v }` stops. */
export function rampValue(stops: { t: number; v: number }[], t: number): number {
  if (t <= stops[0].t) return stops[0].v;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].t) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
      return a.v + (b.v - a.v) * k;
    }
  }
  return stops[stops.length - 1].v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hand-drawn irregularity
//
// Nothing in a hand-illustrated scene is perfectly level, and nothing in a
// hand-illustrated scene *shimmers* either. Every wobble below is a pure
// function of where the object sits, so a picture frame hangs at the same
// crooked angle for the whole run — and picks the same angle again after a
// rebuild. Never Math.random() for geometry.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic 0..1 hash of a position (+ a salt to decorrelate uses). */
export function hash01(a: number, b = 0, salt = 0): number {
  let h = Math.imul(Math.round(a * 16) | 0, 374761393);
  h = (h + Math.imul(Math.round(b * 16) | 0, 668265263)) | 0;
  h = (h + Math.imul(salt | 0, 2246822519)) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Symmetric deterministic jitter in ±amount. */
export function wobble(a: number, b: number, salt: number, amount: number): number {
  return (hash01(a, b, salt) * 2 - 1) * amount;
}

/** One degree, in radians — the entire budget for "nothing is quite straight". */
export const DEG = Math.PI / 180;

// ─────────────────────────────────────────────────────────────────────────────
// Character palettes — deliberately the same lists the React portraits use so
// a therapist reads as the same person on their card and in the room.
// ─────────────────────────────────────────────────────────────────────────────

const SKINS = [0xf2d3ba, 0xe8bd9a, 0xd8a179, 0xc08457, 0x9d6640, 0x7d4d2e, 0x5f3a21, 0xefdcc9];
const HAIRS = [0x2b2119, 0x4a3527, 0x6d4b2e, 0x9a6a3a, 0xc9a26b, 0x8e8e93, 0xd8d3cb, 0x5a3b52, 0x3c5a6b];
const OUTFITS = [
  0x8faf8b, 0x8b6b8f, 0xc2634f, 0x4d7d84, 0xd3a05a, 0x6b7f9e, 0xa9776b, 0x5f8460, 0xb58aa5, 0x3f6470,
];

export function skinOf(seed: PortraitSeed): number {
  return SKINS[Math.abs(seed.skin) % SKINS.length];
}
export function hairOf(seed: PortraitSeed): number {
  return HAIRS[Math.abs(seed.hairColor) % HAIRS.length];
}
export function outfitOf(seed: PortraitSeed): number {
  return OUTFITS[Math.abs(seed.outfitColor) % OUTFITS.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// One-off Canvas 2D textures (radial glow, petal, dust dot).
// Created lazily, cached for the lifetime of the tab.
// ─────────────────────────────────────────────────────────────────────────────

let _glow: Texture | null = null;
let _petal: Texture | null = null;
let _dot: Texture | null = null;

function makeCanvas(size: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

/** Soft radial falloff, white in the middle. Tint + scale it per lamp. */
export function glowTexture(): Texture {
  if (_glow) return _glow;
  const c = makeCanvas(128);
  if (!c) return (_glow = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  // A double-shouldered falloff reads much more like real lamplight than a
  // straight linear ramp — bright core, long gentle skirt.
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.26)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.07)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  _glow = Texture.from(c);
  return _glow;
}

/** A single flower petal for the goodbye confetti. */
export function petalTexture(): Texture {
  if (_petal) return _petal;
  const c = makeCanvas(32);
  if (!c) return (_petal = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(16, 3);
  ctx.bezierCurveTo(27, 9, 27, 23, 16, 29);
  ctx.bezierCurveTo(5, 23, 5, 9, 16, 3);
  ctx.fill();
  _petal = Texture.from(c);
  return _petal;
}

/** A tiny soft dot for dust motes. */
export function dotTexture(): Texture {
  if (_dot) return _dot;
  const c = makeCanvas(16);
  if (!c) return (_dot = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(8, 8, 0, 8, 8, 8);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 16);
  _dot = Texture.from(c);
  return _dot;
}

let _core: Texture | null = null;

/**
 * The bright inner core of a lamp — a much tighter falloff than `glowTexture`.
 * A real lamp is a small fierce thing wrapped in a large gentle thing; drawing
 * both is the difference between "light" and "coloured blob".
 */
export function coreTexture(): Texture {
  if (_core) return _core;
  const c = makeCanvas(64);
  if (!c) return (_core = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.22)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  _core = Texture.from(c);
  return _core;
}

let _cone: Texture | null = null;

/**
 * The shaft of light under a lampshade: narrow and bright at the top, widening
 * and dissolving downward. Built a scanline at a time so the edges are soft
 * without needing a canvas blur filter.
 *
 * Anchor at (0.5, 0) on the lamp head; the far end lands on the floorboards.
 */
export function coneTexture(): Texture {
  if (_cone) return _cone;
  const S = 128;
  const c = makeCanvas(S);
  if (!c) return (_cone = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    const half = (0.07 + 0.42 * t) * S;
    const a = Math.pow(1 - t, 1.5) * 0.9;
    const lg = ctx.createLinearGradient(S / 2 - half, 0, S / 2 + half, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.32, `rgba(255,255,255,${a * 0.45})`);
    lg.addColorStop(0.5, `rgba(255,255,255,${a})`);
    lg.addColorStop(0.68, `rgba(255,255,255,${a * 0.45})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(S / 2 - half, y, half * 2, 1.05);
  }
  _cone = Texture.from(c);
  return _cone;
}

let _beam: Texture | null = null;

/**
 * A soft-edged shaft of daylight. Skewed and tinted at runtime, this is the
 * parallelogram a window throws across the floor: long and cool at eight,
 * short and gold by four, cold blue at dusk as the lamps take over.
 *
 * Anchor at (0.5, 0) on the window sill.
 */
export function beamTexture(): Texture {
  if (_beam) return _beam;
  const S = 128;
  const c = makeCanvas(S);
  if (!c) return (_beam = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < S; y++) {
    const t = y / (S - 1);
    // Bright where it leaves the glass, pooling and then fading on the floor.
    const a = (0.55 + 0.45 * Math.sin(t * Math.PI)) * Math.pow(1 - t * 0.82, 1.15);
    const lg = ctx.createLinearGradient(0, 0, S, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)');
    lg.addColorStop(0.2, `rgba(255,255,255,${a * 0.7})`);
    lg.addColorStop(0.5, `rgba(255,255,255,${a})`);
    lg.addColorStop(0.8, `rgba(255,255,255,${a * 0.7})`);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, y, S, 1.05);
  }
  _beam = Texture.from(c);
  return _beam;
}

let _vignette: Texture | null = null;

/**
 * Transparent in the middle, dark at the edges. Stretched over a room it makes
 * the corners fall away instead of every wall being one flat fill.
 */
export function vignetteTexture(): Texture {
  if (_vignette) return _vignette;
  const S = 128;
  const c = makeCanvas(S);
  if (!c) return (_vignette = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.72);
  g.addColorStop(0.0, 'rgba(255,255,255,0)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.34)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _vignette = Texture.from(c);
  return _vignette;
}

let _sideShade: Texture | null = null;

/**
 * A one-sided falloff: clear on the left, dark on the right. Flipped toward
 * whichever side of a room its lamp *isn't* on, so the room is lit BY the lamp
 * rather than tinted uniformly.
 */
export function sideShadeTexture(): Texture {
  if (_sideShade) return _sideShade;
  const S = 64;
  const c = makeCanvas(S);
  if (!c) return (_sideShade = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, S, 0);
  g.addColorStop(0.0, 'rgba(255,255,255,0)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.06)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.42)');
  g.addColorStop(1.0, 'rgba(255,255,255,0.8)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  _sideShade = Texture.from(c);
  return _sideShade;
}

let _grain: Texture | null = null;

/**
 * Paper grain. Tiled across the whole scene at a whisper of alpha, this is the
 * cheapest thing in the file and does more than any other single line to stop
 * flat vector fills reading as UI.
 */
export function grainTexture(): Texture {
  if (_grain) return _grain;
  const S = 128;
  const c = makeCanvas(S);
  if (!c) return (_grain = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    // Squaring keeps most of the field empty and lets a few flecks read, which
    // is what paper actually looks like.
    // Weighted toward the dark flecks: light speckle lifts the blacks and the
    // night sky goes milky, which is the one thing grain must never do.
    const dark = Math.random() < 0.66;
    const a = Math.pow(Math.random(), 2.4) * (dark ? 62 : 40);
    const o = i * 4;
    d[o] = dark ? 22 : 255;
    d[o + 1] = dark ? 40 : 248;
    d[o + 2] = dark ? 40 : 232;
    d[o + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  _grain = Texture.from(c);
  return _grain;
}

let _sky: Texture | null = null;

/** Grayscale vertical gradient used for the sky (tinted at runtime). */
export function skyTexture(): Texture {
  if (_sky) return _sky;
  const c = makeCanvas(4);
  if (!c) return (_sky = Texture.WHITE);
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6f6f6f');
  g.addColorStop(0.55, '#c8c8c8');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  _sky = Texture.from(c);
  return _sky;
}

// ─────────────────────────────────────────────────────────────────────────────
// People
// ─────────────────────────────────────────────────────────────────────────────

export type PersonPose = 'stand' | 'sit';

export interface PersonOpts {
  seed: PortraitSeed;
  pose: PersonPose;
  /** Half-closed eyes + a small slump. Used for tired therapists before noon. */
  sleepy?: boolean;
}

/** Body metrics, shared by the drawing code and the rig assembly. */
const M = {
  headR: 7.2,
  standHeadY: -38.8,
  standNeckY: -33,
  standTorsoTop: -31.5,
  hipY: -16,
  shoulderY: -30.5,
  // Seated numbers sit ~0.6 lower than the standing ones scaled down would
  // suggest: the point is that the sitter's weight goes *into* the cushion.
  sitSeatY: -11.6,
  sitHeadY: -34.2,
  sitTorsoTop: -26.9,
  sitShoulderY: -25.9,
  /** Where the head pivots — the base of the neck. */
  standNeckPivot: -29.4,
  sitNeckPivot: -24.2,
};

/** Height of a chair seat above the floor. Rooms use this to place chairs. */
export const SEAT_HEIGHT = 12;

/**
 * Draw the body of a chibi figure: torso, neck, head, hair, face — plus the
 * folded legs when seated. Standing legs and both arms are separate Graphics
 * so they can be rotated for walk/wave without rebuilding any geometry.
 */
export function drawPerson(g: Graphics, opts: PersonOpts): void {
  const { seed, pose } = opts;
  const skin = skinOf(seed);
  const outfit = outfitOf(seed);
  const trouser = darken(outfit, 0.34);
  const sitting = pose === 'sit';

  const torsoTop = sitting ? M.sitTorsoTop : M.standTorsoTop;
  const neckY = sitting ? M.sitHeadY + 6 : M.standNeckY;
  const hipY = sitting ? M.sitSeatY : M.hipY;

  g.clear();

  // ── Seated legs ───────────────────────────────────────────────────────────
  if (sitting) {
    // The old pose ran a thigh and a shin straight down and read as hovering.
    // A body in a chair breaks in three places: the seat takes the weight, the
    // knee breaks at the cushion's front edge, and the foot lands flat.
    g.ellipse(1, hipY + 1.4, 9, 2.8).fill({ color: 0x000000, alpha: 0.13 });
    // Thigh, running forward along the seat.
    g.roundRect(-7, hipY - 3.4, 19, 5.6, 2.8).fill(trouser);
    // Knee, breaking over the front edge.
    g.circle(11.4, hipY - 0.6, 2.9).fill(trouser);
    // Shin, dropping from the knee.
    g.roundRect(9, hipY - 2.4, 5.2, 12.2, 2.4).fill(darken(trouser, 0.07));
    // Foot, flat on the boards.
    g.roundRect(8.2, -3.4, 8.2, 3.4, 1.7).fill(darken(trouser, 0.32));
    // Crease where the thigh folds into the hip.
    g.roundRect(-5.6, hipY - 1.6, 7.5, 1.5, 0.75).fill({ color: 0x000000, alpha: 0.1 });
  }

  // ── Torso ─────────────────────────────────────────────────────────────────
  g.roundRect(-7.2, torsoTop, 14.4, hipY - torsoTop + 1.5, 5.2).fill(outfit);
  // A lighter collar wedge gives the flat shape a little depth.
  g.moveTo(-3.4, torsoTop + 0.4);
  g.lineTo(0, torsoTop + 5.4);
  g.lineTo(3.4, torsoTop + 0.4);
  g.closePath();
  g.fill({ color: lighten(outfit, 0.32), alpha: 0.9 });
  // Shoulder highlight — the lamplight lands on top of people too.
  g.roundRect(-6.4, torsoTop + 0.2, 12.8, 2.6, 1.3).fill({ color: 0xffffff, alpha: 0.13 });
  // Inner shadow down the left side.
  g.roundRect(-7.2, torsoTop, 4.2, hipY - torsoTop + 1.5, 5.2).fill({ color: 0x000000, alpha: 0.07 });
  if (sitting) {
    // Fabric gathering where the torso meets the seat.
    g.roundRect(-6.4, hipY - 3.6, 12.8, 3.4, 1.7).fill({ color: 0x000000, alpha: 0.09 });
  }

  // ── Neck ──────────────────────────────────────────────────────────────────
  g.rect(-2.3, neckY, 4.6, 4).fill(darken(skin, 0.12));
}

/**
 * The head, drawn in the same person-space coordinates as the body so it lines
 * up exactly — it lives on its own Graphics purely so it can pivot at the neck
 * for the idle head-turn and the therapist's listening tilt.
 */
export function drawPersonHead(g: Graphics, opts: PersonOpts): void {
  const { seed, pose } = opts;
  const skin = skinOf(seed);
  const hair = hairOf(seed);
  const sitting = pose === 'sit';
  const headY = sitting ? M.sitHeadY : M.standHeadY;
  const r = M.headR;

  g.clear();

  // ── Hair behind the head (long styles, afro, bun, ponytail) ───────────────
  const style = Math.abs(seed.hair) % 8;
  if (style === 2) {
    g.roundRect(-r - 1.4, headY - 2, r * 2 + 2.8, 20, 4).fill(hair);
  } else if (style === 4) {
    g.circle(-r * 0.85, headY - r * 0.85, 3.4).fill(hair);
  } else if (style === 6) {
    g.circle(0, headY - 1.2, r + 3.4).fill(hair);
  } else if (style === 7) {
    g.ellipse(-r - 1.6, headY + 4.4, 3.1, 6.6).fill(hair);
  }

  // ── Head ──────────────────────────────────────────────────────────────────
  g.circle(0, headY, r).fill(skin);
  // Ears.
  g.ellipse(-r, headY + 1.2, 1.5, 2.1).fill(darken(skin, 0.06));
  g.ellipse(r, headY + 1.2, 1.5, 2.1).fill(darken(skin, 0.06));

  // ── Hair cap: a slightly larger blob, then the face is punched back in ─────
  const capR = style === 5 ? r + 0.2 : style === 3 ? r + 1.4 : r + 0.9;
  g.circle(0, headY - 1.3, capR).fill(hair);
  if (style === 3) {
    // Curls: a few bumps around the crown.
    for (let i = 0; i < 4; i++) {
      const a = Math.PI + (i / 3) * Math.PI;
      g.circle(Math.cos(a) * (r + 0.4), headY - 1.4 + Math.sin(a) * (r + 0.4), 2.5).fill(hair);
    }
  }
  const faceDrop = style === 5 ? 1.1 : style === 1 ? 1.9 : 1.6;
  g.ellipse(0, headY + faceDrop, r * (style === 5 ? 0.95 : 0.88), r * 0.82).fill(skin);
  if (style === 1) {
    // Bob: two side panels framing the face.
    g.roundRect(-r - 1.1, headY - 2.6, 3.1, 10.5, 1.5).fill(hair);
    g.roundRect(r - 2, headY - 2.6, 3.1, 10.5, 1.5).fill(hair);
  }
  // A sliver of lamplight on the crown, so the head is a sphere and not a disc.
  g.ellipse(-1.6, headY - capR * 0.62, r * 0.5, r * 0.24).fill({ color: 0xffffff, alpha: 0.16 });

  // ── Face ──────────────────────────────────────────────────────────────────
  const eyeY = headY + 0.9;
  if (opts.sleepy) {
    g.moveTo(-4.1, eyeY - 0.3);
    g.quadraticCurveTo(-2.7, eyeY + 1.3, -1.3, eyeY - 0.3);
    g.moveTo(1.3, eyeY - 0.3);
    g.quadraticCurveTo(2.7, eyeY + 1.3, 4.1, eyeY - 0.3);
    g.stroke({ color: 0x2b2119, width: 1.1, cap: 'round' });
  } else {
    g.circle(-2.7, eyeY, 1.2).fill(0x2b2119);
    g.circle(2.7, eyeY, 1.2).fill(0x2b2119);
    g.circle(-2.35, eyeY - 0.45, 0.42).fill({ color: 0xffffff, alpha: 0.9 });
    g.circle(3.05, eyeY - 0.45, 0.42).fill({ color: 0xffffff, alpha: 0.9 });
  }
  // Blush.
  g.ellipse(-4.6, eyeY + 2.5, 1.7, 1.0).fill({ color: 0xe08a76, alpha: 0.32 });
  g.ellipse(4.6, eyeY + 2.5, 1.7, 1.0).fill({ color: 0xe08a76, alpha: 0.32 });
  // Mouth.
  if (opts.sleepy) {
    g.ellipse(0, eyeY + 3.6, 1.2, 1.5).fill({ color: 0x8a4a3c, alpha: 0.65 });
  } else {
    g.moveTo(-1.7, eyeY + 3.1);
    g.quadraticCurveTo(0, eyeY + 4.5, 1.7, eyeY + 3.1);
    g.stroke({ color: 0x8a4a3c, width: 0.9, cap: 'round' });
  }

  // ── Accessory: round glasses on a slice of the population ─────────────────
  if (Math.abs(seed.accessory) % 4 === 1) {
    g.circle(-2.7, eyeY, 2.4);
    g.circle(2.7, eyeY, 2.4);
    g.moveTo(-0.3, eyeY);
    g.lineTo(0.3, eyeY);
    g.stroke({ color: PAL.inkSoft, width: 0.8, alpha: 0.85 });
  }
}

/** A single leg, hinged at the hip (local origin). */
function drawLeg(g: Graphics, seed: PortraitSeed): void {
  const trouser = darken(outfitOf(seed), 0.34);
  g.clear();
  g.roundRect(-2.3, 0, 4.6, 16, 2.3).fill(trouser);
  g.roundRect(-2.7, 13.2, 6.4, 3.4, 1.7).fill(darken(trouser, 0.3));
}

/** A single arm, hinged at the shoulder (local origin). */
function drawArm(g: Graphics, seed: PortraitSeed): void {
  const outfit = outfitOf(seed);
  const skin = skinOf(seed);
  g.clear();
  g.roundRect(-1.7, -1.4, 3.4, 13, 1.7).fill(darken(outfit, 0.1));
  g.circle(0, 12.4, 1.9).fill(skin);
}

/**
 * A soft contact shadow. Two ellipses: a wide diffuse skirt and a tight, much
 * darker core right where the object meets the floor. That second ellipse is
 * what actually plants a thing on the boards.
 */
export function drawContactShadow(g: Graphics, w: number, h = w * 0.26, alpha = 1): void {
  g.ellipse(0, 0.6, w, h).fill({ color: PAL.ink, alpha: 0.1 * alpha });
  g.ellipse(0, 0.4, w * 0.66, h * 0.62).fill({ color: PAL.ink, alpha: 0.14 * alpha });
  g.ellipse(0, 0.2, w * 0.34, h * 0.4).fill({ color: PAL.ink, alpha: 0.16 * alpha });
}

/** The soft contact shadow a figure casts on the floorboards. */
export function drawShadow(g: Graphics, w = 11): void {
  g.clear();
  drawContactShadow(g, w, 3.2);
}

/** What someone in the waiting room is doing with their hands. */
export type PersonProp = 'none' | 'phone' | 'magazine' | 'mug';

export interface PersonRig {
  view: Container;
  rig: Container;
  shadow: Graphics;
  body: Graphics;
  /** Pivots at the base of the neck for the idle turn and listening tilt. */
  head: Graphics;
  /** Whatever they are holding: a phone, a magazine, a mug. */
  hand: Graphics;
  legs: [Graphics, Graphics];
  arms: [Graphics, Graphics];
  seed: PortraitSeed;
  pose: PersonPose;
  sleepy: boolean;
  prop: PersonProp;
  phase: number;
  /** Per-person offset so a full waiting room never breathes in unison. */
  offset: number;
  /** Seconds of life, used for the slow breath and the occasional head turn. */
  clock: number;
  /** Radians of forward lean, set by the caller. Positive = toward `facing`. */
  lean: number;
  facing: 1 | -1;
  headPivotY: number;
}

/** Whatever they're holding, drawn in front of the chest. */
function drawHandProp(g: Graphics, kind: PersonProp): void {
  g.clear();
  if (kind === 'none') return;
  if (kind === 'phone') {
    g.roundRect(-1.9, -3.2, 3.8, 6.4, 1).fill(PAL.ink);
    g.roundRect(-1.3, -2.6, 2.6, 5.2, 0.6).fill({ color: 0xd8ecf2, alpha: 0.92 });
    // The little cold glow a phone throws back onto its owner.
    g.ellipse(0, -0.6, 4.4, 4).fill({ color: 0xbfe0ea, alpha: 0.14 });
  } else if (kind === 'magazine') {
    // Two pages tented open.
    g.moveTo(0, -4.2);
    g.lineTo(-5.6, -1.6);
    g.lineTo(-5.6, 2.4);
    g.lineTo(0, 0.2);
    g.closePath();
    g.fill(PAL.paper);
    g.moveTo(0, -4.2);
    g.lineTo(5.6, -1.6);
    g.lineTo(5.6, 2.4);
    g.lineTo(0, 0.2);
    g.closePath();
    g.fill(PAL.paperWarm);
    g.moveTo(-4.4, -0.6);
    g.lineTo(-1.2, -2.1);
    g.moveTo(-4.4, 0.9);
    g.lineTo(-1.2, -0.6);
    g.stroke({ color: PAL.inkFaint, width: 0.5, alpha: 0.6 });
  } else {
    g.roundRect(-2.2, -2.2, 4.4, 4.6, 1.2).fill(PAL.paper);
    g.roundRect(-2.2, -2.2, 4.4, 1.2, 0.6).fill(PAL.sage);
    g.moveTo(2.2, -1.2);
    g.quadraticCurveTo(4.2, 0, 2.2, 1.4);
    g.stroke({ color: PAL.paper, width: 1, cap: 'round' });
  }
}

/** Assemble a fully-rigged little person. Position `view` at their feet. */
export function createPerson(seed: PortraitSeed): PersonRig {
  const view = new Container();
  const shadow = new Graphics();
  drawShadow(shadow);
  const rig = new Container();

  const legL = new Graphics();
  const legR = new Graphics();
  drawLeg(legL, seed);
  drawLeg(legR, seed);
  const armL = new Graphics();
  const armR = new Graphics();
  drawArm(armL, seed);
  drawArm(armR, seed);
  const body = new Graphics();
  const head = new Graphics();
  const hand = new Graphics();
  hand.visible = false;

  // Legs behind the torso, head above it, arms and hands in front — the
  // cheapest possible depth sort.
  rig.addChild(legL, legR, body, head, armL, armR, hand);
  view.addChild(shadow, rig);

  const p: PersonRig = {
    view,
    rig,
    shadow,
    body,
    head,
    hand,
    legs: [legL, legR],
    arms: [armL, armR],
    seed,
    pose: 'stand',
    sleepy: false,
    prop: 'none',
    phase: Math.random() * Math.PI * 2,
    offset: Math.random() * 12,
    clock: 0,
    lean: 0,
    facing: 1,
    headPivotY: M.standNeckPivot,
  };
  applyPose(p, 'stand', false);
  return p;
}

function applyPose(p: PersonRig, pose: PersonPose, sleepy: boolean): void {
  p.pose = pose;
  p.sleepy = sleepy;
  drawPerson(p.body, { seed: p.seed, pose, sleepy });
  drawPersonHead(p.head, { seed: p.seed, pose, sleepy });
  const sitting = pose === 'sit';
  // Pivot and position coincide, so the head rotates about the neck in place.
  p.headPivotY = sitting ? M.sitNeckPivot : M.standNeckPivot;
  p.head.pivot.set(0, p.headPivotY);
  p.head.position.set(0, p.headPivotY);
  p.legs[0].visible = !sitting;
  p.legs[1].visible = !sitting;
  p.legs[0].position.set(-2.6, M.hipY);
  p.legs[1].position.set(2.6, M.hipY);
  const sy = sitting ? M.sitShoulderY : M.shoulderY;
  p.arms[0].position.set(-7.1, sy);
  p.arms[1].position.set(7.1, sy);
  p.hand.position.set(5.2, sy + (sitting ? 7.4 : 8.6));
  p.shadow.scale.set(sitting ? 0.7 : 1, 1);
}

/** Re-draw only when the pose or the sleepy flag actually changed. */
export function setPersonPose(p: PersonRig, pose: PersonPose, sleepy: boolean): void {
  if (p.pose === pose && p.sleepy === sleepy) return;
  applyPose(p, pose, sleepy);
}

/** Re-draw only when what they're holding actually changed. */
export function setPersonProp(p: PersonRig, kind: PersonProp): void {
  if (p.prop === kind) return;
  p.prop = kind;
  drawHandProp(p.hand, kind);
  p.hand.visible = kind !== 'none';
}

export function setPersonFacing(p: PersonRig, facing: 1 | -1): void {
  if (p.facing === facing) return;
  p.facing = facing;
  p.rig.scale.x = facing;
  p.shadow.scale.x = (p.pose === 'sit' ? 0.7 : 1) * facing;
}

export type PersonMode = 'idle' | 'walk' | 'sit' | 'wave';

/**
 * Idle is a deliberate 2-frame hop (quantised sine) so the office reads like a
 * storybook rather than a physics demo. Walk, sit and wave animate smoothly on
 * top of the same rig — no geometry is rebuilt here.
 */
export function animatePerson(p: PersonRig, dt: number, mode: PersonMode, reducedMotion: boolean): void {
  const amp = reducedMotion ? 0 : 1;
  p.phase += dt * (mode === 'walk' ? 9.5 : mode === 'wave' ? 6 : 1.7);
  p.clock += dt;

  // A slow breath — a fifth of a pixel over four seconds. You never see it
  // happen; you only notice when it isn't there.
  const breath = Math.sin((p.clock + p.offset) * (Math.PI / 2)) * 0.22 * amp;
  // An occasional head turn: mostly still, with a soft excursion every twenty
  // seconds or so. The sixth power is what buys the stillness between turns.
  const swing = Math.sin(p.clock * 0.31 + p.offset * 1.7);
  const turn = Math.sign(swing) * Math.pow(Math.abs(swing), 6) * amp;
  // Lean is authored in the person's own facing space; a rotation always tips
  // the top of the rig toward +x, so it has to be signed by which way they face.
  const slump = p.sleepy ? 0.06 * amp : 0;

  switch (mode) {
    case 'walk': {
      const sw = Math.sin(p.phase);
      p.legs[0].rotation = sw * 0.55 * amp;
      p.legs[1].rotation = -sw * 0.55 * amp;
      p.arms[0].rotation = -sw * 0.4 * amp;
      p.arms[1].rotation = sw * 0.4 * amp;
      p.rig.y = -Math.abs(Math.cos(p.phase)) * 1.5 * amp;
      p.rig.x = 0;
      p.rig.rotation = p.facing * p.lean;
      p.head.rotation = -sw * 0.03 * amp;
      p.head.x = 0;
      break;
    }
    case 'sit': {
      p.arms[0].rotation = 0.52;
      p.arms[1].rotation = p.prop === 'none' ? 0.46 : 0.92;
      // Weight is in the chair, so the whole rig barely moves — only the
      // breath, plus a slow shift of position every so often.
      const shift = Math.sin(p.clock * 0.23 + p.offset) * 0.35 * amp;
      p.rig.y = breath;
      p.rig.x = shift;
      p.rig.rotation = p.facing * (p.lean + slump);
      p.head.rotation = turn * 0.07 + p.lean * 0.4;
      p.head.x = turn * 0.7;
      break;
    }
    case 'wave': {
      p.legs[0].rotation = 0;
      p.legs[1].rotation = 0;
      p.arms[0].rotation = 0.1;
      p.arms[1].rotation = -2.5 + Math.sin(p.phase) * 0.38 * amp;
      p.rig.y = -Math.abs(Math.sin(p.phase * 0.5)) * 1.2 * amp;
      p.rig.x = 0;
      p.rig.rotation = 0;
      p.head.rotation = Math.sin(p.phase * 0.5) * 0.05 * amp;
      p.head.x = 0;
      break;
    }
    default: {
      // Two-frame bob: up on one beat, down on the next, with the breath on top.
      const f = Math.sin(p.phase) > 0 ? 1 : 0;
      p.rig.y = -f * 1.1 * amp + breath;
      p.rig.x = 0;
      p.legs[0].rotation = 0;
      p.legs[1].rotation = 0;
      p.arms[0].rotation = 0.09;
      p.arms[1].rotation = p.prop === 'none' ? -0.09 : 0.86;
      p.rig.rotation = p.facing * (p.lean + slump * 1.15);
      p.head.rotation = turn * 0.09;
      p.head.x = turn * 0.8;
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Props. Each draws standing on the local origin, facing +x unless noted.
// ─────────────────────────────────────────────────────────────────────────────

/** A soft armchair seen from the side. `dir` is the direction the sitter faces. */
export function drawArmchair(g: Graphics, dir: 1 | -1, fabric: number): void {
  const backX = dir === 1 ? -13.5 : 7;
  drawContactShadow(g, 15, 3.4);
  g.roundRect(-13, -16, 26, 16, 4).fill(fabric);
  // The seat dips: darker in the well, so the cushion has somewhere to give.
  g.ellipse(dir * 1.5, -13.4, 9.5, 3.2).fill({ color: 0x000000, alpha: 0.13 });
  g.roundRect(backX, -35, 6.5, 24, 3).fill(darken(fabric, 0.18));
  // Upholstery catches the light along its top edge.
  g.roundRect(backX + 0.5, -34.6, 5.5, 2, 1).fill({ color: 0xffffff, alpha: 0.2 });
  g.roundRect(-10, -19, 20, 5, 2.4).fill(lighten(fabric, 0.16));
  g.roundRect(-9.4, -18.6, 18.8, 1.8, 0.9).fill({ color: 0xffffff, alpha: 0.22 });
  g.roundRect(dir * 9 - 2.6, -23, 5.2, 8, 2.4).fill(darken(fabric, 0.08));
  g.roundRect(dir * 9 - 2.2, -22.6, 4.4, 1.6, 0.8).fill({ color: 0xffffff, alpha: 0.18 });
  g.roundRect(-11.5, -3, 23, 3.4, 1.6).fill({ color: PAL.ink, alpha: 0.12 });
  // Feet, with a warm edge along the top of the wood.
  g.roundRect(-11, -2, 3, 2.6, 1).fill(PAL.woodDeep);
  g.roundRect(8, -2, 3, 2.6, 1).fill(PAL.woodDeep);
  g.rect(-11, -2, 3, 0.7).fill({ color: PAL.wood, alpha: 0.7 });
  g.rect(8, -2, 3, 0.7).fill({ color: PAL.wood, alpha: 0.7 });
}

/**
 * A plain wooden waiting-room chair. `fabric` is the seat pad: the practice owns
 * a dozen of these and they have never all matched, which is exactly what you
 * want when five of them get carried into one room for a circle.
 */
export function drawSideChair(g: Graphics, dir: 1 | -1, fabric = mix(PAL.sage, PAL.paper, 0.4)): void {
  const backX = dir === 1 ? -8.4 : 5.6;
  drawContactShadow(g, 10, 2.6);
  g.roundRect(backX, -27, 2.8, 16, 1.4).fill(PAL.woodDeep);
  g.rect(backX, -27, 0.9, 16).fill({ color: PAL.wood, alpha: 0.55 });
  g.roundRect(backX - 0.6, -26.5, 4, 2.6, 1.2).fill(PAL.woodDeep);
  g.roundRect(-9, -12.6, 18, 3.2, 1.5).fill(PAL.wood);
  g.roundRect(-8, -14.4, 16, 3, 1.4).fill(fabric);
  g.roundRect(-7.4, -14.2, 14.8, 1.1, 0.55).fill({ color: 0xffffff, alpha: 0.3 });
  g.ellipse(dir * 1, -12.4, 5.4, 1.3).fill({ color: PAL.ink, alpha: 0.1 });
  g.roundRect(-8, -9.6, 2.4, 9.6, 1.1).fill(PAL.woodDeep);
  g.roundRect(5.6, -9.6, 2.4, 9.6, 1.1).fill(PAL.woodDeep);
  g.rect(-8, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.45 });
  g.rect(5.6, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.45 });
}

/**
 * A rug, drawn flat on the floor line and centred on the origin. `seed` picks
 * the wobble: a hand-laid rug never sits square, and its edge is never a
 * perfect ellipse.
 */
export function drawRug(g: Graphics, w: number, color: number, seed = 0): void {
  const h = 13;
  const cy = -h / 2;
  // Ground shadow first, so the rug looks like it lies ON the boards.
  g.ellipse(0, cy + 1, w / 2 + 2, h / 2 + 1).fill({ color: PAL.ink, alpha: 0.08 });

  // The outer edge, drawn as a polygon with a wobbling radius so it reads as
  // woven cloth rather than a vector ellipse.
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const k = 1 + wobble(i, seed, 11, 0.035);
    const x = Math.cos(a) * (w / 2) * k;
    const y = cy + Math.sin(a) * (h / 2) * k;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fill(color);

  // A border band, then the field, then a woven centre.
  g.ellipse(0, cy, w / 2 - 3.5, h / 2 - 1.4).fill(darken(color, 0.2));
  g.ellipse(0, cy, w / 2 - 5.5, h / 2 - 2.2).fill(lighten(color, 0.22));
  g.ellipse(0, cy, w / 2 - 14, h / 2 - 4).fill(darken(color, 0.14));
  // A few pile lines across the field.
  for (let i = -2; i <= 2; i++) {
    const x = (i * w) / 14;
    g.moveTo(x + wobble(i, seed, 3, 1.2), cy - h / 2 + 3);
    g.lineTo(x + wobble(i, seed, 4, 1.2), cy + h / 2 - 3);
  }
  g.stroke({ color: darken(color, 0.28), width: 0.5, alpha: 0.35 });
  // Fringe at both ends, each tassel at its own slightly wrong angle.
  for (let i = -3; i <= 3; i++) {
    const j = wobble(i, seed, 7, 0.7);
    g.rect(-w / 2 - 3 + j, cy + i * 1.6 - 0.4, 4, 0.9).fill({ color: darken(color, 0.25), alpha: 0.8 });
    g.rect(w / 2 - 1 - j, cy + i * 1.6 - 0.4, 4, 0.9).fill({ color: darken(color, 0.25), alpha: 0.8 });
  }
}

/** A standing lamp. The glow sprite is positioned separately at `lampHeadY`. */
export function drawFloorLamp(g: Graphics, h = 62): void {
  drawContactShadow(g, 9, 2.6);
  g.ellipse(0, -1, 7.5, 2.6).fill(PAL.woodDeep);
  g.ellipse(-1, -1.8, 4, 1.1).fill({ color: PAL.wood, alpha: 0.5 });
  g.rect(-1.1, -h, 2.2, h).fill(PAL.inkSoft);
  g.rect(-1.1, -h, 0.8, h).fill({ color: 0xffffff, alpha: 0.16 });
  // Shade — a trapezoid, slightly wider at the bottom.
  g.moveTo(-6.5, -h);
  g.lineTo(6.5, -h);
  g.lineTo(9, -h + 12);
  g.lineTo(-9, -h + 12);
  g.closePath();
  g.fill(PAL.amberGlow);
  // The shade's own shading: the far side of the cloth is in its own shadow.
  g.moveTo(3, -h);
  g.lineTo(6.5, -h);
  g.lineTo(9, -h + 12);
  g.lineTo(4.4, -h + 12);
  g.closePath();
  g.fill({ color: PAL.amberDeep, alpha: 0.22 });
  g.moveTo(-9, -h + 12);
  g.lineTo(9, -h + 12);
  g.lineTo(8, -h + 13.4);
  g.lineTo(-8, -h + 13.4);
  g.closePath();
  g.fill({ color: PAL.amber, alpha: 0.9 });
}

export const lampHeadY = (h: number): number => -h + 9;

/** A table lamp for the reception desk. */
export function drawDeskLamp(g: Graphics): void {
  g.rect(-0.9, -14, 1.8, 14).fill(PAL.inkSoft);
  g.moveTo(-4.5, -20);
  g.lineTo(4.5, -20);
  g.lineTo(6, -13);
  g.lineTo(-6, -13);
  g.closePath();
  g.fill(PAL.amberGlow);
  g.ellipse(0, -0.5, 4.5, 1.6).fill(PAL.inkSoft);
}

/**
 * A window on the back wall. Panes are drawn in white so the caller can tint
 * the whole Graphics with the current sky colour.
 */
export function drawWindowPanes(g: Graphics, x: number, y: number, w: number, h: number): void {
  g.rect(x, y, w, h).fill(0xffffff);
}

export function drawWindowFrame(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  plain = false,
): void {
  // A warm reflection across the glass keeps the pane from reading as a hole.
  g.moveTo(x, y + h);
  g.lineTo(x + w * 0.45, y);
  g.lineTo(x + w * 0.68, y);
  g.lineTo(x + w * 0.23, y + h);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.16 });
  // Frame + mullions, in wood so the glass reads as glass.
  g.rect(x - 3.5, y - 3.5, w + 7, h + 7).stroke({ color: PAL.woodDeep, width: 3.5 });
  g.rect(x + w / 2 - 1.4, y, 2.8, h).fill(PAL.woodDeep);
  g.rect(x, y + h * 0.42 - 1.4, w, 2.8).fill(PAL.woodDeep);
  if (plain) return;
  // Sill and a curtain gathered on the left.
  g.roundRect(x - 8, y + h + 2, w + 16, 4, 1.6).fill(PAL.paperDeep);
  g.moveTo(x - 5, y - 5);
  g.quadraticCurveTo(x + w * 0.18, y + h * 0.4, x - 3, y + h + 1);
  g.lineTo(x - 12, y + h + 1);
  g.lineTo(x - 12, y - 5);
  g.closePath();
  g.fill({ color: mix(PAL.brickSoft, PAL.paperWarm, 0.45), alpha: 0.92 });
  // Pelmet.
  g.roundRect(x - 14, y - 8, w + 28, 5, 2).fill(PAL.woodDeep);
}

/** A small wall clock — a cheap, legible bit of "this is an office". */
export function drawWallClock(g: Graphics, x: number, y: number, r = 8): void {
  // Nobody ever hangs a clock quite level.
  const tilt = wobble(x, y, 5, 1.6 * DEG);
  g.rotateTransform(tilt);
  g.translateTransform(x, y);
  g.ellipse(1.6, 2.4, r * 0.98, r * 0.98).fill({ color: PAL.ink, alpha: 0.12 });
  g.circle(0, 0, r).fill(PAL.paper);
  g.circle(0, 0, r).stroke({ color: PAL.woodDeep, width: 2 });
  g.ellipse(-r * 0.28, -r * 0.32, r * 0.5, r * 0.32).fill({ color: 0xffffff, alpha: 0.4 });
  g.moveTo(0, 0);
  g.lineTo(0, -r * 0.6);
  g.moveTo(0, 0);
  g.lineTo(r * 0.45, r * 0.18);
  g.stroke({ color: PAL.inkSoft, width: 1.3, cap: 'round' });
  g.translateTransform(-x, -y);
  g.rotateTransform(-tilt);
}

/** A water cooler for the waiting room. */
export function drawWaterCooler(g: Graphics): void {
  drawContactShadow(g, 8.5, 2.4);
  g.roundRect(-7, -26, 14, 26, 2.5).fill(PAL.paperDeep);
  g.roundRect(-7, -26, 4, 26, 2.5).fill({ color: 0xffffff, alpha: 0.3 });
  g.roundRect(-8, -44, 16, 19, 5).fill({ color: 0x9fd0dc, alpha: 0.85 });
  g.roundRect(-8, -36, 16, 11, 3).fill({ color: 0x74b3c4, alpha: 0.9 });
  g.roundRect(-6.4, -42.5, 3, 15, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
  g.roundRect(-3, -21, 6, 3, 1.2).fill(PAL.inkSoft);
}

/** The front door, standing on the floor line at the origin. */
export function drawFrontDoor(g: Graphics, w: number, h: number): void {
  g.roundRect(-w / 2 - 3, -h - 4, w + 6, h + 4, 4).fill(PAL.woodDeep);
  g.roundRect(-w / 2, -h, w, h, 3).fill(PAL.brick);
  g.roundRect(-w / 2 + 4, -h + 6, w - 8, h * 0.38, 2).fill({ color: 0x000000, alpha: 0.1 });
  g.roundRect(-w / 2 + 4, -h + 10 + h * 0.38, w - 8, h * 0.4, 2).fill({ color: 0x000000, alpha: 0.1 });
  g.circle(w / 2 - 5, -h * 0.45, 1.8).fill(PAL.amber);
}

/** The wood panel that slides across a therapy-room doorway during a session. */
export function drawDoorPanel(g: Graphics, w: number, h: number): void {
  g.roundRect(0, -h, w, h, 2.5).fill(PAL.wood);
  g.roundRect(2, -h + 4, w - 4, h - 8, 2).fill({ color: PAL.woodDeep, alpha: 0.35 });
  g.circle(w - 4.5, -h * 0.46, 1.5).fill(PAL.amberGlow);
}

/**
 * The doorway a session door slides across. The opening shows the warm hall
 * beyond rather than a black hole, so an open door still reads as inviting.
 */
export function drawDoorway(g: Graphics, x: number, floorY: number, w: number, h: number): void {
  g.roundRect(x, floorY - h, w, h, 2).fill(mix(PAL.paperWarm, PAL.woodDeep, 0.45));
  g.roundRect(x, floorY - h, w * 0.45, h, 2).fill({ color: PAL.amberGlow, alpha: 0.2 });
  g.roundRect(x - 3, floorY - h - 3, w + 6, h + 3, 2.5).stroke({ color: PAL.woodDeep, width: 3 });
}

/**
 * A compact switchback stairwell filling its own narrow cell. `h` is the full
 * floor-to-floor rise; the origin is the bottom-left, on the lower floor line.
 */
export function drawStairwell(g: Graphics, w: number, h: number): void {
  const half = h / 2;
  const steps = 5;
  // Lower flight climbs left → right.
  for (let i = 0; i < steps; i++) {
    const sx = (i * w) / steps;
    const sy = -((i + 1) * half) / steps;
    g.rect(sx, sy, w / steps + 1, -sy).fill(i % 2 ? PAL.wood : lighten(PAL.wood, 0.07));
    g.rect(sx, sy, w / steps + 1, 2).fill({ color: PAL.ink, alpha: 0.18 });
  }
  // Mid landing.
  g.rect(0, -half - 5, w, 5).fill(PAL.woodDeep);
  // Upper flight climbs right → left, drawn as solid blocks down to the
  // landing so it reads as a staircase and not a row of floating slats.
  for (let i = 0; i < steps; i++) {
    const sx = w - ((i + 1) * w) / steps;
    const sy = -half - 5 - ((i + 1) * (half - 5)) / steps;
    g.rect(sx, sy, w / steps + 1, -half - 5 - sy).fill(i % 2 ? PAL.wood : lighten(PAL.wood, 0.07));
    g.rect(sx, sy, w / steps + 1, 2).fill({ color: PAL.ink, alpha: 0.18 });
  }
  // Banisters.
  g.moveTo(2, -14);
  g.lineTo(w - 3, -half - 14);
  g.moveTo(w - 3, -half - 20);
  g.lineTo(3, -h + 2);
  g.stroke({ color: PAL.woodDeep, width: 2.6, cap: 'round' });
}

export function drawLowTable(g: Graphics, w: number): void {
  drawContactShadow(g, w * 0.55, 3);
  g.roundRect(-w / 2, -13, w, 3.4, 1.6).fill(PAL.wood);
  g.roundRect(-w / 2, -13, w, 1.1, 0.55).fill({ color: 0xffffff, alpha: 0.26 });
  g.roundRect(-w / 2, -9.9, w, 0.9, 0.45).fill({ color: PAL.woodDeep, alpha: 0.55 });
  g.roundRect(-w / 2 + 3, -9.6, 2.6, 9.6, 1.2).fill(PAL.woodDeep);
  g.roundRect(w / 2 - 5.6, -9.6, 2.6, 9.6, 1.2).fill(PAL.woodDeep);
  g.rect(-w / 2 + 3, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.5 });
  g.rect(w / 2 - 5.6, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.5 });
  // Magazines, fanned the way a stack actually settles.
  g.roundRect(-6, -16.2, 12, 1.6, 0.8).fill(PAL.brickSoft);
  g.roundRect(-4.5, -17.6, 11, 1.6, 0.8).fill(PAL.sage);
  g.roundRect(-5.5, -19, 10, 1.6, 0.8).fill(PAL.amber);
  g.roundRect(-5.5, -19, 10, 0.6, 0.3).fill({ color: 0xffffff, alpha: 0.3 });
}

export function drawCoatRack(g: Graphics, h = 56): void {
  drawContactShadow(g, 7.5, 2.2);
  g.ellipse(0, -1, 6, 2.2).fill(PAL.woodDeep);
  g.rect(-1.2, -h, 2.4, h).fill(PAL.woodDeep);
  g.rect(-1.2, -h, 0.9, h).fill({ color: PAL.wood, alpha: 0.5 });
  g.moveTo(-1.2, -h + 6);
  g.lineTo(-8, -h + 11);
  g.moveTo(1.2, -h + 6);
  g.lineTo(8, -h + 11);
  g.stroke({ color: PAL.woodDeep, width: 2, cap: 'round' });
  // A hung coat.
  g.moveTo(-8, -h + 11);
  g.quadraticCurveTo(-13, -h + 26, -6, -h + 30);
  g.quadraticCurveTo(-2, -h + 22, -4, -h + 11);
  g.closePath();
  g.fill(PAL.plum);
}

export function drawReceptionDesk(g: Graphics, w: number): void {
  const h = 26;
  drawContactShadow(g, w * 0.56, 3.4);
  g.roundRect(-w / 2, -h, w, h, 2.5).fill(PAL.wood);
  g.roundRect(-w / 2, -h, w, 4, 2).fill(PAL.paperDeep);
  // The lit top edge of the counter — the one line that makes it read as wood.
  g.roundRect(-w / 2, -h, w, 1.2, 0.6).fill({ color: 0xffffff, alpha: 0.34 });
  g.rect(-w / 2, -h + 4, w, 1).fill({ color: PAL.woodDeep, alpha: 0.4 });
  g.roundRect(-w / 2 + 2, -h + 8, w - 4, h - 12, 2).fill({ color: PAL.woodDeep, alpha: 0.28 });
  // A little monitor and a stack of files.
  g.roundRect(-w / 2 + 7, -h - 12, 14, 10, 1.6).fill(PAL.inkSoft);
  g.roundRect(-w / 2 + 8, -h - 11, 12, 8, 1.2).fill(mix(PAL.sage, PAL.paper, 0.55));
  g.roundRect(w / 2 - 18, -h - 4, 11, 4, 1).fill(PAL.paper);
  g.roundRect(w / 2 - 17, -h - 7, 10, 3.4, 1).fill(PAL.paperWarm);
}

export function drawCoffeeMachine(g: Graphics): void {
  // Counter.
  drawContactShadow(g, 24, 3.4);
  g.roundRect(-24, -22, 48, 4, 1.6).fill(PAL.paperDeep);
  g.roundRect(-24, -22, 48, 1.2, 0.6).fill({ color: 0xffffff, alpha: 0.36 });
  g.roundRect(-22, -18, 44, 18, 2).fill(mix(PAL.wood, PAL.paperDeep, 0.35));
  g.rect(-22, -18, 44, 1).fill({ color: PAL.woodDeep, alpha: 0.35 });
  // The machine itself.
  g.roundRect(-16, -48, 20, 26, 3).fill(PAL.inkSoft);
  g.roundRect(-13.5, -45, 15, 9, 2).fill(mix(PAL.amber, PAL.ink, 0.35));
  g.roundRect(-12, -30, 9, 6, 1.2).fill(PAL.paper);
  g.circle(-1.5, -41, 1.6).fill(PAL.amber);
  // Kettle.
  g.roundRect(8, -34, 13, 12, 3).fill(PAL.brick);
  g.moveTo(21, -31);
  g.quadraticCurveTo(26, -29, 22, -25);
  g.stroke({ color: PAL.brick, width: 2.4, cap: 'round' });
  g.roundRect(11, -37, 7, 3, 1.4).fill(darken(PAL.brick, 0.25));
  // Mugs.
  g.roundRect(-20, -27, 5, 5, 1.4).fill(PAL.paper);
  g.roundRect(-13.5, -27, 5, 5, 1.4).fill(PAL.sage);
}

export function drawCouch(g: Graphics, w: number): void {
  const h = 15;
  drawContactShadow(g, w * 0.52, 3.6);
  g.roundRect(-w / 2, -h, w, h, 4).fill(PAL.plum);
  g.roundRect(-w / 2, -h - 16, w * 0.94, 18, 4).fill(darken(PAL.plum, 0.16));
  // Light along the top of the back, shadow in the seat well.
  g.roundRect(-w / 2 + 1.5, -h - 15.6, w * 0.94 - 3, 2.4, 1.2).fill({ color: 0xffffff, alpha: 0.2 });
  g.roundRect(-w / 2 + 2, -h - 3.5, w / 2 - 4, 5, 2.4).fill(lighten(PAL.plum, 0.18));
  g.roundRect(2, -h - 3.5, w / 2 - 4, 5, 2.4).fill(lighten(PAL.plum, 0.18));
  g.ellipse(-w / 4, -h + 1.5, w / 4 - 3, 2.6).fill({ color: 0x000000, alpha: 0.12 });
  g.ellipse(w / 4, -h + 1.5, w / 4 - 3, 2.6).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(w / 2 - 6, -h - 10, 6, 12, 3).fill(darken(PAL.plum, 0.08));
  g.roundRect(w / 2 - 5.6, -h - 9.6, 5.2, 1.6, 0.8).fill({ color: 0xffffff, alpha: 0.16 });
  // Cushion, thrown down at its own slightly wrong angle.
  const cx = -w / 2 + 9.5;
  const cy = -h - 7.5;
  g.rotateTransform(-6 * DEG);
  g.translateTransform(cx, cy);
  g.roundRect(-4.5, -4.5, 9, 9, 2.4).fill(PAL.amber);
  g.roundRect(-4.5, -4.5, 9, 2.4, 1.2).fill({ color: 0xffffff, alpha: 0.2 });
  g.translateTransform(-cx, -cy);
  g.rotateTransform(6 * DEG);
}

export function drawBookshelf(g: Graphics, w: number, h: number): void {
  drawContactShadow(g, w * 0.55, 3.2);
  g.roundRect(-w / 2, -h, w, h, 2).fill(PAL.woodDeep);
  g.rect(-w / 2, -h, w, 1.1).fill({ color: PAL.wood, alpha: 0.55 });
  const shelves = Math.max(2, Math.round(h / 20));
  for (let s = 0; s < shelves; s++) {
    const y = -h + 3 + (s * (h - 6)) / shelves;
    const sh = (h - 6) / shelves - 3;
    g.rect(-w / 2 + 2.5, y, w - 5, sh).fill(darken(PAL.woodDeep, 0.35));
    // Books.
    let bx = -w / 2 + 4;
    let i = s;
    while (bx < w / 2 - 6) {
      const bw = 2.4 + ((i * 7) % 3);
      const col = [PAL.brick, PAL.sage, PAL.amber, PAL.plum, PAL.paperDeep][(i * 3) % 5];
      g.rect(bx, y + 1.5, bw, sh - 2.5).fill(col);
      bx += bw + 1.1;
      i++;
    }
  }
}

/**
 * Framed art for a bare wall. Hung by hand, so it hangs slightly crooked — the
 * angle is a hash of where it is, and therefore the same every frame and the
 * same again after a rebuild.
 */
export function drawWallArt(g: Graphics, x: number, y: number, w: number, h: number, tone: number): void {
  const tilt = wobble(x, y, 2, 1.4 * DEG);
  const cx = x + w / 2;
  const cy = y + h / 2;
  g.rotateTransform(tilt);
  g.translateTransform(cx, cy);
  const l = -w / 2;
  const t = -h / 2;
  // The frame casts a little shadow down and to the right onto the wall.
  g.roundRect(l + 1.6, t + 2.2, w, h, 1.6).fill({ color: PAL.ink, alpha: 0.14 });
  g.roundRect(l, t, w, h, 1.6).fill(PAL.woodDeep);
  g.roundRect(l, t, w, 1.2, 0.6).fill({ color: PAL.wood, alpha: 0.6 });
  g.rect(l + 2.5, t + 2.5, w - 5, h - 5).fill(mix(tone, PAL.paper, 0.45));
  // A hill, a sun, and the glaze catching the light across the top corner.
  g.moveTo(l + 3, t + h - 4);
  g.lineTo(l + w * 0.4, t + h * 0.42);
  g.lineTo(l + w * 0.62, t + h - 4);
  g.closePath();
  g.fill({ color: tone, alpha: 0.75 });
  g.circle(l + w * 0.74, t + h * 0.32, h * 0.11).fill({ color: PAL.amber, alpha: 0.9 });
  g.moveTo(l + 2.5, t + 2.5);
  g.lineTo(l + w * 0.5, t + 2.5);
  g.lineTo(l + 2.5, t + h * 0.6);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.12 });
  g.translateTransform(-cx, -cy);
  g.rotateTransform(-tilt);
}

/**
 * The prop that says which school this room practises from — the thing a player
 * can point at and say "oh, that one's the somatic therapist". Every object here
 * is the one named in `MODALITIES[].prop`, drawn standing on the floor line.
 */
export function drawModalityProp(g: Graphics, modality: string, accent: number): void {
  switch (modality) {
    case 'cbt': {
      // A whiteboard ruled into three columns, half-erased.
      drawContactShadow(g, 10, 2.4);
      g.moveTo(-7, 0);
      g.lineTo(-1.4, -30);
      g.moveTo(7, 0);
      g.lineTo(1.4, -30);
      g.stroke({ color: PAL.woodDeep, width: 2, cap: 'round' });
      g.rotateTransform(-1.2 * DEG);
      g.translateTransform(0, -42);
      g.roundRect(-13, -13, 26, 26, 1.5).fill(PAL.woodDeep);
      g.rect(-11.4, -11.4, 22.8, 22.8).fill(PAL.paper);
      g.moveTo(-3.8, -11.4);
      g.lineTo(-3.8, 11.4);
      g.moveTo(3.8, -11.4);
      g.lineTo(3.8, 11.4);
      g.stroke({ color: mix(accent, PAL.paper, 0.35), width: 0.9 });
      for (let i = 0; i < 5; i++) {
        const yy = -7.5 + i * 3.6;
        g.moveTo(-9.6 + wobble(i, 1, 9, 0.8), yy);
        g.lineTo(-5.4 - (i % 2) * 1.4, yy);
        if (i < 3) {
          g.moveTo(-1.8, yy + 1.2);
          g.lineTo(2.2 - (i % 2) * 1.6, yy + 1.2);
        }
      }
      g.stroke({ color: PAL.inkFaint, width: 0.75, alpha: 0.7, cap: 'round' });
      // The half-erased smear.
      g.rect(4.4, -6, 6.4, 10).fill({ color: 0xffffff, alpha: 0.6 });
      g.translateTransform(0, 42);
      g.rotateTransform(1.2 * DEG);
      break;
    }
    case 'dbt': {
      // A fanned deck of laminated skills cards on a low stool.
      drawContactShadow(g, 9, 2.4);
      g.roundRect(-8, -14, 16, 2.6, 1.2).fill(PAL.wood);
      g.roundRect(-8, -14, 16, 0.9, 0.45).fill({ color: 0xffffff, alpha: 0.3 });
      g.roundRect(-6.4, -11.4, 2.2, 11.4, 1).fill(PAL.woodDeep);
      g.roundRect(4.2, -11.4, 2.2, 11.4, 1).fill(PAL.woodDeep);
      for (let i = 0; i < 5; i++) {
        const a = (-28 + i * 14) * DEG;
        g.rotateTransform(a);
        g.translateTransform(0, -15.5);
        g.roundRect(-3.4, -9.5, 6.8, 9.5, 1).fill(i % 2 ? PAL.paper : mix(accent, PAL.paper, 0.55));
        g.roundRect(-3.4, -9.5, 6.8, 1.8, 0.9).fill({ color: accent, alpha: 0.75 });
        g.translateTransform(0, 15.5);
        g.rotateTransform(-a);
      }
      break;
    }
    case 'emdr': {
      // A light bar on a low tripod, angled at the empty chair.
      drawContactShadow(g, 9, 2.4);
      g.moveTo(-6, 0);
      g.lineTo(0, -20);
      g.lineTo(6, 0);
      g.moveTo(0, -20);
      g.lineTo(1.5, 0);
      g.stroke({ color: PAL.inkSoft, width: 1.8, cap: 'round' });
      g.rotateTransform(-7 * DEG);
      g.translateTransform(0, -24);
      g.roundRect(-13, -3, 26, 6, 3).fill(PAL.ink);
      for (let i = 0; i < 5; i++) {
        g.circle(-9 + i * 4.5, 0, 1.5).fill({ color: i === 2 ? PAL.amberGlow : mix(accent, PAL.ink, 0.4) });
      }
      g.circle(0, 0, 1.5).fill(PAL.amberGlow);
      g.ellipse(0, 0, 15, 4).fill({ color: PAL.amberGlow, alpha: 0.12 });
      g.translateTransform(0, 24);
      g.rotateTransform(7 * DEG);
      break;
    }
    case 'somatic': {
      // A rolled yoga mat standing in the corner like a patient cat.
      drawContactShadow(g, 7, 2.2);
      g.rotateTransform(3 * DEG);
      g.roundRect(-4.6, -34, 9.2, 34, 4.4).fill(mix(accent, PAL.sageDeep, 0.25));
      g.roundRect(-4.6, -34, 3.4, 34, 1.8).fill({ color: 0xffffff, alpha: 0.18 });
      g.ellipse(0, -33.6, 4.6, 2.2).fill(darken(mix(accent, PAL.sageDeep, 0.25), 0.2));
      g.ellipse(0, -33.6, 1.7, 0.9).fill({ color: PAL.ink, alpha: 0.3 });
      g.roundRect(-5.4, -20, 10.8, 2.4, 1.2).fill(mix(PAL.paperDeep, PAL.woodDeep, 0.4));
      g.rotateTransform(-3 * DEG);
      // A folded blanket beside it.
      g.roundRect(6, -6, 13, 6, 1.6).fill(mix(PAL.paperDeep, accent, 0.3));
      g.rect(6, -4, 13, 0.8).fill({ color: PAL.ink, alpha: 0.12 });
      break;
    }
    case 'psychodynamic': {
      // A low worn couch with the clock turned away from it.
      drawContactShadow(g, 17, 3);
      g.roundRect(-16, -12, 32, 12, 3).fill(mix(accent, PAL.paperDeep, 0.28));
      g.roundRect(-16, -20, 9, 9, 3).fill(mix(accent, PAL.paperDeep, 0.14));
      g.roundRect(-15.4, -19.6, 8, 2, 1).fill({ color: 0xffffff, alpha: 0.22 });
      g.roundRect(-15, -12.6, 30, 2.4, 1.2).fill({ color: 0xffffff, alpha: 0.16 });
      g.ellipse(2, -10.4, 11, 2).fill({ color: 0x000000, alpha: 0.12 });
      g.roundRect(-14, -2, 2.6, 2.4, 1).fill(PAL.woodDeep);
      g.roundRect(11.4, -2, 2.6, 2.4, 1).fill(PAL.woodDeep);
      // A small clock, face to the wall.
      g.roundRect(13, -17, 4, 5, 1).fill(PAL.woodDeep);
      break;
    }
    case 'act': {
      // A brass compass on a slim stand, needle never quite still.
      drawContactShadow(g, 6.5, 2);
      g.ellipse(0, -1, 5.5, 2).fill(PAL.woodDeep);
      g.rect(-1.4, -22, 2.8, 21).fill(PAL.woodDeep);
      g.rect(-1.4, -22, 1, 21).fill({ color: PAL.wood, alpha: 0.55 });
      g.roundRect(-7, -25, 14, 3.4, 1.6).fill(PAL.wood);
      g.roundRect(-7, -25, 14, 1.1, 0.55).fill({ color: 0xffffff, alpha: 0.3 });
      g.rotateTransform(-4 * DEG);
      g.translateTransform(0, -29);
      g.circle(0, 0, 5).fill(mix(PAL.amber, PAL.woodDeep, 0.3));
      g.circle(0, 0, 3.6).fill(PAL.paperWarm);
      g.moveTo(0, -3);
      g.lineTo(1.2, 0);
      g.lineTo(0, 3);
      g.lineTo(-1.2, 0);
      g.closePath();
      g.fill(PAL.brick);
      g.circle(-1.4, -1.6, 1.6).fill({ color: 0xffffff, alpha: 0.35 });
      g.translateTransform(0, 29);
      g.rotateTransform(4 * DEG);
      break;
    }
    case 'play': {
      // A sand tray and a basket of chipped wooden figures.
      drawContactShadow(g, 13, 2.8);
      g.roundRect(-13, -6, 26, 6, 1).fill(PAL.woodDeep);
      g.roundRect(-13, -14, 26, 8, 1.4).fill(mix(PAL.wood, PAL.paperDeep, 0.2));
      g.roundRect(-11.4, -12.6, 22.8, 5, 1).fill(mix(PAL.paperDeep, PAL.amber, 0.28));
      // Dunes in the sand.
      g.moveTo(-11, -9);
      g.quadraticCurveTo(-4, -11.4, 2, -9.2);
      g.quadraticCurveTo(7, -7.6, 11, -9);
      g.stroke({ color: darken(mix(PAL.paperDeep, PAL.amber, 0.28), 0.18), width: 0.8 });
      // Three little figures standing in it.
      for (let i = 0; i < 3; i++) {
        const fx = -6 + i * 6 + wobble(i, 2, 6, 1.1);
        g.roundRect(fx - 1, -16.5, 2, 4, 1).fill([PAL.brick, accent, PAL.sageDeep][i % 3]);
        g.circle(fx, -17.4, 1.3).fill(PAL.wood);
      }
      // The basket.
      g.moveTo(15, -1);
      g.lineTo(27, -1);
      g.lineTo(25.4, -9);
      g.lineTo(16.6, -9);
      g.closePath();
      g.fill(mix(PAL.wood, PAL.woodDeep, 0.4));
      g.rect(16.4, -6.5, 9.2, 0.8).fill({ color: PAL.paperDeep, alpha: 0.4 });
      break;
    }
    default: {
      // family — a ring of mismatched chairs, one always pulled slightly back.
      drawContactShadow(g, 16, 2.8);
      const tones = [PAL.wood, mix(PAL.sage, PAL.paperDeep, 0.4), mix(accent, PAL.paperDeep, 0.4)];
      for (let i = 0; i < 3; i++) {
        const cx = -11 + i * 11;
        const back = i === 1 ? -3 : 0;
        const tilt = wobble(i, 3, 8, 2.6 * DEG);
        g.rotateTransform(tilt);
        g.translateTransform(cx + back, i === 1 ? -1.5 : 0);
        g.roundRect(-4.6, -8, 9.2, 2.2, 1).fill(tones[i]);
        g.roundRect(-4.6, -8, 9.2, 0.8, 0.4).fill({ color: 0xffffff, alpha: 0.28 });
        g.roundRect(-4.2, -6, 1.6, 6, 0.8).fill(PAL.woodDeep);
        g.roundRect(2.6, -6, 1.6, 6, 0.8).fill(PAL.woodDeep);
        g.roundRect(i % 2 ? 2.6 : -4.2, -17, 1.7, 9.4, 0.8).fill(darken(tones[i], 0.2));
        g.translateTransform(-(cx + back), i === 1 ? 1.5 : 0);
        g.rotateTransform(-tilt);
      }
      break;
    }
  }
}

/**
 * A potted plant. `growth` (0..1) controls how lush it is — the office fills
 * out as alumni accumulate, which is the whole point of the motif.
 */
export function drawPlant(g: Graphics, size: number, species: number, growth = 1): void {
  const leaf = [PAL.sage, 0x7fa57c, 0x93b98d, 0x6f9c70, 0xa3c39c, 0x82ab86][species % 6];
  const pot = [PAL.brick, 0xb0705c, 0xa8523f, PAL.woodDeep, 0xc2634f, 0x9c6a55][species % 6];
  const potH = size * 0.34;
  const potW = size * 0.42;

  drawContactShadow(g, potW * 0.62, potW * 0.2);
  g.moveTo(-potW / 2, -potH);
  g.lineTo(potW / 2, -potH);
  g.lineTo(potW / 2 - potW * 0.13, 0);
  g.lineTo(-potW / 2 + potW * 0.13, 0);
  g.closePath();
  g.fill(pot);
  // Terracotta is a curved surface: light down one side, shadow down the other.
  g.moveTo(-potW / 2, -potH);
  g.lineTo(-potW / 2 + potW * 0.26, -potH);
  g.lineTo(-potW / 2 + potW * 0.32, 0);
  g.lineTo(-potW / 2 + potW * 0.13, 0);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.16 });
  g.moveTo(potW / 2 - potW * 0.2, -potH);
  g.lineTo(potW / 2, -potH);
  g.lineTo(potW / 2 - potW * 0.13, 0);
  g.lineTo(potW / 2 - potW * 0.26, 0);
  g.closePath();
  g.fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(-potW / 2 - 1.2, -potH - 2.6, potW + 2.4, 3.4, 1.2).fill(darken(pot, 0.16));
  g.roundRect(-potW / 2 - 1.2, -potH - 2.6, potW + 2.4, 1.1, 0.55).fill({
    color: 0xffffff,
    alpha: 0.18,
  });
  // Soil.
  g.ellipse(0, -potH - 1.4, potW * 0.42, 1.1).fill(darken(PAL.woodDeep, 0.35));

  const stemH = size * 0.62 * (0.55 + growth * 0.45);
  const leaves = 3 + Math.round(growth * 3);
  for (let i = 0; i < leaves; i++) {
    const t = (i + 1) / (leaves + 1);
    const dir = i % 2 === 0 ? 1 : -1;
    const y = -potH - stemH * t;
    // No two leaves come off a stem at the same angle or the same length.
    const len = size * (0.2 + 0.13 * (1 - t)) * (1 + wobble(i, species, 21, 0.16));
    const lift = wobble(i, species, 22, 0.3);
    g.moveTo(0, y);
    g.quadraticCurveTo(dir * len * 0.7, y - len * (0.55 + lift), dir * len, y - len * (0.9 + lift));
    g.quadraticCurveTo(dir * len * 0.35, y - len * 0.2, 0, y);
    g.closePath();
    g.fill({ color: i % 3 === 0 ? lighten(leaf, 0.12) : leaf, alpha: 0.95 });
    // A midrib, which is what stops a leaf reading as a coloured comma.
    g.moveTo(0, y);
    g.quadraticCurveTo(dir * len * 0.5, y - len * (0.4 + lift * 0.6), dir * len * 0.94, y - len * (0.86 + lift));
    g.stroke({ color: darken(leaf, 0.22), width: 0.45, alpha: 0.5 });
  }
  g.moveTo(0, -potH);
  g.quadraticCurveTo(wobble(species, 0, 23, 1.4), -potH - stemH * 0.55, 0, -potH - stemH);
  g.stroke({ color: darken(leaf, 0.2), width: 1.4, cap: 'round' });
}

// ─────────────────────────────────────────────────────────────────────────────
// The office cat. Entirely optional to the game and entirely the point of it.
// ─────────────────────────────────────────────────────────────────────────────

export type CatPose = 'walk' | 'sit' | 'curl';

export interface CatRig {
  view: Container;
  body: Graphics;
  tail: Graphics;
  pose: CatPose;
  phase: number;
}

const CAT_FUR = 0x9c8d7e;

/** The cat, drawn with her feet at the local origin and facing +x. */
function drawCat(g: Graphics, pose: CatPose): void {
  const fur = CAT_FUR;
  const dark = darken(fur, 0.22);
  g.clear();
  if (pose === 'curl') {
    g.ellipse(0, 0, 8.5, 2).fill({ color: PAL.ink, alpha: 0.14 });
    g.ellipse(0, -3.6, 8, 4).fill(fur);
    g.ellipse(-2, -4.8, 5.4, 3).fill(lighten(fur, 0.1));
    g.circle(5, -5.2, 3.1).fill(fur);
    g.moveTo(3.2, -7.6);
    g.lineTo(3.9, -10);
    g.lineTo(5.2, -7.9);
    g.closePath();
    g.fill(dark);
    g.moveTo(6, -8);
    g.lineTo(7.1, -10);
    g.lineTo(7.5, -7.4);
    g.closePath();
    g.fill(dark);
    // Eyes shut — she is asleep, that is the entire joke.
    g.moveTo(3.6, -5.4);
    g.quadraticCurveTo(4.4, -4.7, 5.2, -5.4);
    g.stroke({ color: PAL.ink, width: 0.6, cap: 'round' });
    return;
  }
  const sitting = pose === 'sit';
  g.ellipse(0, 0, sitting ? 5 : 7.5, 1.9).fill({ color: PAL.ink, alpha: 0.14 });
  if (sitting) {
    g.moveTo(-3.6, 0);
    g.quadraticCurveTo(-4.6, -7, -2.4, -10.5);
    g.quadraticCurveTo(1.6, -12.6, 3.2, -8.4);
    g.quadraticCurveTo(4, -3.4, 3.6, 0);
    g.closePath();
    g.fill(fur);
    g.roundRect(1.4, -2.2, 3.6, 2.2, 1.1).fill(lighten(fur, 0.1));
  } else {
    g.roundRect(-6.5, -8.6, 13, 5.4, 2.7).fill(fur);
    g.roundRect(-6, -8.4, 12, 1.8, 0.9).fill({ color: 0xffffff, alpha: 0.14 });
    g.roundRect(-5, -3.6, 1.9, 3.8, 0.9).fill(dark);
    g.roundRect(-1.4, -3.6, 1.9, 3.8, 0.9).fill(fur);
    g.roundRect(2.2, -3.6, 1.9, 3.8, 0.9).fill(dark);
    g.roundRect(4.8, -3.6, 1.9, 3.8, 0.9).fill(fur);
  }
  const hx = sitting ? 2.4 : 7;
  const hy = sitting ? -12.4 : -10.4;
  g.circle(hx, hy, 3.1).fill(fur);
  g.moveTo(hx - 2.4, hy - 1.6);
  g.lineTo(hx - 2, hy - 4.4);
  g.lineTo(hx + 0.2, hy - 2.4);
  g.closePath();
  g.fill(dark);
  g.moveTo(hx + 0.9, hy - 2.5);
  g.lineTo(hx + 2.9, hy - 4.3);
  g.lineTo(hx + 3, hy - 1.5);
  g.closePath();
  g.fill(dark);
  g.circle(hx - 0.9, hy - 0.2, 0.55).fill(PAL.ink);
  g.circle(hx + 1.5, hy - 0.2, 0.55).fill(PAL.ink);
  g.circle(hx + 2.4, hy + 1.3, 0.5).fill({ color: 0xd88f8f, alpha: 0.9 });
}

/** A cat with an independently swishing tail. Position `view` at her feet. */
export function createCat(): CatRig {
  const view = new Container();
  const tail = new Graphics();
  // The tail is hinged at her rump, so it can swish without redrawing her.
  tail.moveTo(0, 0);
  tail.quadraticCurveTo(-5.5, -1.5, -7.5, -7);
  tail.stroke({ color: CAT_FUR, width: 2.4, cap: 'round' });
  const body = new Graphics();
  view.addChild(tail, body);
  const c: CatRig = { view, body, tail, pose: 'walk', phase: Math.random() * 6.28 };
  drawCat(body, 'walk');
  tail.position.set(-6, -7);
  return c;
}

export function setCatPose(c: CatRig, pose: CatPose): void {
  if (c.pose === pose) return;
  c.pose = pose;
  drawCat(c.body, pose);
  c.tail.position.set(pose === 'sit' ? -3.4 : -6, pose === 'curl' ? -3.4 : pose === 'sit' ? -5 : -7);
  c.tail.visible = pose !== 'curl';
}

/** The staircase in the upper landing, descending to the right. */
export function drawStairs(g: Graphics, w: number, h: number): void {
  const steps = 7;
  const sw = w / steps;
  const sh = h / steps;
  for (let i = 0; i < steps; i++) {
    g.rect(i * sw, i * sh, sw + 1, h - i * sh).fill(i % 2 ? PAL.wood : lighten(PAL.wood, 0.08));
    g.rect(i * sw, i * sh, sw + 1, 2).fill({ color: PAL.ink, alpha: 0.16 });
  }
  // Handrail.
  g.moveTo(0, -13);
  g.lineTo(w, h - 13);
  g.stroke({ color: PAL.woodDeep, width: 2.4, cap: 'round' });
}

/** A small label used for the "+N more" wing. */
export function makeLabel(text: string, size: number, color: number): Text {
  return new Text({
    text,
    style: {
      fontFamily: 'Fraunces, Iowan Old Style, Georgia, serif',
      fontSize: size,
      fontWeight: '600',
      fill: color,
      align: 'center',
    },
  });
}

/** A tinted glow sprite ready to be parked over a lamp. */
export function makeGlow(color: number, size: number, alpha: number): Sprite {
  const s = new Sprite(glowTexture());
  s.anchor.set(0.5);
  s.width = size;
  s.height = size;
  s.tint = color;
  s.alpha = alpha;
  s.blendMode = 'add';
  return s;
}
