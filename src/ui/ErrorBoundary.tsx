import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadSave, listAutosaves, loadAutosave } from '../sim/save';
import { adoptState, useStore } from '../store';

/**
 * A render error anywhere in the tree would otherwise unmount the whole game,
 * which reads to a player as "it froze". The simulation state is intact when
 * this happens — it lives outside React — so the honest thing to do is say what
 * broke and offer the three recoveries that actually work: carry on, roll back
 * to an autosave, or export the save so the run is not lost.
 */
interface State {
  error: Error | null;
  info: string;
  attempt: number;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: '', attempt: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] render failed', error, info.componentStack);
    this.setState({ info: (info.componentStack ?? '').split('\n').slice(0, 6).join('\n') });
  }

  private retry = () => {
    this.setState((s) => ({ error: null, info: '', attempt: s.attempt + 1 }));
  };

  private rollBack = () => {
    const saves = listAutosaves();
    if (!saves.length) return;
    const state = loadAutosave(0);
    if (adoptState(state)) this.retry();
  };

  private exportRun = () => {
    downloadSave(useStore.getState().game.state);
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return <>{this.props.children}</>;

    const saves = listAutosaves();

    return (
      <div className="fixed inset-0 z-[100] grid place-items-center p-6 bg-night">
        <div className="paper max-w-[560px] w-full p-6">
          <h1 className="display text-[1.4rem] text-ink">Something in the interface broke.</h1>
          <p className="text-[0.86rem] text-ink-soft mt-2 leading-relaxed">
            The practice itself is fine — the simulation lives outside the screen and did not lose
            anything. This is a bug in the drawing, not in your run.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto text-[0.7rem] leading-snug paper-flat p-3 whitespace-pre-wrap text-ink-soft">
            {error.message}
            {this.state.info ? `\n${this.state.info}` : ''}
          </pre>

          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn btn-primary" onClick={this.retry}>
              Try drawing it again
            </button>
            {saves.length > 0 && (
              <button className="btn btn-ghost" onClick={this.rollBack}>
                Roll back to {saves[0].label}
              </button>
            )}
            <button className="btn btn-ghost" onClick={this.exportRun}>
              Export the save
            </button>
          </div>

          <p className="text-[0.72rem] text-ink-faint mt-3">
            If it breaks again in the same place, the exported file plus the message above is
            everything needed to reproduce it — the simulation is deterministic.
          </p>
        </div>
      </div>
    );
  }
}
