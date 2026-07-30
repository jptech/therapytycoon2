/**
 * Aggregated event registry.
 *
 * Life events are the ones that happen *to* people — a client's landlord, a
 * therapist's mother, a Tuesday that goes sideways. Practice events are the
 * ones that happen to the clinic: the boiler, the board, the newspaper.
 */
import { LIFE_EVENTS } from './events-life';
import { PRACTICE_EVENTS } from './events-practice';
import type { GameEventDef } from '../sim/types';

export const EVENTS: readonly GameEventDef[] = [...LIFE_EVENTS, ...PRACTICE_EVENTS];
