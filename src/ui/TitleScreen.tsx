import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CONDITION_LABELS, DIFFICULTIES, STARTING_CASH } from '../sim/balance';
import { importSave } from '../sim/save';
import { formatMoney } from '../sim/util';
import type { Difficulty, ModalityId } from '../sim/types';
import { MODALITIES, PRACTICE_NAME_PARTS } from '../content';
import { adoptState, savedGameExists, useSim, useStore, useUi } from '../store';

/**
 * The front door.
 *
 * A dark, warm street outside a clinic that is still lit at seven in the
 * evening — one window, one lamp, one plant on the sill. The whole promise of
 * the game in a single drawing, made of about forty inline SVG shapes.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Comfort
// ─────────────────────────────────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setPrefers(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return prefers;
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentation-only lookups
// ─────────────────────────────────────────────────────────────────────────────

/** Modality.prop is a sentence, not a glyph — this is the glyph for the card face. */
const MODALITY_GLYPH: Record<ModalityId, string> = {
  cbt: '🗒️',
  dbt: '🃏',
  emdr: '💡',
  somatic: '🧘',
  psychodynamic: '🛋️',
  act: '🧭',
  play: '🧸',
  family: '🪑',
};

const DIFFICULTY_ORDER: Difficulty[] = ['cozy', 'standard', 'challenge'];

const DIFFICULTY_VOICE: Record<Difficulty, string> = {
  cozy: 'The full game, with a floor under it. Every system is here; none of them can take the building away.',
  standard: 'The practice as it actually runs. Tight some months, fine most months.',
  challenge: 'For a second run, when you already know where the hard part is.',
};

/** Ids read by applyLegacy() in sim/engine.ts. Labels only — no numbers invented. */
const LEGACY_PERKS: { id: string; name: string; blurb: string; icon: string }[] = [
  { id: 'legacy_nest_egg', name: 'Nest egg', blurb: 'You open with more in the account.', icon: '🏦' },
  { id: 'legacy_reputation', name: 'Word of mouth', blurb: 'People have heard of you before you unlock the door.', icon: '📣' },
  { id: 'legacy_mentor', name: 'An old colleague', blurb: 'A veteran comes out of semi-retirement, at half salary.', icon: '🕯️' },
  { id: 'legacy_technique', name: 'Something you kept', blurb: 'You start knowing one more technique in your own school.', icon: '🗝️' },
  { id: 'legacy_community', name: 'The neighbourhood remembers', blurb: 'Community trust starts higher.', icon: '🏘️' },
];

function rollPracticeName(): string {
  const { first, second } = PRACTICE_NAME_PARTS;
  return `${first[Math.floor(Math.random() * first.length)]} ${second[Math.floor(Math.random() * second.length)]}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// The scene
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Brickwork, as one path.
 *
 * Courses every 38px with the joints staggered half a brick per row, which is
 * the only thing that separates a brick wall from graph paper. Built at module
 * scope from integers — geometry never touches Math.random (see the art rules),
 * and this way the string is assembled once for the life of the tab rather than
 * on every title-screen render.
 */
const BRICK = (() => {
  const seg: string[] = [];
  for (let row = 0; row < 5; row++) {
    const top = 22 + row * 38;
    if (row > 0) seg.push(`M40 ${top}h240`);
    const offset = row % 2 ? 21 : 0;
    for (let x = 40 + offset; x < 280; x += 42) seg.push(`M${x} ${top}v38`);
  }
  return seg.join('');
})();

/**
 * Motes in the beam under the sill. Hand-placed rather than generated: four is
 * enough to say "there is air in this room" and any more starts to read as
 * snow. `dur` is prime-ish against its neighbours so they never pulse together.
 */
const DUST: { x: number; y: number; r: number; dx: number; dy: number; dur: number; delay: number }[] = [
  { x: 118, y: 216, r: 1.5, dx: 5, dy: 30, dur: 9.4, delay: 0 },
  { x: 172, y: 228, r: 1.1, dx: -4, dy: 24, dur: 11.8, delay: 2.6 },
  { x: 214, y: 220, r: 1.7, dx: 6, dy: 33, dur: 8.7, delay: 4.1 },
  { x: 146, y: 238, r: 1.2, dx: -3, dy: 18, dur: 13.2, delay: 1.3 },
];

function LitWindow({ animate }: { animate: boolean }) {
  return (
    <svg
      viewBox="0 0 320 262"
      className="w-[min(340px,72vw)] h-auto"
      role="img"
      aria-label="A clinic window, lit from inside by a lamp, with a plant on the sill."
    >
      <defs>
        <radialGradient id="tt-lampglow" cx="50%" cy="46%">
          <stop offset="0%" stopColor="#F6D79B" stopOpacity="0.62" />
          <stop offset="52%" stopColor="#E8A94C" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#E8A94C" stopOpacity="0" />
        </radialGradient>
        {/* The room is a wall and a floor, not one flat wash. Both gradients are
            steeper on the right because that is the side the lamp is on. */}
        <linearGradient id="tt-wall" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#F7DDAC" />
          <stop offset="54%" stopColor="#F0C476" />
          <stop offset="100%" stopColor="#E4AC5C" />
        </linearGradient>
        <linearGradient id="tt-floor" x1="0.2" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#E2A855" />
          <stop offset="100%" stopColor="#CE8C3E" />
        </linearGradient>
        {/* Where the lamp actually lands: hot core, long ambient tail. */}
        <radialGradient id="tt-lamppool" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#FFF6DE" stopOpacity="0.85" />
          <stop offset="38%" stopColor="#FDEBC2" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FBE0A6" stopOpacity="0" />
        </radialGradient>
        {/* The bulb's own bloom. A flat ellipse gave it a hard edge, which is
            the one thing a light source can never have. */}
        <radialGradient id="tt-bulb" cx="50%" cy="50%">
          <stop offset="0%" stopColor="#FFFAEA" stopOpacity="0.92" />
          <stop offset="26%" stopColor="#FDF0CC" stopOpacity="0.5" />
          <stop offset="62%" stopColor="#F6D79B" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#F6D79B" stopOpacity="0" />
        </radialGradient>
        {/* Corners of the room fall away — depth by occlusion, not outline. */}
        <radialGradient id="tt-reveal" cx="52%" cy="46%">
          <stop offset="56%" stopColor="#3A2410" stopOpacity="0" />
          <stop offset="100%" stopColor="#3A2410" stopOpacity="0.3" />
        </radialGradient>
        {/* Glass is a surface as well as a hole: one raking sheen across it. */}
        <linearGradient id="tt-sheen" x1="0" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.3" />
          <stop offset="42%" stopColor="#FFFFFF" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        {/* Two spills, not one. The core falls off fast and the ambient carries
            twice as far; a single gradient reads as a stage spotlight. */}
        <linearGradient id="tt-spill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F6D79B" stopOpacity="0.44" />
          <stop offset="46%" stopColor="#E8A94C" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#E8A94C" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="tt-spill-wide" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8A94C" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#E8A94C" stopOpacity="0" />
        </linearGradient>
        {/* The sash bars are proud of the glass, so the room's light rakes past
            them and lays a soft band down and to one side of each. */}
        <linearGradient id="tt-bar-shadow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5A3A16" stopOpacity="0.26" />
          <stop offset="100%" stopColor="#5A3A16" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="tt-bar-shadow-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5A3A16" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#5A3A16" stopOpacity="0" />
        </linearGradient>
        <clipPath id="tt-pane-clip">
          <rect x="62" y="44" width="196" height="152" rx="7" />
        </clipPath>
        <clipPath id="tt-brick-clip">
          <rect x="40" y="22" width="240" height="188" rx="12" />
        </clipPath>
      </defs>

      {/* the glow the whole picture hangs on. It breathes slower than the bulb
          does — a room's ambient light lags the filament that makes it. */}
      <ellipse
        cx="160"
        cy="122"
        rx="158"
        ry="128"
        fill="url(#tt-lampglow)"
        className={animate ? 'animate-flicker' : ''}
        style={animate ? { animationDuration: '11s' } : undefined}
      />

      {/* light spilling onto the pavement, and the wedge of shadow the centre
          sash bar throws into it — the detail that says the light came through
          a window rather than out of a hole */}
      <path d="M56 204 L264 204 L316 260 L4 260 Z" fill="url(#tt-spill-wide)" />
      <path d="M70 204 L250 204 L292 260 L28 260 Z" fill="url(#tt-spill)" />
      <path d="M156 204 L164 204 L172 260 L148 260 Z" fill="#16292C" opacity="0.16" />

      {/* brickwork */}
      <rect x="40" y="22" width="240" height="188" rx="12" fill="#1B3134" />
      <g clipPath="url(#tt-brick-clip)">
        <path d={BRICK} stroke="#26454A" strokeWidth="1.1" opacity="0.7" fill="none" />
      </g>
      {/* the wall near the opening catches the room's light too */}
      <rect x="40" y="22" width="240" height="188" rx="12" fill="url(#tt-lamppool)" opacity="0.5" />
      <rect x="40" y="22" width="240" height="188" rx="12" fill="none" stroke="#2E5257" strokeWidth="2" />
      <path d="M42 24h236" stroke="#43666B" strokeWidth="1.4" opacity="0.55" fill="none" strokeLinecap="round" />

      {/* ── the room, everything clipped to the glass ─────────────────────── */}
      <g clipPath="url(#tt-pane-clip)">
        <rect x="62" y="44" width="196" height="112" fill="url(#tt-wall)" />
        <rect x="62" y="156" width="196" height="40" fill="url(#tt-floor)" />
        {/* skirting: the one line that turns two rectangles into a room */}
        <path d="M62 156h196" stroke="#B87F38" strokeWidth="2.4" opacity="0.4" />
        <path d="M62 154.4h196" stroke="#FBE3B0" strokeWidth="1.2" opacity="0.5" />
        {/* the lamp's own pool, on the wall behind it and on the floor below */}
        <ellipse cx="229" cy="118" rx="62" ry="70" fill="url(#tt-lamppool)" />
        <ellipse cx="226" cy="184" rx="46" ry="14" fill="url(#tt-lamppool)" opacity="0.7" />

        {/* Frames on the wall, none of them hung true and no two the same size —
            a matched set reads as wallpaper. This is the wall by the door that
            the whole game is about, so it is worth the nodes. Each is a dark
            moulding around a paler mat, which is what makes it a picture rather
            than a rectangle. */}
        <g opacity="0.42">
          <g transform="rotate(-1.6 92 71)">
            <rect x="81" y="61" width="22" height="17" rx="1" fill="#1E3A3A" />
            <rect x="83.4" y="63.4" width="17.2" height="12.2" fill="#FBE6BB" opacity="0.4" />
          </g>
          <g transform="rotate(1.3 118 66)">
            <rect x="111" y="59" width="14" height="11.5" rx="0.9" fill="#1E3A3A" />
            <rect x="113" y="61" width="10" height="7.5" fill="#FBE6BB" opacity="0.34" />
          </g>
          <g transform="rotate(-0.6 116 87)">
            <rect x="109" y="80" width="17" height="13" rx="0.9" fill="#1E3A3A" />
            <rect x="111" y="82" width="13" height="9" fill="#FBE6BB" opacity="0.37" />
          </g>
        </g>

        {/* what is happening in there. Opacity is depth: things further into the
            room sit in more haze, things by the glass are nearly solid. */}
        <g fill="#1E3A3A">
          {/* rug — an edge that wobbles, laid flat under both chairs */}
          <path
            d="M86 180q30-9 66-8t66 9q-30 10-66 9.5T86 180z"
            opacity="0.17"
          />
          {/* couch: back, seat, both arms, and feet that lift it off the floor */}
          <path d="M80 179v-23a8 8 0 018-8h50a8 8 0 018 8v23z" opacity="0.8" />
          <path d="M76 183v-11a6 6 0 016-6h62a6 6 0 016 6v11z" opacity="0.88" />
          <path d="M70 183v-15a6 6 0 016-6h4v21zM144 162h4a6 6 0 016 6v15h-10z" opacity="0.72" />
          <path d="M73 183h4v5h-4zM147 183h4v5h-4z" opacity="0.55" />
          {/* the other chair, angled slightly away from the couch */}
          <path d="M196 182v-21a8 8 0 018-8h12a8 8 0 018 8v21z" opacity="0.7" />
          <path d="M193 184v-9a5 5 0 015-5h20a5 5 0 015 5v9z" opacity="0.8" />
          {/* side table, and the mug somebody has not finished */}
          <path d="M164 167h24l-1.5 3h-21z" opacity="0.62" />
          <path d="M173 170h6l1 16h-8z" opacity="0.62" />
          <path d="M170 160h9v5a2.5 2.5 0 01-2.5 2.5h-4A2.5 2.5 0 01170 165zm9 1.2h2a2 2 0 010 4h-2z" opacity="0.74" />
        </g>

        {/* The floor lamp, in the only order that works: the glow first, then the
            silhouette on top of it. Painted the other way round the halo washes
            out the shade it is supposed to be coming out of. */}
        <ellipse cx="229.5" cy="132" rx="40" ry="34" fill="url(#tt-bulb)" className={animate ? 'animate-flicker' : ''} />
        <g fill="#1E3A3A">
          <path d="M228 120h3.4v66H228z" opacity="0.78" />
          <path d="M221 186h17.4l-1 3H222z" opacity="0.7" />
          <path d="M214 118l6-17h22l6 17z" opacity="0.86" />
        </g>
        {/* the filament, just under the lip of the shade */}
        <ellipse cx="229.5" cy="120.5" rx="7" ry="4.5" fill="#FFF9EA" opacity="0.75" />
        <circle cx="229.5" cy="120" r="2.6" fill="#FFFDF4" />

        {/* the lit edges. Everything faces the lamp on the right, so that is the
            side that catches — this is the whole difference between furniture
            and stickers. */}
        <g fill="none" stroke="#FCE9BC" strokeLinecap="round">
          <path d="M88 148h50a8 8 0 018 8" strokeWidth="1.3" opacity="0.42" />
          <path d="M148 162a6 6 0 016 6v15" strokeWidth="1.2" opacity="0.34" />
          <path d="M224 153a8 8 0 018 8v21" strokeWidth="1.2" opacity="0.36" />
          <path d="M231.4 122v64" strokeWidth="1" opacity="0.38" />
          <path d="M242 101l6 17" strokeWidth="1.1" opacity="0.45" />
        </g>

        {/* A curtain gathered at the right jamb. It hangs nearer the glass than
            the lamp does, so it overlaps the lamp — depth here is occlusion,
            never an outline. Its left face is the one turned toward the bulb. */}
        <g>
          <path d="M258 44v152h-13c4-25 5-50 3-76s-1-51 3-76z" fill="#1E3A3A" opacity="0.8" />
          <path
            d="M245 196c4-25 5-50 3-76s-1-51 3-76"
            fill="none"
            stroke="#FCE9BC"
            strokeWidth="0.9"
            opacity="0.26"
          />
          <path d="M252 45c3 25 2 51 1 77s0 49 2 74" fill="none" stroke="#0F2124" strokeWidth="0.9" opacity="0.4" />
        </g>

        {/* Plant on the interior sill: small, tucked into the corner where the
            glass meets the ledge, and scaled by an outer group because the float
            animation writes `transform` and would clobber an attribute here. */}
        <g transform="translate(22 58) scale(0.68)">
          <g className={animate ? 'animate-float' : ''} style={{ transformOrigin: '96px 190px' }}>
            <ellipse cx="93" cy="191.5" rx="16" ry="3" fill="#8B5A22" opacity="0.3" />
            <path d="M92 166c-9-4-13-13-11-22 9 1 15 8 15 17z" fill="#4E7350" opacity="0.94" />
            <path d="M100 164c8-5 11-14 8-23-9 2-14 10-13 19z" fill="#7BA078" opacity="0.96" />
            <path d="M103 172c7-2 11-8 11-15-7 1-11 6-12 12z" fill="#5F8460" opacity="0.9" />
            <path d="M104 141c-2 7-6 12-9 14" stroke="#C9E0BE" strokeWidth="1.4" fill="none" opacity="0.5" strokeLinecap="round" />
            <path d="M96 170c-1-12-1-20 0-26" stroke="#4E7350" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M87 173h18l-2.4 15H89.4z" fill="#A8523F" />
            <path d="M99 173h6l-2.4 15h-4z" fill="#C2634F" opacity="0.85" />
            <rect x="85.4" y="170" width="21.2" height="4" rx="1.8" fill="#B85A44" />
            <path d="M104.2 171h2.4v2h-2.4z" fill="#E1897A" opacity="0.7" />
          </g>
        </g>

        {/* sash-bar shadows laid on the glass, then the sheen, then the room's
            own falling-away corners */}
        <rect x="163" y="44" width="9" height="152" fill="url(#tt-bar-shadow)" />
        <rect x="62" y="123" width="196" height="9" fill="url(#tt-bar-shadow-v)" />
        <path d="M62 196 L62 128 L156 44 L206 44 L74 196 Z" fill="url(#tt-sheen)" />
        <rect x="62" y="44" width="196" height="152" fill="url(#tt-reveal)" />
      </g>

      {/* frame. The sash bar's right face is turned toward the lamp, so it gets
          a hairline of light; its left face does not. */}
      <g fill="none" strokeLinejoin="round">
        <rect x="62" y="44" width="196" height="152" rx="7" stroke="#132427" strokeWidth="6.5" />
        <path d="M160 44v152M62 120h196" stroke="#132427" strokeWidth="6" />
        <path d="M163.4 48v144" stroke="#F3D296" strokeWidth="0.9" opacity="0.32" />
        <path d="M66 123.4h188" stroke="#F3D296" strokeWidth="0.9" opacity="0.24" />
        <rect x="59" y="41" width="202" height="158" rx="9" stroke="#0D1B1E" strokeWidth="2" opacity="0.75" />
        <path d="M61 42.5h198" stroke="#3D6A70" strokeWidth="1.2" opacity="0.5" strokeLinecap="round" />
      </g>

      {/* sill. A top face the light lands on, a front face it does not, and a
          drip edge under that — three tones is the fewest that reads as an
          object with a thickness instead of a drawn line. */}
      <path d="M48 192h224l4 6H44z" fill="#41707A" />
      <path d="M62 192h196l1.6 2.4H60.6z" fill="#F6D79B" opacity="0.32" />
      <rect x="44" y="198" width="232" height="8" rx="1.5" fill="#2A4B50" />
      <path d="M44 206h232l-5 4H49z" fill="#152A2E" opacity="0.85" />

      {animate ? (
        <g className="juice-only" aria-hidden>
          {DUST.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill="#F6D79B"
              style={{
                animation: `dust-drift ${d.dur}s linear ${d.delay}s infinite`,
                ['--dust-x' as string]: `${d.dx}px`,
                ['--dust-y' as string]: `${d.dy}px`,
                ['--dust-peak' as string]: '0.55',
              }}
            />
          ))}
        </g>
      ) : null}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export function TitleScreen() {
  const screen = useUi((u) => u.screen);
  const setUi = useStore((s) => s.setUi);

  const calm = useSim((s) => s.settings.calmMode);
  const reducedSetting = useSim((s) => s.settings.reducedMotion);
  const prefersReduced = usePrefersReducedMotion();
  const animate = !calm && !reducedSetting && !prefersReduced;

  const legacyPoints = useSim((s) => s.legacy.points);
  const runsCompleted = useSim((s) => s.legacy.runsCompleted);
  const legacySpent = useSim((s) => s.legacy.spent.join('|'));
  const spentSet = useMemo(() => new Set(legacySpent.split('|').filter(Boolean)), [legacySpent]);

  const [hasSaved, setHasSaved] = useState(() => savedGameExists());
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onContinue = useCallback(() => {
    const ok = useStore.getState().loadSaved();
    if (!ok) {
      setHasSaved(false);
      setImportError('That save would not open. Starting fresh is the only honest option.');
    }
  }, []);

  const onImportFile = useCallback(async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const state = importSave(text);
      if (!state) {
        setImportError('That file did not look like a Lamplit Clinic save.');
        return;
      }
      adoptState(state);
    } catch {
      setImportError('The file could not be read. Try exporting it again.');
    }
  }, []);

  // App renders this for every screen that isn't 'playing', so anything other
  // than the setup step falls through to the hero rather than blanking out.
  if (screen === 'playing') return null;
  const onSetup = screen === 'setup';

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain"
      style={{
        background:
          'radial-gradient(120% 90% at 50% 26%, #22393c 0%, #16292c 52%, #0f1e21 100%)',
      }}
    >
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-8 gap-6">
        {!onSetup ? (
          <TitleHero
            animate={animate}
            hasSaved={hasSaved}
            onContinue={onContinue}
            onNew={() => setUi({ screen: 'setup' })}
            onPickFile={() => fileRef.current?.click()}
            importError={importError}
            legacyPoints={legacyPoints}
            runsCompleted={runsCompleted}
            spent={spentSet}
          />
        ) : (
          <SetupStep animate={animate} onBack={() => setUi({ screen: 'title' })} />
        )}

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label="Choose a saved practice file to import"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImportFile(f);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero
// ─────────────────────────────────────────────────────────────────────────────

function TitleHero({
  animate,
  hasSaved,
  onContinue,
  onNew,
  onPickFile,
  importError,
  legacyPoints,
  runsCompleted,
  spent,
}: {
  animate: boolean;
  hasSaved: boolean;
  onContinue: () => void;
  onNew: () => void;
  onPickFile: () => void;
  importError: string | null;
  legacyPoints: number;
  runsCompleted: number;
  spent: Set<string>;
}) {
  return (
    <div className={`flex flex-col items-center text-center max-w-[640px] ${animate ? 'rise-in' : ''}`}>
      <LitWindow animate={animate} />

      <h1 className="mt-5">
        <span
          className="display block text-[clamp(2.1rem,7.5vw,3.9rem)] leading-[0.98] text-paper"
          style={{ textShadow: '0 10px 40px rgba(232,169,76,0.28)' }}
        >
          Therapy Tycoon II
        </span>
        <span
          className="block mt-2.5 text-[clamp(0.66rem,2.1vw,0.88rem)] font-extrabold uppercase tracking-[0.42em] text-amber"
          style={{ paddingLeft: '0.42em' }}
        >
          The Lamplit Clinic
        </span>
      </h1>

      <p className="text-[0.86rem] leading-relaxed text-paper/70 mt-4 max-w-[46ch]">
        A practice-management game where the product is care. Book the hours, watch the plants grow,
        and try to get everybody home at a reasonable time — including yourself.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-2.5 mt-7">
        {hasSaved ? (
          <button className="btn btn-primary text-[0.95rem] px-5 py-2.5" onClick={onContinue}>
            Continue
          </button>
        ) : null}
        <button
          className={`btn text-[0.95rem] px-5 py-2.5 ${hasSaved ? 'btn-ghost' : 'btn-primary'}`}
          onClick={onNew}
          style={
            hasSaved
              ? {
                  background: 'color-mix(in oklab, var(--color-paper) 14%, transparent)',
                  borderColor: 'color-mix(in oklab, var(--color-paper) 30%, transparent)',
                  color: 'var(--color-paper)',
                }
              : undefined
          }
        >
          New practice
        </button>
        <button
          className="btn text-[0.82rem]"
          onClick={onPickFile}
          style={{
            background: 'transparent',
            borderColor: 'color-mix(in oklab, var(--color-paper) 24%, transparent)',
            color: 'color-mix(in oklab, var(--color-paper) 74%, transparent)',
          }}
        >
          Import a save
        </button>
      </div>

      {hasSaved ? (
        <p className="text-[0.7rem] text-paper/45 mt-2.5">
          Starting a new practice leaves the old save where it is until the first autosave of the new run.
        </p>
      ) : null}

      {importError ? (
        <p
          className="text-[0.76rem] mt-3 px-3 py-1.5 rounded-full"
          role="alert"
          style={{
            background: 'color-mix(in oklab, var(--color-brick) 22%, transparent)',
            color: 'var(--color-brick-soft)',
          }}
        >
          {importError}
        </p>
      ) : null}

      {legacyPoints > 0 ? (
        <LegacyStrip points={legacyPoints} runs={runsCompleted} spent={spent} />
      ) : null}
    </div>
  );
}

function LegacyStrip({ points, runs, spent }: { points: number; runs: number; spent: Set<string> }) {
  const carried = LEGACY_PERKS.filter((p) => spent.has(p.id));
  return (
    <section
      aria-label="Legacy carried from earlier runs"
      // `backgroundColor`, not `background`: the shorthand would wipe the wash
      // that .lamp-wash puts on top of it.
      className="lamp-wash mt-8 w-full rounded-[14px] px-4 py-3.5 text-left"
      style={{
        backgroundColor: 'color-mix(in oklab, var(--color-paper) 8%, transparent)',
        border: '1px solid color-mix(in oklab, var(--color-paper) 18%, transparent)',
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="display text-[0.98rem] text-paper">What you carry</h2>
        <span className="tabular text-[0.76rem] text-amber">
          {points} legacy point{points === 1 ? '' : 's'}
        </span>
      </div>
      <p className="text-[0.72rem] text-paper/55 leading-snug mt-0.5">
        Banked from {runs} finished run{runs === 1 ? '' : 's'}. Cures, standing, accreditation stages and
        the people on your wall all count toward it.
      </p>

      {carried.length ? (
        <ul className="list-none p-0 m-0 mt-2.5 grid gap-1.5">
          {carried.map((p) => (
            <li key={p.id} className="flex items-start gap-2">
              <span aria-hidden className="text-[0.9rem] leading-none mt-0.5">
                {p.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.78rem] font-bold text-paper/90 leading-snug">{p.name}</span>
                <span className="block text-[0.7rem] text-paper/50 leading-snug">{p.blurb}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[0.72rem] text-paper/45 leading-snug mt-2">
          Nothing spent yet. They keep — there is no hurry, and no interest.
        </p>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup
// ─────────────────────────────────────────────────────────────────────────────

function SetupStep({ animate, onBack }: { animate: boolean; onBack: () => void }) {
  const setUi = useStore((s) => s.setUi);

  const [therapistName, setTherapistName] = useState('');
  const [practiceName, setPracticeName] = useState(() => rollPracticeName());
  const [modality, setModality] = useState<ModalityId>('cbt');
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [showRopes, setShowRopes] = useState(true);

  const open = useCallback(() => {
    const trimmedPractice = practiceName.trim();
    const trimmedName = therapistName.trim();
    useStore.getState().newGame({
      practiceName: trimmedPractice || rollPracticeName(),
      therapistName: trimmedName || undefined,
      modality,
      difficulty,
      skipTutorial: !showRopes,
    });
    setUi({ screen: 'playing', panel: null });
  }, [difficulty, modality, practiceName, setUi, showRopes, therapistName]);

  return (
    <div className={`w-full max-w-[880px] ${animate ? 'rise-in' : ''}`}>
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <h1 className="display text-[1.7rem] leading-tight text-paper">Open a practice</h1>
          <p className="text-[0.78rem] text-paper/55 leading-snug mt-0.5">
            Four decisions. None of them are permanent except the last one, and that one is only mostly.
          </p>
        </div>
        <button
          className="btn text-[0.76rem]"
          onClick={onBack}
          style={{
            background: 'transparent',
            borderColor: 'color-mix(in oklab, var(--color-paper) 24%, transparent)',
            color: 'color-mix(in oklab, var(--color-paper) 72%, transparent)',
          }}
        >
          ← Back
        </button>
      </div>

      <div className="paper px-4 py-4 sm:px-5 sm:py-5">
        {/* Names */}
        <fieldset className="border-0 p-0 m-0">
          <legend className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-ink-faint mb-2">
            Who is opening, and where
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[0.74rem] font-bold text-ink-soft mb-1">Your name</span>
              <input
                value={therapistName}
                onChange={(e) => setTherapistName(e.target.value)}
                maxLength={40}
                placeholder="Leave blank and we'll pick one"
                className="w-full paper-flat px-3 py-2 text-[0.88rem] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
              />
            </label>
            <label className="block">
              <span className="block text-[0.74rem] font-bold text-ink-soft mb-1">Practice name</span>
              <div className="flex gap-1.5">
                <input
                  value={practiceName}
                  onChange={(e) => setPracticeName(e.target.value)}
                  maxLength={48}
                  className="flex-1 min-w-0 paper-flat px-3 py-2 text-[0.88rem] text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2"
                />
                <button
                  type="button"
                  className="btn btn-ghost text-[0.72rem] px-2.5 py-1 shrink-0"
                  onClick={() => setPracticeName(rollPracticeName())}
                  aria-label="Suggest another practice name"
                  title="Suggest another"
                >
                  <span aria-hidden>🎲</span> Re-roll
                </button>
              </div>
            </label>
          </div>
        </fieldset>

        <div className="my-4 h-px" style={{ background: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} />

        {/* Modality */}
        <fieldset className="border-0 p-0 m-0">
          <legend className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-ink-faint mb-2">
            The school you trained in
          </legend>
          <p className="text-[0.74rem] text-ink-faint leading-snug -mt-1 mb-2.5">
            You can cross-train later. This is only where you start from, and which chair ends up in your room.
          </p>
          <div
            className="grid gap-2"
            role="radiogroup"
            aria-label="Choose your modality"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(196px, 1fr))' }}
          >
            {MODALITIES.map((m) => {
              const on = modality === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setModality(m.id)}
                  className="card-warm text-left px-3 py-2.5 transition hover:brightness-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: on ? m.color : 'color-mix(in oklab, var(--color-ink) 13%, transparent)',
                    // A chosen card is picked up off the table, not just outlined.
                    boxShadow: on
                      ? `0 0 0 2px color-mix(in oklab, ${m.color} 55%, transparent), var(--shadow-lifted)`
                      : 'var(--shadow-soft)',
                  }}
                >
                  <div className="flex items-start gap-2">
                    <span aria-hidden className="text-[1.15rem] leading-none mt-0.5">
                      {MODALITY_GLYPH[m.id]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block display text-[0.9rem] leading-tight text-ink">{m.name}</span>
                      <span className="block text-[0.7rem] text-ink-faint leading-snug mt-0.5">{m.blurb}</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.strongWith.map((c) => (
                      <span
                        key={c}
                        className="chip"
                        style={{
                          background: `color-mix(in oklab, ${m.color} 16%, transparent)`,
                          borderColor: `color-mix(in oklab, ${m.color} 38%, transparent)`,
                          color: `color-mix(in oklab, ${m.color} 74%, #1E3A3A)`,
                        }}
                      >
                        {CONDITION_LABELS[c] ?? c}
                      </span>
                    ))}
                  </div>
                  <div className="text-[0.68rem] text-ink-faint italic leading-snug mt-1.5">
                    In your room: {m.prop}.
                  </div>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="my-4 h-px" style={{ background: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} />

        {/* Difficulty */}
        <fieldset className="border-0 p-0 m-0">
          <legend className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-ink-faint mb-2">
            How hard the arithmetic is
          </legend>
          <div
            className="grid gap-2"
            role="radiogroup"
            aria-label="Choose a difficulty"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}
          >
            {DIFFICULTY_ORDER.map((id) => {
              const d = DIFFICULTIES[id];
              const on = difficulty === id;
              const accent =
                id === 'cozy'
                  ? 'var(--color-sage)'
                  : id === 'standard'
                    ? 'var(--color-amber)'
                    : 'var(--color-plum)';
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDifficulty(id)}
                  className="card-warm text-left px-3 py-2.5 transition hover:brightness-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    borderColor: on ? accent : 'color-mix(in oklab, var(--color-ink) 13%, transparent)',
                    boxShadow: on
                      ? `0 0 0 2px color-mix(in oklab, ${accent} 55%, transparent), var(--shadow-lifted)`
                      : 'var(--shadow-soft)',
                  }}
                >
                  <div className="display text-[1rem] leading-tight text-ink">{d.name}</div>
                  <div className="text-[0.72rem] text-ink-soft leading-snug mt-0.5">{d.blurb}</div>
                  <div className="text-[0.7rem] text-ink-faint leading-snug mt-1.5">{DIFFICULTY_VOICE[id]}</div>
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-2 text-[0.66rem]">
                    <dt className="text-ink-faint">Opening cash</dt>
                    <dd className="tabular text-ink-soft text-right m-0">{formatMoney(STARTING_CASH[id])}</dd>
                    <dt className="text-ink-faint">Referral flow</dt>
                    <dd className="tabular text-ink-soft text-right m-0">
                      {Math.round(d.referralMult * 100)}%
                    </dd>
                    <dt className="text-ink-faint">Client patience</dt>
                    <dd className="tabular text-ink-soft text-right m-0">
                      {Math.round(d.patienceMult * 100)}%
                    </dd>
                    <dt className="text-ink-faint">Setbacks</dt>
                    <dd className="tabular text-ink-soft text-right m-0">
                      {Math.round(d.regressionMult * 100)}%
                    </dd>
                    <dt className="text-ink-faint">Closure</dt>
                    <dd className="text-ink-soft text-right m-0">{d.bankruptcy ? 'possible' : 'never'}</dd>
                  </dl>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="my-4 h-px" style={{ background: 'color-mix(in oklab, var(--color-ink) 12%, transparent)' }} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[0.78rem] text-ink-soft cursor-pointer">
            <input
              type="checkbox"
              checked={showRopes}
              onChange={(e) => setShowRopes(e.target.checked)}
              className="w-4 h-4 accent-[var(--color-amber-deep)]"
            />
            Let Dr. Halloway walk me through the first day
          </label>
          <button className="btn btn-primary text-[0.95rem] px-5 py-2.5" onClick={open}>
            Open the practice
          </button>
        </div>
      </div>
    </div>
  );
}
