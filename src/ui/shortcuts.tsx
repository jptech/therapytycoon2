import { useStore } from '../store';
import { Modal, SectionHeading } from './primitives';

/**
 * Every key the game listens for, written down once.
 *
 * The handlers live in `Hud.tsx` (the clock and the rail) and `SessionOverlay`
 * (the deck), but the *list* lives here so the card the player reads and the
 * keys the game answers to cannot drift apart. If you teach the game a new key,
 * add its line here in the same change.
 */

interface Shortcut {
  /** Each entry is one key cap. Two caps side by side means "or". */
  keys: string[];
  what: string;
  /** When this key is worth pressing, if it isn't always. */
  when?: string;
}

// Deliberately not exported: a non-component export from a .tsx module puts
// React Fast Refresh out of action for the whole file and everything importing
// it, and nothing outside this file needs the list.
const SHORTCUTS: Shortcut[] = [
  { keys: ['Space'], what: 'Hold the day, or let it run on', when: 'while the day is running' },
  { keys: ['1', '2', '3'], what: 'One, two or four times speed' },
  { keys: ['[', ']'], what: 'The door before or after this one on the rail' },
  { keys: ['Esc'], what: 'Close the panel — or set down whatever is open on top of it' },
  { keys: ['1', '2', '3', '4'], what: 'Play that card from the hand', when: 'while a session is asking' },
  { keys: ['?'], what: 'This card' },
];

function Cap({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="tabular inline-grid place-items-center min-w-[1.65rem] h-[1.65rem] px-1.5 text-[0.72rem] font-bold text-ink-soft rounded-[7px]"
      style={{
        background:
          'linear-gradient(180deg, #fffdf8 0%, var(--color-paper) 55%, var(--color-paper-warm) 100%)',
        border: '1px solid color-mix(in oklab, var(--color-ink) 17%, transparent)',
        boxShadow:
          'inset 0 1px 0 rgba(255,253,246,0.9), 0 1px 0 color-mix(in oklab, var(--color-ink) 16%, transparent), 0 2px 3px -2px rgba(24,46,46,0.3)',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </kbd>
  );
}

/** The list itself, so the settings panel and the card can share one rendering. */
export function KeyList() {
  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-1.5">
      {SHORTCUTS.map((s) => (
        <li key={`${s.keys.join('')}-${s.what}`} className="flex items-baseline gap-2.5">
          <span className="shrink-0 flex items-center gap-1 w-[132px]">
            {s.keys.map((k) => (
              <Cap key={k}>{k}</Cap>
            ))}
          </span>
          <span className="text-[0.79rem] text-ink leading-snug">
            {s.what}
            {s.when ? <span className="text-ink-faint"> — {s.when}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The same list, centre stage, reachable from the rail or by pressing `?`. */
export function KeysCard() {
  const setUi = useStore((s) => s.setUi);
  const close = () => setUi({ keysOpen: false });

  return (
    <Modal width={470} onClose={close} labelledBy="keys-card-title">
      <div className="px-5 pt-4 pb-5">
        <div id="keys-card-title">
          <SectionHeading sub="The mouse can do all of this too. These are just the shorter way.">
            Keys
          </SectionHeading>
        </div>
        <KeyList />
        <p className="text-[0.72rem] text-ink-faint leading-snug mt-3.5">
          None of them fire while you are typing, and none of them move the practice on behind a
          decision that is still waiting for you.
        </p>
      </div>
    </Modal>
  );
}
