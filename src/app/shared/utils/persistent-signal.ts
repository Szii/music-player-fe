import { effect, signal, WritableSignal } from '@angular/core';

/**
 * A writable signal whose value is persisted to `localStorage` under `key` and
 * restored on the next load.
 */
export function persistentSignal<T>(key: string, initial: T): WritableSignal<T> {
  const stored = readStored<T>(key);
  const state = signal<T>(stored !== undefined ? stored : initial);

  effect(() => {
    const value = state();
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore: storage may be unavailable (private mode) or over quota.
    }
  });

  return state;
}

function readStored<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}
