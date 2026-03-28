export class PlaybackPositionTracker {

  displayPositionS = 0;
  seekableMaxS = 0;

  private windowStartS = 0;
  private windowEndS = 0; 
  private durationS = 0;

  constructor(private readonly getAudioElement: () => HTMLAudioElement | null) {}

  setWindow(startS: number, endS: number): void {
    this.windowStartS = startS;
    this.windowEndS = endS;
  }

  setDuration(durationS: number): void {
    this.durationS = durationS;
  }

  reset(): void {
    this.displayPositionS = this.windowStartS;
    this.seekableMaxS = this.windowStartS;
  }

  tick(isScrubbing: boolean): number {
    if (isScrubbing) return this.displayPositionS;
    const audio = this.getAudioElement();
    if (!audio) return this.displayPositionS;
    this.displayPositionS = Math.floor(this.windowStartS + audio.currentTime);
    return this.displayPositionS;
  }

  updateSeekable(estimatedS: number, complete: boolean): number {
    if (complete) {
      this.seekableMaxS = this.effectiveEndS;
      return this.seekableMaxS;
    }

    this.seekableMaxS = Math.min(this.effectiveEndS, estimatedS);
    return this.seekableMaxS;
  }

  clamp(posS: number): number {
    const minS = this.windowStartS;
    const maxS = Math.min(this.seekableMaxS, this.effectiveEndS);
    return Math.max(minS, Math.min(posS, maxS));
  }

  toAudioTime(displayS: number): number {
    return Math.max(0, displayS - this.windowStartS);
  }

  get effectiveEndS(): number {
    return this.windowEndS > 0 ? this.windowEndS : this.durationS;
  }

  getActualBufferedEndS(): number {
    const audio = this.getAudioElement();
    if (!audio) return 0;
    try {
      if (audio.buffered.length > 0) {
        return audio.buffered.end(audio.buffered.length - 1);
      }
    } catch {}
    return 0;
  }
}