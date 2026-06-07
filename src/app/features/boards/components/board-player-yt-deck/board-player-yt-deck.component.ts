import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { BoardPlayerYtComponent } from '../board-player-yt/board-player-yt.component';
import { outgoingCrossfadeMs } from '../../utils/crossfade';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';
type SourceName = 'A' | 'B';

/**
 * Firefox-safe two-source wrapper for the YouTube iframe player.
 *
 * The plain BoardPlayerYtComponent can crossfade one board into another, but
 * Firefox can delay a cold second iframe when the tab is backgrounded. This
 * wrapper keeps two full BoardPlayerYtComponent instances alive while looping:
 * one audible, one silent. At the seam, the silent source is already a playing
 * media pipeline, so we only seek it to the loop start and fade board-level
 * volume between the two source components.
 */
@Component({
  selector: 'app-board-player-yt-deck',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BoardPlayerYtComponent],
  template: `
    <div class="yt-deck">
      <div
        class="yt-deck__source"
        [class.yt-deck__source--hidden]="activeSource() !== 'A'">
        <app-board-player-yt
          #sourceA
          [showPrimaryButton]="showPrimaryButton() && activeSource() === 'A'"
          [title]="title()"
          [hasTrack]="hasTrack()"
          [trackId]="trackId()"
          [videoId]="videoId()"
          [status]="sourceAStatus()"
          [durationS]="durationS()"
          [windowStartS]="windowStartS()"
          [windowEndS]="windowEndS()"
          [hasSelectedWindow]="hasSelectedWindow()"
          [windowFadeInMs]="windowFadeInMs()"
          [windowFadeOutMs]="windowFadeOutMs()"
          [repeat]="false"
          [masterVolume]="sourceAMasterVolume()"
          [masterFadeRampMs]="sourceAFadeRampMs()"
          (playRequested)="playRequested.emit()"
          (stopRequested)="stopRequested.emit()"
          (ended)="onSourceEnded('A')"
          (nearEnd)="onSourceNearEnd('A')"
          (seeked)="onSourceSeeked('A')"
          (audioError)="audioError.emit()"
        />
      </div>

      <div
        class="yt-deck__source"
        [class.yt-deck__source--hidden]="activeSource() !== 'B'">
        <app-board-player-yt
          #sourceB
          [showPrimaryButton]="showPrimaryButton() && activeSource() === 'B'"
          [title]="title()"
          [hasTrack]="hasTrack()"
          [trackId]="trackId()"
          [videoId]="videoId()"
          [status]="sourceBStatus()"
          [durationS]="durationS()"
          [windowStartS]="windowStartS()"
          [windowEndS]="windowEndS()"
          [hasSelectedWindow]="hasSelectedWindow()"
          [windowFadeInMs]="windowFadeInMs()"
          [windowFadeOutMs]="windowFadeOutMs()"
          [repeat]="false"
          [masterVolume]="sourceBMasterVolume()"
          [masterFadeRampMs]="sourceBFadeRampMs()"
          (playRequested)="playRequested.emit()"
          (stopRequested)="stopRequested.emit()"
          (ended)="onSourceEnded('B')"
          (nearEnd)="onSourceNearEnd('B')"
          (seeked)="onSourceSeeked('B')"
          (audioError)="audioError.emit()"
        />
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .yt-deck {
        position: relative;
      }

      .yt-deck__source--hidden {
        position: absolute;
        inset: 0;
        width: 1px;
        height: 1px;
        overflow: hidden;
        opacity: 0;
        pointer-events: none;
      }
    `,
  ],
})
export class BoardPlayerYtDeckComponent {
  /** Fallback loop crossfade when the looping window has no fades configured. */
  private static readonly DEFAULT_LOOP_CROSSFADE_MS = 3000;

  private readonly destroyRef = inject(DestroyRef);

  readonly title = input('');
  readonly hasTrack = input(false);
  readonly trackId = input<number | null>(null);
  readonly videoId = input<string | null>(null);
  readonly status = input<PlayerStatus>('STOPPED');
  readonly durationS = input<number | null>(null);
  readonly windowStartS = input<number | null>(null);
  readonly windowEndS = input<number | null>(null);
  readonly hasSelectedWindow = input(false);
  readonly windowFadeInMs = input(0);
  readonly windowFadeOutMs = input(0);
  readonly repeat = input(false);
  readonly masterVolume = input(1);
  readonly masterFadeRampMs = input(0);
  readonly showPrimaryButton = input(true);

  readonly playRequested = output<void>();
  readonly stopRequested = output<void>();
  readonly ended = output<void>();
  readonly nearEnd = output<void>();
  readonly audioError = output<void>();

  @ViewChild('sourceA')
  private sourceA?: BoardPlayerYtComponent;

  @ViewChild('sourceB')
  private sourceB?: BoardPlayerYtComponent;

  readonly activeSource = signal<SourceName>('A');
  readonly sourceAStatus = signal<PlayerStatus>('STOPPED');
  readonly sourceBStatus = signal<PlayerStatus>('STOPPED');
  readonly sourceAGain = signal(1);
  readonly sourceBGain = signal(0);
  readonly loopFadeActive = signal(false);

  readonly sourceAMasterVolume = computed(() =>
    this.clamp01(this.masterVolume()) * this.sourceAGain(),
  );

  readonly sourceBMasterVolume = computed(() =>
    this.clamp01(this.masterVolume()) * this.sourceBGain(),
  );

  /**
   * Symmetric loop crossfade length, sized by the looping window's own fade-out
   * (the outgoing edge), falling back to the default when unset. Both sources ramp
   * over this same duration — the proven preset-style crossfade.
   */
  readonly loopCrossfadeMs = computed(() =>
    outgoingCrossfadeMs(
      this.windowFadeOutMs(),
      BoardPlayerYtDeckComponent.DEFAULT_LOOP_CROSSFADE_MS,
    ),
  );

  readonly sourceAFadeRampMs = computed(() =>
    this.loopFadeActive() ? this.loopCrossfadeMs() : this.masterFadeRampMs(),
  );

  readonly sourceBFadeRampMs = computed(() =>
    this.loopFadeActive() ? this.loopCrossfadeMs() : this.masterFadeRampMs(),
  );

  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;
  private crossfadeInProgress = false;
  private syncSeq = 0;
  private lastVideoId: string | null = null;
  private lastTrackId: number | null = null;

  constructor() {
    effect(() => {
      const status = this.status();
      const videoId = this.videoId();
      const trackId = this.trackId();
      const canPlay = this.hasTrack() && videoId != null;
      const repeat = this.repeat();

      // Touch these so source lifecycle is re-evaluated when the selected media
      // changes. The child components receive the actual values directly.
      this.windowStartS();
      this.windowEndS();
      this.hasSelectedWindow();
      this.durationS();

      // A track/video switch mid loop-crossfade: abort the A/B loop fade so the
      // active source can cleanly crossfade into the new track instead of two
      // crossfades fighting.
      const mediaChanged = videoId !== this.lastVideoId || trackId !== this.lastTrackId;
      this.lastVideoId = videoId;
      this.lastTrackId = trackId;
      if (mediaChanged && this.crossfadeInProgress) {
        this.abortLoopCrossfade();
      }

      this.syncSources(status, canPlay, repeat);
    });

    this.destroyRef.onDestroy(() => this.clearCrossfadeTimer());
  }

  /** Current playback position (seconds) of the audible source. */
  getCurrentPositionS(): number {
    const active = this.activeSource() === 'A' ? this.sourceA : this.sourceB;
    return active?.displayPositionS() ?? 0;
  }

  onSourceSeeked(source: SourceName): void {
    // A manual seek on the audible source cancels the loop crossfade so it
    // doesn't swap to the silent source (snapping back to the loop start).
    if (this.crossfadeInProgress && source === this.activeSource()) {
      this.abortLoopCrossfade();
    }
  }

  onSourceNearEnd(source: SourceName): void {
    if (source !== this.activeSource()) {
      return;
    }

    if (!this.repeat()) {
      this.nearEnd.emit();
      return;
    }

    this.startLoopCrossfade();
  }

  onSourceEnded(source: SourceName): void {
    // If the outgoing source reaches its real end while the deck fade is still
    // finishing, do not start a second crossfade. That would reset the gains
    // back to from=1/to=0 and restart the incoming source, which sounds like
    // the faded-out track starts again and covers the already playing one.
    if (this.crossfadeInProgress) {
      if (source === this.activeSource()) {
        this.finishLoopCrossfade();
        return;
      }

      this.restartSilentSource(source);
      return;
    }

    if (source !== this.activeSource()) {
      this.restartSilentSource(source);
      return;
    }

    if (this.repeat()) {
      this.startLoopCrossfade();
      return;
    }

    this.ended.emit();
  }

  private syncSources(
    status: PlayerStatus,
    canPlay: boolean,
    repeat: boolean,
  ): void {
    if (!canPlay || status === 'STOPPED' || status === 'ERROR') {
      this.stopAllSources();
      return;
    }

    if (status === 'PAUSED') {
      this.clearCrossfadeTimer();
      this.crossfadeInProgress = false;
      this.loopFadeActive.set(false);
      this.sourceAStatus.set(this.sourceWasRunning('A') ? 'PAUSED' : 'STOPPED');
      this.sourceBStatus.set(this.sourceWasRunning('B') ? 'PAUSED' : 'STOPPED');
      return;
    }

    if (status !== 'PLAYING') {
      return;
    }

    const active = this.activeSource();
    const shadow = this.otherSource(active);

    this.setSourceStatus(active, 'PLAYING');
    this.setSourceStatus(shadow, repeat ? 'PLAYING' : 'STOPPED');

    if (!this.crossfadeInProgress) {
      // Keep the deck's source gain at 0 while the board is stopped, then let
      // the active source ramp 0 -> 1 when the parent starts a board crossfade.
      // This preserves the page-level masterVolume/masterFadeRampMs fade.
      this.loopFadeActive.set(false);
      this.setSourceGain(active, 1);
      this.setSourceGain(shadow, 0);
    }
  }

  private startLoopCrossfade(): void {
    if (this.crossfadeInProgress) {
      return;
    }

    if (this.status() !== 'PLAYING' || !this.hasTrack() || !this.videoId()) {
      return;
    }

    const seq = ++this.syncSeq;
    const from = this.activeSource();
    const to = this.otherSource(from);

    this.clearCrossfadeTimer();
    this.crossfadeInProgress = true;
    this.loopFadeActive.set(true);

    this.setSourceStatus(to, 'PLAYING');
    this.setSourceGain(from, 1);
    this.setSourceGain(to, 0);

    // The important Firefox workaround: the target source is already alive and
    // silent. We only seek/play it, then fade into it. We do not cold-load a new
    // iframe at the loop seam.
    this.restartSource(to);

    this.setSourceGain(from, 0);
    this.setSourceGain(to, 1);

    this.crossfadeTimer = setTimeout(() => {
      this.finishLoopCrossfade(seq);
    }, this.loopCrossfadeMs() + 80);
  }

  /**
   * Cancel an in-progress loop crossfade without swapping sources, restoring the
   * active source to full and silencing the shadow. Used when a track switch
   * arrives mid-crossfade so the active source can crossfade to the new track.
   */
  private abortLoopCrossfade(): void {
    this.clearCrossfadeTimer();
    this.syncSeq++;
    this.crossfadeInProgress = false;
    this.loopFadeActive.set(false);
    const active = this.activeSource();
    this.setSourceGain(active, 1);
    this.setSourceGain(this.otherSource(active), 0);
  }

  private finishLoopCrossfade(expectedSeq?: number): void {
    if (!this.crossfadeInProgress) {
      return;
    }

    if (expectedSeq != null && expectedSeq !== this.syncSeq) {
      return;
    }

    const from = this.activeSource();
    const to = this.otherSource(from);

    this.clearCrossfadeTimer();
    this.activeSource.set(to);
    this.setSourceGain(from, 0);
    this.setSourceGain(to, 1);

    this.crossfadeInProgress = false;
    this.loopFadeActive.set(false);
    this.syncSources(
      this.status(),
      this.hasTrack() && this.videoId() != null,
      this.repeat(),
    );
  }

  private restartSource(source: SourceName): void {
    this.getSourceComponent(source)?.restartFromWindowStart();
  }

  private restartSilentSource(source: SourceName): void {
    if (!this.repeat() || this.status() !== 'PLAYING') {
      return;
    }

    if (source === this.activeSource()) {
      return;
    }

    this.setSourceStatus(source, 'PLAYING');
    this.setSourceGain(source, 0);
    this.restartSource(source);
  }

  private stopAllSources(): void {
    this.clearCrossfadeTimer();
    this.syncSeq++;
    this.crossfadeInProgress = false;
    this.loopFadeActive.set(false);
    this.activeSource.set('A');
    this.sourceAStatus.set('STOPPED');
    this.sourceBStatus.set('STOPPED');
    // Important: inactive/stopped decks must expose 0 volume to the child
    // players. If source A stays at gain 1 while stopped, the child player
    // remembers target volume 1 and a later board-to-board crossfade has no
    // 0 -> 1 ramp to apply.
    this.sourceAGain.set(0);
    this.sourceBGain.set(0);
  }

  private clearCrossfadeTimer(): void {
    if (this.crossfadeTimer !== null) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
  }

  private sourceWasRunning(source: SourceName): boolean {
    return this.getSourceStatus(source) === 'PLAYING';
  }

  private getSourceComponent(source: SourceName): BoardPlayerYtComponent | undefined {
    return source === 'A' ? this.sourceA : this.sourceB;
  }

  private getSourceStatus(source: SourceName): PlayerStatus {
    return source === 'A' ? this.sourceAStatus() : this.sourceBStatus();
  }

  private setSourceStatus(source: SourceName, status: PlayerStatus): void {
    if (source === 'A') {
      this.sourceAStatus.set(status);
      return;
    }

    this.sourceBStatus.set(status);
  }

  private setSourceGain(source: SourceName, gain: number): void {
    const clamped = this.clamp01(gain);
    if (source === 'A') {
      this.sourceAGain.set(clamped);
      return;
    }

    this.sourceBGain.set(clamped);
  }

  private otherSource(source: SourceName): SourceName {
    return source === 'A' ? 'B' : 'A';
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(value, 1));
  }
}
