import { Suspense, lazy, useEffect } from 'react';
import { isStuck, startClock, stopClock, useSim, useStore, useUi, saveNow } from './store';
import { useAudio } from './audio/useAudio';
import { keysCardOwnsScreen, useModals } from './ui/modals';
import { KeysCard } from './ui/shortcuts';

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
import { PracticePanel } from './ui/panels/PracticePanel';
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
  practice: PracticePanel,
  wall: WallPanel,
  settings: SettingsPanel,
  log: LogPanel,
} as const;

export function App() {
  const screen = useUi((u) => u.screen);
  const panel = useUi((u) => u.panel);
  const dayPhase = useSim((s) => s.dayPhase);
  const calm = useSim((s) => s.settings.calmMode);
  const reduced = useSim((s) => s.settings.reducedMotion);
  // One set of predicates for what owns the centre of the screen, shared with
  // the keyboard layer so the two can never disagree — see src/ui/modals.ts.
  // The pending-event ones come from src/sim/pending.ts, exactly as the modals
  // themselves use to pick their subject.
  const modal = useModals();
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

      {/* Modals, most-blocking first — same order as ModalState. */}
      {modal.ended ? <EndScreen /> : null}
      {modal.session ? <SessionOverlay /> : null}
      {!modal.session && modal.event ? <EventModal /> : null}
      {modal.hire ? <HireModal /> : null}
      {modal.philosophy ? <PhilosophyModal /> : null}
      {modal.quarter ? <QuarterReview /> : null}
      {keysCardOwnsScreen(modal) ? <KeysCard /> : null}
    </div>
  );
}
