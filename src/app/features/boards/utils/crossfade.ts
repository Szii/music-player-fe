/**
 * Crossfade-length helper.
 *
 * Every board crossfade is governed by the *outgoing* side's fade: when one
 * window/track/board hands off to the next, the overlap spans the fade-out the
 * user configured on the outgoing source (window A → window B uses window A's
 * fade-out). The incoming side's fade-in never extends the overlap.
 *
 * When the outgoing side has no fade configured, fall back to the player's
 * default constant so un-faded sources keep a sensible overlap.
 */
export function outgoingCrossfadeMs(
  outFadeMs: number | null | undefined,
  fallbackMs: number,
): number {
  const out = outFadeMs ?? 0;
  return out > 0 ? out : fallbackMs;
}
