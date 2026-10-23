import { useSyncExternalStore } from 'react';

export interface SaveeyeState {
  sources: string[];
  answered: 'allow' | 'deny' | null;
  unfocused: boolean;
  test: boolean;
}

let state: SaveeyeState = { sources: [], answered: null, unfocused: false, test: false };
const listeners = new Set<() => void>();

function set(patch: Partial<SaveeyeState>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useSaveeye = (): SaveeyeState => useSyncExternalStore(subscribe, () => state);

export function answerSaveeye(allow: boolean): void {
  if (!state.test) window.feather.saveeyeAnswer(allow);
  set({ answered: allow ? 'allow' : 'deny' });
  if (state.test) setTimeout(() => set({ sources: [], answered: null, test: false }), 2500);
}

export function testSaveeye(): void {
  set({ sources: ['Testaufnahme'], answered: null, test: true });
}

export function listenToSaveeye(): () => void {
  const stopCapture = window.feather.onSaveeyeCapture((notice) => {
    set({ sources: notice.sources, answered: null, test: false });
  });
  const stopFocus = window.feather.onWindowFocus((focused) => set({ unfocused: !focused }));
  return () => {
    stopCapture();
    stopFocus();
  };
}
