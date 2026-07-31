import type { SessionType } from '../sim/types';
import { SESSION_TYPE_LABEL } from '../sim/session';
import { Chip } from './primitives';

/**
 * The words for a room with more than one person in it.
 *
 * Four shapes of hour exist in the sim — individual, couples, family, group —
 * and five separate surfaces have to describe them: the day book, the caseload,
 * the decision beat, the reflect card and the evening ledger. They all say the
 * same things here so a couple is never "Couples session (2 clients)" in one
 * place and "A.M. and their partner" in another.
 *
 * Nothing in this file reads state. It takes what the sim already recorded —
 * `client.partnerHandles`, `SessionResult.group.handles` — and turns it into
 * sentences.
 */

export const SESSION_TYPE_COLOR: Record<SessionType, string> = {
  individual: 'var(--color-ink-faint)',
  couples: 'var(--color-amber-deep)',
  family: 'var(--color-plum)',
  group: 'var(--color-sage-deep)',
};

/** Small-number words. Six people in a circle reads better than a numeral. */
const COUNT_WORD = ['nobody', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export function countWord(n: number): string {
  return COUNT_WORD[n] ?? String(n);
}

/** "Rosa", "Rosa and Dana", "Rosa, Dana and Theo" — never an Oxford comma. */
export function andList(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/**
 * A list that has to fit in a grid cell. Two names, then a count — "K.O., R.T.
 * and 3 more" — because a column 8.5rem wide cannot hold six sets of initials
 * and truncating mid-name looks like a bug.
 */
export function joinHandles(handles: string[], max = 2): string {
  if (handles.length <= max) return andList(handles);
  return `${handles.slice(0, max).join(', ')} and ${handles.length - max} more`;
}

/**
 * What the room is, in the fewest words that are still true. `size` is the
 * number of *cases* in it — a couples case is one case and two people, which is
 * why couples and family don't take a count.
 */
export function roomTitle(type: SessionType, size = 1): string {
  // No leading article: this lands in a grid cell 8.5rem wide, and "A room of
  // four" truncated to "A room of …" loses the only number that mattered.
  if (type === 'group') return size > 1 ? `Room of ${countWord(size)}` : 'A group room';
  if (type === 'couples') return 'The two of them';
  if (type === 'family') return 'The family, together';
  return 'One to one';
}

/**
 * The line a caseload card carries under the presenting problem. Returns null
 * for an ordinary individual case, which is most of them — the card should not
 * grow a row to say "on their own".
 */
export function companionLine(type: SessionType, partners: string[] = []): string | null {
  // Handles are initials and already end in a full stop, so a clause after one
  // takes a dash rather than a second period — "with R.T.. The work is…" is the
  // kind of small wrongness that makes careful writing look careless.
  if (type === 'couples') {
    return partners.length
      ? `Comes in with ${andList(partners)} — the work is the pair, not either of them.`
      : 'Comes in as a couple. The work is the pair, not either of them.';
  }
  if (type === 'family') {
    return partners.length
      ? `Comes in with ${andList(partners)} — everyone it concerns is in the room.`
      : 'Comes in as a family. Everyone it concerns is in the room.';
  }
  if (type === 'group') {
    return 'Seen in a group room — never the only person in the hour.';
  }
  return null;
}

/** The chip every surface uses for a non-individual case. */
export function SessionTypeChip({
  type,
  partners = [],
}: {
  type: SessionType;
  partners?: string[];
}) {
  if (type === 'individual') return null;
  const line = companionLine(type, partners);
  return (
    <Chip color={SESSION_TYPE_COLOR[type]} title={line ?? undefined}>
      {type === 'group' ? '◎ ' : '🤝 '}
      {SESSION_TYPE_LABEL[type]}
    </Chip>
  );
}
