// TEMPORARY visual harness for EndScreen / PhilosophyModal — deleted after verification.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import './src/ui/theme.css';
import { EndScreen } from './src/ui/EndScreen';
import { PhilosophyModal } from './src/ui/PhilosophyModal';
import { useStore, getSim, dispatch } from './src/store';
import { Rng } from './src/sim/rng';
import { generateTherapist, generateClient } from './src/sim/generators';
import { TESTIMONIALS } from './src/content/testimonials';

type Mode = 'philosophy' | 'accredited' | 'retired' | 'collapsed';

function boot(mode: Mode) {
  useStore.getState().newGame({ seed: 4242, skipTutorial: true, difficulty: 'standard' });
  const s = getSim();
  const rng = new Rng(s.rng);
  s.practiceLevel = 4;
  s.day = 87;
  s.reputation = 68;
  s.communityTrust = 55;

  for (let i = 1; i < 5; i++) {
    const t = generateTherapist(s, rng, {});
    t.hiredDay = 3 + i * 11;
    t.tenure = 87 - t.hiredDay;
    t.stats.sessions = 40 + i * 23;
    t.stats.cures = i;
    if (i === 4) {
      t.status = 'departed';
      t.tenure = 22;
    }
    s.therapists.push(t);
  }
  s.therapists[0].tenure = 87;
  s.therapists[0].stats.sessions = 191;
  s.therapists[0].stats.cures = 8;

  for (let i = 0; i < 6; i++) {
    const c = generateClient(s, rng, {});
    c.status = 'active';
    s.clients.push(c);
  }

  s.alumni = Array.from({ length: 17 }, (_, i) => {
    const c = generateClient(s, rng, {});
    return {
      id: 'al' + i,
      handle: c.handle,
      firstName: c.firstName,
      portrait: c.portrait,
      condition: c.condition,
      curedDay: 10 + i * 4,
      sessions: 12 + (i % 7),
      therapistId: s.therapists[i % 4].id,
      therapistName: s.therapists[i % 4].name,
      testimonial: TESTIMONIALS[i % TESTIMONIALS.length]?.text ?? 'It helped.',
      complex: i % 5 === 0,
    };
  });

  s.stats.sessionsRun = 412;
  s.stats.cures = 19;
  s.stats.complexCures = 5;
  s.stats.breakthroughs = 24;
  s.stats.dropouts = 6;
  s.stats.maxStreak = 11;
  s.stats.qualitySum = 285;
  s.stats.qualityCount = 412;
  s.stats.totalRevenue = 148200;
  s.stats.totalExpenses = 131400;
  s.stats.daysPlayed = 87;
  s.stats.history = Array.from({ length: 60 }, (_, i) => ({
    day: i + 1,
    cash: 3000 + i * 40,
    reputation: 20 + i * 0.9,
    communityTrust: 30 + i * 0.4,
    clients: 4 + Math.floor(i / 6),
    therapists: 1 + Math.floor(i / 18),
    avgQuality: 0.62 + i * 0.002,
    avgMorale: 58,
    avgEnergy: 62,
    cures: Math.floor(i / 3),
    revenue: 900,
    expenses: 780,
    practiceLevel: 1 + Math.floor(i / 18),
  }));
  s.milestonesEarned = ['ms_first_cure', 'ms_five_cures'];
  s.programs = [
    { id: 'group_therapy', startedDay: 41, therapistIds: [], progressDays: 0, active: true, lifetimeCash: 9200 },
    { id: 'workshops', startedDay: 58, therapistIds: [], progressDays: 0, active: false, lifetimeCash: 3100 },
  ];
  s.legacy = { points: 14, spent: ['legacy_reputation'], runsCompleted: 2 };

  if (mode === 'philosophy') {
    s.flags.philosophyAvailable = true;
    s.practiceLevel = 3;
    delete s.ended;
  } else {
    s.philosophy = 'trauma_informed';
    s.ended = { kind: mode, day: 87 };
    if (mode !== 'collapsed') {
      s.log.unshift({
        id: 'lg',
        day: 87,
        minute: 0,
        text: 'Run complete. 14 legacy points banked.',
        kind: 'milestone',
        tone: 'good',
      });
    }
    if (mode === 'accredited') s.campaign.accredited = true;
  }
  dispatch({ type: 'ADVANCE_TUTORIAL', step: s.tutorialStep });
}

function Harness() {
  const [mode, setMode] = useState<Mode>('philosophy');
  const [ready, setReady] = useState(false);
  if (!ready) {
    boot(mode);
    setReady(true);
  }
  const pick = (m: Mode) => {
    boot(m);
    setMode(m);
  };
  return (
    <div style={{ height: '100%' }}>
      <div style={{ position: 'fixed', zIndex: 200, top: 6, left: 6, display: 'flex', gap: 6 }}>
        {(['philosophy', 'accredited', 'retired', 'collapsed'] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => pick(m)}
            style={{
              background: m === mode ? '#E8A94C' : '#FAF5EC',
              border: '1px solid #1E3A3A',
              borderRadius: 999,
              padding: '3px 10px',
              fontSize: 11,
              fontFamily: 'monospace',
            }}
          >
            {m}
          </button>
        ))}
      </div>
      <PhilosophyModal />
      <EndScreen />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
