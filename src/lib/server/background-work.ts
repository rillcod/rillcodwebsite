/** Shared across Next route bundles in the single standalone Node process. */
const stateKey = Symbol.for('rillcod.background-work');
type WorkState = { pending: number };
const root = globalThis as typeof globalThis & { [stateKey]?: WorkState };
const state = root[stateKey] ??= { pending: 0 };

export function backgroundWorkPending(): number {
  return state.pending;
}

export function registerBackgroundWork(): () => void {
  state.pending++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.pending--;
  };
}
