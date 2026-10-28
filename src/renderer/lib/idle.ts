import { useSyncExternalStore } from 'react';

let idle = false;
const listeners = new Set<() => void>();

export const isIdle = (): boolean => idle;

export function setIdle(value: boolean): void {
  if (idle === value) return;
  idle = value;
  document.documentElement.dataset.idle = value ? 'true' : 'false';
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useIdle(): boolean {
  return useSyncExternalStore(subscribe, isIdle);
}
