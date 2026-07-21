/**
 * Middle of a track/clip in whole seconds (0 when the duration is unknown).
 * Previews start here so the snippet lands in the body of the audio rather than
 * a quiet intro.
 */
export function previewMidpointS(durationS: number | null | undefined): number {
  return durationS && durationS > 0 ? Math.floor(durationS / 2) : 0;
}
