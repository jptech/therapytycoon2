import { memo } from 'react';
import type { PortraitSeed } from '../sim/types';

/**
 * Layered procedural portraits: ~50 hand-authored shapes combine into thousands
 * of distinct, charming people. Deterministic from the seed, so a client's face
 * never changes between sessions.
 */

const SKINS = ['#f2d3ba', '#e8bd9a', '#d8a179', '#c08457', '#9d6640', '#7d4d2e', '#5f3a21', '#efdcc9'];
const HAIR_COLORS = ['#2b2119', '#4a3527', '#6d4b2e', '#9a6a3a', '#c9a26b', '#8e8e93', '#d8d3cb', '#5a3b52', '#3c5a6b'];
const OUTFITS = ['#8faf8b', '#8b6b8f', '#c2634f', '#4d7d84', '#d3a05a', '#6b7f9e', '#a9776b', '#5f8460', '#b58aa5', '#3f6470'];

/** Hair shapes are drawn over a 64×64 head; each is a path fragment. */
const HAIR: string[] = [
  // 0 — cropped
  'M14 26c0-11 7-17 18-17s18 6 18 17c0 3-1 5-2 6 0-8-5-12-16-12s-16 4-16 12c-1-1-2-3-2-6z',
  // 1 — bob
  'M12 28c0-12 8-19 20-19s20 7 20 19v14c-3 1-5-1-5-6 0-9-4-13-15-13s-15 4-15 13c0 5-2 7-5 6z',
  // 2 — long straight
  'M12 27c0-12 8-18 20-18s20 6 20 18v22c-2 2-5 1-5-3V30c0-8-5-12-15-12s-15 4-15 12v16c0 4-3 5-5 3z',
  // 3 — curls
  'M13 27c0-12 8-18 19-18s19 6 19 18c0 4-2 6-4 5 1-4-1-6-4-5 1-4-2-6-5-4 0-4-3-5-6-3-3-2-6-1-6 3-3-2-6 0-5 4-3-1-5 1-4 5-2 1-4-1-4-5z',
  // 4 — bun
  'M14 27c0-11 7-17 18-17s18 6 18 17c0 3-1 5-2 6 0-8-5-12-16-12s-16 4-16 12c-1-1-2-3-2-6zM32 4a5 5 0 110 10 5 5 0 010-10z',
  // 5 — buzz
  'M16 27c0-9 6-14 16-14s16 5 16 14c0 2-1 3-2 3 0-7-5-10-14-10s-14 3-14 10c-1 0-2-1-2-3z',
  // 6 — side part
  'M13 27c0-12 8-18 19-18 9 0 15 4 18 11-6-3-13-4-20-1-5 2-9 6-11 12-2 2-6 1-6-4z',
  // 7 — afro
  'M32 5c12 0 21 9 21 20 0 7-4 12-9 14 2-3 3-7 3-11 0-9-6-14-15-14s-15 5-15 14c0 4 1 8 3 11-5-2-9-7-9-14 0-11 9-20 21-20z',
  // 8 — locs
  'M12 28c0-12 8-19 20-19s20 7 20 19v6h-3v-6h-3v8h-3v-8h-3v6h-3v-8H22v8h-3v-6h-3v8h-4z',
  // 9 — pixie
  'M14 27c0-11 7-18 18-18s18 7 18 18c-2-2-3-5-4-8-4 4-11 6-19 5-4-1-6 1-7 4-3 1-6 1-6-1z',
  // 10 — ponytail
  'M13 27c0-12 8-18 19-18s19 6 19 18c0 3-1 5-3 5 0-8-5-12-16-12s-16 4-16 12c-2 0-3-2-3-5zM50 24c5 2 8 8 7 15-1 6-4 9-7 8 3-6 3-16 0-23z',
  // 11 — wavy shoulder
  'M12 28c0-12 8-19 20-19s20 7 20 19v13c-2 4-5 2-5-2 0-3 1-6 0-9-1-8-6-11-15-11s-14 3-15 11c-1 3 0 6 0 9 0 4-3 6-5 2z',
];

const ACCESSORIES: (string | null)[] = [
  null,
  // glasses
  'M20 33h9a3 3 0 01-3 4h-3a3 3 0 01-3-4zm15 0h9a3 3 0 01-3 4h-3a3 3 0 01-3-4zm-6 1h6',
  null,
  // earrings (dots handled separately)
  'EARRING',
  null,
  // round glasses
  'ROUND_GLASSES',
  null,
  // freckles
  'FRECKLES',
  null,
];

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
  const skin = SKINS[seed.skin % SKINS.length];
  const hair = HAIR[seed.hair % HAIR.length];
  const hairColor = HAIR_COLORS[seed.hairColor % HAIR_COLORS.length];
  const outfit = OUTFITS[seed.outfitColor % OUTFITS.length];
  const accessory = ACCESSORIES[seed.accessory % ACCESSORIES.length];
  const faceW = 21 + (seed.face % 3);
  const faceH = 24 + (seed.face % 4);
  const id = `p${seed.skin}${seed.hair}${seed.face}${seed.outfitColor}${seed.hue}`;

  const eyeY = 33;
  const browLift = mood === 'happy' ? -1 : mood === 'sad' ? 1.5 : 0;
  const mouth =
    mood === 'happy'
      ? 'M27 44q5 5 10 0'
      : mood === 'sad'
        ? 'M27 46q5 -4 10 0'
        : mood === 'tired'
          ? 'M28 45h8'
          : 'M28 45q4 2.5 8 0';

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
        <radialGradient id={`bg-${id}`} cx="35%" cy="22%">
          <stop offset="0%" stopColor={`hsl(${seed.hue} 46% 88%)`} />
          <stop offset="100%" stopColor={`hsl(${(seed.hue + 26) % 360} 34% 74%)`} />
        </radialGradient>
      </defs>

      {glow ? <circle cx="32" cy="32" r="31" fill="#E8A94C" opacity="0.22" /> : null}
      <circle cx="32" cy="32" r="30" fill={`url(#bg-${id})`} />

      <g clipPath={`url(#clip-${id})`}>
        {/* shoulders */}
        <path d="M8 64c0-12 10-19 24-19s24 7 24 19z" fill={outfit} />
        <path d="M26 46c2 4 10 4 12 0l-2 8h-8z" fill={`color-mix(in oklab, ${outfit} 70%, white)`} />
        {/* neck */}
        <path d="M27 40h10v9c0 2-10 2-10 0z" fill={skin} />
        <path d="M27 40h10v4c-3 2-7 2-10 0z" fill="rgba(0,0,0,0.12)" />
        {/* head */}
        <ellipse cx="32" cy="31" rx={faceW} ry={faceH} fill={skin} />
        {/* ears */}
        <ellipse cx={32 - faceW} cy="33" rx="2.6" ry="3.6" fill={skin} />
        <ellipse cx={32 + faceW} cy="33" rx="2.6" ry="3.6" fill={skin} />
        {/* brows */}
        <path
          d={`M23 ${29 + browLift}q4 -2 8 0`}
          stroke={hairColor}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M33 ${29 + browLift}q4 -2 8 0`}
          stroke={hairColor}
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
        />
        {/* eyes */}
        {mood === 'tired' ? (
          <>
            <path d={`M24 ${eyeY}q3 2 6 0`} stroke="#2b2119" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <path d={`M34 ${eyeY}q3 2 6 0`} stroke="#2b2119" strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="27" cy={eyeY} rx="1.9" ry="2.2" fill="#2b2119" />
            <ellipse cx="37" cy={eyeY} rx="1.9" ry="2.2" fill="#2b2119" />
            <circle cx="27.6" cy={eyeY - 0.7} r="0.6" fill="#fff" opacity="0.85" />
            <circle cx="37.6" cy={eyeY - 0.7} r="0.6" fill="#fff" opacity="0.85" />
          </>
        )}
        {/* mouth */}
        <path d={mouth} stroke="#8a4a3c" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        {/* blush */}
        <ellipse cx="23" cy="39" rx="3" ry="1.8" fill="#e08a76" opacity="0.28" />
        <ellipse cx="41" cy="39" rx="3" ry="1.8" fill="#e08a76" opacity="0.28" />
        {/* hair */}
        <path d={hair} fill={hairColor} />

        {/* accessories */}
        {accessory === 'EARRING' ? (
          <>
            <circle cx={32 - faceW} cy="37" r="1.5" fill="#E8A94C" />
            <circle cx={32 + faceW} cy="37" r="1.5" fill="#E8A94C" />
          </>
        ) : accessory === 'ROUND_GLASSES' ? (
          <g stroke="#33534f" strokeWidth="1.3" fill="none" opacity="0.85">
            <circle cx="27" cy={eyeY} r="4.4" />
            <circle cx="37" cy={eyeY} r="4.4" />
            <path d={`M31.4 ${eyeY}h1.2`} />
          </g>
        ) : accessory === 'FRECKLES' ? (
          <g fill="#a5623f" opacity="0.5">
            <circle cx="26" cy="38" r="0.6" />
            <circle cx="29" cy="39.4" r="0.55" />
            <circle cx="38" cy="38" r="0.6" />
            <circle cx="35" cy="39.4" r="0.55" />
            <circle cx="32" cy="40.2" r="0.5" />
          </g>
        ) : accessory ? (
          <path d={accessory} stroke="#33534f" strokeWidth="1.3" fill="none" opacity="0.85" />
        ) : null}
      </g>

      <circle cx="32" cy="32" r="30" fill="none" stroke="rgba(30,58,58,0.22)" strokeWidth="1.5" />
    </svg>
  );
}

export const Portrait = memo(PortraitImpl);

/**
 * The unifying motif: a client's progress is a plant that sprouts, leafs, buds
 * and blooms. Used on client cards and echoed by real plants in the office.
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
  const stemH = 6 + p * 26;
  const leafCount = Math.floor(p * 6);
  const budded = p > 0.72;
  const bloomed = p >= 0.995;
  const leafColor = ['#8FAF8B', '#7FA57C', '#93B98D', '#6f9c70', '#a3c39c', '#82ab86'][species % 6];
  const flower = ['#E8A94C', '#C2634F', '#8B6B8F', '#e5b8c4', '#f0c96a', '#b58aa5'][species % 6];

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden>
      {/* pot */}
      <path d="M13 32h14l-1.6 6H14.6z" fill="#C2634F" opacity="0.9" />
      <rect x="12" y="29.5" width="16" height="3" rx="1.2" fill="#a8523f" />
      {/* soil */}
      <rect x="13.6" y="31" width="12.8" height="1.4" fill="#5a4433" opacity="0.7" />
      {/* stem */}
      <path
        d={`M20 32 C20 ${32 - stemH * 0.5}, ${20 + Math.sin(species) * 2} ${32 - stemH * 0.8}, 20 ${32 - stemH}`}
        stroke={leafColor}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
      {/* leaves */}
      {Array.from({ length: leafCount }).map((_, i) => {
        const t = (i + 1) / (leafCount + 1);
        const y = 32 - stemH * t;
        const dir = i % 2 === 0 ? 1 : -1;
        const len = 4 + p * 4;
        return (
          <path
            key={i}
            d={`M20 ${y} q ${dir * len} -1.6 ${dir * len * 1.5} ${-len * 0.35} q ${-dir * len * 0.6} ${len * 0.55} ${-dir * len * 1.5} ${len * 0.35 - 0.6}`}
            fill={leafColor}
            opacity={0.92}
          />
        );
      })}
      {/* bud / bloom */}
      {bloomed ? (
        <g>
          {Array.from({ length: 6 }).map((_, i) => (
            <ellipse
              key={i}
              cx={20 + Math.cos((i / 6) * Math.PI * 2) * 3.4}
              cy={32 - stemH + Math.sin((i / 6) * Math.PI * 2) * 3.4}
              rx="2.6"
              ry="1.9"
              fill={flower}
              transform={`rotate(${(i / 6) * 360} ${20 + Math.cos((i / 6) * Math.PI * 2) * 3.4} ${32 - stemH + Math.sin((i / 6) * Math.PI * 2) * 3.4})`}
            />
          ))}
          <circle cx="20" cy={32 - stemH} r="2" fill="#F6D79B" />
        </g>
      ) : budded ? (
        <ellipse cx="20" cy={32 - stemH - 1} rx="2.4" ry="3.2" fill={flower} opacity="0.85" />
      ) : null}
    </svg>
  );
}
