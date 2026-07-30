// TEMPORARY visual harness for src/scene — deleted after verification.
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { OfficeScene } from './src/scene/OfficeScene';
import { useStore, getSim, startClock, dispatch } from './src/store';
import { Rng } from './src/sim/rng';
import { generateTherapist, generateClient } from './src/sim/generators';

function boot(level: number, therapists: number, alumniCount: number) {
  useStore.getState().newGame({ seed: 1234, skipTutorial: true, difficulty: 'standard' });
  const s = getSim();
  const rng = new Rng(s.rng);
  s.practiceLevel = level;
  for (let i = 1; i < therapists; i++) {
    const t = generateTherapist(s, rng, {});
    s.therapists.push(t);
  }
  // Give everyone a client and book the day out.
  for (let i = 0; i < therapists * 2; i++) {
    const c = generateClient(s, rng, {});
    c.status = 'active';
    s.clients.push(c);
  }
  s.alumni = Array.from({ length: alumniCount }, (_, i) => ({
    id: 'a' + i,
    handle: 'A.M.',
    firstName: 'A',
    portrait: s.therapists[0].portrait,
    condition: 'anxiety' as const,
    curedDay: 1,
    sessions: 8,
    therapistId: '',
    therapistName: '',
    testimonial: '',
    complex: false,
  }));
  s.rng = rng.state;
  dispatch({ type: 'START_DAY' });
  dispatch({ type: 'AUTOFILL_SCHEDULE' });
  dispatch({ type: 'TICK', dtMinutes: 1 });
  startClock();
}

function Harness() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    boot(Number(q.get('level') ?? 1), Number(q.get('staff') ?? 1), Number(q.get('alumni') ?? 6));
    // Jump to a time of day.
    const min = Number(q.get('min') ?? 0);
    if (min) dispatch({ type: 'TICK', dtMinutes: min });
    setReady(true);
  }, []);
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#16292c' }}>
      {ready ? <OfficeScene /> : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Harness />);
