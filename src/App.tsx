import { Suspense, lazy, useEffect } from 'react';
import { startClock, stopClock, useSim, useStore, useUi, saveNow } from './store';
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
const OfficeScene = lazy(() =>
  import('./scene/OfficeScene')
    .then((m) => ({ default: m.OfficeScene }))
    .catch(() => ({ default: () => null })),
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
  const hasSessionDecision = useSim((s) => s.pendingEvents.some((p) => !!p.techniqueCards));
  const hasPlainEvent = useSim((s) => s.pendingEvents.some((p) => !p.techniqueCards));

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
