import { Suspense, lazy, useEffect } from 'react';
import { isStuck, pendingChoice, pendingDecision, startClock, stopClock, useSim, useStore, useUi, saveNow } from './store';
import { useAudio } from './audio/useAudio';

import { Hud } from './ui/Hud';
import { MorningBrief, DayEndScreen } from './ui/DayFlow';
import { SessionOverlay } from './ui/SessionOverlay';
import { ReflectCard } from './ui/ReflectCard';
import { EventModal } from './ui/EventModal';
import { Celebrations } from './ui/Celebrations';
import { TitleScreen } from './ui/TitleScreen';
import { Onboarding } from './ui/Onboarding';
import { QuarterReview } from './ui/QuarterReview';
import { PhilosophyModal } from './ui/PhilosophyModal';
import { EndScreen } from './ui/EndScreen';
import { HireModal, StaffPanel } from './ui/panels/StaffPanel';
import { SchedulePanel } from './ui/panels/SchedulePanel';
import { ClientsPanel } from './ui/panels/ClientsPanel';
import { FinancesPanel } from './ui/panels/FinancesPanel';
import { UpgradesPanel } from './ui/panels/UpgradesPanel';
import { ProgramsPanel } from './ui/panels/ProgramsPanel';
import { PoliciesPanel } from './ui/panels/PoliciesPanel';
import { CampaignPanel } from './ui/panels/CampaignPanel';
import { WallPanel } from './ui/panels/WallPanel';
import { SettingsPanel } from './ui/panels/SettingsPanel';
import { LogPanel } from './ui/panels/LogPanel';

/**
 * The Pixi office scene is the heaviest module and the only one that can fail
 * on a machine without WebGL, so it loads lazily behind a boundary. The game is
 * fully playable if it never arrives.
 */
function NoScene(): React.ReactElement {
  return <></>;
}

const OfficeScene = lazy(() =>
  import('./scene/OfficeScene')
    .then((m) => ({ default: m.OfficeScene }))
    .catch((err) => {
      console.warn('[scene] office scene unavailable — the game plays fine without it', err);
      return { default: NoScene };
    }),
);

const PANELS = {
  schedule: SchedulePanel,
  clients: ClientsPanel,
  staff: StaffPanel,
  finances: FinancesPanel,
  upgrades: UpgradesPanel,
  programs: ProgramsPanel,
  policies: PoliciesPanel,
  campaign: CampaignPanel,
  wall: WallPanel,
  settings: SettingsPanel,
  log: LogPanel,
} as const;

export function App() {
  const screen = useUi((u) => u.screen);
  const panel = useUi((u) => u.panel);
  const hireOpen = useUi((u) => u.hireOpen);
  const dayPhase = useSim((s) => s.dayPhase);
  const ended = useSim((s) => !!s.ended);
  const calm = useSim((s) => s.settings.calmMode);
  const reduced = useSim((s) => s.settings.reducedMotion);
  const philosophyOffered = useSim((s) => !!s.flags.philosophyAvailable && !s.philosophy);
  const quarterReview = useSim((s) => !!s.flags.showQuarterReview);
  // Same predicates the modals use to pick their subject — see store.ts.
  const hasSessionDecision = useSim((s) => !!pendingDecision(s));
  const hasPlainEvent = useSim((s) => !!pendingChoice(s));
  const stuck = useSim(isStuck);

  useAudio();

  useEffect(() => {
    startClock();
    return stopClock;
  }, []);

  // Comfort settings are applied at the document level so the CSS can respond
  // without every component threading the flag through.
  useEffect(() => {
    document.documentElement.dataset.calm = String(calm);
  }, [calm]);
  useEffect(() => {
    document.documentElement.dataset.reduced = String(reduced);
  }, [reduced]);

  // Watchdog. The clock is blocked while events are pending, so an event no
  // modal will render is an unrecoverable freeze — and a silent one, because
  // pause/play cannot clear it. Belt and braces on top of the shared selectors:
  // drop it, say so loudly, and let the day continue.
  useEffect(() => {
    if (!stuck) return;
    const s = useStore.getState().game.state;
    console.error(
      '[watchdog] pending events with no modal to resolve them — dropping to unblock the clock',
      s.pendingEvents.map((p) => ({ id: p.def.id, cards: p.techniqueCards?.length })),
    );
    s.pendingEvents = [];
    if (s.dayPhase === 'running') s.paused = false;
    useStore.setState({ rev: useStore.getState().rev + 1 });
  }, [stuck]);

  // Save on the way out so a closed tab never costs a day.
  useEffect(() => {
    const onHide = () => {
      if (useStore.getState().ui.screen === 'playing') saveNow();
    };
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  if (screen !== 'playing') return <TitleScreen />;

  const Panel = panel ? PANELS[panel] : null;

  return (
    <div className="relative w-full h-full overflow-hidden bg-night">
      <Suspense fallback={null}>
        <OfficeScene />
      </Suspense>

      <Hud />

      {Panel ? <Panel /> : null}

      {dayPhase === 'morning_brief' ? <MorningBrief /> : null}
      {dayPhase === 'day_end' ? <DayEndScreen /> : null}

      <ReflectCard />
      <Celebrations />
      <Onboarding />

      {/* Modals, most-blocking first. */}
      {ended ? <EndScreen /> : null}
      {hasSessionDecision ? <SessionOverlay /> : null}
      {!hasSessionDecision && hasPlainEvent ? <EventModal /> : null}
      {hireOpen ? <HireModal /> : null}
      {philosophyOffered ? <PhilosophyModal /> : null}
      {quarterReview ? <QuarterReview /> : null}
    </div>
  );
}
