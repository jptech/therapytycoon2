import { memo } from 'react';
import type { PortraitSeed } from '../sim/types';

/**
 * Layered procedural portraits: a *bust*, not a floating head. Everything below
 * is a pure function of the seed, so a client's face never changes between
 * sessions — and, because the seed only carries eight small integers, the same
 * integers get hashed several different ways to buy face shape, eye shape, brow
 * weight, nose and mouth on top of the four fields that were doing all the work
 * before. Colour alone was never going to make a hundred people.
 *
 * The frame is 64×64 clipped to r=30 at (32,32). The head lives at (32,25) and
 * is at most 15.6 tall, which leaves ~7 units of air above the crown for hair
 * and a real neck and shoulders below. The previous composition put a 27-tall
 * head in the same circle; it read as a passport photo taken from a foot away.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Palette
// ─────────────────────────────────────────────────────────────────────────────

interface Tone {
  base: string;
  /** The shadowed side, and every crease drawn on the face. */
  shade: string;
  /** Blush reads as *warmth added*, so on deep tones it has to be lighter than
   *  the skin, not darker — a rosy wash on #5f3a21 is a smudge of dirt. */
  blush: string;
  blushA: number;
  lip: string;
}

const SKINS: Tone[] = [
  { base: '#f2d3ba', shade: '#dcb094', blush: '#e08a76', blushA: 0.3, lip: '#b5604c' },
  { base: '#e8bd9a', shade: '#cf9c76', blush: '#dd8069', blushA: 0.28, lip: '#ab5744' },
  { base: '#d8a179', shade: '#bc8258', blush: '#d1755a', blushA: 0.26, lip: '#9d4e3d' },
  { base: '#c08457', shade: '#a2683f', blush: '#c8724e', blushA: 0.24, lip: '#8d452f' },
  { base: '#9d6640', shade: '#814f2e', blush: '#bb6644', blushA: 0.24, lip: '#7a3a28' },
  { base: '#7d4d2e', shade: '#643b21', blush: '#a95c3c', blushA: 0.22, lip: '#653022' },
  { base: '#5f3a21', shade: '#4a2c17', blush: '#8f5136', blushA: 0.22, lip: '#54291c' },
  { base: '#efdcc9', shade: '#d6bda5', blush: '#dd9683', blushA: 0.28, lip: '#b06a55' },
];

const HAIR_COLORS = ['#2b2119', '#4a3527', '#6d4b2e', '#9a6a3a', '#c9a26b', '#8e8e93', '#d8d3cb', '#5a3b52', '#3c5a6b'];
/** Indices in HAIR_COLORS that read as grey or white — the only age signal the
 *  component gets, since the sim never hands us a number of years. */
const GREYING = new Set([5, 6]);

const OUTFITS = ['#8faf8b', '#8b6b8f', '#c2634f', '#4d7d84', '#d3a05a', '#6b7f9e', '#a9776b', '#5f8460', '#b58aa5', '#3f6470'];

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic variety
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 0..1 from three small integers. A local copy of `hash01` from
 * src/scene/sprites.ts on purpose: importing it would drag PixiJS into every
 * panel that draws a face, and the scene is lazy-loaded for a reason.
 */
function h01(a: number, b: number, salt: number): number {
  let h = Math.imul(a | 0, 374761393);
  h = (h + Math.imul(b | 0, 668265263)) | 0;
  h = (h + Math.imul(salt | 0, 2246822519)) | 0;
  h ^= h >>> 13;
  h = Math.imul(h, 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const pick = <T,>(arr: readonly T[], a: number, b: number, salt: number): T =>
  arr[Math.floor(h01(a, b, salt) * arr.length) % arr.length];

// ─────────────────────────────────────────────────────────────────────────────
// Head geometry
// ─────────────────────────────────────────────────────────────────────────────

const HEAD_CX = 32;
const HEAD_CY = 25;
/** The head every hairstyle was authored against; real heads scale to it. */
const CANON_W = 13;
const CANON_H = 15;

interface FaceShape {
  name: string;
  /** Half-width and half-height of the skull. */
  w: number;
  h: number;
  /** 0 = the chin comes to a point, 1 = the jaw is squared off. */
  jaw: number;
  /** How far the cheekbone bows past the temple. */
  cheek: number;
}

const FACE_SHAPES: FaceShape[] = [
  { name: 'round', w: 13.2, h: 13.9, jaw: 0.62, cheek: 1.0 },
  { name: 'oval', w: 12.4, h: 15.0, jaw: 0.40, cheek: 0.5 },
  { name: 'long', w: 11.9, h: 15.6, jaw: 0.48, cheek: 0.15 },
  { name: 'square', w: 13.0, h: 14.6, jaw: 0.98, cheek: 0.6 },
  { name: 'heart', w: 12.9, h: 15.1, jaw: 0.14, cheek: 0.95 },
];

/**
 * The skull as one closed path rather than an ellipse, because an ellipse can
 * only be fat or thin — it cannot have a jaw. Chin at the bottom, up the right
 * side through the jaw corner and the cheekbone to the crown, mirrored back.
 */
function headPath(w: number, h: number, jaw: number, cheek: number): string {
  const x = (k: number) => (HEAD_CX + w * k).toFixed(2);
  const y = (k: number) => (HEAD_CY + h * k).toFixed(2);
  return (
    `M32 ${y(1)}` +
    // chin → jaw corner. `jaw` slides the first handle sideways, and that one
    // number is the whole difference between a heart-shaped chin and a blunt one.
    `C${x(0.3 + 0.5 * jaw)} ${y(0.995)} ${x(0.86 + 0.13 * jaw)} ${y(0.74 - 0.1 * jaw)} ${x(0.99)} ${y(0.28)}` +
    // jaw corner → temple, bowed out at the cheekbone.
    `C${x(1.01 + 0.05 * cheek)} ${y(0.02)} ${x(1 + 0.04 * cheek)} ${y(-0.4)} ${x(0.85)} ${y(-0.73)}` +
    `C${x(0.64)} ${y(-0.99)} ${x(0.3)} ${y(-1)} 32 ${y(-1)}` +
    `C${x(-0.3)} ${y(-1)} ${x(-0.64)} ${y(-0.99)} ${x(-0.85)} ${y(-0.73)}` +
    `C${x(-1 - 0.04 * cheek)} ${y(-0.4)} ${x(-1.01 - 0.05 * cheek)} ${y(0.02)} ${x(-0.99)} ${y(0.28)}` +
    `C${x(-0.86 - 0.13 * jaw)} ${y(0.74 - 0.1 * jaw)} ${x(-0.3 - 0.5 * jaw)} ${y(0.995)} 32 ${y(1)}Z`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hair
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every style is authored against the canonical head (centre 32,25 — half-width
 * 13, half-height 15) and then scaled onto whatever skull the seed picked, so a
 * hairline lands on the forehead of a long face and a round one alike. The old
 * set was authored against a head that no longer exists, which is why it read
 * as a swim cap floating clear of the silhouette.
 *
 * `CROWN` is the outer edge of a head of hair: the skull, a hair's breadth
 * proud of it. Most styles open with it and then draw their own hairline home.
 */
const CROWN = 'M18.4 26.5C18.4 13.6 24.2 8.6 32 8.6C39.8 8.6 45.6 13.6 45.6 26.5';

interface HairStyle {
  /** Drawn before the body: long hair falls *behind* the shoulders. */
  back?: string;
  /** Drawn over the head. */
  front: string;
  /** A lit strand, drawn only on the large sizes where it isn't a smudge. */
  shine?: string;
  /** Styles that leave the ears out in the open. */
  ears?: boolean;
  /** Stubble reads as scalp seen through hair, not as a solid helmet. */
  soft?: number;
  /** Coil texture: little stroked arcs, not dots. Dots on a smooth dome read as
   *  a beaded headband; an arc reads as a curl even at three pixels across. */
  texture?: string;
}

const HAIR: HairStyle[] = [
  // 0 — cropped: a low, rounded hairline and a clean nape. Every hairline here
  // sits around y=16, not y=14: a unit and a half higher and the forehead takes
  // over the face, which is what made the old set read as receding.
  {
    front: `${CROWN}C45.4 23 44.4 20.6 43 19.2C40.6 16.6 36.8 15.6 32 15.6C27.2 15.6 23.4 16.6 21 19.2C19.6 20.6 18.6 23 18.4 26.5Z`,
    shine: 'M23.8 14.6C26.4 11.8 29.6 10.5 33.6 10.6',
    ears: true,
  },
  // 1 — bob: the sides fall past the ear and curl in under the jaw.
  {
    front:
      'M17.4 35.8C16.4 28 17.2 18.6 20.8 13.6C23.6 9.8 27.4 8 32 8C36.6 8 40.4 9.8 43.2 13.6C46.8 18.6 47.6 28 46.6 35.8C46 38.8 43 39.6 41 37.8C43.2 32.6 43.4 24.8 41.4 20.2C39.2 23 34.6 24.2 27.8 23C24.8 22.4 22.6 24.2 21.4 27.8C20.4 31 20.8 34.8 22.6 37.8C20.6 39.6 18 38.8 17.4 35.8Z',
    shine: 'M22.6 15.8C25 12.4 28.2 10.6 32.4 10.4',
  },
  // 2 — long straight: a back curtain behind the shoulders plus two front
  // panels that frame the cheeks. Drawing the fall in one piece with the cap is
  // what made the old long styles look glued on.
  {
    back:
      'M15.4 30.2C14.4 19.6 19.6 9.4 32 9.4C44.4 9.4 49.6 19.6 48.6 30.2L49.8 52.4C50 55 45.8 55 45.6 52L44.2 30.2C44.2 21.8 39.8 18 32 18C24.2 18 19.8 21.8 19.8 30.2L18.4 52C18.2 55 14 55 14.2 52.4Z',
    // Cap and curtains are one closed silhouette, not a cap with two strips
    // glued beside the cheeks — the strips read as a chin strap every time. The
    // little V at the centre of the hairline is the part.
    front:
      'M20.4 43.4C17.6 37 17.2 30 18.4 24C18.6 13.6 24.2 8.6 32 8.6C39.8 8.6 45.4 13.6 45.6 24C46.8 30 46.4 37 43.6 43.4' +
      'C42 43.8 41 42.4 41.4 40C42.4 33.6 42.6 27.4 41.6 22.6C40.4 17.6 36.4 15.8 32.8 16.4C32.4 16.5 31.6 16.5 31.2 16.4C27.6 15.8 23.6 17.6 22.4 22.6' +
      'C21.4 27.4 21.6 33.6 22.6 40C23 42.4 22 43.8 20.4 43.4Z',
    shine: 'M23 14.8C25.6 11.8 28.8 10.4 32.6 10.4',
  },
  // 3 — coils: the silhouette itself is bumpy. Curls that keep a smooth outline
  // and get their texture from scribbles inside read as a wig.
  {
    front:
      'M17.6 27.2C16.2 24.4 16.6 21.2 18.6 19.2C18 16 20 13.2 23 12.8C23.6 9.8 26.6 7.8 29.6 8.8C31.4 6.8 34.8 6.8 36.6 8.8C39.6 7.8 42.6 9.8 43.2 12.8C46.2 13.2 48.2 16 47.6 19.2C49.6 21.2 50 24.4 48.6 27.2C47 22.6 44.4 19.4 41 17.8C36.8 15.8 27.4 15.8 23.2 17.8C19.8 19.4 17.6 22.6 17.6 27.2Z',
    texture:
      'M21.6 20.4q1.4-1.6 2.8 0M25.4 15.6q1.4-1.6 2.8 0M30.6 12.6q1.4-1.6 2.8 0M35.8 15.4q1.4-1.6 2.8 0M39.4 20.2q1.4-1.6 2.8 0M23.8 17.8q1.4-1.6 2.8 0M28 14q1.4-1.6 2.8 0M33.4 14q1.4-1.6 2.8 0M37.6 17.6q1.4-1.6 2.8 0M19.4 24.6q1.4-1.6 2.8 0M43.6 24.4q1.4-1.6 2.8 0',
  },
  // 4 — bun: pulled back, so the bun sits *behind* the skull at the crown and
  // the front is smooth with a visible parting.
  {
    back: 'M35.4 11.8a5.4 5.4 0 1 0 10.8 0 5.4 5.4 0 1 0 -10.8 0Z',
    front: `${CROWN}C45.6 22.6 44.8 20 43.2 18.4C40.6 16 36.8 15 32 15C27.2 15 23.4 16 20.8 18.4C19.2 20 18.4 22.6 18.4 26.5Z`,
    shine: 'M24.6 15C27.6 12 32 10.8 36.6 11.6',
    ears: true,
  },
  // 5 — buzz: scalp through stubble, so it is painted at part opacity. A solid
  // fill at this length always looks like a bathing cap.
  {
    front:
      'M19.4 25.8C18.8 15 24 10.4 32 10.4C40 10.4 45.2 15 44.6 25.8C44 23 43 21.4 41.6 20.4C39.2 18.4 36 17.6 32 17.6C28 17.6 24.8 18.4 22.4 20.4C21 21.4 20 23 19.4 25.8Z',
    soft: 0.9,
    ears: true,
  },
  // 6 — side part: the sweep starts high on the right and drops low on the left.
  {
    front: `${CROWN}C45.4 21.4 44.6 18.4 43 16.8C39.6 20.8 32.8 22.8 25.4 21.6C22.4 21.2 20.2 22.8 18.4 26.5Z`,
    shine: 'M40.4 17.4C36.4 20 31 21.2 25.6 20.4',
    ears: true,
  },
  // 7 — afro: volume all the way round, so the ears are inside the silhouette.
  // The outline is built from six overlapping lobes; a smooth circle with dots
  // painted on it is a swim cap, which is what the old one was.
  {
    front:
      'M32 5.6C36.2 5.6 39.6 7.2 42 9.6C45.8 10.6 48.6 13.8 48.8 17.8C50.2 20.4 50.2 23.8 48.6 26.4C48 29.8 46 32.6 43.2 34.2C44.4 31.4 44.8 28.8 44.8 26.4C44.8 18.6 39.4 14.6 32 14.6C24.6 14.6 19.2 18.6 19.2 26.4C19.2 28.8 19.6 31.4 20.8 34.2C18 32.6 16 29.8 15.4 26.4C13.8 23.8 13.8 20.4 15.2 17.8C15.4 13.8 18.2 10.6 22 9.6C24.4 7.2 27.8 5.6 32 5.6Z',
    texture:
      'M19.4 20.6q1.4-1.6 2.8 0M23 15.8q1.4-1.6 2.8 0M28.4 12.4q1.4-1.6 2.8 0M34.4 12.2q1.4-1.6 2.8 0M39.6 15.4q1.4-1.6 2.8 0M43.4 20.4q1.4-1.6 2.8 0M22.4 24.8q1.4-1.6 2.8 0M26.6 18.6q1.4-1.6 2.8 0M32 15.6q1.4-1.6 2.8 0M37.2 18.4q1.4-1.6 2.8 0M40.4 24.6q1.4-1.6 2.8 0M17.2 25.6q1.4-1.6 2.8 0M45.6 25.6q1.4-1.6 2.8 0',
  },
  // 8 — locs: a cap with weighted ropes. They hang behind the shoulders; two
  // shorter ones come forward past the jaw so the face stays framed.
  {
    // The back ropes stay inside the skull's outline so the head hides them at
    // eye level and they reappear below the jaw. Any that stray past the
    // silhouette double up with the front pair and the whole head reads as a
    // beaded curtain.
    back:
      'M19.6 24.6h3.2v24.6a1.6 1.6 0 0 1-3.2 0Z M23.8 26.6h3.2v20.8a1.6 1.6 0 0 1-3.2 0Z M27.8 27.6h3.2v23a1.6 1.6 0 0 1-3.2 0Z M33.4 27.6h3.2v21a1.6 1.6 0 0 1-3.2 0Z M37.4 26.6h3.2v24a1.6 1.6 0 0 1-3.2 0Z M41.4 24.6h3.2v20.6a1.6 1.6 0 0 1-3.2 0Z',
    // The two that come forward taper and splay. Parallel-sided bars down the
    // cheeks were reading as a chin strap, not as hair with weight in it.
    front:
      `${CROWN}C45.4 22.6 44.6 20 43 18.4C40.4 15.8 36.6 14.8 32 14.8C27.4 14.8 23.6 15.8 21 18.4C19.4 20 18.6 22.6 18.4 26.5Z` +
      'M16.4 22.6C15.6 27.6 15.4 33 16 38a1.75 1.75 0 0 0 3.4-0.4C18.6 32.8 18.8 27.8 19.4 22.6Z' +
      'M47.6 22.6C48.4 27.6 48.6 33 48 38a1.75 1.75 0 0 1-3.4-0.4C45.4 32.8 45.2 27.8 44.6 22.6Z',
    shine: 'M24 15.8C26.8 12.8 30.4 11.4 34.4 11.6',
  },
  // 9 — pixie: short, with a wisp escaping at one temple. The asymmetry is the
  // whole style; a symmetrical pixie is just a cropped cut.
  {
    front:
      'M18.6 26.5C18 15.4 23.6 8.6 32 8.6C40.4 8.6 46 15.4 45.4 26.5C44.8 23 44 20.6 42.6 19.2C41.2 22.4 37.4 23.8 32.6 23.2C29.2 22.8 25.8 21.6 23.4 20C21.6 21.2 20.2 23 18.6 26.5Z' +
      'M20.4 19.4C19 22 18.4 25.4 18.8 29.4C17.4 28.2 16.6 25.4 17 22.6C17.3 20.4 18.5 19.2 20.4 19.4Z',
    shine: 'M25 14.2C27.8 11.6 31.4 10.6 35.4 11',
    ears: true,
  },
  // 10 — ponytail: gathered high at the back right, so the tail leaves the skull
  // where the hand would hold it rather than floating beside the ear.
  {
    back: 'M42.4 17.2C51.4 19 56 27.6 54.2 37.4C53.2 43.4 50 46.8 47 45.8C49.8 38.4 48.6 24 42.4 17.2Z',
    front:
      `${CROWN}C45.6 22.6 44.6 19.8 42.8 18C40.2 15.6 36.6 14.6 32 14.6C27.4 14.6 23.6 16 21 18.8C19.4 20.4 18.6 23 18.4 26.5Z` +
      // the tie, so the tail is gathered rather than growing out of the skull
      'M42 16.4a2.6 2.6 0 1 0 5.2 0 2.6 2.6 0 1 0 -5.2 0Z',
    shine: 'M23.4 16.2C26.6 12.8 31.6 11.2 37 12',
    ears: true,
  },
  // 11 — wavy, shoulder length: the wave lives in the outline, not in stripes
  // drawn on top of a straight fall.
  {
    back:
      'M15.6 30C14.6 19.8 19.8 9.6 32 9.6C44.2 9.6 49.4 19.8 48.4 30C49.6 34 48.2 38 49 42.4C49.6 46.4 48.6 49.6 46 51C44.2 48 44.8 44 44 40.4C43 36.6 44.4 33 44 29.6C43.4 21.8 39.6 18.2 32 18.2C24.4 18.2 20.6 21.8 20 29.6C19.6 33 21 36.6 20 40.4C19.2 44 19.8 48 18 51C15.4 49.6 14.4 46.4 15 42.4C15.8 38 14.4 34 15.6 30Z',
    front:
      'M21.4 42C18.6 38.2 17.2 33.6 18 28.4C17.4 23.8 17.6 19.4 19.4 15.6C21.8 10.8 26.4 8.4 32 8.4C37.6 8.4 42.2 10.8 44.6 15.6C46.4 19.4 46.6 23.8 46 28.4C46.8 33.6 45.4 38.2 42.6 42' +
      'C40.8 42.6 39.6 41.2 40.2 39C41.8 33.4 42.4 27.6 41.4 22.4C40.2 17.6 36 15.8 32.6 16.4C32.3 16.5 31.7 16.5 31.4 16.4C28 15.8 23.8 17.6 22.6 22.4C21.6 27.6 22.2 33.4 23.8 39C24.4 41.2 23.2 42.6 21.4 42Z',
    shine: 'M22.8 15.4C25.4 12.2 28.8 10.6 32.8 10.6',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Clothes and accessories
// ─────────────────────────────────────────────────────────────────────────────

/** `seed.outfit` was unused before; it decides what the collar does. */
type Collar = 'crew' | 'vee' | 'button' | 'cardigan' | 'turtleneck' | 'kerchief' | 'shawl';
const COLLARS: Collar[] = ['crew', 'vee', 'button', 'cardigan', 'turtleneck', 'kerchief', 'shawl'];

/**
 * Nine accessories, no nulls-with-a-comment and no sentinel strings pretending
 * to be path data. Quiet things a person actually wears — nothing here should
 * read as a costume on the fortieth client card.
 */
type Accessory =
  | 'none'
  | 'glasses'
  | 'roundGlasses'
  | 'earrings'
  | 'freckles'
  | 'beautySpot'
  | 'noseStud'
  | 'hearingAid'
  | 'headscarf';

const ACCESSORIES: Accessory[] = [
  'none',
  'glasses',
  'roundGlasses',
  'earrings',
  'freckles',
  'beautySpot',
  'noseStud',
  'hearingAid',
  'headscarf',
];

/** A headscarf wraps the whole skull, so it is drawn in the hair's frame. */
const HEADSCARF =
  'M17.8 33.4C16.6 21.4 21.8 8 32 8C42.2 8 47.4 21.4 46.2 33.4C45.6 37.4 43.6 40.4 41.4 41.4C43.6 36 44 29 42.4 23.8C41 19.6 37.2 17.2 32 17.2C26.8 17.2 23 19.6 21.6 23.8C20 29 20.4 36 22.6 41.4C20.4 40.4 18.4 37.4 17.8 33.4Z';

// ─────────────────────────────────────────────────────────────────────────────
// Mood
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brows carry mood, not the mouth: at 22px the mouth is three pixels of stroke
 * and a smile and a frown are the same three pixels, but a brow that tilts is
 * legible as long as anything is. Offsets are inner / middle / outer, plus a
 * lift applied to the whole brow.
 */
const BROW_MOOD: Record<string, { lift: number; inner: number; mid: number; outer: number }> = {
  neutral: { lift: 0, inner: 0.4, mid: -1.0, outer: 0.2 },
  happy: { lift: -0.8, inner: 0.2, mid: -1.8, outer: -0.4 },
  sad: { lift: -0.4, inner: -1.6, mid: -0.2, outer: 1.8 },
  tired: { lift: 1.0, inner: 0.9, mid: 0.5, outer: 1.6 },
};

export interface PortraitProps {
  seed: PortraitSeed;
  size?: number;
  /** Draws a soft lamplit ring behind the bust. */
  glow?: boolean;
  className?: string;
  /** Slight downward tilt used for sleepy / low-energy states. */
  mood?: 'neutral' | 'happy' | 'tired' | 'sad';
  title?: string;
}

function PortraitImpl({ seed, size = 48, glow = false, className = '', mood = 'neutral', title }: PortraitProps) {
  const tone = SKINS[seed.skin % SKINS.length];
  const hairIdx = seed.hairColor % HAIR_COLORS.length;
  const hairColor = HAIR_COLORS[hairIdx];
  const style = HAIR[seed.hair % HAIR.length];
  const outfit = OUTFITS[seed.outfitColor % OUTFITS.length];
  const collar = COLLARS[seed.outfit % COLLARS.length];
  const accessory = ACCESSORIES[seed.accessory % ACCESSORIES.length];

  /**
   * `id` used to be the seed's digits concatenated, so (skin 1, hair 12) and
   * (skin 11, hair 2) minted the same string and two different people shared one
   * clipPath and one gradient — whichever mounted first won, and the other
   * inherited its background. Separators fix the ambiguity; every field goes in
   * because the five that used to be here were not enough to be unique anyway.
   */
  const id = `p${seed.skin}-${seed.hair}-${seed.hairColor}-${seed.face}-${seed.accessory}-${seed.outfit}-${seed.outfitColor}-${seed.hue}`;

  /**
   * Detail level. A nose is two thirds of a pixel wide at 24px and reads as
   * grit on the screen; a smile line is worse. Everything structural is drawn
   * at every size, and only the marks that need room are gated here.
   */
  const fine = size >= 38;

  const shape = pick(FACE_SHAPES, seed.face, seed.hue, 11);
  const w = shape.w;
  const h = shape.h;
  const chin = HEAD_CY + h;
  const headD = headPath(w, h, shape.jaw, shape.cheek);

  // Hair was authored on a 13×15 skull; put it on this one.
  const hairT = `translate(32 ${HEAD_CY}) scale(${(w / CANON_W).toFixed(3)} ${(h / CANON_H).toFixed(3)}) translate(-32 ${-HEAD_CY})`;

  const greying = GREYING.has(hairIdx);
  /** Whether this head of hair actually leaves the ear in the open. */
  const earsShow = accessory !== 'headscarf' && (style.ears ?? false);
  const eyeY = HEAD_CY + h * 0.1;
  const noseY = HEAD_CY + h * 0.44;
  const mouthY = HEAD_CY + h * 0.68;
  const eyeDX = w * (0.36 + 0.08 * h01(seed.face, seed.hue, 21));
  const eyeRx = 1.75 + 0.5 * h01(seed.hue, seed.skin, 22);
  const eyeRy = eyeRx * (0.82 + 0.4 * h01(seed.hue, seed.hair, 23));
  const lashes = h01(seed.hue, seed.accessory, 24) < 0.42;
  const noseKind = pick(['button', 'straight', 'wide', 'aquiline'] as const, seed.face, seed.hue, 25);
  const mouthW = 5.4 + 2.8 * h01(seed.hue, seed.outfitColor, 26);
  const lip = 1.25 + 0.65 * h01(seed.hue, seed.face, 27);
  // A brow lightens and thins with age; the greying entries get the softer one.
  const browW = (greying ? 1.15 : 1.4) + 0.5 * h01(seed.hue, seed.hairColor, 28);
  const browTilt = -0.5 + 1.3 * h01(seed.hue, seed.skin, 29);
  const blushDrop = h * 0.26 + 1.4 * h01(seed.hue, seed.face, 30);
  const earY = eyeY + 1.9;
  // Just proud of the silhouette. Any further and they read as two lumps parked
  // beside the head, which is exactly what the old ones did at 32 ± faceW.
  const earX = w * 0.95;

  const m = BROW_MOOD[mood] ?? BROW_MOOD.neutral;
  const browY = eyeY - 3.6 + m.lift;
  const browColor = greying
    ? `color-mix(in oklab, ${hairColor} 62%, ${tone.shade})`
    : `color-mix(in oklab, ${hairColor} 86%, ${tone.shade})`;
  const hairLit = `color-mix(in oklab, ${hairColor} 74%, #fff)`;
  const hairDark = `color-mix(in oklab, ${hairColor} 84%, #16292c)`;
  const scarfColor = `color-mix(in oklab, ${outfit} 78%, #faf5ec)`;

  const wall = `hsl(${seed.hue} 40% 86%)`;
  const floor = `hsl(${(seed.hue + 24) % 360} 26% 66%)`;

  const eye = (sx: 1 | -1) => {
    const cx = 32 + sx * eyeDX;
    if (mood === 'tired') {
      return (
        <g key={sx}>
          <path
            d={`M${cx - eyeRx - 0.5} ${eyeY - 0.5}q${eyeRx + 0.5} ${eyeRy + 1.1} ${2 * eyeRx + 1} 0`}
            stroke="#241c16"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          {fine ? (
            <path
              d={`M${cx - eyeRx} ${eyeY + eyeRy + 1.5}q${eyeRx} ${0.9} ${2 * eyeRx} 0`}
              stroke={tone.shade}
              strokeWidth="0.9"
              fill="none"
              strokeLinecap="round"
              opacity="0.55"
            />
          ) : null}
        </g>
      );
    }
    return (
      <g key={sx}>
        <ellipse cx={cx} cy={eyeY} rx={eyeRx} ry={eyeRy} fill="#241c16" />
        <circle cx={cx + 0.62} cy={eyeY - eyeRy * 0.4} r="0.58" fill="#fff" opacity="0.9" />
        {lashes ? (
          <path
            d={`M${cx - eyeRx - 0.9} ${eyeY - eyeRy * 0.42}q${eyeRx + 0.9} ${-eyeRy * 0.98} ${2 * eyeRx + 1.8} ${eyeRy * 0.3}`}
            stroke="#241c16"
            strokeWidth="1.1"
            fill="none"
            strokeLinecap="round"
          />
        ) : null}
        {/* A real smile closes the lower lid — without it "happy" is only a mouth. */}
        {mood === 'happy' ? (
          <path
            d={`M${cx - eyeRx - 0.3} ${eyeY + eyeRy + 0.9}q${eyeRx + 0.3} ${-1.1} ${2 * eyeRx + 0.6} 0`}
            stroke={tone.shade}
            strokeWidth="0.95"
            fill="none"
            strokeLinecap="round"
            opacity="0.7"
          />
        ) : null}
      </g>
    );
  };

  const brow = (sx: 1 | -1) => {
    const inner = 32 + sx * (eyeDX - eyeRx - 0.4);
    const outer = 32 + sx * (eyeDX + eyeRx + 2.1);
    const mid = (inner + outer) / 2;
    return (
      <path
        key={sx}
        d={`M${inner} ${browY + m.inner}Q${mid} ${browY + m.mid} ${outer} ${browY + m.outer + browTilt}`}
        stroke={browColor}
        strokeWidth={browW}
        fill="none"
        strokeLinecap="round"
        opacity={greying ? 0.72 : 0.95}
      />
    );
  };

  // Noses stay short and low. Anything that reaches up toward the brow reads at
  // card size as a scratch across the cheek rather than a feature.
  const nose =
    noseKind === 'button'
      ? `M${32 - 1.1} ${noseY - 0.9}q1.1 1.6 2.2 0`
      : noseKind === 'straight'
        ? `M${32 - 0.5} ${noseY - 2.3}q-0.5 1.8 0.4 2.4q0.9 0.6 1.9 -0.3`
        : noseKind === 'wide'
          ? `M${32 - 1.75} ${noseY - 1}q1.75 2 3.5 0`
          : `M${32 - 0.6} ${noseY - 2.6}q1 1.9 1.5 2.5q0.5 0.7 -1.5 1.1`;

  const mx = 32 - mouthW / 2;
  const mouth =
    mood === 'happy'
      ? `M${mx} ${mouthY - 0.7}q${mouthW / 2} ${mouthW * 0.44} ${mouthW} 0`
      : mood === 'sad'
        ? `M${mx} ${mouthY + 1.1}q${mouthW / 2} ${-mouthW * 0.3} ${mouthW} 0`
        : mood === 'tired'
          ? `M${mx + 0.5} ${mouthY}q${mouthW / 2} ${mouthW * 0.08} ${mouthW - 1} ${-0.5}`
          : `M${mx} ${mouthY}q${mouthW / 2} ${mouthW * 0.22} ${mouthW} 0`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id={`clip-${id}`}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
        <clipPath id={`head-${id}`}>
          <path d={headD} />
        </clipPath>
        <radialGradient id={`bg-${id}`} cx="34%" cy="20%" r="82%">
          <stop offset="0%" stopColor={wall} />
          <stop offset="58%" stopColor={`hsl(${(seed.hue + 16) % 360} 34% 79%)`} />
          <stop offset="100%" stopColor={`hsl(${(seed.hue + 30) % 360} 28% 68%)`} />
        </radialGradient>
        {/* The lamp is up and to the left of everything in this game. */}
        <radialGradient id={`lamp-${id}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f6d79b" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#f6d79b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`vig-${id}`} cx="38%" cy="30%" r="74%">
          <stop offset="58%" stopColor="#16292c" stopOpacity="0" />
          <stop offset="100%" stopColor="#16292c" stopOpacity="0.2" />
        </radialGradient>
        {glow ? (
          // Light, not a coloured disc: nothing at all through the middle, a warm
          // rim where the figure's edge would catch it, gone again by the border.
          <radialGradient id={`glow-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="60%" stopColor="#f6d79b" stopOpacity="0" />
            <stop offset="86%" stopColor="#f6d79b" stopOpacity="0.6" />
            <stop offset="95%" stopColor="#e8a94c" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#e8a94c" stopOpacity="0" />
          </radialGradient>
        ) : null}
      </defs>

      {glow ? <circle cx="32" cy="32" r="32" fill={`url(#glow-${id})`} /> : null}
      <circle cx="32" cy="32" r="30" fill={`url(#bg-${id})`} />

      <g clipPath={`url(#clip-${id})`}>
        {/* The room: a wall, a floor, and a baseboard catching the lamp. Two
            flat bands would be a swatch; the horizon is what says "interior".
            It sits just above the shoulders so only the corners of it show —
            any higher and it draws a line straight through the face. */}
        <path d="M0 46.6H64V64H0Z" fill={floor} opacity="0.85" />
        <path d="M0 46.2H64V47.1H0Z" fill="#faf5ec" opacity="0.26" />
        <ellipse cx="17" cy="15" rx="30" ry="26" fill={`url(#lamp-${id})`} />
        {/* The figure's shadow on the wall: the head's own outline, nudged down
            and right. An offset ellipse was cheaper and read as a stain — a cast
            shadow has to be the shape of the thing casting it or it is a smudge. */}
        <path d={headD} transform="translate(2.2 1.8)" fill="#16292c" opacity="0.075" />

        {/* hair, back layer — long styles fall behind the shoulders */}
        {style.back && accessory !== 'headscarf' ? <path transform={hairT} d={style.back} fill={hairDark} /> : null}

        {/* neck: drawn before the body so the collar sits on top of it. A neck
            is about three quarters the width of the jaw and barely two thirds
            of it ever shows — a narrow column with five units of daylight
            around it is a lamp stand, not a person. */}
        <path
          d={`M${32 - w * 0.4} ${chin - h * 0.42}h${w * 0.8}v${48 - (chin - h * 0.42)}h${-w * 0.8}Z`}
          fill={tone.base}
        />
        {/* the jaw's shadow on the throat — the single mark that turns a head
            and a rectangle into a head *on* a neck */}
        <path
          d={`M${32 - w * 0.4} ${chin - h * 0.42}q${w * 0.4} ${5.4} ${w * 0.8} 0v3.4h${-w * 0.8}Z`}
          fill={tone.shade}
          opacity="0.62"
        />

        {/* body: shoulders that reach the sides of the frame. The dome this
            replaced read as a hill the head was standing on. */}
        <path d="M0 64C1 52.4 12.4 45.2 32 45.2C51.6 45.2 63 52.4 64 64Z" fill={outfit} />
        {/* lit shoulder line, and the far shoulder falling away from the lamp */}
        <path
          d="M2.4 62C3.8 52.8 15 46.6 32 46.6C49 46.6 60.2 52.8 61.6 62"
          fill="none"
          stroke={`color-mix(in oklab, ${outfit} 62%, #fff)`}
          strokeWidth="1.5"
          opacity="0.5"
        />
        <path d="M40 46.8C51.6 49.2 60.8 55 63.2 64H45Z" fill="#16292c" opacity="0.1" />
        {/* the head's shadow on the chest */}
        <ellipse cx="32" cy="47.4" rx={w * 0.86} ry="3.4" fill="#16292c" opacity="0.16" />

        <Neckline kind={collar} outfit={outfit} tone={tone} hue={seed.hue} w={w} fine={fine} />

        {/* ears, behind the head so only the outer edge shows: tucked into the
            silhouette instead of sitting beside it as two lumps */}
        <ellipse cx={32 - earX} cy={earY} rx="1.75" ry="2.5" fill={tone.base} transform={`rotate(9 ${32 - earX} ${earY})`} />
        <ellipse cx={32 + earX} cy={earY} rx="1.75" ry="2.5" fill={tone.base} transform={`rotate(-9 ${32 + earX} ${earY})`} />

        {/* head */}
        <path d={headD} fill={tone.base} />
        <g clipPath={`url(#head-${id})`}>
          {/* the terminator runs down the far side of the nose and under the
              cheekbone; a plain offset ellipse puts a vertical stripe on the face */}
          <path
            d={`M${32 + w * 0.34} ${HEAD_CY - h * 1.1}C${32 + w * 0.56} ${HEAD_CY - h * 0.4} ${32 + w * 0.36} ${HEAD_CY + h * 0.34} ${32 + w * 0.7} ${chin + 2}L${32 + w * 1.6} ${chin + 2}L${32 + w * 1.6} ${HEAD_CY - h * 1.1}Z`}
            fill={tone.shade}
            opacity="0.28"
          />
          <ellipse cx={32 - w * 0.36} cy={HEAD_CY - h * 0.46} rx={w * 0.5} ry={h * 0.36} fill="#fff" opacity="0.09" />
          {/* rim on the lit edge */}
          <path
            d={`M${32 - w * 0.99} ${HEAD_CY + h * 0.22}C${32 - w * 1.04} ${HEAD_CY - h * 0.3} ${32 - w * 0.84} ${HEAD_CY - h * 0.82} ${32 - w * 0.32} ${HEAD_CY - h * 1.0}`}
            stroke="#fff"
            strokeWidth="1.7"
            fill="none"
            strokeLinecap="round"
            opacity="0.17"
          />
        </g>
        {/* The ear's inner fold, drawn after the head so it lands on the sliver
            that shows rather than under it — and only for the styles that leave
            the ear out, because a skin-toned crease painted over a bob is a
            scratch on the picture. */}
        {earsShow ? (
          <>
            <path
              d={`M${32 - earX - 1.15} ${earY - 0.9}q-0.55 0.9 0.15 1.9`}
              stroke={tone.shade}
              strokeWidth="0.75"
              fill="none"
              strokeLinecap="round"
              opacity="0.6"
            />
            <path
              d={`M${32 + earX + 1.15} ${earY - 0.9}q0.55 0.9 -0.15 1.9`}
              stroke={tone.shade}
              strokeWidth="0.75"
              fill="none"
              strokeLinecap="round"
              opacity="0.6"
            />
          </>
        ) : null}

        {/* blush, warmed by tone rather than the same rose on all eight */}
        <ellipse
          cx={32 - w * 0.6}
          cy={eyeY + blushDrop}
          rx="2.9"
          ry="1.7"
          fill={tone.blush}
          opacity={tone.blushA + (mood === 'happy' ? 0.07 : 0)}
        />
        <ellipse
          cx={32 + w * 0.6}
          cy={eyeY + blushDrop}
          rx="2.9"
          ry="1.7"
          fill={tone.blush}
          opacity={tone.blushA + (mood === 'happy' ? 0.07 : 0)}
        />

        {[brow(-1), brow(1)]}
        {[eye(-1), eye(1)]}

        <path d={nose} stroke={tone.shade} strokeWidth="1.05" fill="none" strokeLinecap="round" opacity="0.72" />
        {fine && noseKind === 'wide' ? (
          <g fill={tone.shade} opacity="0.5">
            <circle cx={32 - 2.1} cy={noseY - 0.5} r="0.42" />
            <circle cx={32 + 2.1} cy={noseY - 0.5} r="0.42" />
          </g>
        ) : null}

        <path d={mouth} stroke={tone.lip} strokeWidth={lip} fill="none" strokeLinecap="round" />
        {fine && lip > 1.65 ? (
          <path
            d={`M${mx + 1.2} ${mouthY + lip + 0.9}q${mouthW / 2 - 1.2} ${0.7} ${mouthW - 2.4} 0`}
            stroke="#fff"
            strokeWidth="0.7"
            fill="none"
            strokeLinecap="round"
            opacity="0.22"
          />
        ) : null}

        {/* Age, as far as we can tell it: the greying entries get the crease a
            face earns from smiling for forty years. Never a wrinkle *pattern* —
            one line per side, and only where there is room to draw it. */}
        {fine && greying ? (
          <g stroke={tone.shade} strokeWidth="0.8" fill="none" strokeLinecap="round" opacity="0.38">
            <path d={`M${32 - w * 0.4} ${noseY + 0.8}q-1.1 2.4 -0.2 3.6`} />
            <path d={`M${32 + w * 0.4} ${noseY + 0.8}q1.1 2.4 0.2 3.6`} />
          </g>
        ) : null}

        {/* hair, front layer */}
        {accessory === 'headscarf' ? null : (
          <g transform={hairT}>
            <path d={style.front} fill={hairColor} opacity={style.soft ?? 1} />
            {style.texture ? (
              <path
                d={style.texture}
                stroke={hairDark}
                strokeWidth="1.15"
                fill="none"
                strokeLinecap="round"
                opacity="0.3"
              />
            ) : null}
            {fine && style.shine ? (
              <path d={style.shine} stroke={hairLit} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.55" />
            ) : null}
          </g>
        )}

        <Extra
          kind={accessory}
          eyeY={eyeY}
          eyeDX={eyeDX}
          earX={earX}
          earY={earY}
          noseY={noseY}
          mouthY={mouthY}
          w={w}
          tone={tone}
          hairT={hairT}
          scarf={scarfColor}
          hue={seed.hue}
          fine={fine}
        />

        {/* vignette: the far side of the frame falls away from the lamp. A fat
            ring stroke was doing this job and left a hard inner edge that made
            the whole thing look like a glass badge. */}
        <circle cx="32" cy="32" r="30" fill={`url(#vig-${id})`} />
      </g>

      <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(30,58,58,0.2)" strokeWidth="1.3" />
      {/* the frame itself catches the lamp on its upper-left arc */}
      <path
        d="M10.8 53.2A30 30 0 0 1 10.8 10.8"
        fill="none"
        stroke="#fffcf4"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.26"
      />
    </svg>
  );
}

export const Portrait = memo(PortraitImpl);

// ─────────────────────────────────────────────────────────────────────────────
// Collars
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The neckline is where a bust stops being a mannequin. Seven of them, keyed off
 * the seed field that used to go unread, and all of them drawn *after* the body
 * so the collar overlaps the throat the way cloth does.
 */
function Neckline({
  kind,
  outfit,
  tone,
  hue,
  w,
  fine,
}: {
  kind: Collar;
  outfit: string;
  tone: Tone;
  hue: number;
  w: number;
  fine: boolean;
}) {
  const light = `color-mix(in oklab, ${outfit} 58%, #fff)`;
  const dark = `color-mix(in oklab, ${outfit} 76%, #16292c)`;
  const nw = w * 0.4;

  switch (kind) {
    case 'vee':
      // Shallow. A V that reaches y=56 is a plunging neckline on a client card.
      return (
        <>
          {/* the opening starts at exactly the width of the throat, or the
              corners flare past it and the whole thing reads as a bow tie */}
          <path d={`M${32 - nw} 44.6L32 49.8L${32 + nw} 44.6Z`} fill={tone.base} />
          <path d={`M${32 - nw} 45.4q${nw} 2.2 ${2 * nw} 0`} fill={tone.shade} opacity="0.42" />
          <path d={`M${32 - nw - 0.5} 44.8L32 50.4L${32 + nw + 0.5} 44.8`} fill="none" stroke={dark} strokeWidth="1.2" opacity="0.5" strokeLinejoin="round" />
        </>
      );
    case 'button':
      // An open collar: two points meeting at the throat, a placket between them
      // and buttons down it. Two loose triangles read as folded paper.
      return (
        <>
          <path d={`M${32 - nw - 0.4} 45.4L${32 - 1.2} 52.6L${32 - nw - 5.4} 49.2Z`} fill={light} opacity="0.95" />
          <path d={`M${32 + nw + 0.4} 45.4L${32 + 1.2} 52.6L${32 + nw + 5.4} 49.2Z`} fill={light} opacity="0.7" />
          <path d={`M${32 - nw - 0.4} 45.4L${32 - 1.2} 52.6M${32 + nw + 0.4} 45.4L${32 + 1.2} 52.6`} stroke={dark} strokeWidth="0.9" fill="none" opacity="0.45" />
          <path d="M32 52.2V64" stroke={dark} strokeWidth="1" opacity="0.45" />
          {fine ? (
            <>
              <circle cx="32" cy="56" r="0.75" fill={dark} opacity="0.75" />
              <circle cx="32" cy="60.6" r="0.75" fill={dark} opacity="0.75" />
            </>
          ) : null}
        </>
      );
    case 'cardigan':
      // Everything below y≈58 is outside the clip circle, so the lapels have to
      // say what they are in the twelve units between the collarbone and the rim.
      return (
        <>
          <path d={`M${32 - nw - 0.8} 45.6C${32 - 5.6} 50 ${32 - 5.2} 55.4 ${32 - 5.6} 62H${32 - 13}C${32 - 13.4} 53.8 ${32 - 10.4} 48.4 ${32 - nw - 0.8} 45.6Z`} fill={dark} opacity="0.62" />
          <path d={`M${32 + nw + 0.8} 45.6C${32 + 5.6} 50 ${32 + 5.2} 55.4 ${32 + 5.6} 62H${32 + 13}C${32 + 13.4} 53.8 ${32 + 10.4} 48.4 ${32 + nw + 0.8} 45.6Z`} fill={dark} opacity="0.62" />
          <path d={`M${32 - 5.6} 62C${32 - 5.2} 55.4 ${32 - 5.6} 50 ${32 - nw - 0.8} 45.6H${32 + nw + 0.8}C${32 + 5.6} 50 ${32 + 5.2} 55.4 ${32 + 5.6} 62Z`} fill={light} opacity="0.85" />
        </>
      );
    case 'turtleneck':
      return (
        <>
          <path d={`M${32 - nw - 1.4} 42.4h${2 * nw + 2.8}v5.4q${-nw - 1.4} 2.6 ${-2 * nw - 2.8} 0Z`} fill={outfit} />
          <path d={`M${32 - nw - 1.4} 44.4q${nw + 1.4} 2.4 ${2 * nw + 2.8} 0`} fill="none" stroke={dark} strokeWidth="0.9" opacity="0.45" />
          <path d={`M${32 - nw - 1.4} 43q${nw + 1.4} 2.2 ${2 * nw + 2.8} 0`} fill="none" stroke={light} strokeWidth="0.9" opacity="0.5" />
        </>
      );
    case 'kerchief':
      return (
        <>
          <path
            d={`M${32 - nw - 3.4} 46.4q${nw + 3.4} 5 ${2 * nw + 6.8} 0l1.8 3.4q${-nw - 4.4} 5.6 ${-2 * nw - 8.8} 0Z`}
            fill={`hsl(${(hue + 180) % 360} 44% 62%)`}
          />
          <path d="M32 52.2l-2 6 4 0Z" fill={`hsl(${(hue + 180) % 360} 44% 52%)`} />
        </>
      );
    case 'shawl':
      return (
        <>
          <path d={`M${32 - nw - 1.4} 45.6C${32 - 12} 47.6 ${32 - 17} 53.4 ${32 - 18.6} 62H${32 - 8.6}C${32 - 8} 54.4 ${32 - 5.4} 49.6 32 48.2Z`} fill={light} opacity="0.86" />
          <path d={`M${32 + nw + 1.4} 45.6C${32 + 12} 47.6 ${32 + 17} 53.4 ${32 + 18.6} 62H${32 + 8.6}C${32 + 8} 54.4 ${32 + 5.4} 49.6 32 48.2Z`} fill={dark} opacity="0.6" />
        </>
      );
    case 'crew':
    default:
      return (
        <>
          <path d={`M${32 - nw - 2.6} 46.2q${nw + 2.6} 4.2 ${2 * nw + 5.2} 0l0.8 2.3q${-nw - 3} 4.8 ${-2 * nw - 6.8} 0Z`} fill={light} opacity="0.8" />
          {/* the ribbing's lower edge — without it the band floats */}
          <path d={`M${32 - nw - 3.4} 48.5q${nw + 3.4} 4.8 ${2 * nw + 6.8} 0`} fill="none" stroke={dark} strokeWidth="0.9" opacity="0.42" />
        </>
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Accessories
// ─────────────────────────────────────────────────────────────────────────────

function Extra({
  kind,
  eyeY,
  eyeDX,
  earX,
  earY,
  noseY,
  mouthY,
  w,
  tone,
  hairT,
  scarf,
  hue,
  fine,
}: {
  kind: Accessory;
  eyeY: number;
  eyeDX: number;
  earX: number;
  earY: number;
  noseY: number;
  mouthY: number;
  w: number;
  tone: Tone;
  hairT: string;
  scarf: string;
  hue: number;
  fine: boolean;
}) {
  const lens = 3.5 + eyeDX * 0.18;
  switch (kind) {
    case 'glasses':
      // Rectangular frames: lenses that hold a little light, and arms that go
      // somewhere. Floating rounded rectangles read as a mask.
      return (
        <g>
          <rect x={32 - eyeDX - lens} y={eyeY - lens * 0.72} width={lens * 2} height={lens * 1.44} rx="1.4" fill="#fffdf6" opacity="0.14" />
          <rect x={32 + eyeDX - lens} y={eyeY - lens * 0.72} width={lens * 2} height={lens * 1.44} rx="1.4" fill="#fffdf6" opacity="0.14" />
          <g stroke="#33534f" strokeWidth="1.2" fill="none" opacity="0.88" strokeLinecap="round">
            <rect x={32 - eyeDX - lens} y={eyeY - lens * 0.72} width={lens * 2} height={lens * 1.44} rx="1.4" />
            <rect x={32 + eyeDX - lens} y={eyeY - lens * 0.72} width={lens * 2} height={lens * 1.44} rx="1.4" />
            <path d={`M${32 - eyeDX + lens} ${eyeY - 0.4}h${2 * eyeDX - 2 * lens}`} />
            <path d={`M${32 - eyeDX - lens} ${eyeY - 0.6}L${32 - earX} ${earY - 1.4}`} />
            <path d={`M${32 + eyeDX + lens} ${eyeY - 0.6}L${32 + earX} ${earY - 1.4}`} />
          </g>
          {fine ? (
            <path
              d={`M${32 - eyeDX - lens + 1} ${eyeY + lens * 0.5}l${lens * 0.9} ${-lens}`}
              stroke="#fffdf6"
              strokeWidth="1"
              opacity="0.5"
              strokeLinecap="round"
            />
          ) : null}
        </g>
      );
    case 'roundGlasses':
      return (
        <g>
          <circle cx={32 - eyeDX} cy={eyeY} r={lens} fill="#fffdf6" opacity="0.14" />
          <circle cx={32 + eyeDX} cy={eyeY} r={lens} fill="#fffdf6" opacity="0.14" />
          <g stroke="#33534f" strokeWidth="1.2" fill="none" opacity="0.88" strokeLinecap="round">
            <circle cx={32 - eyeDX} cy={eyeY} r={lens} />
            <circle cx={32 + eyeDX} cy={eyeY} r={lens} />
            <path d={`M${32 - eyeDX + lens} ${eyeY - 0.5}q${eyeDX - lens} ${-1} ${2 * (eyeDX - lens)} 0`} />
            <path d={`M${32 - eyeDX - lens} ${eyeY - 0.6}L${32 - earX} ${earY - 1.4}`} />
            <path d={`M${32 + eyeDX + lens} ${eyeY - 0.6}L${32 + earX} ${earY - 1.4}`} />
          </g>
          {fine ? (
            <path
              d={`M${32 - eyeDX - lens * 0.6} ${eyeY + lens * 0.5}l${lens * 0.7} ${-lens}`}
              stroke="#fffdf6"
              strokeWidth="1"
              opacity="0.5"
              strokeLinecap="round"
            />
          ) : null}
        </g>
      );
    case 'earrings':
      // Drawn after the hair on purpose: an earring the fringe swallows is a
      // detail nobody ever sees.
      return (
        <g>
          <circle cx={32 - earX - 0.2} cy={earY + 2.6} r="1.3" fill="#e8a94c" />
          <circle cx={32 + earX + 0.2} cy={earY + 2.6} r="1.3" fill="#e8a94c" />
          <circle cx={32 - earX - 0.6} cy={earY + 2.1} r="0.42" fill="#f6d79b" />
          <circle cx={32 + earX - 0.2} cy={earY + 2.1} r="0.42" fill="#f6d79b" />
        </g>
      );
    case 'freckles':
      // Scattered, not stencilled — the old five sat in a tidy arc.
      return (
        <g fill={tone.shade} opacity="0.55">
          <circle cx={32 - w * 0.52} cy={noseY - 1.8} r="0.55" />
          <circle cx={32 - w * 0.3} cy={noseY - 0.4} r="0.48" />
          <circle cx={32 - w * 0.62} cy={noseY + 0.6} r="0.42" />
          <circle cx={32 + w * 0.5} cy={noseY - 2.1} r="0.55" />
          <circle cx={32 + w * 0.32} cy={noseY - 0.2} r="0.5" />
          <circle cx={32 + w * 0.6} cy={noseY + 0.9} r="0.42" />
          {fine ? <circle cx={32 - 0.8} cy={noseY - 2.6} r="0.36" /> : null}
        </g>
      );
    case 'beautySpot':
      return <circle cx={32 - w * 0.42} cy={mouthY - 1.6} r="0.72" fill={tone.shade} opacity="0.85" />;
    case 'noseStud':
      return (
        <g>
          <circle cx={32 + 1.9} cy={noseY - 0.4} r="0.62" fill="#f6d79b" />
          <circle cx={32 + 1.9} cy={noseY - 0.4} r="0.3" fill="#fffdf6" opacity="0.9" />
        </g>
      );
    case 'hearingAid':
      // Over the ear and over the hair, because it is worn, not hidden.
      return (
        <g>
          <path
            d={`M${32 + earX - 0.6} ${earY - 3}q2.6 0.2 2.4 3.2q-0.2 2.4 -1.6 3`}
            stroke="#b8b6b0"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
          />
          <ellipse cx={32 + earX + 1.6} cy={earY - 3.2} rx="1.5" ry="1.9" fill="#cfcdc6" />
          <ellipse cx={32 + earX + 1.2} cy={earY - 3.8} rx="0.5" ry="0.7" fill="#fffdf6" opacity="0.7" />
        </g>
      );
    case 'headscarf':
      return (
        <g transform={hairT}>
          <path d={HEADSCARF} fill={scarf} />
          {/* the fold that says cloth: a shadow where it wraps behind the temple */}
          <path
            d="M22 20.6C25.6 16.6 38 16.4 42 20.6C40.8 18.2 37.2 15.6 32 15.6C26.8 15.6 23.4 18.2 22 20.6Z"
            fill="#16292c"
            opacity="0.16"
          />
          <path d="M40.6 36.8C43.6 37 45.4 39 45 41.6C43 41.4 41 39.6 40.6 36.8Z" fill={`hsl(${(hue + 8) % 360} 30% 58%)`} opacity="0.5" />
          {fine ? (
            <path d="M21.6 25C23.6 20.4 28 18 32.4 18" stroke="#fffdf6" strokeWidth="1.2" fill="none" opacity="0.35" strokeLinecap="round" />
          ) : null}
        </g>
      );
    case 'none':
    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// The plant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The unifying motif: a client's progress is a plant that sprouts, leafs, buds
 * and blooms. Used on client cards and echoed by real plants in the office.
 *
 * The thresholds are the contract and have not moved: `floor(p*6)` leaves,
 * a bud past 0.72, a bloom at 0.995. The *stem* got shorter — it used to reach
 * y=0 at full progress, which put the open flower's top petals outside the
 * viewBox, so the reward for finishing a client was a decapitated bloom.
 */
export function Plant({
  progress,
  size = 34,
  species = 0,
  className = '',
}: {
  progress: number;
  size?: number;
  species?: number;
  className?: string;
}) {
  const p = Math.max(0, Math.min(1, progress / 100));
  const stemH = 3.5 + p * 18.5;
  const leafCount = Math.floor(p * 6);
  const budded = p > 0.72;
  const bloomed = p >= 0.995;
  const leafColor = ['#8FAF8B', '#7FA57C', '#93B98D', '#6f9c70', '#a3c39c', '#82ab86'][species % 6];
  const leafDark = `color-mix(in oklab, ${leafColor} 78%, #1e3a3a)`;
  const leafLit = `color-mix(in oklab, ${leafColor} 68%, #faf5ec)`;
  const flower = ['#E8A94C', '#C2634F', '#8B6B8F', '#e5b8c4', '#f0c96a', '#b58aa5'][species % 6];
  const flowerDark = `color-mix(in oklab, ${flower} 80%, #6a4f6e)`;
  const base = 28.4;
  const tip = base - stemH;
  // The lean is the plant's one piece of character and it must not shimmer, so
  // it comes off `species` and nothing else.
  const lean = Math.sin(species * 2.4) * 2.2;

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      {/* the pot sits on something */}
      <ellipse cx="20" cy="38.4" rx="9.4" ry="1.5" fill="#1e3a3a" opacity="0.14" />

      {/* terracotta: a belly that curves, a rim that overhangs, and the lamp on
          the left shoulder of both. A flat trapezoid reads as a paper cup. */}
      <path d="M12.9 30.6C13.4 34 14.2 36.4 15.2 38.2H24.8C25.8 36.4 26.6 34 27.1 30.6Z" fill="#C2634F" />
      <path d="M21.4 30.6C21.2 34 20.8 36.4 20 38.2H24.8C25.8 36.4 26.6 34 27.1 30.6Z" fill="#a3503d" opacity="0.75" />
      <path d="M14.6 31.2C15 34 15.6 36 16.3 37.6" stroke="#e08a76" strokeWidth="1.1" fill="none" opacity="0.5" strokeLinecap="round" />
      <rect x="11.6" y="27.4" width="16.8" height="3.4" rx="1.3" fill="#b85a46" />
      <rect x="11.6" y="27.4" width="16.8" height="1.3" rx="0.65" fill="#e08a76" opacity="0.55" />

      {/* soil, with two crumbs so it isn't a painted stripe */}
      <ellipse cx="20" cy="28.2" rx="7.4" ry="1.7" fill="#4d3a2b" />
      <ellipse cx="18.4" cy="27.8" rx="1.5" ry="0.6" fill="#6b5140" opacity="0.8" />
      <ellipse cx="22.2" cy="28.4" rx="1.1" ry="0.5" fill="#6b5140" opacity="0.6" />

      {/* stem */}
      <path
        d={`M20 ${base}C20 ${base - stemH * 0.4} ${20 + lean} ${base - stemH * 0.72} ${20 + lean * 0.6} ${tip}`}
        stroke={leafDark}
        strokeWidth="1.9"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M19.5 ${base}C19.5 ${base - stemH * 0.4} ${19.5 + lean} ${base - stemH * 0.72} ${19.5 + lean * 0.6} ${tip}`}
        stroke={leafLit}
        strokeWidth="0.6"
        fill="none"
        strokeLinecap="round"
        opacity="0.55"
      />

      {/* leaves: two arcs meeting at a point, with a midrib. The old comma shape
          had neither a tip nor a spine, so it read as a bean. */}
      {Array.from({ length: leafCount }).map((_, i) => {
        const t = (i + 1) / (leafCount + 1);
        const y = base - stemH * t;
        const x = 20 + lean * 0.6 * t;
        const dir = i % 2 === 0 ? 1 : -1;
        const len = 4.4 + p * 3.6;
        const tipX = x + dir * len * 1.35;
        const tipY = y - len * 0.62;
        return (
          <g key={i}>
            <path
              d={
                `M${x} ${y}C${x + dir * len * 0.4} ${y - len * 0.72} ${x + dir * len * 0.95} ${tipY - len * 0.24} ${tipX} ${tipY}` +
                `C${x + dir * len * 0.86} ${tipY + len * 0.44} ${x + dir * len * 0.38} ${y + len * 0.2} ${x} ${y}Z`
              }
              fill={dir > 0 ? leafDark : leafColor}
            />
            <path
              d={`M${x} ${y}Q${x + dir * len * 0.66} ${y - len * 0.52} ${tipX} ${tipY}`}
              stroke={dir > 0 ? leafColor : leafLit}
              strokeWidth="0.55"
              fill="none"
              opacity="0.7"
              strokeLinecap="round"
            />
          </g>
        );
      })}

      {/* bud / bloom */}
      {bloomed ? (
        <g>
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
            const cx = 20 + lean * 0.6 + Math.cos(a) * 3.1;
            const cy = tip + Math.sin(a) * 3.1;
            return (
              <ellipse
                key={i}
                cx={cx}
                cy={cy}
                rx="2.5"
                ry="1.8"
                fill={i > 1 && i < 5 ? flowerDark : flower}
                transform={`rotate(${(a * 180) / Math.PI} ${cx} ${cy})`}
              />
            );
          })}
          <circle cx={20 + lean * 0.6} cy={tip} r="1.9" fill="#c9873a" />
          <circle cx={20 + lean * 0.6 - 0.5} cy={tip - 0.5} r="1.1" fill="#F6D79B" />
        </g>
      ) : budded ? (
        <g>
          <path
            d={`M${20 + lean * 0.6} ${tip - 3.4}C${20 + lean * 0.6 + 2.4} ${tip - 2.6} ${20 + lean * 0.6 + 2.2} ${tip + 1} ${20 + lean * 0.6} ${tip + 1.4}C${20 + lean * 0.6 - 2.2} ${tip + 1} ${20 + lean * 0.6 - 2.4} ${tip - 2.6} ${20 + lean * 0.6} ${tip - 3.4}Z`}
            fill={flower}
          />
          <path
            d={`M${20 + lean * 0.6} ${tip - 3.4}C${20 + lean * 0.6 + 2.4} ${tip - 2.6} ${20 + lean * 0.6 + 2.2} ${tip + 1} ${20 + lean * 0.6} ${tip + 1.4}Z`}
            fill={flowerDark}
            opacity="0.7"
          />
          {/* the sepal, so the bud is held rather than balanced */}
          <path
            d={`M${20 + lean * 0.6 - 1.9} ${tip + 0.6}q1.9 2 3.8 0q-1.9 1.4 -3.8 0Z`}
            fill={leafDark}
          />
        </g>
      ) : null}
    </svg>
  );
}
