/**
 * Crossfade-length helpers.
 *
 * The board crossfade length is derived from the fade values the user set on
 * the relevant windows/tracks: the overlap covers both the outgoing window's
 * fade-out and the incoming window's fade-in, so a single symmetric crossfade
 * spans `max(outFadeMs, inFadeMs)`.
 *
 * When neither edge has a fade configured, fall back to the player's default
 * constant so un-faded windows keep their previous behaviour.
 */
export function deriveCrossfadeMs(
  outFadeMs: number | null | undefined,
  inFadeMs: number | null | undefined,
  fallbackMs: number,
): number {
  const out = outFadeMs ?? 0;
  const incoming = inFadeMs ?? 0;
  const derived = Math.max(out, incoming);
  return derived > 0 ? derived : fallbackMs;
}
