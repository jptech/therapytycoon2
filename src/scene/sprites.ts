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
  sitSeatY: -12,
  sitHeadY: -34.8,
  sitTorsoTop: -27.5,
  sitShoulderY: -26.5,
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
  const hair = hairOf(seed);
  const outfit = outfitOf(seed);
  const trouser = darken(outfit, 0.34);
  const sitting = pose === 'sit';

  const headY = sitting ? M.sitHeadY : M.standHeadY;
  const torsoTop = sitting ? M.sitTorsoTop : M.standTorsoTop;
  const neckY = sitting ? M.sitHeadY + 6 : M.standNeckY;
  const hipY = sitting ? M.sitSeatY : M.hipY;
  const r = M.headR;

  g.clear();

  // ── Seated legs ───────────────────────────────────────────────────────────
  if (sitting) {
    // Thigh runs forward from the hip, shin drops to the floor.
    g.roundRect(-6.6, hipY - 3.6, 13.6, 5.2, 2.6).fill(trouser);
    g.roundRect(3.3, hipY - 0.6, 4.8, 12.6, 2.4).fill(trouser);
    g.roundRect(2.9, -3.4, 6.6, 3.4, 1.7).fill(darken(trouser, 0.3));
  }

  // ── Torso ─────────────────────────────────────────────────────────────────
  g.roundRect(-7.2, torsoTop, 14.4, hipY - torsoTop + 1.5, 5.2).fill(outfit);
  // A lighter collar wedge gives the flat shape a little depth.
  g.moveTo(-3.4, torsoTop + 0.4);
  g.lineTo(0, torsoTop + 5.4);
  g.lineTo(3.4, torsoTop + 0.4);
  g.closePath();
  g.fill({ color: lighten(outfit, 0.32), alpha: 0.9 });
  // Inner shadow down the left side.
  g.roundRect(-7.2, torsoTop, 4.2, hipY - torsoTop + 1.5, 5.2).fill({ color: 0x000000, alpha: 0.07 });

  // ── Neck ──────────────────────────────────────────────────────────────────
  g.rect(-2.3, neckY, 4.6, 4).fill(darken(skin, 0.12));

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

/** The soft contact shadow a figure casts on the floorboards. */
export function drawShadow(g: Graphics, w = 11): void {
  g.clear();
  g.ellipse(0, 0.5, w, 3).fill({ color: PAL.ink, alpha: 0.16 });
}

export interface PersonRig {
  view: Container;
  rig: Container;
  shadow: Graphics;
  body: Graphics;
  legs: [Graphics, Graphics];
  arms: [Graphics, Graphics];
  seed: PortraitSeed;
  pose: PersonPose;
  sleepy: boolean;
  phase: number;
  facing: 1 | -1;
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

  // Legs behind the torso, arms in front — the cheapest possible depth sort.
  rig.addChild(legL, legR, body, armL, armR);
  view.addChild(shadow, rig);

  const p: PersonRig = {
    view,
    rig,
    shadow,
    body,
    legs: [legL, legR],
    arms: [armL, armR],
    seed,
    pose: 'stand',
    sleepy: false,
    phase: Math.random() * Math.PI * 2,
    facing: 1,
  };
  applyPose(p, 'stand', false);
  return p;
}

function applyPose(p: PersonRig, pose: PersonPose, sleepy: boolean): void {
  p.pose = pose;
  p.sleepy = sleepy;
  drawPerson(p.body, { seed: p.seed, pose, sleepy });
  const sitting = pose === 'sit';
  p.legs[0].visible = !sitting;
  p.legs[1].visible = !sitting;
  p.legs[0].position.set(-2.6, M.hipY);
  p.legs[1].position.set(2.6, M.hipY);
  const sy = sitting ? M.sitShoulderY : M.shoulderY;
  p.arms[0].position.set(-7.1, sy);
  p.arms[1].position.set(7.1, sy);
  p.shadow.scale.set(sitting ? 0.7 : 1, 1);
}

/** Re-draw only when the pose or the sleepy flag actually changed. */
export function setPersonPose(p: PersonRig, pose: PersonPose, sleepy: boolean): void {
  if (p.pose === pose && p.sleepy === sleepy) return;
  applyPose(p, pose, sleepy);
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

  switch (mode) {
    case 'walk': {
      const sw = Math.sin(p.phase);
      p.legs[0].rotation = sw * 0.55 * amp;
      p.legs[1].rotation = -sw * 0.55 * amp;
      p.arms[0].rotation = -sw * 0.4 * amp;
      p.arms[1].rotation = sw * 0.4 * amp;
      p.rig.y = -Math.abs(Math.cos(p.phase)) * 1.5 * amp;
      p.rig.rotation = 0;
      break;
    }
    case 'sit': {
      const b = Math.sin(p.phase * 0.75);
      p.arms[0].rotation = 0.52;
      p.arms[1].rotation = 0.46;
      p.rig.y = b * 0.35 * amp;
      p.rig.rotation = p.sleepy ? 0.05 : 0;
      break;
    }
    case 'wave': {
      p.legs[0].rotation = 0;
      p.legs[1].rotation = 0;
      p.arms[0].rotation = 0.1;
      p.arms[1].rotation = -2.5 + Math.sin(p.phase) * 0.38 * amp;
      p.rig.y = -Math.abs(Math.sin(p.phase * 0.5)) * 1.2 * amp;
      p.rig.rotation = 0;
      break;
    }
    default: {
      // Two-frame bob: up on one beat, down on the next.
      const f = Math.sin(p.phase) > 0 ? 1 : 0;
      p.rig.y = -f * 1.1 * amp;
      p.legs[0].rotation = 0;
      p.legs[1].rotation = 0;
      p.arms[0].rotation = 0.09;
      p.arms[1].rotation = -0.09;
      p.rig.rotation = p.sleepy ? 0.07 * amp : 0;
      break;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Props. Each draws standing on the local origin, facing +x unless noted.
// ─────────────────────────────────────────────────────────────────────────────

/** A soft armchair seen from the side. `dir` is the direction the sitter faces. */
export function drawArmchair(g: Graphics, dir: 1 | -1, fabric: number): void {
  const backX = dir === 1 ? -11.5 : 6;
  g.roundRect(-11, -14, 22, 14, 3.5).fill(fabric);
  g.roundRect(backX, -30, 5.5, 20, 2.6).fill(darken(fabric, 0.18));
  g.roundRect(-8.6, -16.8, 17.2, 4.6, 2.2).fill(lighten(fabric, 0.16));
  g.roundRect(dir * 7.6 - 2.3, -19.5, 4.6, 6.5, 2.2).fill(darken(fabric, 0.08));
  g.roundRect(-10, -2.6, 20, 3, 1.4).fill({ color: PAL.ink, alpha: 0.12 });
}

/** A plain wooden waiting-room chair. */
export function drawSideChair(g: Graphics, dir: 1 | -1): void {
  const backX = dir === 1 ? -8.4 : 5.6;
  g.roundRect(backX, -27, 2.8, 16, 1.4).fill(PAL.woodDeep);
  g.roundRect(backX - 0.6, -26.5, 4, 2.6, 1.2).fill(PAL.woodDeep);
  g.roundRect(-9, -12.6, 18, 3.2, 1.5).fill(PAL.wood);
  g.roundRect(-8, -14.4, 16, 3, 1.4).fill(mix(PAL.sage, PAL.paper, 0.4));
  g.roundRect(-8, -9.6, 2.4, 9.6, 1.1).fill(PAL.woodDeep);
  g.roundRect(5.6, -9.6, 2.4, 9.6, 1.1).fill(PAL.woodDeep);
}

/** A rug, drawn flat on the floor line and centred on the origin. */
export function drawRug(g: Graphics, w: number, color: number): void {
  const h = 7;
  g.ellipse(0, -1.5, w / 2, h / 2).fill({ color, alpha: 0.85 });
  g.ellipse(0, -1.5, w / 2 - 5, h / 2 - 1.6).fill({ color: lighten(color, 0.2), alpha: 0.7 });
  g.ellipse(0, -1.5, w / 2 - 11, h / 2 - 2.6).fill({ color: darken(color, 0.12), alpha: 0.5 });
}

/** A standing lamp. The glow sprite is positioned separately at `lampHeadY`. */
export function drawFloorLamp(g: Graphics, h = 62): void {
  g.ellipse(0, -1, 7.5, 2.6).fill(PAL.woodDeep);
  g.rect(-1.1, -h, 2.2, h).fill(PAL.inkSoft);
  // Shade — a trapezoid, slightly wider at the bottom.
  g.moveTo(-6.5, -h);
  g.lineTo(6.5, -h);
  g.lineTo(9, -h + 12);
  g.lineTo(-9, -h + 12);
  g.closePath();
  g.fill(PAL.amberGlow);
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

export function drawWindowFrame(g: Graphics, x: number, y: number, w: number, h: number): void {
  g.rect(x - 3, y - 3, w + 6, h + 6).fill(PAL.paperDeep);
  g.rect(x - 3, y - 3, w + 6, h + 6).stroke({ color: PAL.inkSoft, width: 1.4, alpha: 0.55 });
  g.rect(x + w / 2 - 1, y, 2, h).fill(PAL.paperDeep);
  g.rect(x, y + h / 2 - 1, w, 2).fill(PAL.paperDeep);
  // Sill.
  g.roundRect(x - 6, y + h + 3, w + 12, 3.6, 1.4).fill(PAL.paperDeep);
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

/** The dark doorway the panel covers. */
export function drawDoorway(g: Graphics, x: number, floorY: number, w: number, h: number): void {
  g.roundRect(x, floorY - h, w, h, 2.5).fill(darken(PAL.night, 0.1));
  g.roundRect(x, floorY - h, w, h, 2.5).stroke({ color: PAL.woodDeep, width: 2 });
}

export function drawLowTable(g: Graphics, w: number): void {
  g.roundRect(-w / 2, -13, w, 3.4, 1.6).fill(PAL.wood);
  g.roundRect(-w / 2 + 3, -9.6, 2.6, 9.6, 1.2).fill(PAL.woodDeep);
  g.roundRect(w / 2 - 5.6, -9.6, 2.6, 9.6, 1.2).fill(PAL.woodDeep);
  // Magazines.
  g.roundRect(-6, -16.2, 12, 1.6, 0.8).fill(PAL.brickSoft);
  g.roundRect(-4.5, -17.6, 11, 1.6, 0.8).fill(PAL.sage);
  g.roundRect(-5.5, -19, 10, 1.6, 0.8).fill(PAL.amber);
}

export function drawCoatRack(g: Graphics, h = 56): void {
  g.ellipse(0, -1, 6, 2.2).fill(PAL.woodDeep);
  g.rect(-1.2, -h, 2.4, h).fill(PAL.woodDeep);
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
  g.roundRect(-w / 2, -h, w, h, 2.5).fill(PAL.wood);
  g.roundRect(-w / 2, -h, w, 4, 2).fill(PAL.paperDeep);
  g.roundRect(-w / 2 + 2, -h + 8, w - 4, h - 12, 2).fill({ color: PAL.woodDeep, alpha: 0.28 });
  // A little monitor and a stack of files.
  g.roundRect(-w / 2 + 7, -h - 12, 14, 10, 1.6).fill(PAL.inkSoft);
  g.roundRect(-w / 2 + 8, -h - 11, 12, 8, 1.2).fill(mix(PAL.sage, PAL.paper, 0.55));
  g.roundRect(w / 2 - 18, -h - 4, 11, 4, 1).fill(PAL.paper);
  g.roundRect(w / 2 - 17, -h - 7, 10, 3.4, 1).fill(PAL.paperWarm);
}

export function drawCoffeeMachine(g: Graphics): void {
  // Counter.
  g.roundRect(-24, -22, 48, 4, 1.6).fill(PAL.paperDeep);
  g.roundRect(-22, -18, 44, 18, 2).fill(mix(PAL.wood, PAL.paperDeep, 0.35));
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
  g.roundRect(-w / 2, -h, w, h, 4).fill(PAL.plum);
  g.roundRect(-w / 2, -h - 16, w * 0.94, 18, 4).fill(darken(PAL.plum, 0.16));
  g.roundRect(-w / 2 + 2, -h - 3.5, w / 2 - 4, 5, 2.4).fill(lighten(PAL.plum, 0.18));
  g.roundRect(2, -h - 3.5, w / 2 - 4, 5, 2.4).fill(lighten(PAL.plum, 0.18));
  g.roundRect(w / 2 - 6, -h - 10, 6, 12, 3).fill(darken(PAL.plum, 0.08));
  // Cushion.
  g.roundRect(-w / 2 + 5, -h - 12, 9, 9, 2.4).fill(PAL.amber);
}

export function drawBookshelf(g: Graphics, w: number, h: number): void {
  g.roundRect(-w / 2, -h, w, h, 2).fill(PAL.woodDeep);
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

/** Framed art for a bare wall. */
export function drawWallArt(g: Graphics, x: number, y: number, w: number, h: number, tone: number): void {
  g.roundRect(x, y, w, h, 1.6).fill(PAL.woodDeep);
  g.rect(x + 2.5, y + 2.5, w - 5, h - 5).fill(mix(tone, PAL.paper, 0.45));
  g.moveTo(x + 3, y + h - 4);
  g.lineTo(x + w * 0.4, y + h * 0.42);
  g.lineTo(x + w * 0.62, y + h - 4);
  g.closePath();
  g.fill({ color: tone, alpha: 0.75 });
  g.circle(x + w * 0.74, y + h * 0.32, h * 0.11).fill({ color: PAL.amber, alpha: 0.9 });
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

  g.moveTo(-potW / 2, -potH);
  g.lineTo(potW / 2, -potH);
  g.lineTo(potW / 2 - potW * 0.13, 0);
  g.lineTo(-potW / 2 + potW * 0.13, 0);
  g.closePath();
  g.fill(pot);
  g.roundRect(-potW / 2 - 1.2, -potH - 2.6, potW + 2.4, 3.4, 1.2).fill(darken(pot, 0.16));

  const stemH = size * 0.62 * (0.55 + growth * 0.45);
  const leaves = 3 + Math.round(growth * 3);
  for (let i = 0; i < leaves; i++) {
    const t = (i + 1) / (leaves + 1);
    const dir = i % 2 === 0 ? 1 : -1;
    const y = -potH - stemH * t;
    const len = size * (0.2 + 0.13 * (1 - t));
    g.moveTo(0, y);
    g.quadraticCurveTo(dir * len * 0.7, y - len * 0.55, dir * len, y - len * 0.9);
    g.quadraticCurveTo(dir * len * 0.35, y - len * 0.2, 0, y);
    g.closePath();
    g.fill({ color: i % 3 === 0 ? lighten(leaf, 0.12) : leaf, alpha: 0.95 });
  }
  g.moveTo(0, -potH);
  g.lineTo(0, -potH - stemH);
  g.stroke({ color: darken(leaf, 0.2), width: 1.4, cap: 'round' });
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
