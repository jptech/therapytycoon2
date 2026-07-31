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
 *
 * The tile is 192 rather than 128 so the repeat period is comfortably wider
 * than any wall in the building — a visible grain *pattern* is worse than no
 * grain at all. The flecks themselves got quieter: at 62 alpha they read as
 * dust floating in front of the sky rather than tooth in the paper behind it,
 * which is the wrong side of the glass. A steeper exponent empties the field
 * out and the survivors sit at half the old contrast, so the grain now lives in
 * the fills instead of on top of them.
 */
export function grainTexture(): Texture {
  if (_grain) return _grain;
  const S = 192;
  const c = makeCanvas(S);
  if (!c) return (_grain = Texture.WHITE);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let i = 0; i < S * S; i++) {
    // Cubing keeps most of the field empty and lets a few flecks read, which
    // is what paper actually looks like.
    // Weighted toward the dark flecks: light speckle lifts the blacks and the
    // night sky goes milky, which is the one thing grain must never do.
    const dark = Math.random() < 0.7;
    const a = Math.pow(Math.random(), 3.1) * (dark ? 38 : 22);
    const o = i * 4;
    // Warm-dark rather than near-black: paper fibre, not soot.
    d[o] = dark ? 40 : 255;
    d[o + 1] = dark ? 54 : 250;
    d[o + 2] = dark ? 52 : 238;
    d[o + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  _grain = Texture.from(c);
  return _grain;
}

let _sky: Texture | null = null;

/**
 * Grayscale vertical gradient used for the sky (tinted at runtime).
 *
 * Still grayscale and still black-at-the-top / white-at-the-horizon, because
 * the caller tints the whole sprite — the endpoints are the contract. What
 * changed is the middle: three stops interpolate as two straight ramps with a
 * visible kink at the join, and a kink in a sky reads as a banding artifact.
 * Six stops with the light piling up toward the horizon is what the last few
 * degrees above a rooftop actually do.
 */
export function skyTexture(): Texture {
  if (_sky) return _sky;
  const c = makeCanvas(4);
  if (!c) return (_sky = Texture.WHITE);
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6f6f6f');
  g.addColorStop(0.26, '#8b8b8b');
  g.addColorStop(0.55, '#c8c8c8');
  g.addColorStop(0.78, '#e4e4e4');
  g.addColorStop(0.93, '#f8f8f8');
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
    // The top of the thigh is the flattest surface on a seated body, so it is
    // the one that catches the lamp.
    g.roundRect(-5, hipY - 3.2, 15.5, 1.5, 0.75).fill({ color: 0xffffff, alpha: 0.11 });
    // Knee, breaking over the front edge.
    g.circle(11.4, hipY - 0.6, 2.9).fill(trouser);
    g.ellipse(11.2, hipY - 2.1, 1.9, 0.9).fill({ color: 0xffffff, alpha: 0.13 });
    // Shin, dropping from the knee.
    g.roundRect(9, hipY - 2.4, 5.2, 12.2, 2.4).fill(darken(trouser, 0.07));
    // The trouser breaks over the shoe — one fold, and the shin stops being pipe.
    g.roundRect(8.5, -6.4, 6.2, 2.8, 1.4).fill(darken(trouser, 0.19));
    // Foot, flat on the boards.
    drawShoe(g, 8.2, 0, 1, trouser, 8.2);
    // Crease where the thigh folds into the hip.
    g.roundRect(-5.6, hipY - 1.6, 7.5, 1.5, 0.75).fill({ color: 0x000000, alpha: 0.1 });
  }

  // ── Torso ─────────────────────────────────────────────────────────────────
  g.roundRect(-7.2, torsoTop, 14.4, hipY - torsoTop + 1.5, 5.2).fill(outfit);
  // Shoulder highlight — the lamplight lands on top of people too.
  g.roundRect(-6.4, torsoTop + 0.2, 12.8, 2.6, 1.3).fill({ color: 0xffffff, alpha: 0.13 });
  // Inner shadow down the left side. Everything on a figure is lit from local
  // +x and shaded toward -x; the rig mirrors wholesale for facing, so internal
  // consistency is the only kind available and it is worth having.
  g.roundRect(-7.2, torsoTop, 4.2, hipY - torsoTop + 1.5, 5.2).fill({ color: 0x000000, alpha: 0.07 });
  if (sitting) {
    // Fabric gathering where the torso meets the seat.
    g.roundRect(-6.4, hipY - 3.6, 12.8, 3.4, 1.7).fill({ color: 0x000000, alpha: 0.09 });
  }
  // Cloth gathers where the shirt ends: two creases, uneven, because a hem
  // never folds symmetrically and a torso with no fold in it is a painted slab.
  g.moveTo(-4.8, hipY - 3.4);
  g.quadraticCurveTo(-2.4, hipY - 1.7, -0.7, hipY - 2.6);
  g.moveTo(2.1, hipY - 2.7);
  g.quadraticCurveTo(3.5, hipY - 1.5, 4.9, hipY - 2.2);
  g.stroke({ color: darken(outfit, 0.3), width: 0.6, alpha: 0.38, cap: 'round' });

  // ── Neck ──────────────────────────────────────────────────────────────────
  g.rect(-2.3, neckY, 4.6, 4).fill(darken(skin, 0.12));
  // The jaw throws a shadow straight down the throat. It is two pixels and it
  // is the difference between a head resting on a body and a head glued to one.
  g.ellipse(0, neckY + 0.5, 2.5, 1.4).fill({ color: 0x000000, alpha: 0.22 });

  // ── Collar ────────────────────────────────────────────────────────────────
  // A lighter V, then two points folded back over it. The fold is the trick:
  // one shape is a painted stripe, two overlapping shapes is a garment.
  const collarY = torsoTop + 0.5;
  g.moveTo(-3.9, collarY);
  g.lineTo(0, collarY + 5.4);
  g.lineTo(3.9, collarY);
  g.closePath();
  g.fill({ color: lighten(outfit, 0.34), alpha: 0.92 });
  g.moveTo(-4.5, collarY - 0.3);
  g.lineTo(-0.5, collarY + 4.6);
  g.lineTo(-2.5, collarY + 0.9);
  g.closePath();
  g.fill(darken(outfit, 0.14));
  g.moveTo(4.5, collarY - 0.3);
  g.lineTo(0.5, collarY + 4.6);
  g.lineTo(2.5, collarY + 0.9);
  g.closePath();
  g.fill(lighten(outfit, 0.16));
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

  const hairLit = lighten(hair, 0.3);
  const hairDark = darken(hair, 0.3);

  g.clear();

  // ── Hair behind the head (long styles, afro, bun, ponytail) ───────────────
  const style = Math.abs(seed.hair) % 8;
  // Which styles swallow the ears. An ear is a unit and a half wide at this
  // scale, so one drawn under a bob is a smudge on the hairline, not an ear.
  const earsShow = style !== 1 && style !== 2 && style !== 6;
  if (style === 2) {
    // Long: a curtain that widens as it falls and does not end square. Hair cut
    // off on a straight horizontal line reads as a cape every single time.
    g.moveTo(-r - 1.2, headY - 1);
    g.lineTo(r + 1.2, headY - 1);
    g.quadraticCurveTo(r + 3, headY + 11, r + 1.4, headY + 18);
    g.quadraticCurveTo(0, headY + 20.5, -r - 1.4, headY + 18);
    g.quadraticCurveTo(-r - 3, headY + 11, -r - 1.2, headY - 1);
    g.closePath();
    g.fill(hair);
    // One strand down the lit side, so the curtain has a direction of fall.
    g.moveTo(r * 0.5, headY + 4);
    g.quadraticCurveTo(r + 1.2, headY + 11, r * 0.8, headY + 17);
    g.stroke({ color: hairLit, width: 1, alpha: 0.32, cap: 'round' });
  } else if (style === 4) {
    // A bun sits *back* on the crown, not on top of it, and it has a band.
    g.circle(-r * 0.74, headY - r * 0.92, 3.6).fill(hair);
    g.ellipse(-r * 0.6, headY - r * 1.14, 1.9, 0.95).fill({ color: hairLit, alpha: 0.45 });
    g.roundRect(-r * 0.74 - 2.4, headY - r * 0.44, 4.8, 1.7, 0.85).fill(hairDark);
  } else if (style === 6) {
    // Afro: a halo assembled from overlapping lobes. A single circle is a
    // compass; nine overlapping ones are hair.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const rr = (r + 1.6) * (1 + wobble(i, seed.hair, 31, 0.08));
      g.circle(Math.cos(a) * rr * 0.62, headY - 1.2 + Math.sin(a) * rr * 0.62, 3.3).fill(hair);
    }
    g.circle(0, headY - 1.2, r + 1.9).fill(hair);
  } else if (style === 7) {
    // Ponytail, gathered high at the back with a kink in the fall. Kept inside
    // r + 4.8 so the silhouette stays within the figure's ~21-unit footprint.
    g.moveTo(-r + 0.4, headY - 2.6);
    g.quadraticCurveTo(-r - 3.8, headY + 1.8, -r - 2.2, headY + 8.6);
    g.quadraticCurveTo(-r - 1.2, headY + 11.6, -r - 3.2, headY + 12);
    g.quadraticCurveTo(-r - 4.8, headY + 6, -r - 3.2, headY - 1.4);
    g.closePath();
    g.fill(hair);
    g.moveTo(-r - 1.6, headY + 1.6);
    g.quadraticCurveTo(-r - 2.6, headY + 6.4, -r - 2.4, headY + 10.4);
    g.stroke({ color: hairLit, width: 0.8, alpha: 0.3, cap: 'round' });
  }

  // ── Head ──────────────────────────────────────────────────────────────────
  g.circle(0, headY, r).fill(skin);
  // A jaw is narrower than a cranium. One unit of taper below the circle is the
  // whole difference between a person and a ball with a face drawn on it.
  g.ellipse(0, headY + r * 0.52, r * 0.86, r * 0.62).fill(skin);
  // The shaded side of the face, matching the torso's dark side.
  g.moveTo(-r, headY - 0.8);
  g.quadraticCurveTo(-r * 0.44, headY + r * 0.2, -r * 0.5, headY + r * 1.02);
  g.quadraticCurveTo(-r * 0.92, headY + r * 0.5, -r, headY - 0.8);
  g.closePath();
  g.fill({ color: 0x000000, alpha: 0.07 });
  if (earsShow) {
    // Ears, cupped — a flat one is a bean stuck to the side of the head.
    g.ellipse(-r + 0.2, headY + 1.2, 1.6, 2.2).fill(darken(skin, 0.05));
    g.ellipse(r - 0.2, headY + 1.2, 1.6, 2.2).fill(darken(skin, 0.05));
    g.ellipse(-r + 0.35, headY + 1.4, 0.65, 1.15).fill({ color: 0x000000, alpha: 0.13 });
    g.ellipse(r - 0.35, headY + 1.4, 0.65, 1.15).fill({ color: 0x000000, alpha: 0.13 });
  }

  // ── Hair cap: a slightly larger blob, then the face is punched back in ─────
  const capR = style === 5 ? r + 0.25 : style === 3 ? r + 1.4 : r + 0.9;
  g.circle(0, headY - 1.3, capR).fill(hair);
  if (style === 3) {
    // Curls: bumps of varying size around the crown, x-squashed so seven of
    // them still fit inside the figure's footprint.
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.94 + (i / 6) * 1.12);
      const rr = 1.9 + hash01(i, seed.hair, 33) * 1.1;
      g.circle(Math.cos(a) * (r - 0.2), headY - 1.5 + Math.sin(a) * (r + 0.6), rr).fill(hair);
    }
  }
  const faceDrop = style === 5 ? 1.1 : style === 1 ? 2.1 : 1.6;
  const faceW = r * (style === 5 ? 0.95 : style === 1 ? 0.85 : 0.88);
  g.ellipse(0, headY + faceDrop, faceW, r * 0.84).fill(skin);

  // ── Style-specific front hair, drawn over the punched-back face ───────────
  if (style === 0) {
    // A side part: the fringe sweeps across the brow and thins to a point. The
    // parting is what makes the two halves different shapes, which is all a
    // silhouette this small has to work with.
    g.moveTo(-r - 0.4, headY - 2.6);
    g.quadraticCurveTo(-1.2, headY - r - 0.4, r * 0.88, headY - 1.4);
    g.quadraticCurveTo(0.6, headY - 2.4, -r - 0.2, headY + 0.4);
    g.closePath();
    g.fill(hair);
    // Sideburn on the shaded side.
    g.roundRect(-r - 0.3, headY - 2, 1.8, 5, 0.85).fill(hair);
  } else if (style === 1) {
    // Bob: two panels cut level with the jaw, plus the blunt fringe that is the
    // entire reason anyone gets one. The fringe is a shade lower on one side.
    g.roundRect(-r - 1.1, headY - 3.2, 3.2, 11.4, 1.6).fill(hair);
    g.roundRect(r - 2.1, headY - 3.2, 3.2, 11.4, 1.6).fill(hair);
    g.moveTo(-r * 0.98, headY - 5);
    g.lineTo(r * 0.98, headY - 5);
    g.lineTo(r * 0.9, headY - 1.8);
    g.quadraticCurveTo(0, headY - 1, -r * 0.9, headY - 2.4);
    g.closePath();
    g.fill(hair);
  } else if (style === 2) {
    // Centre part, with a strand escaping down each side of the face.
    g.moveTo(-r - 1.1, headY - 3.4);
    g.quadraticCurveTo(-r - 1.6, headY + 3, -r + 0.4, headY + 7.6);
    g.lineTo(-r + 2.6, headY + 7);
    g.quadraticCurveTo(-r + 1.4, headY + 1.4, -r + 2.2, headY - 3.4);
    g.closePath();
    g.fill(hair);
    g.moveTo(r + 1.1, headY - 3.4);
    g.quadraticCurveTo(r + 1.6, headY + 3, r - 0.4, headY + 7.6);
    g.lineTo(r - 2.6, headY + 7);
    g.quadraticCurveTo(r - 1.4, headY + 1.4, r - 2.2, headY - 3.4);
    g.closePath();
    g.fill(hair);
    g.moveTo(0.2, headY - capR + 0.8);
    g.lineTo(-0.8, headY - 3.8);
    g.stroke({ color: hairDark, width: 0.6, alpha: 0.45, cap: 'round' });
  } else if (style === 4) {
    // Hair pulled back: the sweep lines toward the bun are what say "pulled".
    // Without them a bun is a ball glued to a cap.
    for (let i = 0; i < 3; i++) {
      const y0 = headY - 4.2 + i * 1.9;
      g.moveTo(r * 0.72, y0);
      g.quadraticCurveTo(0, y0 - 1.5, -r * 0.8, y0 - 2.5);
    }
    g.stroke({ color: hairDark, width: 0.55, alpha: 0.38, cap: 'round' });
    // One wisp that got away, because nobody's does up perfectly.
    g.moveTo(r * 0.7, headY - 3.4);
    g.quadraticCurveTo(r + 1.5, headY - 1.2, r * 0.84, headY + 1.6);
    g.stroke({ color: hair, width: 0.9, alpha: 0.85, cap: 'round' });
  } else if (style === 5) {
    // Cropped: with no fringe the hairline *is* the silhouette, so it gets two
    // temple notches and a pair of sideburns and nothing else.
    g.ellipse(-r * 0.66, headY - 5, 1.6, 1.3).fill(skin);
    g.ellipse(r * 0.66, headY - 5, 1.6, 1.3).fill(skin);
    g.roundRect(-r - 0.2, headY - 2.4, 1.6, 4.6, 0.7).fill(hair);
    g.roundRect(r - 1.4, headY - 2.4, 1.6, 4.6, 0.7).fill(hair);
  } else if (style === 7) {
    // The band, last, so it sits over both the cap and the tail behind it.
    g.roundRect(-r - 1.5, headY - 1.5, 3.3, 2.3, 1).fill(hairDark);
  }

  // A band of lamplight across the crown. Hair is the shiniest thing on a
  // person, so this is the one highlight that gets to be a shape rather than a
  // whisper — and it sits on the lit (+x) side like everything else.
  const crownR = style === 6 ? r + 1.9 : capR;
  g.moveTo(-r * 0.38, headY - crownR * 0.84);
  g.quadraticCurveTo(r * 0.36, headY - crownR * 1.02, r * 0.8, headY - crownR * 0.56);
  g.quadraticCurveTo(r * 0.3, headY - crownR * 0.8, -r * 0.3, headY - crownR * 0.64);
  g.closePath();
  g.fill({ color: hairLit, alpha: 0.42 });

  // ── Face ──────────────────────────────────────────────────────────────────
  const eyeY = headY + 0.9;
  // Brows: two short strokes, one a hair higher than the other. They cost
  // almost nothing and they are what keeps the face off the shelf at the toy
  // shop. A fringe covers them, which is correct.
  g.moveTo(-4.2, eyeY - 2.9);
  g.quadraticCurveTo(-2.7, eyeY - 3.7, -1.4, eyeY - 2.9);
  g.moveTo(1.4, eyeY - 3.1);
  g.quadraticCurveTo(2.7, eyeY - 3.9, 4.2, eyeY - 3.1);
  g.stroke({ color: mix(hair, 0x2b2119, 0.4), width: 0.85, alpha: 0.55, cap: 'round' });
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
  // The suggestion of a nose: one soft mark on the shaded side of it, no
  // outline. Any more than this on a face 14 units across and the nose becomes
  // the only thing anybody sees.
  g.ellipse(0.5, eyeY + 1.5, 0.75, 0.55).fill({ color: darken(skin, 0.24), alpha: 0.4 });
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
    // Lenses first — a whisper of fill so the glass catches the room — then the
    // rims, then a diagonal glint that lands on both at the same angle.
    g.circle(-2.7, eyeY, 2.4).fill({ color: 0xdfe9ea, alpha: 0.16 });
    g.circle(2.7, eyeY, 2.4).fill({ color: 0xdfe9ea, alpha: 0.16 });
    g.circle(-2.7, eyeY, 2.4);
    g.circle(2.7, eyeY, 2.4);
    g.moveTo(-0.3, eyeY);
    g.lineTo(0.3, eyeY);
    // The arm, running back to the ear over the temple.
    g.moveTo(5.1, eyeY - 0.4);
    g.lineTo(6.6, eyeY - 0.9);
    g.stroke({ color: PAL.inkSoft, width: 0.8, alpha: 0.85 });
    g.moveTo(-3.7, eyeY + 0.8);
    g.lineTo(-1.9, eyeY - 1.2);
    g.moveTo(1.7, eyeY + 0.8);
    g.lineTo(3.5, eyeY - 1.2);
    g.stroke({ color: 0xffffff, width: 0.6, alpha: 0.4, cap: 'round' });
  }
}

/**
 * A shoe. `x` is the back of the heel and `y` the floor line it stands on; the
 * shoe runs `dir` from there and is `len` long.
 *
 * A leg that ends in a rounded rectangle ends in nothing. What makes these
 * three shapes read as leather at 6 units long is the order: a dark sole
 * proud of the toe, an upper that tapers, and a lit strip along the top — the
 * same lit-top / shadowed-side rule every prop in this file obeys.
 */
function drawShoe(g: Graphics, x: number, y: number, dir: 1 | -1, tone: number, len = 6.6): void {
  const upper = darken(tone, 0.34);
  const sole = darken(tone, 0.52);
  g.moveTo(x, y - 3.3);
  g.lineTo(x + dir * (len - 2.3), y - 3.3);
  g.quadraticCurveTo(x + dir * len, y - 3, x + dir * len, y - 1.5);
  g.lineTo(x + dir * len, y - 1);
  g.lineTo(x, y - 1);
  g.closePath();
  g.fill(upper);
  // The sole, a touch longer than the upper so the toe reads as welted.
  const sx = dir === 1 ? x - 0.2 : x + 0.2 - (len + 0.4);
  g.roundRect(sx, y - 1.3, len + 0.4, 1.3, 0.55).fill(sole);
  // The lit top edge, stopping short of the toe where the leather turns down.
  g.moveTo(x + dir * 0.7, y - 2.95);
  g.lineTo(x + dir * (len - 1.7), y - 2.95);
  g.stroke({ color: 0xffffff, alpha: 0.2, width: 0.9, cap: 'round' });
}

/** A single leg, hinged at the hip (local origin). */
function drawLeg(g: Graphics, seed: PortraitSeed): void {
  const trouser = darken(outfitOf(seed), 0.34);
  g.clear();
  g.roundRect(-2.3, 0, 4.6, 16, 2.3).fill(trouser);
  // A trouser leg is a cylinder: light down the front, shadow down the back.
  g.roundRect(0.3, 1.4, 1.4, 12.4, 0.7).fill({ color: 0xffffff, alpha: 0.1 });
  g.roundRect(-2.3, 1.4, 1.3, 13, 0.65).fill({ color: 0x000000, alpha: 0.08 });
  // The break where the hem catches on the shoe.
  g.roundRect(-2.5, 11.4, 5, 2.4, 1.2).fill(darken(trouser, 0.15));
  drawShoe(g, -2.7, 16.6, 1, trouser);
}

/** A single arm, hinged at the shoulder (local origin). */
function drawArm(g: Graphics, seed: PortraitSeed): void {
  const outfit = outfitOf(seed);
  const skin = skinOf(seed);
  g.clear();
  g.roundRect(-1.7, -1.4, 3.4, 13, 1.7).fill(darken(outfit, 0.1));
  g.roundRect(-1.7, -1.2, 1.2, 12, 0.6).fill({ color: 0x000000, alpha: 0.08 });
  g.roundRect(0.5, -1, 1.1, 10, 0.55).fill({ color: 0xffffff, alpha: 0.11 });
  // The elbow gets exactly one stroke, because the whole arm is 13 units long.
  g.moveTo(-1.5, 5.4);
  g.quadraticCurveTo(0, 6.4, 1.5, 5.2);
  g.stroke({ color: darken(outfit, 0.34), width: 0.55, alpha: 0.42, cap: 'round' });
  // Cuff, then a hand: a mitten with a thumb forward, which at four units
  // across reads as a hand where a bare circle reads as a ball on a stick.
  g.roundRect(-1.9, 9.8, 3.8, 1.7, 0.85).fill(darken(outfit, 0.24));
  g.ellipse(-0.1, 12.5, 1.85, 2.2).fill(skin);
  g.circle(1.4, 11.9, 0.95).fill(darken(skin, 0.06));
  g.ellipse(0.4, 11.7, 1, 0.85).fill({ color: 0xffffff, alpha: 0.13 });
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
  // The far arm, drawn first and darker so it sits behind the seat. Occlusion
  // is the whole depth budget in this style, so the chair gets both its arms.
  g.roundRect(dir * 8.4 - 2.6, -25, 5.2, 9, 2.4).fill(darken(fabric, 0.3));
  g.roundRect(-13, -16, 26, 16, 4).fill(fabric);
  // The seat dips: darker in the well, so the cushion has somewhere to give.
  g.ellipse(dir * 1.5, -13.4, 9.5, 3.2).fill({ color: 0x000000, alpha: 0.13 });
  g.roundRect(backX, -35, 6.5, 24, 3).fill(darken(fabric, 0.18));
  // Upholstery catches the light along its top edge.
  g.roundRect(backX + 0.5, -34.6, 5.5, 2, 1).fill({ color: 0xffffff, alpha: 0.2 });
  // The back rolls over at the top instead of ending in a flat lid…
  g.ellipse(backX + 3.25, -34.5, 3.4, 1.5).fill(darken(fabric, 0.08));
  // …and throws a shadow down onto the seat behind wherever the sitter is.
  g.roundRect(backX + (dir === 1 ? 6.5 : -4.5), -19.5, 4.5, 5, 2).fill({ color: 0x000000, alpha: 0.1 });
  // Seat cushion, with piping along its front edge — the seam is what separates
  // a cushion from a lighter rectangle painted on the chair.
  g.roundRect(-10, -19, 20, 5, 2.4).fill(lighten(fabric, 0.16));
  g.roundRect(-9.4, -18.6, 18.8, 1.8, 0.9).fill({ color: 0xffffff, alpha: 0.22 });
  g.roundRect(-9.6, -14.9, 19.2, 0.9, 0.45).fill({ color: darken(fabric, 0.3), alpha: 0.5 });
  // Near arm, rolled and worn pale on top where a thousand hands have rested.
  g.roundRect(dir * 9 - 2.6, -23, 5.2, 8, 2.4).fill(darken(fabric, 0.08));
  g.ellipse(dir * 9, -22.3, 2.6, 1.4).fill(lighten(fabric, 0.22));
  g.roundRect(dir * 9 - 2.2, -22.6, 4.4, 1.6, 0.8).fill({ color: 0xffffff, alpha: 0.18 });
  // One wrinkle where the seat is pulled into the back.
  g.moveTo(backX + (dir === 1 ? 6.2 : 0.3), -17.6);
  g.quadraticCurveTo(backX + dir * 3 + (dir === 1 ? 6.2 : 0.3), -16.7, backX + dir * 6 + (dir === 1 ? 6.2 : 0.3), -17.3);
  g.stroke({ color: darken(fabric, 0.32), width: 0.6, alpha: 0.35, cap: 'round' });
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
  // The two back posts, the far one darker: the gap between them is what makes
  // a chair back read as a frame you could see the wall through.
  g.roundRect(backX + dir * 1.6, -25.5, 2.4, 14, 1.2).fill(darken(PAL.woodDeep, 0.28));
  g.roundRect(backX, -27, 2.8, 16, 1.4).fill(PAL.woodDeep);
  g.rect(backX, -27, 0.9, 16).fill({ color: PAL.wood, alpha: 0.55 });
  // Top rail and a lower splat, both slightly bowed the way steamed wood is.
  g.roundRect(backX - 0.6, -26.5, 4, 2.6, 1.2).fill(PAL.woodDeep);
  g.roundRect(backX - 0.4, -26.3, 3.6, 0.9, 0.45).fill({ color: PAL.wood, alpha: 0.6 });
  g.roundRect(backX - 0.2, -20.5, 3.2, 2, 1).fill(darken(PAL.woodDeep, 0.12));
  g.roundRect(-9, -12.6, 18, 3.2, 1.5).fill(PAL.wood);
  g.rect(-9, -12.6, 18, 0.9).fill({ color: 0xffffff, alpha: 0.24 });
  g.roundRect(-8, -14.4, 16, 3, 1.4).fill(fabric);
  g.roundRect(-7.4, -14.2, 14.8, 1.1, 0.55).fill({ color: 0xffffff, alpha: 0.3 });
  // The pad is tied on, and the ties are the reason it never quite matches.
  g.rect(-6.2, -14.4, 0.7, 3).fill({ color: darken(fabric, 0.3), alpha: 0.5 });
  g.rect(5.2, -14.4, 0.7, 3).fill({ color: darken(fabric, 0.3), alpha: 0.5 });
  g.ellipse(dir * 1, -12.4, 5.4, 1.3).fill({ color: PAL.ink, alpha: 0.1 });
  g.roundRect(-8, -9.6, 2.4, 9.6, 1.1).fill(PAL.woodDeep);
  g.roundRect(5.6, -9.6, 2.4, 9.6, 1.1).fill(PAL.woodDeep);
  g.rect(-8, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.45 });
  g.rect(5.6, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.45 });
  // A stretcher between the legs. Chairs have one; the eye misses it without
  // ever being able to say what was wrong.
  g.roundRect(-7.2, -4.6, 13.6, 1.4, 0.7).fill(darken(PAL.woodDeep, 0.14));
  g.rect(-7.2, -4.6, 13.6, 0.5).fill({ color: PAL.wood, alpha: 0.4 });
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
  // A row of woven diamonds down the middle. A plain ring of colour reads as a
  // vector ellipse; a motif that repeats reads as something somebody made.
  for (let i = -3; i <= 3; i++) {
    const dx = (i * (w - 30)) / 7;
    g.moveTo(dx, cy - 1.3);
    g.lineTo(dx + 2.4, cy);
    g.lineTo(dx, cy + 1.3);
    g.lineTo(dx - 2.4, cy);
    g.closePath();
  }
  g.fill({ color: lighten(color, 0.3), alpha: 0.4 });
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
  // A weighted base is two discs, not one — the step is what gives it mass.
  g.ellipse(0, -1, 7.5, 2.6).fill(PAL.woodDeep);
  g.ellipse(0, -2.7, 5.1, 1.9).fill(darken(PAL.woodDeep, 0.14));
  g.ellipse(-1, -1.8, 4, 1.1).fill({ color: PAL.wood, alpha: 0.5 });
  g.rect(-1.1, -h, 2.2, h).fill(PAL.inkSoft);
  g.rect(-1.1, -h, 0.8, h).fill({ color: 0xffffff, alpha: 0.16 });
  // A brass collar where the two halves of the stem screw together. One inch of
  // a second material is what stops a pole reading as a drawn line.
  g.roundRect(-1.7, -h * 0.52, 3.4, 2.4, 0.8).fill(PAL.amberDeep);
  g.rect(-1.6, -h * 0.52, 1.1, 2.4).fill({ color: PAL.amberGlow, alpha: 0.55 });
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
  // The seam where the cloth is joined, and the bulb glowing through it.
  g.moveTo(-2.6, -h + 0.6);
  g.lineTo(-3.7, -h + 11.6);
  g.stroke({ color: PAL.amberDeep, width: 0.6, alpha: 0.28 });
  g.ellipse(-0.6, -h + 7, 3.4, 4).fill({ color: 0xfff3d8, alpha: 0.3 });
  g.moveTo(-9, -h + 12);
  g.lineTo(9, -h + 12);
  g.lineTo(8, -h + 13.4);
  g.lineTo(-8, -h + 13.4);
  g.closePath();
  g.fill({ color: PAL.amber, alpha: 0.9 });
  // You can see up into the shade from below, and what is up there is the bulb.
  g.ellipse(0, -h + 12.4, 7.6, 1.6).fill({ color: PAL.amberGlow, alpha: 0.85 });
  g.ellipse(0, -h + 12.2, 5.4, 1).fill({ color: 0xfff6e2, alpha: 0.9 });
  // Finial.
  g.circle(0, -h - 1.4, 1.2).fill(PAL.amberDeep);
  g.circle(-0.4, -h - 1.8, 0.5).fill({ color: 0xffffff, alpha: 0.4 });
}

export const lampHeadY = (h: number): number => -h + 9;

/** A table lamp for the reception desk. */
export function drawDeskLamp(g: Graphics): void {
  // Base first, so the stem grows out of it instead of sitting on top of it.
  g.ellipse(0, -0.5, 4.6, 1.7).fill(PAL.inkSoft);
  g.ellipse(-0.9, -1.1, 2.5, 0.8).fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(-0.9, -14, 1.8, 13.6).fill(PAL.inkSoft);
  g.rect(-0.9, -14, 0.6, 13.6).fill({ color: 0xffffff, alpha: 0.18 });
  // The knuckle the shade tips on.
  g.circle(0, -13.2, 1.5).fill(darken(PAL.inkSoft, 0.28));
  g.moveTo(-4.5, -20);
  g.lineTo(4.5, -20);
  g.lineTo(6, -13);
  g.lineTo(-6, -13);
  g.closePath();
  g.fill(PAL.amberGlow);
  // Far side of the cloth in its own shadow, same rule as the floor lamp.
  g.moveTo(2.2, -20);
  g.lineTo(4.5, -20);
  g.lineTo(6, -13);
  g.lineTo(3.1, -13);
  g.closePath();
  g.fill({ color: PAL.amberDeep, alpha: 0.22 });
  // The bright mouth of the shade — the reason to have drawn it at all.
  g.roundRect(-6, -13.6, 12, 1.8, 0.9).fill({ color: PAL.amber, alpha: 0.92 });
  g.ellipse(0, -13, 4.2, 1).fill({ color: 0xfff6e2, alpha: 0.8 });
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
  // Frame + mullions, in wood so the glass reads as glass. The mullions get a
  // lit edge of their own: they stand proud of the pane, they are not printed on.
  g.rect(x - 3.5, y - 3.5, w + 7, h + 7).stroke({ color: PAL.woodDeep, width: 3.5 });
  g.rect(x + w / 2 - 1.4, y, 2.8, h).fill(PAL.woodDeep);
  g.rect(x, y + h * 0.42 - 1.4, w, 2.8).fill(PAL.woodDeep);
  g.rect(x + w / 2 - 1.4, y, 0.9, h).fill({ color: PAL.wood, alpha: 0.5 });
  g.rect(x, y + h * 0.42 - 1.4, w, 0.9).fill({ color: PAL.wood, alpha: 0.5 });
  if (plain) return;
  // Sill, with the light on its top edge and its own shadow underneath.
  g.roundRect(x - 8, y + h + 2, w + 16, 4, 1.6).fill(PAL.paperDeep);
  g.roundRect(x - 8, y + h + 2, w + 16, 1.2, 0.6).fill({ color: 0xffffff, alpha: 0.4 });
  g.rect(x - 6, y + h + 6, w + 12, 1.4).fill({ color: PAL.ink, alpha: 0.16 });
  // Curtains, gathered at both jambs. One is drawn back further than the other,
  // because a pair of curtains has never once hung symmetrically.
  const cloth = mix(PAL.brickSoft, PAL.paperWarm, 0.45);
  g.moveTo(x - 5, y - 5);
  g.quadraticCurveTo(x + w * 0.18, y + h * 0.4, x - 3, y + h + 1);
  g.lineTo(x - 12, y + h + 1);
  g.lineTo(x - 12, y - 5);
  g.closePath();
  g.fill({ color: cloth, alpha: 0.92 });
  g.moveTo(x + w + 4, y - 5);
  g.quadraticCurveTo(x + w * 0.87, y + h * 0.34, x + w + 2.6, y + h + 1);
  g.lineTo(x + w + 12, y + h + 1);
  g.lineTo(x + w + 12, y - 5);
  g.closePath();
  g.fill({ color: darken(cloth, 0.1), alpha: 0.92 });
  // Two folds in each, the hanging kind: long, nearly vertical, uneven spacing.
  g.moveTo(x - 8.6, y - 3);
  g.quadraticCurveTo(x - 6.4, y + h * 0.5, x - 7.8, y + h);
  g.moveTo(x + w + 8.6, y - 3);
  g.quadraticCurveTo(x + w + 6.2, y + h * 0.5, x + w + 7.6, y + h);
  g.stroke({ color: darken(cloth, 0.28), width: 0.7, alpha: 0.45, cap: 'round' });
  // Pelmet, lit along the top like everything else in this building.
  g.roundRect(x - 14, y - 8, w + 28, 5, 2).fill(PAL.woodDeep);
  g.roundRect(x - 14, y - 8, w + 28, 1.3, 0.65).fill({ color: PAL.wood, alpha: 0.6 });
  // A small pot on the sill, on the shaded side so it sits into the corner.
  const px = x + w - 7;
  g.moveTo(px - 2.6, y + h + 2);
  g.lineTo(px + 2.6, y + h + 2);
  g.lineTo(px + 2, y + h - 2.4);
  g.lineTo(px - 2, y + h - 2.4);
  g.closePath();
  g.fill(PAL.brick);
  g.rect(px - 2, y + h - 2.4, 1.4, 4.4).fill({ color: 0xffffff, alpha: 0.16 });
  g.ellipse(px - 2.2, y + h - 4.6, 2.4, 1.3).fill(PAL.sage);
  g.ellipse(px + 1.8, y + h - 4.2, 2, 1.1).fill(PAL.sageDeep);
  g.ellipse(px - 0.2, y + h - 6, 1.6, 1.5).fill(lighten(PAL.sage, 0.12));
}

/** A small wall clock — a cheap, legible bit of "this is an office". */
export function drawWallClock(g: Graphics, x: number, y: number, r = 8): void {
  // Nobody ever hangs a clock quite level.
  const tilt = wobble(x, y, 5, 1.6 * DEG);
  g.rotateTransform(tilt);
  g.translateTransform(x, y);
  g.ellipse(1.6, 2.4, r * 0.98, r * 0.98).fill({ color: PAL.ink, alpha: 0.12 });
  g.circle(0, 0, r).fill(PAL.woodDeep);
  g.circle(0, 0, r * 0.85).fill(PAL.paper);
  // The bezel throws a shadow down onto the dial, which is the only reason a
  // clock face ever looks recessed instead of printed on.
  g.ellipse(0, -r * 0.24, r * 0.85, r * 0.62).fill({ color: 0x000000, alpha: 0.07 });
  // Twelve ticks, every third one long. Nobody reads the time off an eight-unit
  // dial; what they read is "clock", and the ticks carry most of that.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = r * (i % 3 === 0 ? 0.56 : 0.67);
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r * 0.76, Math.sin(a) * r * 0.76);
  }
  g.stroke({ color: PAL.inkFaint, width: 0.7, alpha: 0.75, cap: 'round' });
  g.moveTo(0, 0);
  g.lineTo(0, -r * 0.5);
  g.moveTo(0, 0);
  g.lineTo(r * 0.5, r * 0.18);
  g.stroke({ color: PAL.inkSoft, width: 1.3, cap: 'round' });
  // A thin red second hand and the pin that holds all three on.
  g.moveTo(0, 0);
  g.lineTo(-r * 0.32, r * 0.52);
  g.stroke({ color: PAL.brick, width: 0.6, cap: 'round' });
  g.circle(0, 0, 0.85).fill(PAL.inkSoft);
  // Glass last: the reflection sits in front of the hands, not behind them.
  g.ellipse(-r * 0.28, -r * 0.32, r * 0.5, r * 0.32).fill({ color: 0xffffff, alpha: 0.28 });
  g.circle(0, 0, r).stroke({ color: PAL.woodDeep, width: 2 });
  // `arc` continues the current path rather than starting one, and a path that
  // has just been stroked has its cursor back at the origin — so without this
  // moveTo the bezel highlight drags a hairline across the whole building from
  // the top-left corner of the design box. Any `arc` that opens a subpath needs
  // its own moveTo to the arc's first point.
  const a0 = Math.PI * 1.1;
  const a1 = Math.PI * 1.75;
  g.moveTo(Math.cos(a0) * (r - 0.4), Math.sin(a0) * (r - 0.4));
  g.arc(0, 0, r - 0.4, a0, a1).stroke({ color: PAL.wood, width: 1, alpha: 0.55 });
  g.translateTransform(-x, -y);
  g.rotateTransform(-tilt);
}

/** A water cooler for the waiting room. */
export function drawWaterCooler(g: Graphics): void {
  drawContactShadow(g, 8.5, 2.4);
  g.roundRect(-7, -26, 14, 26, 2.5).fill(PAL.paperDeep);
  g.roundRect(-7, -26, 4, 26, 2.5).fill({ color: 0xffffff, alpha: 0.3 });
  g.rect(4.8, -26, 2.2, 26).fill({ color: 0x000000, alpha: 0.1 });
  g.roundRect(-8, -44, 16, 19, 5).fill({ color: 0x9fd0dc, alpha: 0.85 });
  g.roundRect(-8, -36, 16, 11, 3).fill({ color: 0x74b3c4, alpha: 0.9 });
  // The waterline. Without it the bottle is a blue lozenge; with it there is
  // water in the room, and the level is the only thing anyone ever looks at.
  g.ellipse(0, -36, 7.4, 1.5).fill({ color: 0xd8f0f6, alpha: 0.55 });
  g.roundRect(-6.4, -42.5, 3, 15, 1.5).fill({ color: 0xffffff, alpha: 0.35 });
  // Three bubbles on their way up, biggest nearest the top.
  g.circle(3.4, -33.6, 1.05).fill({ color: 0xffffff, alpha: 0.42 });
  g.circle(2.4, -30.4, 0.7).fill({ color: 0xffffff, alpha: 0.34 });
  g.circle(3.6, -28.2, 0.5).fill({ color: 0xffffff, alpha: 0.28 });
  // The collar the bottle sits into.
  g.roundRect(-8.2, -26.6, 16.4, 2.4, 1).fill(darken(PAL.paperDeep, 0.18));
  g.rect(-8.2, -26.6, 16.4, 0.8).fill({ color: 0xffffff, alpha: 0.25 });
  // Two taps, cold and hot, set high enough that a cup fits under them — which
  // is the constraint the whole front of a water cooler is designed around.
  g.roundRect(-3.6, -23.2, 3.1, 3.2, 1).fill(PAL.inkSoft);
  g.roundRect(0.5, -23.2, 3.1, 3.2, 1).fill(PAL.inkSoft);
  g.rect(-3.6, -23.2, 3.1, 1).fill({ color: 0x74b3c4, alpha: 0.95 });
  g.rect(0.5, -23.2, 3.1, 1).fill({ color: PAL.brick, alpha: 0.8 });
  g.roundRect(-4.8, -16.4, 9.6, 2.1, 0.8).fill(darken(PAL.paperDeep, 0.32));
  for (let i = 0; i < 4; i++) {
    g.rect(-3.9 + i * 2.3, -16, 0.7, 1.3).fill({ color: PAL.ink, alpha: 0.32 });
  }
  // One paper cup somebody filled and put down, which is the whole story of a
  // waiting room in a single shape.
  g.moveTo(0.6, -16.4);
  g.lineTo(3.6, -16.4);
  g.lineTo(3.1, -19.6);
  g.lineTo(1.1, -19.6);
  g.closePath();
  g.fill({ color: PAL.paper, alpha: 0.95 });
  g.rect(1.1, -19.6, 2, 0.7).fill({ color: 0x9fd0dc, alpha: 0.6 });
}

/** The front door, standing on the floor line at the origin. */
export function drawFrontDoor(g: Graphics, w: number, h: number): void {
  g.roundRect(-w / 2 - 3, -h - 4, w + 6, h + 4, 4).fill(PAL.woodDeep);
  g.rect(-w / 2 - 3, -h - 4, w + 6, 1.4).fill({ color: PAL.wood, alpha: 0.6 });
  g.roundRect(-w / 2, -h, w, h, 3).fill(PAL.brick);
  g.rect(-w / 2, -h, w, 1.4).fill({ color: 0xffffff, alpha: 0.18 });
  g.rect(w / 2 - 2, -h, 2, h).fill({ color: 0x000000, alpha: 0.15 });
  // A glazed light at the top, warm from inside. It is the first thing a client
  // sees from the street and the cheapest possible way to say "come in".
  const gy = -h + 5;
  const gh = h * 0.19;
  g.roundRect(-w / 2 + 4, gy, w - 8, gh, 1.6).fill({ color: PAL.amberGlow, alpha: 0.88 });
  g.rect(-0.9, gy, 1.8, gh).fill(darken(PAL.brick, 0.22));
  // The diagonal a pane of glass always has across it.
  g.moveTo(-w / 2 + 4, gy + gh);
  g.lineTo(-w / 2 + 4 + (w - 8) * 0.46, gy);
  g.lineTo(-w / 2 + 4 + (w - 8) * 0.68, gy);
  g.lineTo(-w / 2 + 4 + (w - 8) * 0.2, gy + gh);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.22 });
  // Two recessed panels below it, top one taller, both with the light on the
  // bottom lip so they read as cut into the door rather than stuck onto it.
  const p1 = gy + gh + 5;
  const p1h = h * 0.3;
  const p2 = p1 + p1h + 5;
  const p2h = -9 - p2;
  for (const [pt, ph] of [
    [p1, p1h],
    [p2, p2h],
  ]) {
    if (ph < 4) continue;
    g.roundRect(-w / 2 + 4, pt, w - 8, ph, 2).fill({ color: 0x000000, alpha: 0.12 });
    g.rect(-w / 2 + 4, pt, w - 8, 0.9).fill({ color: 0x000000, alpha: 0.14 });
    g.rect(-w / 2 + 4, pt + ph - 0.9, w - 8, 0.9).fill({ color: 0xffffff, alpha: 0.13 });
  }
  // Letterbox, knob, and the little brass plate under it that gets polished.
  g.roundRect(-4.5, p1 + p1h * 0.5 - 1, 9, 2.2, 0.8).fill(PAL.amberDeep);
  g.rect(-4.5, p1 + p1h * 0.5 - 1, 9, 0.7).fill({ color: PAL.amberGlow, alpha: 0.6 });
  g.roundRect(w / 2 - 7.4, -h * 0.5, 4.4, 9, 1.6).fill(darken(PAL.brick, 0.3));
  g.circle(w / 2 - 5.2, -h * 0.45, 1.9).fill(PAL.amber);
  g.circle(w / 2 - 5.7, -h * 0.45 - 0.6, 0.8).fill({ color: 0xffffff, alpha: 0.5 });
  // Threshold and the mat that lives on it.
  g.roundRect(-w / 2 - 2, -2.2, w + 4, 2.4, 0.8).fill(PAL.woodDeep);
  g.rect(-w / 2 - 2, -2.2, w + 4, 0.7).fill({ color: PAL.wood, alpha: 0.55 });
  g.roundRect(-w / 2 + 3, -1.4, w - 6, 1.6, 0.6).fill(mix(PAL.woodDeep, PAL.paperDeep, 0.35));
}

/**
 * The wood panel that slides across a therapy-room doorway during a session.
 *
 * This used to be a slab with a dot on it, which at door proportions read as a
 * wardrobe. A door is: two recessed panels with the taller one at the top, a
 * handle at the height a handle is at, and — because somebody is in there with
 * a lamp on — a hairline of warm light escaping around it. Every one of those
 * stays inside the panel's own footprint, so the strip does not float in mid-air
 * once the door has slid open.
 */
export function drawDoorPanel(g: Graphics, w: number, h: number): void {
  g.roundRect(0, -h, w, h, 2.5).fill(PAL.wood);
  g.rect(0, -h, w, 1.4).fill({ color: 0xffffff, alpha: 0.2 });
  g.rect(w - 2, -h, 2, h).fill({ color: 0x000000, alpha: 0.14 });
  // Two recessed panels. A moulding reads as a groove because its top edge is
  // dark and its bottom edge is light — the reverse of the slab it is cut into.
  const inset = 5;
  const upperH = h * 0.42;
  const lowerT = -h + 7 + upperH + 5;
  const lowerH = -5 - lowerT - 7;
  for (const [pt, ph] of [
    [-h + 7, upperH],
    [lowerT, lowerH],
  ]) {
    if (ph < 4) continue;
    g.roundRect(inset, pt, w - inset * 2, ph, 1.5).fill({ color: PAL.woodDeep, alpha: 0.4 });
    g.rect(inset, pt, w - inset * 2, 0.9).fill({ color: 0x000000, alpha: 0.18 });
    g.rect(inset, pt + ph - 0.9, w - inset * 2, 0.9).fill({ color: 0xffffff, alpha: 0.14 });
  }
  // Handle: a backplate, a brass knob with a highlight, and a lever under it.
  const hy = -h * 0.44;
  g.roundRect(w - 7.5, hy - 4, 3.6, 8, 1.4).fill(darken(PAL.wood, 0.32));
  g.circle(w - 5.7, hy, 1.7).fill(PAL.amberGlow);
  g.circle(w - 6.2, hy - 0.6, 0.7).fill({ color: 0xffffff, alpha: 0.55 });
  g.roundRect(w - 6, hy + 0.7, 4.2, 1.5, 0.75).fill(PAL.amberDeep);
  // The light getting out: down the leading edge and under the bottom rail.
  g.rect(0, -h + 2, 1.5, h - 4).fill({ color: PAL.amberGlow, alpha: 0.7 });
  g.rect(1.5, -h + 2, 1.2, h - 4).fill({ color: PAL.amber, alpha: 0.22 });
  g.rect(1.2, -1.5, w - 2.4, 1.5).fill({ color: PAL.amberGlow, alpha: 0.45 });
}

/**
 * The doorway a session door slides across. The opening shows the warm hall
 * beyond rather than a black hole, so an open door still reads as inviting.
 */
export function drawDoorway(g: Graphics, x: number, floorY: number, w: number, h: number): void {
  g.roundRect(x, floorY - h, w, h, 2).fill(mix(PAL.paperWarm, PAL.woodDeep, 0.45));
  g.roundRect(x, floorY - h, w * 0.45, h, 2).fill({ color: PAL.amberGlow, alpha: 0.2 });
  // The reveal. You are looking through a wall and the wall has thickness: the
  // far jamb is in shadow, the near one catches the hall light, and the head of
  // the opening is dark because nothing above it is lit.
  g.rect(x + w - 3.2, floorY - h, 3.2, h).fill({ color: 0x000000, alpha: 0.2 });
  g.rect(x, floorY - h, 2.4, h).fill({ color: PAL.amberGlow, alpha: 0.16 });
  g.rect(x, floorY - h, w, 2.6).fill({ color: 0x000000, alpha: 0.18 });
  // Threshold strip, worn pale down the middle where everyone steps.
  g.roundRect(x - 1, floorY - 1.8, w + 2, 2, 0.7).fill(PAL.woodDeep);
  g.rect(x - 1, floorY - 1.8, w + 2, 0.6).fill({ color: PAL.wood, alpha: 0.6 });
  g.roundRect(x + w * 0.28, floorY - 1.5, w * 0.44, 0.8, 0.4).fill({ color: PAL.wood, alpha: 0.35 });
  g.roundRect(x - 3, floorY - h - 3, w + 6, h + 3, 2.5).stroke({ color: PAL.woodDeep, width: 3 });
  // Architrave, lit along the top like everything else in the building.
  g.rect(x - 4.6, floorY - h - 5.2, w + 9.2, 1.3).fill({ color: PAL.wood, alpha: 0.45 });
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
  // Balusters, before the rails so the rails cap them. A handrail floating on
  // nothing is the single clearest tell that a staircase was drawn, not built.
  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    g.rect(2 + (w - 5) * t - 0.55, -14 - half * t, 1.1, 14).fill({ color: PAL.woodDeep, alpha: 0.8 });
    const ux = w - 3 + (6 - w) * t;
    g.rect(ux - 0.55, -half - 20 - (h - half - 22) * t, 1.1, 15).fill({ color: PAL.woodDeep, alpha: 0.8 });
  }
  // Newel posts, thicker than the balusters, at the foot and the landing.
  g.roundRect(1, -17, 2.6, 17, 1).fill(PAL.woodDeep);
  g.roundRect(w - 4.4, -half - 22, 2.6, 17, 1).fill(PAL.woodDeep);
  // Banisters.
  g.moveTo(2, -14);
  g.lineTo(w - 3, -half - 14);
  g.moveTo(w - 3, -half - 20);
  g.lineTo(3, -h + 2);
  g.stroke({ color: PAL.woodDeep, width: 2.6, cap: 'round' });
  g.moveTo(2, -14.8);
  g.lineTo(w - 3, -half - 14.8);
  g.moveTo(w - 3, -half - 20.8);
  g.lineTo(3, -h + 1.2);
  g.stroke({ color: PAL.wood, width: 0.8, alpha: 0.55, cap: 'round' });
}

export function drawLowTable(g: Graphics, w: number): void {
  drawContactShadow(g, w * 0.55, 3);
  // A lower shelf, drawn before the legs so the legs cross in front of it.
  g.roundRect(-w / 2 + 3.4, -5.2, w - 6.8, 1.8, 0.8).fill(darken(PAL.wood, 0.2));
  g.rect(-w / 2 + 3.4, -5.2, w - 6.8, 0.6).fill({ color: PAL.wood, alpha: 0.5 });
  g.roundRect(-w / 2, -13, w, 3.4, 1.6).fill(PAL.wood);
  g.roundRect(-w / 2, -13, w, 1.1, 0.55).fill({ color: 0xffffff, alpha: 0.26 });
  // Two grain lines along the top. Wood without grain is a coloured plank.
  g.moveTo(-w / 2 + 3, -11.6);
  g.quadraticCurveTo(0, -12.1, w / 2 - 3, -11.5);
  g.moveTo(-w / 2 + 6, -10.6);
  g.quadraticCurveTo(2, -10.2, w / 2 - 5, -10.7);
  g.stroke({ color: PAL.woodDeep, width: 0.5, alpha: 0.3, cap: 'round' });
  g.roundRect(-w / 2, -9.9, w, 0.9, 0.45).fill({ color: PAL.woodDeep, alpha: 0.55 });
  g.roundRect(-w / 2 + 3, -9.6, 2.6, 9.6, 1.2).fill(PAL.woodDeep);
  g.roundRect(w / 2 - 5.6, -9.6, 2.6, 9.6, 1.2).fill(PAL.woodDeep);
  g.rect(-w / 2 + 3, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.5 });
  g.rect(w / 2 - 5.6, -9.6, 0.8, 9.6).fill({ color: PAL.wood, alpha: 0.5 });
  // Magazines, fanned the way a stack actually settles, and each one showing a
  // sliver of the cover under it.
  g.roundRect(-6, -16.2, 12, 1.6, 0.8).fill(PAL.brickSoft);
  g.roundRect(-4.5, -17.6, 11, 1.6, 0.8).fill(PAL.sage);
  g.roundRect(-5.5, -19, 10, 1.6, 0.8).fill(PAL.amber);
  g.roundRect(-5.5, -19, 10, 0.6, 0.3).fill({ color: 0xffffff, alpha: 0.3 });
  g.rect(-3.4, -18.6, 5.4, 0.5).fill({ color: PAL.woodDeep, alpha: 0.28 });
  // A tissue box, which is the single most therapy-room object there is.
  const bx = w / 2 - 11;
  g.roundRect(bx, -18.6, 8, 5.6, 1).fill(mix(PAL.sage, PAL.paperDeep, 0.5));
  g.rect(bx, -18.6, 8, 1.4).fill({ color: 0xffffff, alpha: 0.24 });
  g.moveTo(bx + 2.6, -18.6);
  g.quadraticCurveTo(bx + 3.4, -21.4, bx + 5.4, -19.6);
  g.quadraticCurveTo(bx + 4.6, -18.2, bx + 2.6, -18.6);
  g.closePath();
  g.fill(PAL.paper);
}

export function drawCoatRack(g: Graphics, h = 56): void {
  drawContactShadow(g, 7.5, 2.2);
  // Three splayed feet rather than a disc: the little tripod is what stops a
  // coat rack looking like a lollipop, and it is two triangles' worth of work.
  g.moveTo(-6.5, -0.4);
  g.lineTo(-1, -5);
  g.lineTo(1, -5);
  g.lineTo(6.5, -0.4);
  g.closePath();
  g.fill(PAL.woodDeep);
  g.ellipse(0, -1, 6, 2.2).fill(PAL.woodDeep);
  g.ellipse(-1.4, -1.8, 3.4, 1).fill({ color: PAL.wood, alpha: 0.5 });
  g.rect(-1.2, -h, 2.4, h).fill(PAL.woodDeep);
  g.rect(-1.2, -h, 0.9, h).fill({ color: PAL.wood, alpha: 0.5 });
  // Pegs that curl up at the end, the way a peg has to if a coat is to stay on.
  g.moveTo(-1.2, -h + 6);
  g.quadraticCurveTo(-6, -h + 10.4, -8, -h + 8.6);
  g.moveTo(1.2, -h + 6);
  g.quadraticCurveTo(6, -h + 10.4, 8, -h + 8.6);
  g.moveTo(-1.2, -h + 13);
  g.lineTo(-5.4, -h + 15.6);
  g.stroke({ color: PAL.woodDeep, width: 2, cap: 'round' });
  g.circle(0, -h - 0.6, 1.9).fill(PAL.woodDeep);
  g.circle(-0.6, -h - 1.2, 0.8).fill({ color: PAL.wood, alpha: 0.6 });
  // A hung coat: shoulder, sleeve, and a hem that hangs unevenly because a coat
  // on a peg always does. The lit shoulder is what gives the cloth volume.
  g.moveTo(-8, -h + 9);
  g.quadraticCurveTo(-13, -h + 25, -6.4, -h + 30.5);
  g.quadraticCurveTo(-2.6, -h + 22, -4, -h + 10);
  g.closePath();
  g.fill(PAL.plum);
  g.moveTo(-7.4, -h + 10);
  g.quadraticCurveTo(-10, -h + 16, -9.4, -h + 24);
  g.stroke({ color: darken(PAL.plum, 0.28), width: 0.7, alpha: 0.6, cap: 'round' });
  g.moveTo(-7.6, -h + 9.6);
  g.quadraticCurveTo(-5.6, -h + 11, -4.4, -h + 10.6);
  g.stroke({ color: 0xffffff, width: 1.2, alpha: 0.2, cap: 'round' });
  // A scarf over the other peg, hanging in two uneven tails.
  g.moveTo(6.8, -h + 9);
  g.quadraticCurveTo(5.4, -h + 18, 6.6, -h + 24);
  g.lineTo(4.6, -h + 24.4);
  g.quadraticCurveTo(3.8, -h + 17, 5.2, -h + 9.2);
  g.closePath();
  g.fill(mix(PAL.brick, PAL.paperDeep, 0.25));
  g.rect(4.7, -h + 21.4, 1.9, 0.9).fill({ color: PAL.paperDeep, alpha: 0.55 });
  g.rect(5, -h + 15.2, 1.7, 0.9).fill({ color: PAL.paperDeep, alpha: 0.45 });
}

export function drawReceptionDesk(g: Graphics, w: number): void {
  const h = 26;
  drawContactShadow(g, w * 0.56, 3.4);
  g.roundRect(-w / 2, -h, w, h, 2.5).fill(PAL.wood);
  g.roundRect(-w / 2, -h, w, 4, 2).fill(PAL.paperDeep);
  // The lit top edge of the counter — the one line that makes it read as wood.
  g.roundRect(-w / 2, -h, w, 1.2, 0.6).fill({ color: 0xffffff, alpha: 0.34 });
  g.rect(-w / 2, -h + 4, w, 1.3).fill({ color: 0x000000, alpha: 0.2 });
  // Recessed front, with the light on the bottom lip and a kick strip below —
  // the same groove convention as the doors, so the whole building agrees.
  g.roundRect(-w / 2 + 2, -h + 8, w - 4, h - 12, 2).fill({ color: PAL.woodDeep, alpha: 0.28 });
  g.rect(-w / 2 + 2, -h + 8, w - 4, 0.9).fill({ color: 0x000000, alpha: 0.16 });
  g.rect(-w / 2 + 2, -5.4, w - 4, 0.9).fill({ color: 0xffffff, alpha: 0.11 });
  g.rect(-w / 2, -2.6, w, 2.6).fill({ color: 0x000000, alpha: 0.16 });
  // Monitor, on a stand, throwing its cold little light back onto the counter.
  const mx = -w / 2 + 14;
  g.ellipse(mx, -h - 0.6, 11, 2.4).fill({ color: 0xcfe6e2, alpha: 0.13 });
  g.roundRect(mx - 4, -h - 2.4, 8, 2.4, 0.8).fill(darken(PAL.inkSoft, 0.22));
  g.rect(mx - 1.4, -h - 4.8, 2.8, 2.8).fill(darken(PAL.inkSoft, 0.1));
  g.roundRect(mx - 7, -h - 14.6, 14, 10, 1.6).fill(PAL.inkSoft);
  g.roundRect(mx - 6, -h - 13.6, 12, 8, 1.2).fill(mix(PAL.sage, PAL.paper, 0.55));
  g.moveTo(mx - 6, -h - 5.8);
  g.lineTo(mx - 1.4, -h - 13.6);
  g.lineTo(mx + 1, -h - 13.6);
  g.lineTo(mx - 3.6, -h - 5.8);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.16 });
  // Keyboard.
  g.roundRect(mx + 9, -h - 2, 13, 2, 0.8).fill(PAL.paperDeep);
  g.rect(mx + 9.7, -h - 1.7, 11.6, 0.8).fill({ color: PAL.inkFaint, alpha: 0.35 });
  // A pot of pens and the little brass bell nobody has ever needed to ring.
  g.roundRect(2, -h - 5.4, 4.4, 5.4, 0.9).fill(PAL.brick);
  g.rect(2, -h - 5.4, 1.3, 5.4).fill({ color: 0xffffff, alpha: 0.18 });
  g.rect(3, -h - 8.6, 0.8, 3.4).fill(PAL.inkSoft);
  g.rect(4.4, -h - 9.2, 0.8, 4).fill(PAL.sageDeep);
  g.roundRect(8.4, -h - 1.6, 6, 1.6, 0.7).fill(PAL.amberDeep);
  g.ellipse(11.4, -h - 2.4, 2.6, 2).fill(PAL.amber);
  g.ellipse(10.6, -h - 3.1, 0.9, 0.6).fill({ color: 0xffffff, alpha: 0.5 });
  g.circle(11.4, -h - 4.6, 0.7).fill(PAL.amberDeep);
  // A stack of files, the top one squared up and the one under it not.
  g.roundRect(w / 2 - 18, -h - 4, 11, 4, 1).fill(PAL.paper);
  g.roundRect(w / 2 - 17, -h - 7, 10, 3.4, 1).fill(PAL.paperWarm);
  g.rect(w / 2 - 16.4, -h - 6.6, 4.4, 0.6).fill({ color: PAL.inkFaint, alpha: 0.4 });
}

export function drawCoffeeMachine(g: Graphics): void {
  // Counter.
  drawContactShadow(g, 24, 3.4);
  g.roundRect(-24, -22, 48, 4, 1.6).fill(PAL.paperDeep);
  g.roundRect(-24, -22, 48, 1.2, 0.6).fill({ color: 0xffffff, alpha: 0.36 });
  g.rect(-24, -18, 48, 1.2).fill({ color: 0x000000, alpha: 0.18 });
  g.roundRect(-22, -18, 44, 18, 2).fill(mix(PAL.wood, PAL.paperDeep, 0.35));
  g.rect(-22, -18, 44, 1).fill({ color: PAL.woodDeep, alpha: 0.35 });
  // Two cupboard doors under the counter, each with its handle.
  g.roundRect(-20.5, -16, 20, 14.4, 1.2).fill({ color: PAL.woodDeep, alpha: 0.15 });
  g.roundRect(0.5, -16, 20, 14.4, 1.2).fill({ color: PAL.woodDeep, alpha: 0.15 });
  g.rect(-2.8, -11, 1.5, 4).fill({ color: PAL.woodDeep, alpha: 0.5 });
  g.rect(1.3, -11, 1.5, 4).fill({ color: PAL.woodDeep, alpha: 0.5 });
  // The machine itself: body, bean hopper, group head, drip tray, one lit
  // button. A coffee machine is legible entirely from where its cup goes.
  g.roundRect(-16, -48, 20, 26, 3).fill(PAL.inkSoft);
  g.roundRect(-16, -48, 20, 1.4, 0.7).fill({ color: 0xffffff, alpha: 0.22 });
  g.rect(-6.6, -47, 2.6, 25).fill({ color: 0x000000, alpha: 0.15 });
  g.roundRect(-13.5, -45, 15, 9, 2).fill(mix(PAL.amber, PAL.ink, 0.35));
  g.roundRect(-13, -44.4, 4.4, 7.8, 1.4).fill({ color: 0xffffff, alpha: 0.13 });
  g.roundRect(-13.6, -34.4, 6.2, 2.4, 0.8).fill(darken(PAL.inkSoft, 0.32));
  g.rect(-11.4, -32, 1.8, 1.6).fill(darken(PAL.inkSoft, 0.45));
  // The cup waiting under it.
  g.roundRect(-12.4, -30.4, 5, 4.6, 1.1).fill(PAL.paper);
  g.rect(-12.4, -30.4, 5, 1).fill({ color: PAL.brickSoft, alpha: 0.8 });
  g.roundRect(-14.6, -25.2, 11.4, 2.2, 0.7).fill(darken(PAL.inkSoft, 0.26));
  for (let i = 0; i < 4; i++) {
    g.rect(-13.4 + i * 2.7, -24.8, 0.8, 1.4).fill({ color: PAL.ink, alpha: 0.38 });
  }
  g.circle(-1.5, -41, 1.6).fill(PAL.amber);
  g.circle(-1.9, -41.4, 0.6).fill({ color: 0xffffff, alpha: 0.5 });
  g.roundRect(-3.4, -37.2, 3.6, 1.5, 0.6).fill(darken(PAL.inkSoft, 0.38));
  // Kettle: body with the light down one side, lid with a knob, a real handle.
  g.roundRect(8, -34, 13, 12, 3).fill(PAL.brick);
  g.roundRect(8.6, -33.2, 3.2, 10.2, 1.5).fill({ color: 0xffffff, alpha: 0.2 });
  g.moveTo(21, -31);
  g.quadraticCurveTo(26, -29, 22, -25);
  g.stroke({ color: PAL.brick, width: 2.4, cap: 'round' });
  g.roundRect(11, -37, 7, 3, 1.4).fill(darken(PAL.brick, 0.25));
  g.rect(11, -37, 7, 0.9).fill({ color: PAL.brickSoft, alpha: 0.5 });
  g.circle(14.5, -37.8, 1.2).fill(darken(PAL.brick, 0.4));
  // A mug, and a jar of something that is definitely not fresh any more.
  g.roundRect(-22, -27, 4.8, 5, 1.4).fill(PAL.paper);
  g.rect(-22, -27, 4.8, 1.1).fill({ color: PAL.sage, alpha: 0.6 });
  g.moveTo(-17.2, -26);
  g.quadraticCurveTo(-15.4, -24.8, -17.2, -23.6);
  g.stroke({ color: PAL.paper, width: 1, cap: 'round' });
  g.roundRect(21.6, -28, 4.4, 6, 1).fill({ color: mix(PAL.woodDeep, PAL.amber, 0.35), alpha: 0.9 });
  g.roundRect(21.2, -29.2, 5.2, 1.6, 0.6).fill(PAL.paperDeep);
  g.rect(21.6, -28, 1.3, 6).fill({ color: 0xffffff, alpha: 0.14 });
}

export function drawCouch(g: Graphics, w: number): void {
  const h = 15;
  drawContactShadow(g, w * 0.52, 3.6);
  // The far arm, behind the seat: same occlusion trick as the armchair, and
  // the reason the couch has a front and a back rather than just a face.
  g.roundRect(-w / 2 - 0.5, -h - 9, 5.5, 11, 2.6).fill(darken(PAL.plum, 0.32));
  g.roundRect(-w / 2, -h, w, h, 4).fill(PAL.plum);
  g.roundRect(-w / 2, -h - 16, w * 0.94, 18, 4).fill(darken(PAL.plum, 0.16));
  // Light along the top of the back, shadow in the seat well.
  g.roundRect(-w / 2 + 1.5, -h - 15.6, w * 0.94 - 3, 2.4, 1.2).fill({ color: 0xffffff, alpha: 0.2 });
  // The back is two cushions, not one panel. The seam is the whole difference.
  g.rect(-w / 2 + w * 0.46, -h - 15, 1, 14).fill({ color: 0x000000, alpha: 0.15 });
  g.roundRect(-w / 2 + 2, -h - 3.5, w / 2 - 4, 5, 2.4).fill(lighten(PAL.plum, 0.18));
  g.roundRect(2, -h - 3.5, w / 2 - 4, 5, 2.4).fill(lighten(PAL.plum, 0.18));
  // Piping along the front edge of each seat cushion.
  g.roundRect(-w / 2 + 2.6, -h - 0.4, w / 2 - 5.2, 0.9, 0.45).fill({ color: darken(PAL.plum, 0.34), alpha: 0.5 });
  g.roundRect(2.6, -h - 0.4, w / 2 - 5.2, 0.9, 0.45).fill({ color: darken(PAL.plum, 0.34), alpha: 0.5 });
  g.ellipse(-w / 4, -h + 1.5, w / 4 - 3, 2.6).fill({ color: 0x000000, alpha: 0.12 });
  g.ellipse(w / 4, -h + 1.5, w / 4 - 3, 2.6).fill({ color: 0x000000, alpha: 0.12 });
  g.roundRect(w / 2 - 6, -h - 10, 6, 12, 3).fill(darken(PAL.plum, 0.08));
  g.roundRect(w / 2 - 5.6, -h - 9.6, 5.2, 1.6, 0.8).fill({ color: 0xffffff, alpha: 0.16 });
  // A throw over the near arm. It is the only object in the break room that
  // says somebody actually sits here on their break, so it gets folds.
  const tx = w / 2 - 9.5;
  g.moveTo(tx, -h - 9);
  g.quadraticCurveTo(tx + 5, -h - 12, tx + 9.6, -h - 8);
  g.quadraticCurveTo(tx + 10.2, -h - 1.5, tx + 8, -h + 3.6);
  g.lineTo(tx + 4.4, -h + 2.8);
  g.quadraticCurveTo(tx + 6.6, -h - 3, tx + 4.2, -h - 6.4);
  g.closePath();
  g.fill(mix(PAL.sage, PAL.paperDeep, 0.35));
  g.moveTo(tx + 1.4, -h - 9.4);
  g.quadraticCurveTo(tx + 5.4, -h - 11.2, tx + 8.8, -h - 8.4);
  g.stroke({ color: 0xffffff, width: 1.1, alpha: 0.24, cap: 'round' });
  g.moveTo(tx + 6, -h - 4.6);
  g.quadraticCurveTo(tx + 8.6, -h - 4, tx + 9.8, -h - 5);
  g.stroke({ color: darken(PAL.sage, 0.32), width: 0.6, alpha: 0.4, cap: 'round' });
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

/**
 * A bookshelf. The books used to be an even run of coloured rects marching left
 * to right at a fixed pitch, which is the one arrangement no real shelf has
 * ever had. What it has instead: gaps where somebody took one out, a book
 * leaning into the gap beside it, a stack lying flat, and one thing per shelf
 * that is not a book at all. All of it hashed from the shelf index, so the
 * practice's library is the same library every rebuild.
 */
export function drawBookshelf(g: Graphics, w: number, h: number): void {
  drawContactShadow(g, w * 0.55, 3.2);
  g.roundRect(-w / 2, -h, w, h, 2).fill(PAL.woodDeep);
  g.rect(-w / 2, -h, w, 1.1).fill({ color: PAL.wood, alpha: 0.55 });
  // The carcass is a box: one side edge takes the light, the other loses it.
  g.rect(-w / 2, -h, 1.6, h).fill({ color: PAL.wood, alpha: 0.3 });
  g.rect(w / 2 - 1.4, -h, 1.4, h).fill({ color: 0x000000, alpha: 0.16 });
  const COLS = [PAL.brick, PAL.sage, PAL.amber, PAL.plum, PAL.paperDeep, PAL.sageDeep, PAL.plumDeep];
  const shelves = Math.max(2, Math.round(h / 20));
  for (let s = 0; s < shelves; s++) {
    const y = -h + 3 + (s * (h - 6)) / shelves;
    const sh = (h - 6) / shelves - 3;
    g.rect(-w / 2 + 2.5, y, w - 5, sh).fill(darken(PAL.woodDeep, 0.35));
    // The back of a shelf is in shadow; the front lip of the board is not.
    g.rect(-w / 2 + 2.5, y, w - 5, 1.8).fill({ color: 0x000000, alpha: 0.26 });
    g.rect(-w / 2 + 2.5, y + sh - 1, w - 5, 1).fill({ color: PAL.wood, alpha: 0.5 });
    const base = y + sh - 1; // the board the books actually stand on
    const right = w / 2 - 9; // the last stretch is reserved for the not-a-book
    let bx = -w / 2 + 4;
    let i = s * 5;
    while (bx < right) {
      const r0 = hash01(i, s, 51);
      const r1 = hash01(i, s, 52);
      if (r0 < 0.13 && bx > -w / 2 + 8) {
        bx += 1.8 + r1 * 2.2; // a gap where somebody took one out
        i++;
        continue;
      }
      if (r0 < 0.23 && bx + 12 < right) {
        // A stack lying flat, each volume a shade shorter than the one under it.
        const sw = 8 + r1 * 3;
        for (let k = 0; k < 3; k++) {
          const kw = sw - k * 1.2;
          g.rect(bx, base - 1.6 - k * 1.8, kw, 1.6).fill(COLS[(i + k) % COLS.length]);
          g.rect(bx, base - 1.6 - k * 1.8, kw, 0.5).fill({ color: 0xffffff, alpha: 0.18 });
        }
        bx += sw + 1.6;
        i++;
        continue;
      }
      const bw = 2.3 + r1 * 2.2;
      const bh = sh - 3 - hash01(i, s, 53) * sh * 0.16;
      const col = COLS[i % COLS.length];
      if (r0 > 0.9 && bx + bw + 3.4 < right) {
        // The leaner. Rotate-then-translate keeps it spinning about its own
        // middle rather than about the shelf's origin — see the couch cushion.
        const lean = 15 * DEG;
        g.rotateTransform(lean);
        g.translateTransform(bx + bw / 2 + 1.4, base - bh / 2);
        g.rect(-bw / 2, -bh / 2, bw, bh).fill(col);
        g.rect(-bw / 2, -bh / 2, bw, 0.8).fill({ color: 0xffffff, alpha: 0.22 });
        g.translateTransform(-(bx + bw / 2 + 1.4), -(base - bh / 2));
        g.rotateTransform(-lean);
        bx += bw + 3;
        i++;
        continue;
      }
      g.rect(bx, base - bh, bw, bh).fill(col);
      // Light on the head of the spine, a band where the title would be.
      g.rect(bx, base - bh, bw, 0.8).fill({ color: 0xffffff, alpha: 0.22 });
      g.rect(bx, base - bh * 0.74, bw, 0.7).fill({ color: 0x000000, alpha: 0.16 });
      bx += bw + 1.1;
      i++;
    }
    // Every real shelf has one thing on it that is not a book.
    const ox = w / 2 - 6.5;
    const kind = Math.floor(hash01(s, 3, 55) * 3);
    if (kind === 0) {
      // A small pot with two leaves over the edge.
      g.moveTo(ox - 2, base);
      g.lineTo(ox + 2, base);
      g.lineTo(ox + 1.5, base - 3.4);
      g.lineTo(ox - 1.5, base - 3.4);
      g.closePath();
      g.fill(PAL.brick);
      g.rect(ox - 1.5, base - 3.4, 1.2, 3.4).fill({ color: 0xffffff, alpha: 0.16 });
      g.ellipse(ox - 1.6, base - 5.2, 1.9, 1.1).fill(PAL.sage);
      g.ellipse(ox + 1.4, base - 4.8, 1.6, 1).fill(PAL.sageDeep);
    } else if (kind === 1) {
      // A photograph, leaning back on its own strut.
      g.roundRect(ox - 2.6, base - 6.4, 5.6, 6.4, 0.6).fill(PAL.woodDeep);
      g.rect(ox - 1.8, base - 5.6, 4, 4.8).fill(mix(PAL.paperWarm, PAL.amber, 0.2));
      g.rect(ox - 1.8, base - 5.6, 4, 1).fill({ color: 0xffffff, alpha: 0.3 });
    } else {
      // A mug somebody left up there and has not come back for.
      g.roundRect(ox - 2, base - 4.4, 4, 4.4, 1).fill(PAL.paper);
      g.rect(ox - 2, base - 4.4, 4, 1.1).fill(PAL.sage);
      g.moveTo(ox + 2, base - 3.4);
      g.quadraticCurveTo(ox + 3.6, base - 2.2, ox + 2, base - 1.2);
      g.stroke({ color: PAL.paper, width: 0.9, cap: 'round' });
    }
  }
}

/**
 * Framed art for a bare wall. Hung by hand, so it hangs slightly crooked — the
 * angle is a hash of where it is, and therefore the same every frame and the
 * same again after a rebuild.
 *
 * There are five pictures, chosen by the same hash. One picture repeated on
 * every wall of the building was the single most obvious tell that the office
 * was generated rather than furnished; five is enough that a screenshot almost
 * never catches two the same. `variant` overrides the choice if a caller ever
 * wants a specific one — otherwise never pass it.
 */
export function drawWallArt(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  tone: number,
  variant = Math.floor(hash01(x, y, 41) * 5) % 5,
): void {
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
  g.rect(l + w - 1.2, t, 1.2, h).fill({ color: 0x000000, alpha: 0.2 });
  // A mount board. A print run edge to edge in its frame is a poster; the pale
  // border is the entire difference between the two, and it costs one rect.
  g.rect(l + 2.2, t + 2.2, w - 4.4, h - 4.4).fill(PAL.paper);
  const il = l + 4;
  const it = t + 4;
  const iw = w - 8;
  const ih = h - 8;
  g.rect(il, it, iw, ih).fill(mix(tone, PAL.paper, 0.45));

  if (variant === 0) {
    // The hill: two ridges now, the far one paler, because one triangle is a
    // shape and two overlapping ones are a landscape.
    g.moveTo(il, it + ih);
    g.quadraticCurveTo(il + iw * 0.3, it + ih * 0.3, il + iw * 0.7, it + ih);
    g.closePath();
    g.fill({ color: mix(tone, PAL.paper, 0.2), alpha: 0.65 });
    g.moveTo(il, it + ih);
    g.lineTo(il + iw * 0.42, it + ih * 0.38);
    g.lineTo(il + iw * 0.8, it + ih);
    g.closePath();
    g.fill({ color: tone, alpha: 0.78 });
    g.circle(il + iw * 0.76, it + ih * 0.26, ih * 0.12).fill({ color: PAL.amber, alpha: 0.9 });
  } else if (variant === 1) {
    // Still life: a jug, a bowl of something, and the table edge under them.
    g.rect(il, it + ih * 0.74, iw, ih * 0.05).fill({ color: PAL.woodDeep, alpha: 0.45 });
    g.moveTo(il + iw * 0.3, it + ih * 0.75);
    g.quadraticCurveTo(il + iw * 0.21, it + ih * 0.4, il + iw * 0.33, it + ih * 0.26);
    g.lineTo(il + iw * 0.45, it + ih * 0.26);
    g.quadraticCurveTo(il + iw * 0.57, it + ih * 0.42, il + iw * 0.48, it + ih * 0.75);
    g.closePath();
    g.fill({ color: tone, alpha: 0.85 });
    g.moveTo(il + iw * 0.33, it + ih * 0.42);
    g.quadraticCurveTo(il + iw * 0.3, it + ih * 0.6, il + iw * 0.34, it + ih * 0.73);
    g.stroke({ color: 0xffffff, width: 0.8, alpha: 0.35, cap: 'round' });
    g.ellipse(il + iw * 0.65, it + ih * 0.7, iw * 0.13, ih * 0.07).fill({ color: PAL.brickSoft, alpha: 0.9 });
    g.circle(il + iw * 0.63, it + ih * 0.62, ih * 0.07).fill({ color: PAL.amber, alpha: 0.9 });
    g.circle(il + iw * 0.71, it + ih * 0.64, ih * 0.055).fill({ color: PAL.brick, alpha: 0.85 });
  } else if (variant === 2) {
    // Colour field: three soft blocks that overlap and darken at the seams.
    g.roundRect(il + iw * 0.05, it + ih * 0.1, iw * 0.46, ih * 0.64, 1).fill({ color: tone, alpha: 0.5 });
    g.roundRect(il + iw * 0.32, it + ih * 0.28, iw * 0.5, ih * 0.52, 1).fill({ color: PAL.amberDeep, alpha: 0.34 });
    g.roundRect(il + iw * 0.18, it + ih * 0.52, iw * 0.68, ih * 0.32, 1).fill({ color: PAL.sageDeep, alpha: 0.32 });
    // One brushed line across it, so it reads as painted rather than filled.
    g.moveTo(il + iw * 0.1, it + ih * 0.44);
    g.quadraticCurveTo(il + iw * 0.5, it + ih * 0.34, il + iw * 0.9, it + ih * 0.46);
    g.stroke({ color: PAL.paper, width: 0.9, alpha: 0.4, cap: 'round' });
  } else if (variant === 3) {
    // Botanical study: one stem, four leaves, and the ruled specimen line the
    // Latin name would sit on if anything at this size could carry lettering.
    const sx = il + iw * 0.48;
    g.moveTo(sx, it + ih * 0.86);
    g.quadraticCurveTo(sx - iw * 0.05, it + ih * 0.5, sx + iw * 0.03, it + ih * 0.14);
    g.stroke({ color: PAL.sageDeep, width: 0.85, cap: 'round' });
    for (let i = 0; i < 4; i++) {
      const ly = it + ih * (0.7 - i * 0.15);
      const d = i % 2 ? 1 : -1;
      g.moveTo(sx, ly);
      g.quadraticCurveTo(sx + d * iw * 0.15, ly - ih * 0.14, sx + d * iw * 0.22, ly - ih * 0.02);
      g.quadraticCurveTo(sx + d * iw * 0.11, ly + ih * 0.04, sx, ly);
      g.closePath();
      g.fill({ color: i % 2 ? PAL.sage : mix(PAL.sage, tone, 0.45), alpha: 0.9 });
    }
    g.rect(il + iw * 0.26, it + ih * 0.94, iw * 0.32, 0.7).fill({ color: PAL.inkFaint, alpha: 0.55 });
  } else {
    // Seascape: a high horizon, a low sun laying a path on the water, two wave
    // strokes and one sail small enough to be a long way out.
    g.rect(il, it + ih * 0.5, iw, ih * 0.5).fill({ color: mix(tone, PAL.ink, 0.3), alpha: 0.6 });
    g.circle(il + iw * 0.32, it + ih * 0.38, ih * 0.13).fill({ color: PAL.amberGlow, alpha: 0.95 });
    g.moveTo(il + iw * 0.26, it + ih * 0.5);
    g.lineTo(il + iw * 0.38, it + ih * 0.5);
    g.lineTo(il + iw * 0.46, it + ih);
    g.lineTo(il + iw * 0.18, it + ih);
    g.closePath();
    g.fill({ color: PAL.amberGlow, alpha: 0.22 });
    g.moveTo(il + iw * 0.7, it + ih * 0.5);
    g.lineTo(il + iw * 0.7, it + ih * 0.28);
    g.lineTo(il + iw * 0.81, it + ih * 0.5);
    g.closePath();
    g.fill({ color: PAL.paper, alpha: 0.9 });
    g.moveTo(il + iw * 0.08, it + ih * 0.72);
    g.quadraticCurveTo(il + iw * 0.26, it + ih * 0.67, il + iw * 0.42, it + ih * 0.74);
    g.moveTo(il + iw * 0.52, it + ih * 0.86);
    g.quadraticCurveTo(il + iw * 0.7, it + ih * 0.81, il + iw * 0.88, it + ih * 0.88);
    g.stroke({ color: PAL.paper, width: 0.7, alpha: 0.45, cap: 'round' });
  }

  // The glaze catching the light across the top corner, over everything.
  g.moveTo(l + 2.2, t + 2.2);
  g.lineTo(l + w * 0.5, t + 2.2);
  g.lineTo(l + 2.2, t + h * 0.62);
  g.closePath();
  g.fill({ color: 0xffffff, alpha: 0.11 });
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
      g.rect(-13, -13, 26, 1.2).fill({ color: PAL.wood, alpha: 0.6 });
      g.rect(11.8, -13, 1.2, 26).fill({ color: 0x000000, alpha: 0.18 });
      g.rect(-11.4, -11.4, 22.8, 22.8).fill(PAL.paper);
      // The board sits proud of its frame, so the frame shadows the top of it.
      g.rect(-11.4, -11.4, 22.8, 1.3).fill({ color: 0x000000, alpha: 0.1 });
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
      // Marker tray along the bottom rail, with two pens and the eraser. It is
      // the one detail that says somebody stands at this board every day.
      g.roundRect(-9, 11.4, 18, 2.2, 0.8).fill(PAL.woodDeep);
      g.rect(-9, 11.4, 18, 0.7).fill({ color: PAL.wood, alpha: 0.55 });
      g.roundRect(-7.6, 10.2, 5.2, 1.4, 0.7).fill(accent);
      g.roundRect(-1.8, 10.4, 4.6, 1.2, 0.6).fill(PAL.brick);
      g.roundRect(4.2, 9.8, 4.4, 1.8, 0.6).fill(PAL.inkSoft);
      g.rect(4.2, 9.8, 4.4, 0.6).fill({ color: PAL.paperDeep, alpha: 0.7 });
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
      // The fan throws a shadow onto the stool it is spread across.
      g.ellipse(0, -14.6, 9, 1.6).fill({ color: 0x000000, alpha: 0.14 });
      for (let i = 0; i < 5; i++) {
        const a = (-28 + i * 14) * DEG;
        g.rotateTransform(a);
        g.translateTransform(0, -15.5);
        g.roundRect(-3.4, -9.5, 6.8, 9.5, 1).fill(i % 2 ? PAL.paper : mix(accent, PAL.paper, 0.55));
        g.roundRect(-3.4, -9.5, 6.8, 1.8, 0.9).fill({ color: accent, alpha: 0.75 });
        // Lamination catches the light along the leading edge of every card,
        // and two ruled lines say there is something written on them.
        g.rect(-3.4, -9.5, 1, 9.5).fill({ color: 0xffffff, alpha: 0.35 });
        g.rect(-2.2, -6.6, 4.4, 0.6).fill({ color: PAL.inkFaint, alpha: 0.5 });
        g.rect(-2.2, -4.8, 3.2, 0.6).fill({ color: PAL.inkFaint, alpha: 0.4 });
        g.translateTransform(0, 15.5);
        g.rotateTransform(-a);
      }
      // The rubber band that holds the deck together when it is not in use.
      g.roundRect(-2.2, -17.2, 4.4, 1.4, 0.6).fill({ color: PAL.brick, alpha: 0.75 });
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
      // Rubber feet, and the cable looping down from the bar and off to a socket.
      g.ellipse(-6, -0.4, 1.4, 0.8).fill(darken(PAL.inkSoft, 0.4));
      g.ellipse(6, -0.4, 1.4, 0.8).fill(darken(PAL.inkSoft, 0.4));
      g.moveTo(2, -21);
      g.quadraticCurveTo(6.5, -12, 4.5, -1);
      g.quadraticCurveTo(4, 1, 11, -0.4);
      g.stroke({ color: darken(PAL.inkSoft, 0.35), width: 1, cap: 'round' });
      g.rotateTransform(-7 * DEG);
      g.translateTransform(0, -24);
      g.roundRect(-13, -3, 26, 6, 3).fill(PAL.ink);
      g.roundRect(-12.4, -2.6, 25, 1.4, 0.7).fill({ color: 0xffffff, alpha: 0.12 });
      for (let i = 0; i < 5; i++) {
        g.circle(-9 + i * 4.5, 0, 1.5).fill({ color: i === 2 ? PAL.amberGlow : mix(accent, PAL.ink, 0.4) });
      }
      g.circle(0, 0, 1.5).fill(PAL.amberGlow);
      // The lit lamp is the only one throwing anything, so it gets its own core
      // as well as the soft wash along the bar.
      g.circle(0, 0, 0.7).fill(0xfff6e2);
      g.ellipse(0, 0, 15, 4).fill({ color: PAL.amberGlow, alpha: 0.12 });
      g.ellipse(0, 0, 5, 2.6).fill({ color: PAL.amberGlow, alpha: 0.2 });
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
      g.rect(-5.4, -20, 10.8, 0.8).fill({ color: 0xffffff, alpha: 0.24 });
      // The carry strap, hanging slack the way a strap does when nobody is
      // holding it. A rolled mat with no strap is a bolster.
      g.moveTo(-4.4, -19);
      g.quadraticCurveTo(-8.6, -13.5, -4.6, -9.2);
      g.stroke({ color: mix(PAL.paperDeep, PAL.woodDeep, 0.55), width: 1.2, cap: 'round' });
      g.rotateTransform(-3 * DEG);
      // A folded blanket beside it — three folds, each edge catching the light.
      g.roundRect(6, -6, 13, 6, 1.6).fill(mix(PAL.paperDeep, accent, 0.3));
      g.rect(6, -6, 13, 1).fill({ color: 0xffffff, alpha: 0.24 });
      g.rect(6, -4, 13, 0.8).fill({ color: PAL.ink, alpha: 0.12 });
      g.rect(6, -2.2, 13, 0.8).fill({ color: PAL.ink, alpha: 0.1 });
      g.ellipse(6.4, -3, 1.1, 2.6).fill({ color: 0x000000, alpha: 0.1 });
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
      // Buttoning, which is what makes an old couch old rather than merely low.
      for (let i = 0; i < 4; i++) {
        g.circle(-8 + i * 6.5, -6.4, 0.8).fill({ color: 0x000000, alpha: 0.16 });
      }
      // A blanket folded over the foot end, and the crease it makes.
      g.roundRect(1.5, -13.6, 10.5, 3.6, 1.2).fill(mix(PAL.brickSoft, PAL.paperDeep, 0.4));
      g.rect(1.5, -13.6, 10.5, 0.9).fill({ color: 0xffffff, alpha: 0.22 });
      g.rect(1.5, -11.6, 10.5, 0.7).fill({ color: PAL.ink, alpha: 0.12 });
      g.roundRect(-14, -2, 2.6, 2.4, 1).fill(PAL.woodDeep);
      g.roundRect(11.4, -2, 2.6, 2.4, 1).fill(PAL.woodDeep);
      g.rect(-14, -2, 2.6, 0.7).fill({ color: PAL.wood, alpha: 0.6 });
      g.rect(11.4, -2, 2.6, 0.7).fill({ color: PAL.wood, alpha: 0.6 });
      // A small clock, face to the wall — the back of the case and its stand.
      g.roundRect(13, -17.4, 4.2, 5.4, 1).fill(PAL.woodDeep);
      g.rect(13, -17.4, 4.2, 0.9).fill({ color: PAL.wood, alpha: 0.55 });
      g.moveTo(15, -12);
      g.lineTo(17.6, -10.2);
      g.stroke({ color: PAL.woodDeep, width: 1, cap: 'round' });
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
      g.circle(0, 0, 4.2).fill(darken(mix(PAL.amber, PAL.woodDeep, 0.3), 0.22));
      g.circle(0, 0, 3.6).fill(PAL.paperWarm);
      // Four cardinal ticks. On a five-unit dial they are all the compass rose
      // there is room for, and without them the brass is a coin.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        g.moveTo(Math.cos(a) * 2.5, Math.sin(a) * 2.5);
        g.lineTo(Math.cos(a) * 3.2, Math.sin(a) * 3.2);
      }
      g.stroke({ color: PAL.inkFaint, width: 0.5, alpha: 0.7, cap: 'round' });
      g.moveTo(0, -3);
      g.lineTo(1.2, 0);
      g.lineTo(0, 3);
      g.lineTo(-1.2, 0);
      g.closePath();
      g.fill(PAL.brick);
      g.moveTo(0, -3);
      g.lineTo(1.2, 0);
      g.lineTo(0, 0);
      g.closePath();
      g.fill({ color: 0xffffff, alpha: 0.3 });
      g.circle(0, 0, 0.6).fill(mix(PAL.amber, PAL.woodDeep, 0.3));
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
      // Three little figures standing in it, each casting its own small shadow
      // on the sand — three unshadowed pegs read as printed on the tray.
      for (let i = 0; i < 3; i++) {
        const fx = -6 + i * 6 + wobble(i, 2, 6, 1.1);
        g.ellipse(fx + 0.6, -12.2, 1.8, 0.6).fill({ color: 0x000000, alpha: 0.14 });
        g.roundRect(fx - 1, -16.5, 2, 4, 1).fill([PAL.brick, accent, PAL.sageDeep][i % 3]);
        g.rect(fx - 1, -16.5, 0.7, 4).fill({ color: 0xffffff, alpha: 0.2 });
        g.circle(fx, -17.4, 1.3).fill(PAL.wood);
        g.circle(fx - 0.4, -17.8, 0.5).fill({ color: 0xffffff, alpha: 0.22 });
      }
      // The basket: woven, so it gets three bands and a rolled rim.
      g.moveTo(15, -1);
      g.lineTo(27, -1);
      g.lineTo(25.4, -9);
      g.lineTo(16.6, -9);
      g.closePath();
      g.fill(mix(PAL.wood, PAL.woodDeep, 0.4));
      g.rect(16.4, -6.5, 9.2, 0.8).fill({ color: PAL.paperDeep, alpha: 0.4 });
      g.rect(15.9, -4.2, 10.2, 0.8).fill({ color: PAL.paperDeep, alpha: 0.3 });
      g.roundRect(16.2, -9.8, 9.6, 1.6, 0.8).fill(mix(PAL.wood, PAL.paperDeep, 0.3));
      g.rect(16.2, -9.8, 9.6, 0.6).fill({ color: 0xffffff, alpha: 0.24 });
      // One figure has escaped the basket and is lying on the boards beside it.
      g.roundRect(11.4, -1.9, 3.6, 1.8, 0.9).fill(PAL.sageDeep);
      g.circle(11, -1, 1.2).fill(PAL.wood);
      break;
    }
    default: {
      // family — a ring of mismatched chairs, one always pulled slightly back.
      drawContactShadow(g, 16, 2.8);
      // A small round rug under the ring, which is what makes three chairs a
      // circle instead of three chairs.
      // Kept inside the prop's existing 16-unit half-width: the armchair beside
      // it in a therapy room is only 28 units away and this fill is opaque
      // enough to read as a collision if it strays.
      g.ellipse(-1, -1.6, 15, 3).fill({ color: mix(accent, PAL.paperDeep, 0.55), alpha: 0.55 });
      g.ellipse(-1, -1.6, 11, 2).fill({ color: mix(accent, PAL.paperDeep, 0.3), alpha: 0.45 });
      const tones = [PAL.wood, mix(PAL.sage, PAL.paperDeep, 0.4), mix(accent, PAL.paperDeep, 0.4)];
      for (let i = 0; i < 3; i++) {
        const cx = -11 + i * 11;
        const back = i === 1 ? -3 : 0;
        const tilt = wobble(i, 3, 8, 2.6 * DEG);
        g.ellipse(cx + back, -0.6, 5.4, 1.4).fill({ color: PAL.ink, alpha: 0.13 });
        g.rotateTransform(tilt);
        g.translateTransform(cx + back, i === 1 ? -1.5 : 0);
        g.roundRect(-4.6, -8, 9.2, 2.2, 1).fill(tones[i]);
        g.roundRect(-4.6, -8, 9.2, 0.8, 0.4).fill({ color: 0xffffff, alpha: 0.28 });
        g.roundRect(-4.2, -6, 1.6, 6, 0.8).fill(PAL.woodDeep);
        g.roundRect(2.6, -6, 1.6, 6, 0.8).fill(PAL.woodDeep);
        // A stretcher between the legs, and the back post with its lit edge.
        g.roundRect(-3.8, -3.2, 6.4, 1.1, 0.55).fill(darken(PAL.woodDeep, 0.12));
        g.roundRect(i % 2 ? 2.6 : -4.2, -17, 1.7, 9.4, 0.8).fill(darken(tones[i], 0.2));
        g.rect(i % 2 ? 2.6 : -4.2, -17, 0.6, 9.4).fill({ color: 0xffffff, alpha: 0.2 });
        g.roundRect(i % 2 ? 1.2 : -5.6, -17.4, 4.5, 1.6, 0.7).fill(darken(tones[i], 0.3));
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
  // A saucer. A pot standing on bare boards is a pot in a catalogue; the two
  // ellipses under it are what put this one in somebody's office.
  g.ellipse(0, -0.3, potW * 0.6, potW * 0.17).fill(darken(pot, 0.3));
  g.ellipse(0, -0.9, potW * 0.53, potW * 0.13).fill(darken(pot, 0.12));
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
  // Soil, with two pebbles on it — the smallest possible reason to believe
  // somebody chose this plant rather than the engine generating it.
  g.ellipse(0, -potH - 1.4, potW * 0.42, 1.1).fill(darken(PAL.woodDeep, 0.35));
  g.ellipse(-potW * 0.18, -potH - 1.8, 1.1, 0.6).fill({ color: PAL.paperDeep, alpha: 0.5 });
  g.ellipse(potW * 0.14, -potH - 1.5, 0.8, 0.45).fill({ color: PAL.paperDeep, alpha: 0.4 });

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

const CAT_PINK = 0xd88f8f;

/** The cat, drawn with her feet at the local origin and facing +x. */
function drawCat(g: Graphics, pose: CatPose): void {
  const fur = CAT_FUR;
  const dark = darken(fur, 0.22);
  const pale = lighten(fur, 0.3);
  g.clear();
  if (pose === 'curl') {
    // A sleeping cat is one continuous spiral, and the tail coming round the
    // front to meet the nose is the exact shape people recognise from across
    // a room. Everything else here is in service of that outline.
    g.ellipse(0, 0, 8.6, 2).fill({ color: PAL.ink, alpha: 0.14 });
    g.ellipse(0, -3.6, 8, 4.1).fill(fur);
    // The rise of the back, and the lamp landing along the top of it.
    g.ellipse(-1.8, -5, 5.6, 2.8).fill(lighten(fur, 0.12));
    g.ellipse(-2.4, -6.2, 3.4, 1.1).fill({ color: 0xffffff, alpha: 0.18 });
    g.moveTo(-3.4, -8.2);
    g.quadraticCurveTo(-1.4, -6.4, -1.8, -4.4);
    g.stroke({ color: dark, width: 1, alpha: 0.35, cap: 'round' });
    // Tail round the front, its pale tip parked under her chin.
    g.moveTo(-6.8, -2.6);
    g.quadraticCurveTo(-2.6, -0.5, 3, -1.1);
    g.quadraticCurveTo(6.4, -1.5, 7.6, -2.4);
    g.stroke({ color: dark, width: 2.4, cap: 'round' });
    g.moveTo(5.2, -1.3);
    g.quadraticCurveTo(6.8, -1.6, 7.6, -2.4);
    g.stroke({ color: pale, width: 1.8, cap: 'round' });
    // Head, tucked down into her own side.
    g.ellipse(5, -5.2, 3.3, 3).fill(fur);
    g.ellipse(5.8, -3.9, 2, 1.2).fill(pale);
    g.moveTo(2.9, -7.4);
    g.lineTo(3.6, -10.1);
    g.lineTo(5.1, -7.7);
    g.closePath();
    g.fill(dark);
    g.moveTo(5.9, -7.9);
    g.lineTo(7.1, -10);
    g.lineTo(7.6, -7.3);
    g.closePath();
    g.fill(dark);
    g.moveTo(3.6, -7.8);
    g.lineTo(4, -9.2);
    g.lineTo(4.6, -7.9);
    g.closePath();
    g.fill({ color: CAT_PINK, alpha: 0.5 });
    // Eyes shut — she is asleep, that is the entire joke.
    g.moveTo(3.3, -5.5);
    g.quadraticCurveTo(4.2, -4.6, 5.1, -5.5);
    g.moveTo(5.9, -5.6);
    g.quadraticCurveTo(6.5, -4.9, 7.1, -5.5);
    g.stroke({ color: PAL.ink, width: 0.6, cap: 'round' });
    g.moveTo(6, -3.4);
    g.lineTo(6.9, -3.4);
    g.lineTo(6.45, -2.9);
    g.closePath();
    g.fill({ color: CAT_PINK, alpha: 0.9 });
    return;
  }

  const sitting = pose === 'sit';
  g.ellipse(0, 0, sitting ? 5.4 : 7.5, 1.9).fill({ color: PAL.ink, alpha: 0.14 });
  if (sitting) {
    // An upright teardrop: wide at the haunch, narrowing to the shoulders.
    g.moveTo(-4, 0);
    g.quadraticCurveTo(-5, -7, -2.5, -10.7);
    g.quadraticCurveTo(1.7, -12.8, 3.3, -8.4);
    g.quadraticCurveTo(4.1, -3.4, 3.7, 0);
    g.closePath();
    g.fill(fur);
    // The haunch is the widest thing on a sitting cat and it belongs low.
    g.ellipse(-2.2, -2.6, 3, 2.6).fill(darken(fur, 0.09));
    g.ellipse(-2.6, -4.2, 2.2, 1).fill({ color: 0xffffff, alpha: 0.12 });
    // Pale chest running up to the chin.
    g.moveTo(1.6, -0.4);
    g.quadraticCurveTo(2.4, -5, 2.1, -9.4);
    g.quadraticCurveTo(3.8, -6, 3.5, -0.4);
    g.closePath();
    g.fill(pale);
    // Two front paws, one a little forward of the other.
    g.roundRect(1.3, -2.4, 3.8, 2.4, 1.2).fill(pale);
    g.roundRect(0.4, -1.8, 3.4, 1.8, 0.9).fill(lighten(fur, 0.18));
    g.moveTo(2.3, -1.1);
    g.lineTo(2.3, -0.3);
    g.moveTo(3.2, -1.1);
    g.lineTo(3.2, -0.3);
    g.stroke({ color: dark, width: 0.35, alpha: 0.7, cap: 'round' });
  } else {
    g.roundRect(-6.5, -8.8, 13, 5.6, 2.8).fill(fur);
    g.roundRect(-6, -8.6, 12, 1.8, 0.9).fill({ color: 0xffffff, alpha: 0.14 });
    // A pale belly line under her, which is what gives a walking cat a spine.
    g.roundRect(-4.6, -4.6, 9.6, 1.5, 0.75).fill(pale);
    // Far pair of legs first and darker, so the near pair comes forward.
    g.roundRect(-5, -3.8, 1.9, 3.8, 0.9).fill(dark);
    g.roundRect(2.2, -3.8, 1.9, 3.8, 0.9).fill(dark);
    g.roundRect(-1.5, -3.8, 2, 3.8, 0.95).fill(fur);
    g.roundRect(4.7, -3.8, 2, 3.8, 0.95).fill(fur);
    g.ellipse(-0.5, -0.3, 1.2, 0.7).fill(pale);
    g.ellipse(5.7, -0.3, 1.2, 0.7).fill(pale);
    // Two stripes over the back — a tabby, because a plain cat at this size is
    // a beige capsule with a face on it.
    g.moveTo(-2.6, -8.7);
    g.lineTo(-3.2, -6.4);
    g.moveTo(0.6, -8.6);
    g.lineTo(0.1, -6.2);
    g.stroke({ color: dark, width: 1.1, alpha: 0.45, cap: 'round' });
  }

  const hx = sitting ? 2.4 : 7;
  const hy = sitting ? -12.4 : -10.4;
  // Wider than tall: a cat's skull is, and the circle it used to be read as a
  // balloon rather than a head.
  g.ellipse(hx, hy, 3.3, 3).fill(fur);
  g.moveTo(hx - 2.5, hy - 1.5);
  g.lineTo(hx - 2.1, hy - 4.5);
  g.lineTo(hx + 0.2, hy - 2.4);
  g.closePath();
  g.fill(dark);
  g.moveTo(hx + 0.9, hy - 2.5);
  g.lineTo(hx + 2.9, hy - 4.4);
  g.lineTo(hx + 3, hy - 1.5);
  g.closePath();
  g.fill(dark);
  // Pink inners, set in from the ear edges so the dark reads as the rim.
  g.moveTo(hx - 2, hy - 2);
  g.lineTo(hx - 1.75, hy - 3.7);
  g.lineTo(hx - 0.6, hy - 2.5);
  g.closePath();
  g.fill({ color: CAT_PINK, alpha: 0.5 });
  g.moveTo(hx + 1.4, hy - 2.4);
  g.lineTo(hx + 2.6, hy - 3.6);
  g.lineTo(hx + 2.6, hy - 1.9);
  g.closePath();
  g.fill({ color: CAT_PINK, alpha: 0.5 });
  // Muzzle, and the light on the top of her head.
  g.ellipse(hx + 1.1, hy + 1.3, 2.1, 1.3).fill(pale);
  g.ellipse(hx - 0.7, hy - 1.7, 1.7, 0.75).fill({ color: 0xffffff, alpha: 0.18 });
  // Almond eyes with a highlight each. This is where the whole cat lives.
  g.ellipse(hx - 0.9, hy - 0.2, 0.75, 0.9).fill(PAL.ink);
  g.ellipse(hx + 1.6, hy - 0.2, 0.75, 0.9).fill(PAL.ink);
  g.circle(hx - 0.6, hy - 0.65, 0.32).fill({ color: 0xffffff, alpha: 0.85 });
  g.circle(hx + 1.9, hy - 0.65, 0.32).fill({ color: 0xffffff, alpha: 0.85 });
  // Nose, and the line of the mouth under it.
  g.moveTo(hx + 0.9, hy + 0.85);
  g.lineTo(hx + 1.9, hy + 0.85);
  g.lineTo(hx + 1.4, hy + 1.5);
  g.closePath();
  g.fill({ color: CAT_PINK, alpha: 0.95 });
  g.moveTo(hx + 1.4, hy + 1.5);
  g.lineTo(hx + 1.4, hy + 1.9);
  g.stroke({ color: dark, width: 0.35, cap: 'round' });
  // Whiskers, kept short: they add just over a unit to her width and she is
  // the only thing in the building that wanders freely enough to afford it.
  g.moveTo(hx + 2.3, hy + 0.9);
  g.lineTo(hx + 4.3, hy + 0.2);
  g.moveTo(hx + 2.3, hy + 1.3);
  g.lineTo(hx + 4.2, hy + 1.8);
  g.stroke({ color: pale, width: 0.35, alpha: 0.65, cap: 'round' });
}

/** A cat with an independently swishing tail. Position `view` at her feet. */
export function createCat(): CatRig {
  const view = new Container();
  const tail = new Graphics();
  // The tail is hinged at her rump, so it can swish without redrawing her.
  tail.moveTo(0, 0);
  tail.quadraticCurveTo(-5.5, -1.5, -7.5, -7);
  tail.stroke({ color: CAT_FUR, width: 2.6, cap: 'round' });
  // Two rings and a pale tip. A tail that tapers and ends in white is the
  // difference between an animal and a length of rope glued to one.
  tail.moveTo(-3.4, -0.5);
  tail.lineTo(-3.9, -1.5);
  tail.moveTo(-5.9, -2.6);
  tail.lineTo(-6.7, -3.6);
  tail.stroke({ color: darken(CAT_FUR, 0.24), width: 1.7, cap: 'round' });
  tail.moveTo(-6.6, -4.6);
  tail.quadraticCurveTo(-7.4, -5.8, -7.5, -7);
  tail.stroke({ color: lighten(CAT_FUR, 0.3), width: 1.8, cap: 'round' });
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
    // The nosing: the lip of each tread catches the light where it overhangs.
    g.rect(i * sw, i * sh + 2, sw + 1, 0.9).fill({ color: 0xffffff, alpha: 0.2 });
    // Balusters, one per tread, running *up* from the tread to meet the rail
    // drawn below — the handrail is the thing they hold, so they have to stop
    // at it and start at the board, not drop down into the riser.
    const ry = -13 + (i + 0.5) * sh; // the rail's height above this baluster
    g.rect(i * sw + sw * 0.5 - 0.5, ry, 1, i * sh - ry).fill({
      color: PAL.woodDeep,
      alpha: 0.75,
    });
  }
  // Handrail, with a lit edge along its top.
  g.moveTo(0, -13);
  g.lineTo(w, h - 13);
  g.stroke({ color: PAL.woodDeep, width: 2.4, cap: 'round' });
  g.moveTo(0, -13.8);
  g.lineTo(w, h - 13.8);
  g.stroke({ color: PAL.wood, width: 0.8, alpha: 0.55, cap: 'round' });
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
