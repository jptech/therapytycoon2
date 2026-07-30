import type { SimEvents, SimEventName } from './types';

type Handler<K extends SimEventName> = (payload: SimEvents[K]) => void;

/**
 * Tiny typed event bus. The sim emits; the UI, audio and Pixi scene subscribe.
 * Emission is synchronous and re-entrancy safe (handlers are snapshotted).
 */
export class EventBus {
  private handlers = new Map<SimEventName, Set<(p: unknown) => void>>();
  private anyHandlers = new Set<(name: SimEventName, p: unknown) => void>();

  on<K extends SimEventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as (p: unknown) => void);
    return () => set!.delete(fn as (p: unknown) => void);
  }

  onAny(fn: (name: SimEventName, p: unknown) => void): () => void {
    this.anyHandlers.add(fn);
    return () => this.anyHandlers.delete(fn);
  }

  emit<K extends SimEventName>(name: K, payload: SimEvents[K]): void {
    const set = this.handlers.get(name);
    if (set && set.size) {
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[bus] handler for ${String(name)} threw`, err);
        }
      }
    }
    if (this.anyHandlers.size) {
      for (const fn of [...this.anyHandlers]) {
        try {
          fn(name, payload);
        } catch (err) {
          console.error('[bus] any-handler threw', err);
        }
      }
    }
  }

  clear(): void {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}

/** The bus the running game uses. The balance harness makes its own. */
export const bus = new EventBus();
