/**
 * Crossfade-length helper.
 *
 * Every window/track/board exposes a single "crossfade" length: the editor keeps
 * its fade-in and fade-out equal, and that shared length is the crossfade (the
 * value the editor's Crossfade slider shows). At a seam the audible overlap is the
 * *longest* crossfade among the sides involved:
 *
 *  - loop (a window into itself): the single window's own crossfade,
 *  - track→track / window→window within a board: the longer of the two,
 *  - board→board: the longer of the outgoing and incoming boards.
 *
 * When that comes out as 0 — the user turned crossfading off — we still apply a
 * tiny {@link SAFETY_FADE_MS} so the seam doesn't click.
 */

/** Smallest overlap applied even when crossfade is set to 0, to avoid clicks. */
export const SAFETY_FADE_MS = 150;

/**
 * Fixed crossfade between consecutive tracks in playlist mode. Playlist tracks
 * play whole and advance through an async backend call, so instead of deriving
 * the overlap from each track's own fades we always use this length (and fire the
 * advance early enough to cover it).
 */
export const PLAYLIST_CROSSFADE_MS = 3000;

/**
 * Crossfade length of a single source: the longer of its fade-in and fade-out
 * (the editor keeps them equal). This is the value the editor's Crossfade slider
 * represents, so the audible overlap matches the number the user set — the window
 * fades in over this length at its start and out over it at its end.
 */
export function sourceCrossfadeMs(
  fadeInMs: number | null | undefined,
  fadeOutMs: number | null | undefined,
): number {
  return Math.max(0, fadeInMs ?? 0, fadeOutMs ?? 0);
}

/**
 * Effective overlap at a seam: the longest crossfade among the sides involved,
 * floored at {@link SAFETY_FADE_MS} so a 0 setting still avoids a click.
 */
export function effectiveCrossfadeMs(
  ...candidateMs: ReadonlyArray<number | null | undefined>
): number {
  const longest = candidateMs.reduce<number>(
    (max, ms) => Math.max(max, ms ?? 0),
    0,
  );
  return longest > 0 ? longest : SAFETY_FADE_MS;
}
