/**
 * Content registry. Every authored data file is re-exported here and indexed
 * by id so the sim never reaches into a specific content module.
 *
 * Adding content is a data change, never an engine change.
 */
import type {
  ArcBeatDef,
  CampaignStageDef,
  GameEventDef,
  MilestoneDef,
  Modality,
  PhilosophyDef,
  ProgramDef,
  Technique,
  TraitDef,
  TrainingDef,
  UpgradeDef,
} from '../sim/types';

import { MODALITIES } from './modalities';
import { TECHNIQUES } from './techniques';
import { TRAITS } from './traits';
import { EVENTS } from './events';
import { ARC_BEATS } from './arcs';
import { PROGRAMS } from './programs';
import { PHILOSOPHIES } from './philosophies';
import { UPGRADES } from './upgrades';
import { TRAININGS } from './trainings';
import { MILESTONES } from './milestones';
import { CAMPAIGN_STAGES } from './campaign';

export {
  MODALITIES,
  TECHNIQUES,
  TRAITS,
  EVENTS,
  ARC_BEATS,
  PROGRAMS,
  PHILOSOPHIES,
  UPGRADES,
  TRAININGS,
  MILESTONES,
  CAMPAIGN_STAGES,
};

export * from './names';
export * from './testimonials';

function index<T extends { id: string }>(arr: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const item of arr) out[item.id] = item;
  return out;
}

export const modalityById: Record<string, Modality> = index(MODALITIES);
export const techniqueById: Record<string, Technique> = index(TECHNIQUES);
export const traitById: Record<string, TraitDef> = index(TRAITS);
export const eventById: Record<string, GameEventDef> = index(EVENTS);
export const arcBeatById: Record<string, ArcBeatDef> = index(ARC_BEATS);
export const programById: Record<string, ProgramDef> = index(PROGRAMS);
export const philosophyById: Record<string, PhilosophyDef> = index(PHILOSOPHIES);
export const upgradeById: Record<string, UpgradeDef> = index(UPGRADES);
export const trainingById: Record<string, TrainingDef> = index(TRAININGS);
export const milestoneById: Record<string, MilestoneDef> = index(MILESTONES);
export const campaignStageById: Record<string, CampaignStageDef> = index(CAMPAIGN_STAGES);

export const techniquesByModality: Record<string, Technique[]> = (() => {
  const out: Record<string, Technique[]> = {};
  for (const t of TECHNIQUES) (out[t.modality] ||= []).push(t);
  return out;
})();

export const eventsByScope: Record<string, GameEventDef[]> = (() => {
  const out: Record<string, GameEventDef[]> = {};
  for (const e of EVENTS) (out[e.scope] ||= []).push(e);
  return out;
})();

export const beatsByChapter: Record<string, ArcBeatDef[]> = (() => {
  const out: Record<string, ArcBeatDef[]> = {};
  for (const b of ARC_BEATS) (out[b.chapter] ||= []).push(b);
  return out;
})();
