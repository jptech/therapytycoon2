import { useCallback, useEffect, useRef, useState } from 'react';
import { downloadSave, importSave, listAutosaves, loadAutosave } from '../../sim/save';
import type { GameSettings } from '../../sim/types';
import { adoptState, getSim, saveNow, useDispatch, useSim, useStore } from '../../store';
import { Button, Divider, PanelShell, SectionHeading } from '../primitives';
import { KeyList } from '../shortcuts';

/**
 * Comfort, keeping, and the exit.
 *
 * Two jobs: the accessibility switches (which write straight through
 * SET_SETTING and are mirrored onto <html> so theme.css can damp motion and
 * hide `.juice-only` globally), and everything to do with the save file —
 * including the two doors out of a run, both behind a confirm that says
 * plainly what happens.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Small parts
// ─────────────────────────────────────────────────────────────────────────────

function Toggle({
  label,
  hint,
  checked,
  onChange,
  divider,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Hairline rule above this row — set on every row but the first in a group. */
  divider?: boolean;
}) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-2"
      style={
        divider
          ? { borderTop: '1px solid color-mix(in oklab, var(--color-ink) 9%, transparent)' }
          : undefined
      }
    >
      <div className="min-w-0">
        <div className="text-[0.83rem] font-bold text-ink leading-snug">{label}</div>
        {hint ? <div className="text-[0.72rem] text-ink-faint leading-snug mt-0.5">{hint}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="shrink-0 mt-0.5 relative w-[46px] h-[26px] rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          background: checked
            ? 'linear-gradient(180deg, var(--color-amber) 0%, var(--color-amber-deep) 100%)'
            : 'color-mix(in oklab, var(--color-ink) 13%, transparent)',
          border: '1px solid color-mix(in oklab, var(--color-ink) 17%, transparent)',
        }}
      >
        <span
          aria-hidden
          className="absolute top-[2px] w-[20px] h-[20px] rounded-full"
          style={{
            left: checked ? 22 : 2,
            background: 'var(--color-paper)',
            boxShadow: 'var(--shadow-soft)',
            transition: 'left 0.18s var(--ease-warm)',
          }}
        />
      </button>
    </div>
  );
}

/** A destructive action that has to be asked twice, and says why. */
function ConfirmButton({
  idle,
  confirm,
  explain,
  variant = 'ghost',
  onConfirm,
  disabled,
}: {
  idle: string;
  confirm: string;
  explain: string;
  variant?: 'ghost' | 'brick' | 'plum' | 'sage' | 'primary';
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 6000);
    return () => window.clearTimeout(id);
  }, [armed]);

  if (!armed) {
    return (
      <Button variant={variant} size="sm" disabled={disabled} onClick={() => setArmed(true)}>
        {idle}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <span className="text-[0.7rem] text-ink-soft leading-snug max-w-[34ch]">{explain}</span>
      <span className="inline-flex gap-1.5">
        <Button
          variant={variant === 'ghost' ? 'brick' : variant}
          size="sm"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
        >
          {confirm}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
          Not now
        </Button>
      </span>
    </span>
  );
}

function relativeTime(ts: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Root
// ─────────────────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  const dispatch = useDispatch();
  const openPanel = useStore((s) => s.openPanel);
  const setUi = useStore((s) => s.setUi);

  const calm = useSim((s) => s.settings.calmMode);
  const reduced = useSim((s) => s.settings.reducedMotion);
  const sound = useSim((s) => s.settings.sound);
  const music = useSim((s) => s.settings.music);
  const volume = useSim((s) => s.settings.volume);
  const autoPause = useSim((s) => s.settings.autoPauseOnEvent);
  const advanced = useSim((s) => s.settings.showAdvancedNumbers);

  const day = useSim((s) => s.day);
  const practiceName = useSim((s) => s.practiceName);
  const legacyPoints = useSim((s) => s.legacy.points);
  const runsCompleted = useSim((s) => s.legacy.runsCompleted);
  const ended = useSim((s) => s.ended?.kind ?? '');

  // theme.css keys `.juice-only` and its motion damper off these two attributes.
  useEffect(() => {
    document.documentElement.dataset.calm = String(calm);
  }, [calm]);
  useEffect(() => {
    document.documentElement.dataset.reduced = String(reduced);
  }, [reduced]);

  const set = useCallback(
    (key: keyof GameSettings, value: boolean | number) => dispatch({ type: 'SET_SETTING', key, value }),
    [dispatch],
  );

  const [autosaves, setAutosaves] = useState(() => listAutosaves());
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refreshAutosaves = useCallback(() => setAutosaves(listAutosaves()), []);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 4200);
    return () => window.clearTimeout(id);
  }, [notice]);

  const onSaveNow = useCallback(() => {
    saveNow();
    refreshAutosaves();
    setNotice({ tone: 'good', text: 'Saved. The lights stay on where you left them.' });
  }, [refreshAutosaves]);

  const onExport = useCallback(() => {
    downloadSave(getSim());
    setNotice({ tone: 'good', text: 'A copy is on its way to your downloads folder.' });
  }, []);

  const onImportFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const state = importSave(text);
      if (!adoptState(state)) {
        setNotice({ tone: 'bad', text: 'That file did not look like a Lamplit Clinic save.' });
        return;
      }
      setNotice({ tone: 'good', text: 'Loaded. Everything is where that save left it.' });
    } catch {
      setNotice({ tone: 'bad', text: 'The file could not be read. Try exporting it again.' });
    }
  }, []);

  const onRestore = useCallback((index: number) => {
    if (!adoptState(loadAutosave(index))) {
      setNotice({ tone: 'bad', text: 'That autosave would not open. The others may still be fine.' });
      return;
    }
    setNotice({ tone: 'good', text: 'Restored. The intervening days are gone; the lesson is not.' });
  }, []);

  return (
    <PanelShell
      title="Comfort & keeping"
      icon="🕯️"
      subtitle="How the game behaves, and where your practice is kept."
      onClose={() => openPanel(null)}
      footer={
        <div className="flex items-center justify-between gap-3 text-[0.7rem] text-ink-faint">
          <span>{practiceName}</span>
          <span className="tabular">Day {day}</span>
        </div>
      }
    >
      {notice ? (
        <div
          role="status"
          className="mb-3 px-3 py-2 rounded-[12px] text-[0.76rem] leading-snug"
          style={{
            background:
              notice.tone === 'good'
                ? 'color-mix(in oklab, var(--color-sage) 20%, transparent)'
                : 'color-mix(in oklab, var(--color-brick) 20%, transparent)',
            color: notice.tone === 'good' ? 'var(--color-sage-deep)' : 'var(--color-brick)',
          }}
        >
          {notice.text}
        </div>
      ) : null}

      {/* ── Comfort ─────────────────────────────────────────────────────── */}
      <SectionHeading sub="Nothing here changes the odds. It only changes the volume.">
        Comfort
      </SectionHeading>

      <div className="card-warm px-3 py-1">
        <Toggle
          label="Calm mode"
          hint="Fewer effects, same game. Ceremonies, confetti and glows step aside; every number, toast and reason stays exactly where it was."
          checked={calm}
          onChange={(v) => set('calmMode', v)}
        />
        <Toggle
          divider
          label="Reduced motion"
          hint="Holds still. Panels appear instead of sliding, meters jump instead of easing. Your system setting already does this; this makes it certain."
          checked={reduced}
          onChange={(v) => set('reducedMotion', v)}
        />
        <Toggle
          divider
          label="Auto-pause on decisions"
          hint="Stops the clock whenever the room asks you something. Off means the day keeps moving while you read."
          checked={autoPause}
          onChange={(v) => set('autoPauseOnEvent', v)}
        />
        <Toggle
          divider
          label="Show advanced numbers"
          hint="Puts the raw quality terms, multipliers and probabilities on the cards that currently describe them in words."
          checked={advanced}
          onChange={(v) => set('showAdvancedNumbers', v)}
        />
      </div>

      <Divider label="Sound" />

      <div className="card-warm px-3 py-1">
        <Toggle
          label="Sound effects"
          hint="Doors, kettles, the soft chime when an hour lands well."
          checked={sound}
          onChange={(v) => set('sound', v)}
        />
        <Toggle
          divider
          label="Music"
          hint="A quiet room-tone score that thins out in the evening."
          checked={music}
          onChange={(v) => set('music', v)}
        />
        <div
          className="py-2.5"
          style={{ borderTop: '1px solid color-mix(in oklab, var(--color-ink) 9%, transparent)' }}
        >
          <label className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-[0.83rem] font-bold text-ink">Volume</span>
            <span className="tabular text-[0.72rem] text-ink-faint">{Math.round(volume * 100)}%</span>
          </label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            disabled={!sound && !music}
            aria-label="Overall volume"
            onChange={(e) => set('volume', Number(e.target.value))}
            className="w-full accent-[var(--color-amber-deep)] disabled:opacity-40"
          />
        </div>
      </div>

      {/* ── Keys ────────────────────────────────────────────────────────── */}
      <Divider label="Keys" />
      <SectionHeading sub="The mouse can do all of this too. These are just the shorter way.">
        Without reaching for the mouse
      </SectionHeading>

      <div className="card-warm px-3 py-2.5">
        <KeyList />
      </div>
      <p className="text-[0.71rem] text-ink-faint leading-snug mt-2">
        The same card is under <span className="font-bold">⌨ ?</span> at the foot of the rail, or by pressing{' '}
        <span className="font-bold">?</span> anywhere.
      </p>

      {/* ── Keeping ─────────────────────────────────────────────────────── */}
      <Divider label="Keeping" />
      <SectionHeading sub="The game saves itself at the top of every day. These are the manual doors.">
        Your save
      </SectionHeading>

      <div className="flex flex-wrap gap-1.5">
        <Button variant="primary" size="sm" onClick={onSaveNow}>
          Save now
        </Button>
        <Button variant="ghost" size="sm" onClick={onExport}>
          Export a copy
        </Button>
        <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
          Import a save
        </Button>
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
      <p className="text-[0.71rem] text-ink-faint leading-snug mt-2">
        Importing replaces the run you are in right now. Export first if you would like to keep it.
      </p>

      <div className="mt-3.5">
        <SectionHeading
          sub="The last five mornings, kept automatically."
          right={
            <button
              onClick={refreshAutosaves}
              className="text-[0.68rem] text-ink-faint underline underline-offset-2 hover:text-ink-soft transition bg-transparent border-0 p-0 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Refresh
            </button>
          }
        >
          Rewind
        </SectionHeading>

        {autosaves.length === 0 ? (
          <p className="text-[0.74rem] text-ink-faint leading-snug">
            Nothing kept yet. The first autosave lands when tomorrow opens.
          </p>
        ) : (
          <ul className="list-none p-0 m-0 grid gap-1.5">
            {autosaves.map((a) => (
              <li
                key={`${a.index}-${a.savedAt}`}
                className="card-warm px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-[0.8rem] font-bold text-ink leading-snug tabular">{a.label}</div>
                  <div className="text-[0.68rem] text-ink-faint leading-snug">{relativeTime(a.savedAt)}</div>
                </div>
                <ConfirmButton
                  idle="Restore"
                  confirm="Go back"
                  explain={`Everything since ${a.label} is undone — sessions, money, goodbyes and all.`}
                  onConfirm={() => onRestore(a.index)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── The way out ─────────────────────────────────────────────────── */}
      <Divider label="The way out" />

      <div className="card-warm px-3.5 py-3">
        <h3 className="display text-[0.98rem] text-ink">Retire this run</h3>
        <p className="text-[0.75rem] text-ink-soft leading-relaxed mt-1">
          Close the practice on your own terms. Retiring banks{' '}
          <b>legacy points</b> — earned from the people who finished here, the standing you built, the
          accreditation stages you cleared and the length of your wall — and those points come with you into
          your next practice. The run ends; nothing about it is deleted.
        </p>
        <p className="text-[0.72rem] text-ink-faint leading-snug mt-1.5 tabular">
          Banked so far: {legacyPoints} point{legacyPoints === 1 ? '' : 's'} across {runsCompleted} finished
          run{runsCompleted === 1 ? '' : 's'}.
        </p>
        <div className="mt-2.5 flex flex-wrap items-start gap-2">
          <ConfirmButton
            idle={ended ? 'Already ended' : 'Retire this run'}
            confirm="Retire, and bank it"
            explain="The clock stops for good on this practice. Your legacy points are added to the bank and the run is written up."
            variant="plum"
            disabled={!!ended}
            onConfirm={() => dispatch({ type: 'RETIRE_RUN' })}
          />
          <ConfirmButton
            idle="Back to the front door"
            confirm="Leave the run open"
            explain="Returns to the title screen. Nothing is retired and nothing is deleted — your save is still there under Continue."
            onConfirm={() => setUi({ screen: 'title', panel: null })}
          />
        </div>
      </div>

      <p className="text-[0.7rem] text-ink-faint leading-relaxed mt-3">
        Saves live in this browser. Clearing site data clears them, so export a copy before you do anything
        clever with your browser settings.
      </p>
    </PanelShell>
  );
}
