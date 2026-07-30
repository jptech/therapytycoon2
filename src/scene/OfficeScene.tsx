import { useEffect, useRef } from 'react';
import { Application, type Ticker } from 'pixi.js';
import { bus } from '../sim/bus';
import { getSim } from '../store';
import { OfficeWorld } from './office';

/**
 * The game's home screen: a full-bleed Pixi canvas showing the practice as a
 * warmly lit cutaway. Every React panel slides *over* this, never replaces it.
 *
 * React's only jobs here are (a) owning the canvas element's lifetime and
 * (b) pumping the world. Sim state is read imperatively via `getSim()` once per
 * frame — subscribing with a hook would re-render React 60 times a second.
 */
export function OfficeScene() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;

    let disposed = false;
    let app: Application | null = null;
    let world: OfficeWorld | null = null;
    let observer: ResizeObserver | null = null;
    const unsubscribe: Array<() => void> = [];

    void (async () => {
      const instance = new Application();
      try {
        await instance.init({
          resizeTo: el,
          backgroundAlpha: 0,
          antialias: true,
          resolution: Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1),
          autoDensity: true,
          preference: 'webgl',
        });
      } catch (err) {
        // No WebGL (or a blocked context). The panels are fully playable
        // without the scene, so fail quietly with a single line.
        console.warn('[office] Could not start the office scene; rendering panels only.', err);
        try {
          instance.destroy(true, { children: true });
        } catch {
          /* the renderer never came up — nothing to tear down */
        }
        return;
      }

      // Pixi v8 init is async: the component may already be gone.
      if (disposed) {
        instance.destroy(true, { children: true });
        return;
      }

      app = instance;
      instance.canvas.style.display = 'block';
      instance.canvas.style.width = '100%';
      instance.canvas.style.height = '100%';
      el.appendChild(instance.canvas);

      const w = new OfficeWorld(instance);
      world = w;
      w.layout(el.clientWidth, el.clientHeight);

      // ── Drive the world ────────────────────────────────────────────────────
      let cssAccum = 0;
      const tick = (ticker: Ticker) => {
        const state = getSim();
        w.update(ticker.deltaMS, state);
        // Let the CSS panels share the scene's time-of-day, cheaply.
        cssAccum += ticker.deltaMS;
        if (cssAccum > 250) {
          cssAccum = 0;
          document.documentElement.style.setProperty('--ambient', w.ambientValue.toFixed(3));
        }
      };
      instance.ticker.add(tick);
      unsubscribe.push(() => instance.ticker.remove(tick));

      // ── Discrete moments from the sim ─────────────────────────────────────
      unsubscribe.push(bus.on('SESSION_STARTED', (p) => w.onSessionStarted(p.session)));
      unsubscribe.push(bus.on('SESSION_COMPLETED', (p) => w.onSessionCompleted(p.result)));
      unsubscribe.push(bus.on('CLIENT_CURED', (p) => w.onClientCured(p.clientId, p.alumni.portrait)));
      unsubscribe.push(bus.on('CLIENT_ARRIVED', (p) => w.onClientArrived(p.clientId)));
      unsubscribe.push(bus.on('DAY_STARTED', () => w.onDayStarted()));
      unsubscribe.push(bus.on('DAY_ENDED', () => w.onDayEnded()));
      unsubscribe.push(bus.on('PRACTICE_LEVELED', () => w.onPracticeLeveled()));
      unsubscribe.push(bus.on('THERAPIST_HIRED', () => w.onTherapistHired()));

      // ── Resize ────────────────────────────────────────────────────────────
      observer = new ResizeObserver(() => {
        if (!disposed) w.layout(el.clientWidth, el.clientHeight);
      });
      observer.observe(el);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      observer = null;
      for (const off of unsubscribe) {
        try {
          off();
        } catch {
          /* ignore */
        }
      }
      unsubscribe.length = 0;
      try {
        world?.destroy();
      } catch {
        /* ignore */
      }
      world = null;
      try {
        app?.destroy(true, { children: true });
      } catch {
        /* ignore */
      }
      app = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    />
  );
}

export default OfficeScene;
