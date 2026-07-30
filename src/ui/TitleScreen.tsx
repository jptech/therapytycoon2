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
        <linearGradient id="tt-pane" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#FBE6BB" />
          <stop offset="58%" stopColor="#F0C374" />
          <stop offset="100%" stopColor="#DE9F49" />
        </linearGradient>
        <linearGradient id="tt-spill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E8A94C" stopOpacity="0.34" />
          <stop offset="100%" stopColor="#E8A94C" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* the glow the whole picture hangs on */}
      <ellipse
        cx="160"
        cy="122"
        rx="158"
        ry="128"
        fill="url(#tt-lampglow)"
        className={animate ? 'animate-flicker' : ''}
      />

      {/* light spilling onto the pavement */}
      <path d="M66 206 L254 206 L302 258 L18 258 Z" fill="url(#tt-spill)" />

      {/* brickwork */}
      <rect x="40" y="22" width="240" height="188" rx="12" fill="#1B3134" />
      <g stroke="#26454a" strokeWidth="1.2" opacity="0.8">
        <path d="M40 60h240M40 98h240M40 136h240M40 174h240" />
      </g>
      <rect x="40" y="22" width="240" height="188" rx="12" fill="none" stroke="#2E5257" strokeWidth="2" />

      {/* the pane */}
      <rect x="62" y="44" width="196" height="152" rx="7" fill="url(#tt-pane)" />

      {/* what is happening in there */}
      <g fill="#1E3A3A">
        {/* rug */}
        <ellipse cx="152" cy="180" rx="66" ry="11" opacity="0.2" />
        {/* couch */}
        <path d="M78 186v-24a9 9 0 019-9h44a9 9 0 019 9v24z" opacity="0.82" />
        <path d="M74 186v-14a7 7 0 017-7h2v21zM145 186v-21h2a7 7 0 017 7v14z" opacity="0.7" />
        {/* the other chair, angled slightly away */}
        <path d="M196 186v-19a8 8 0 018-8h12a8 8 0 018 8v19z" opacity="0.72" />
        {/* side table + mug */}
        <rect x="166" y="168" width="20" height="3" rx="1.5" opacity="0.66" />
        <rect x="174" y="171" width="4" height="15" rx="1.5" opacity="0.66" />
        <path d="M170 162h9v5a2.5 2.5 0 01-2.5 2.5h-4A2.5 2.5 0 01170 167zm9 1.2h2a2 2 0 010 4h-2z" opacity="0.75" />
        {/* floor lamp */}
        <rect x="228" y="120" width="3" height="66" rx="1.5" opacity="0.8" />
        <path d="M214 118l6-17h22l6 17z" opacity="0.86" />
      </g>
      {/* the bulb itself */}
      <circle cx="229.5" cy="120" r="15" fill="#FDF3D8" opacity="0.55" className={animate ? 'animate-flicker' : ''} />
      <circle cx="229.5" cy="118" r="4.6" fill="#FFF9EA" />

      {/* plant on the sill */}
      <g className={animate ? 'animate-float' : ''} style={{ transformOrigin: '96px 190px' }}>
        <path d="M92 168c-9-4-13-13-11-22 9 1 15 8 15 17z" fill="#5F8460" opacity="0.92" />
        <path d="M100 166c8-5 11-14 8-23-9 2-14 10-13 19z" fill="#8FAF8B" opacity="0.95" />
        <path d="M96 172c-1-12-1-20 0-26" stroke="#5F8460" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M87 172h18l-2.4 14H89.4z" fill="#C2634F" />
        <rect x="85.4" y="169" width="21.2" height="4" rx="1.8" fill="#A8523F" />
      </g>

      {/* frame */}
      <g stroke="#132427" strokeWidth="6" fill="none" strokeLinejoin="round">
        <rect x="62" y="44" width="196" height="152" rx="7" />
        <path d="M160 44v152M62 120h196" />
      </g>
      {/* sill */}
      <rect x="50" y="194" width="220" height="12" rx="5" fill="#2E5257" />
      <rect x="50" y="194" width="220" height="4" rx="2" fill="#3D6a70" opacity="0.7" />
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
      className="mt-8 w-full rounded-[14px] px-4 py-3.5 text-left"
      style={{
        background: 'color-mix(in oklab, var(--color-paper) 8%, transparent)',
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
                    boxShadow: on ? `0 0 0 2px color-mix(in oklab, ${m.color} 55%, transparent)` : 'var(--shadow-soft)',
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
                    boxShadow: on ? `0 0 0 2px color-mix(in oklab, ${accent} 55%, transparent)` : 'var(--shadow-soft)',
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
