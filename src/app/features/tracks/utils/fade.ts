/**
 * Fade-length helpers.
 *
 * Fade durations are stored as milliseconds (matching the API DTOs
 * `fadeInDurationMs` / `fadeOutDurationMs`). The UI lets the user adjust them in
 * fixed steps and displays them as seconds.
 */

/**
 * Step the fade-length controls move by. The crossfade slider sets fade-in and
 * fade-out together to this same length, so the crossfade moves in 0.1 s steps.
 */
export const FADE_STEP_MS = 100;

/** Hard cap for a single fade edge regardless of window length. */
export const MAX_FADE_MS = 10_000;

/** Snap a millisecond value to the nearest {@link FADE_STEP_MS} step. */
export function snapFadeMs(ms: number): number {
  return Math.round(ms / FADE_STEP_MS) * FADE_STEP_MS;
}

/**
 * Largest fade allowed for a window of the given length so that a symmetric
 * fade in + fade out still fits (each edge gets at most half the window),
 * capped by {@link MAX_FADE_MS} and snapped to the step.
 */
export function maxFadeForWindow(lengthS: number): number {
  const halfMs = Math.max(0, (lengthS * 1000) / 2);
  const capped = Math.min(MAX_FADE_MS, halfMs);
  return snapFadeMs(capped);
}

/** Clamp a fade to `[0, maxMs]` and snap it to the step. */
export function clampFadeMs(ms: number, maxMs: number): number {
  if (!Number.isFinite(ms) || ms <= 0) {
    return 0;
  }
  return Math.min(snapFadeMs(ms), snapFadeMs(maxMs));
}

/** Format a fade duration for display, e.g. `0 ms`, `0.25 s`, `2.50 s`. */
export function formatFadeMs(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  if (safe === 0) {
    return '0 ms';
  }
  return `${(safe / 1000).toFixed(2)} s`;
}
