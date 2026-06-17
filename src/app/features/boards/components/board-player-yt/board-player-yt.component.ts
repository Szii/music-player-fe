import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  
  OnDestroy,
  ViewChild,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { PlayerControlsComponent } from '../player-controls/player-controls.component';
import { YoutubeIframeApiService } from '../../../../core/services/youtube-iframe-api.service';
import { effectiveCrossfadeMs, sourceCrossfadeMs } from '../../utils/crossfade';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';
type SlotName = 'A' | 'B';

interface Slot {
  readonly name: SlotName;
  readonly mount: () => HTMLDivElement | null;
  player: YT.Player | null;
  ready: boolean;
  creating: Promise<YT.Player | null> | null;
  loadedVideoId: string | null;
  loadedTrackId: number | null;
  /** Crossfade gain 0..1, multiplied by the master volume. */
  gain: number;
}

interface PendingTrack {
  readonly videoId: string;
  readonly trackId: number | null;
  readonly crossfadeMs: number;
}

/**
 * YouTube IFrame-backed board player (experimental, behind
 * {@link USE_YT_IFRAME_PLAYER}).
 *
 * Reproduces the input/output contract of `BoardPlayerComponent` so it can be
 * swapped in at the `board-card` leaf without touching page orchestration.
 *
 * Uses two YouTube players (A/B slots), mirroring the original engine, so
 * loop-seam and track-switch crossfades overlap two streams and ramp their
 * volumes with an equal-power curve. Board-to-board crossfade comes from the
 * parent ramping `masterVolume`. Sample-accurate gain is not available through
 * the IFrame API, so fades are `setVolume` ramps on the JS clock; on iOS, where
 * only one media element plays at a time, overlapping crossfades degrade to
 * hard cuts.
 */
@Component({
  selector: 'app-board-player-yt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlayerControlsComponent],
  template: `
    <app-player-controls
      [title]="title()"
      [hasTrack]="hasTrack()"
      [status]="localStatus()"
      [positionS]="displayPositionS()"
      [durationS]="fullDurationS()"
      [seekableMaxS]="seekableMaxS()"
      [windowStartS]="hasSelectedWindow() ? windowStartS() : null"
      [windowEndS]="hasSelectedWindow() ? windowEndS() : null"
      [fadeOutS]="windowFadeOutMs() / 1000"
      [showPrimaryButton]="showPrimaryButton()"
      [disabled]="localStatus() === 'BUFFERING'"
      (play)="onPlay()"
      (stop)="onStop()"
      (seekPreview)="onSeekPreview($event)"
      (seekCommit)="onSeekCommit($event)"
    />

    <div class="yt-host" aria-hidden="true">
      <div #mountA></div>
      <div #mountB></div>
    </div>
  `,
  styles: [
    `
      .yt-host {
        position: fixed;
        left: -10000px;
        top: 0;
        width: 320px;
        height: 360px;
        pointer-events: none;
      }
    `,
  ],
})
export class BoardPlayerYtComponent implements OnDestroy {
  /** Minimum near-end lead so the deck can start the incoming source even when
      the window has no (or a very short) fade-out. */
  private static readonly MIN_NEAR_END_LEAD_S = 0.25;
  private static readonly POLL_INTERVAL_MS = 50;
  /** Used for the final target when the user skips several tracks mid-fade. */
  private static readonly RAPID_SWITCH_CROSSFADE_MS = 250;
  /** Extra head-start so the incoming slot can buffer before the fade starts. */
  private static readonly CROSSFADE_BUFFER_LEAD_S = 1;
  private static readonly PLAYING_WAIT_TIMEOUT_MS = 4000;

  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly api = inject(YoutubeIframeApiService);

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
  /**
   * When set (playlist mode), track switches use this fixed crossfade length
   * instead of deriving it from the per-track fades, and near-end fires a
   * crossfade-plus-buffer early so the async track advance can overlap it.
   */
  readonly forcedCrossfadeMs = input<number | null>(null);
  /**
   * When the selected window changes while playing, keep the playhead where it is
   * if it still falls inside the new window (used by the window editor while the
   * user drags the boundaries). Boards leave this off and always jump to the new
   * window start.
   */
  readonly preservePositionOnWindowChange = input(false);

  readonly playRequested = output<void>();
  readonly stopRequested = output<void>();
  readonly ended = output<void>();
  readonly nearEnd = output<void>();
  readonly audioError = output<void>();
  /** Emitted when the user commits a manual seek (so the deck can cancel an
      in-progress loop crossfade and honour the new position). */
  readonly seeked = output<number>();
  /** Current playhead position (seconds) of this player, emitted as it changes
      (playback, seek, loop, stop) so a host can mirror it (e.g. a waveform). */
  readonly positionChange = output<number>();

  @ViewChild('mountA', { static: true })
  mountARef?: ElementRef<HTMLDivElement>;
  @ViewChild('mountB', { static: true })
  mountBRef?: ElementRef<HTMLDivElement>;

  readonly localStatus = signal<PlayerStatus>('STOPPED');
  readonly displayPositionS = signal(0);
  readonly seekableMaxS = signal(0);
  readonly fullDurationS = signal(0);

  private readonly slotA: Slot = {
    name: 'A',
    mount: () => this.mountARef?.nativeElement ?? null,
    player: null,
    ready: false,
    creating: null,
    loadedVideoId: null,
    loadedTrackId: null,
    gain: 1,
  };
  private readonly slotB: Slot = {
    name: 'B',
    mount: () => this.mountBRef?.nativeElement ?? null,
    player: null,
    ready: false,
    creating: null,
    loadedVideoId: null,
    loadedTrackId: null,
    gain: 0,
  };

  private activeSlot: SlotName = 'A';
  /** Crossfade (ms) of the window/track currently committed to the active slot
      (its fade-in + fade-out). At a switch this is the *outgoing* crossfade,
      compared against the incoming window's crossfade so the longer one wins. */
  private activeCrossfadeMs = 0;
  private currentMaster = 1;
  /**
   * Last requested master-volume target. Used so a ramp-duration-only input
   * change does not snap the current in-progress ramp to the final value.
   */
  private lastMasterTarget: number | null = null;
  private masterRampId = 0;
  private gainRampId = 0;
  private masterRampTimer: ReturnType<typeof setInterval> | null = null;
  private gainRampTimer: ReturnType<typeof setInterval> | null = null;
  private switchSeq = 0;
  private crossfadeInProgress = false;
  /** While a window/track-switch crossfade runs, keep the UI pinned to the new
      window start instead of mirroring the outgoing slot's playhead. Loop-seam
      crossfades leave this false so the slider keeps progressing to the seam. */
  private pinDisplayDuringCrossfade = false;
  /** Latest track requested while a crossfade was still running (e.g. rapid
      playlist skips). Applied once the in-progress crossfade settles. */
  private pendingTrack: PendingTrack | null = null;
  /** If a newer track arrives mid-fade, finish or abort the current fade quickly
      so the queued final target is heard immediately. */
  private finishCurrentCrossfadeRequested = false;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private emittedNearEnd = false;
  private isUserSeeking = false;
  private lastWindowKey: string | null = null;

  constructor() {
    // Drive the imperative YouTube players from the declarative inputs.
    effect(() => {
      const status = this.status();
      const videoId = this.videoId();
      const trackId = this.trackId();
      const hasTrack = this.hasTrack();
      // Touch window/repeat so changes re-evaluate boundaries while playing.
      this.windowStartS();
      this.windowEndS();
      this.hasSelectedWindow();
      this.repeat();

      this.sync(status, hasTrack ? videoId : null, hasTrack ? trackId : null);
    });

    effect(() => {
      this.updateMasterVolumeTarget(
        Math.max(0, Math.min(this.masterVolume(), 1)),
        this.masterFadeRampMs(),
      );
    });

    effect(() => this.fullDurationS.set(this.durationS() ?? 0));

    // Mirror the playhead outward (waveform timelines, etc.) whenever it moves.
    effect(() => this.positionChange.emit(this.displayPositionS()));

    // React to selected-window changes mid-playback: re-seek the active player
    // to the new window start without a backend round-trip.
    effect(() => {
      const hasWindow = this.hasSelectedWindow();
      const startS = this.windowStartFloor();
      const endS = this.windowEndCeil();
      this.onWindowChanged(`${hasWindow}:${startS}:${endS}`, startS);
    });

    this.destroyRef.onDestroy(() => this.teardown());
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  onPlay(): void {
    this.playRequested.emit();
  }

  onStop(): void {
    this.stopRequested.emit();
  }

  onSeekPreview(rawValue: number): void {
    this.isUserSeeking = true;
    this.displayPositionS.set(this.clampToSeekableWindow(Math.floor(rawValue)));
  }

  onSeekCommit(rawValue: number): void {
    const target = this.clampToSeekableWindow(Math.floor(rawValue));

    // A manual seek wins over any in-progress crossfade: abort it so its
    // completion doesn't snap playback back to the seam/window start.
    if (this.crossfadeInProgress) {
      this.abortCrossfade();
    }

    this.displayPositionS.set(target);
    this.isUserSeeking = false;
    this.emittedNearEnd = false;

    const videoId = this.hasTrack() ? this.videoId() : null;
    const trackId = this.hasTrack() ? this.trackId() : null;
    const active = this.active();

    // Aborting a crossfade reverts to its outgoing slot. If that slot isn't the
    // currently selected track, the seek interrupted a track switch — load the
    // selected track at the seek position instead of seeking the stale track.
    if (videoId && !this.slotMatches(active, videoId, trackId)) {
      void this.crossfadeInto(videoId, trackId, target, this.switchCrossfadeMs(), true);
      this.seeked.emit(target);
      return;
    }

    if (active.player && active.ready) {
      active.player.seekTo(target, true);
    }

    this.seeked.emit(target);
  }

  /**
   * Imperative restart used by the Firefox-safe deck wrapper.
   *
   * The wrapper keeps two independent YouTube player components alive. Near a
   * loop seam it asks the silent component to jump back to the selected window
   * start while it is already an active media pipeline, then fades into it.
   */
  restartFromWindowStart(): void {
    const target = this.windowStartFloor();
    this.displayPositionS.set(target);
    this.seekableMaxS.set(this.seekableWindowEnd());
    this.isUserSeeking = false;
    this.emittedNearEnd = false;

    const active = this.active();
    if (active.player && active.ready) {
      active.player.seekTo(target, true);
      active.player.playVideo();
      this.localStatus.set('PLAYING');
      this.startPolling();
    }
  }

  /**
   * Restart the active slot at the window start while guaranteeing it is silent.
   *
   * The deck calls this after a source has faded out and becomes the hidden
   * backup source. In backgrounded Firefox, timer throttling can leave the
   * previous volume ramp slightly above zero when the fade-cleanup timeout runs.
   * Forcing the master volume to 0 before and after the seek prevents the
   * recycled source from audibly restarting over the source that just faded in.
   */
  restartSilentlyFromWindowStart(): void {
    this.forceMasterVolume(0);
    this.restartFromWindowStart();
    this.forceMasterVolume(0);
  }

  private sync(
    status: PlayerStatus,
    videoId: string | null,
    trackId: number | null,
  ): void {
    if (!videoId) {
      this.stopAndReset();
      return;
    }

    if (status === 'PLAYING') {
      if (this.crossfadeInProgress) {
        // A new track was requested mid-crossfade (e.g. rapid playlist skips).
        // Keep only the latest target. If it differs from the already incoming
        // slot, finish/abort the current fade quickly and then fade into this
        // final target.
        if (this.slotMatches(this.idle(), videoId, trackId)) {
          this.pendingTrack = null;
          return;
        }

        this.pendingTrack = {
          videoId,
          trackId,
          crossfadeMs: BoardPlayerYtComponent.RAPID_SWITCH_CROSSFADE_MS,
        };
        this.requestCurrentCrossfadeFinish();
        return;
      }

      const active = this.active();

      if (active.loadedVideoId == null) {
        void this.startInitial(videoId, trackId);
        return;
      }

      if (!this.slotMatches(active, videoId, trackId)) {
        void this.crossfadeInto(
          videoId,
          trackId,
          this.windowStartFloor(),
          this.switchCrossfadeMs(),
          true,
        );
        return;
      }

      // Same track already active — resume if paused.
      if (this.localStatus() === 'PAUSED' && active.player && active.ready) {
        active.player.playVideo();
        this.localStatus.set('PLAYING');
        this.startPolling();
      }
      return;
    }

    if (status === 'PAUSED') {
      const active = this.active();
      if (active.player && active.ready) {
        active.player.pauseVideo();
      }
      this.localStatus.set('PAUSED');
      this.stopPolling();
      return;
    }

    // STOPPED / ERROR
    this.stopAndReset();
  }

  private async startInitial(
    videoId: string,
    trackId: number | null,
  ): Promise<void> {
    const active = this.active();
    const player = await this.ensureSlotPlayer(active);
    if (!player) {
      return;
    }

    const startS = this.windowStartFloor();
    active.loadedVideoId = videoId;
    active.loadedTrackId = trackId;
    active.gain = 1;
    this.idle().gain = 0;
    this.emittedNearEnd = false;
    this.captureActiveWindowFades();
    this.localStatus.set('BUFFERING');

    player.loadVideoById(videoId, startS);
    this.applyVolumes();
    player.playVideo();

    this.displayPositionS.set(startS);
    this.seekableMaxS.set(this.seekableWindowEnd());
    this.localStatus.set('PLAYING');
    this.startPolling();
  }

  /**
   * Overlap the idle slot playing `videoId` from `startS`, then crossfade from
   * the active slot into it and swap. Used for both loop seams (same video) and
   * track switches (new video).
   */
  private async crossfadeInto(
    videoId: string,
    trackId: number | null,
    startS: number,
    crossfadeMs: number,
    pinDisplayToStart = false,
  ): Promise<void> {
    if (this.crossfadeInProgress) {
      return;
    }

    this.crossfadeInProgress = true;
    this.finishCurrentCrossfadeRequested = false;
    this.pinDisplayDuringCrossfade = pinDisplayToStart;
    if (pinDisplayToStart) {
      // Snap the scrubber to the incoming window immediately so it doesn't show
      // the outgoing slot's playhead "already played" into the new window.
      this.displayPositionS.set(startS);
      this.seekableMaxS.set(this.seekableWindowEnd());
    }
    const seq = ++this.switchSeq;
    const from = this.active();
    const to = this.idle();

    try {
      const toPlayer = await this.ensureSlotPlayer(to);
      if (!toPlayer || seq !== this.switchSeq) {
        return;
      }

      to.loadedVideoId = videoId;
      to.loadedTrackId = trackId;
      to.gain = 0;
      this.applyVolumes();
      // Mute the incoming player so its programmatic autoplay is always allowed
      // (Firefox blocks non-muted autoplay without a direct gesture, even at
      // volume 0). It's unmuted once it's actually playing — gain is still 0, so
      // there's no audible blip until the crossfade ramps it up.
      toPlayer.mute();
      toPlayer.loadVideoById(videoId, startS);
      toPlayer.playVideo();

      const playing = await this.waitForPlaying(
        to,
        BoardPlayerYtComponent.PLAYING_WAIT_TIMEOUT_MS,
      );
      if (seq !== this.switchSeq) {
        return;
      }

      // Incoming slot never started (e.g. autoplay blocked), or a newer pending
      // track arrived while it was buffering. Abort without swapping so the
      // active slot keeps playing and pending playback can be flushed safely.
      if (!playing) {
        if (to.player && to.ready) {
          to.player.stopVideo();
        }
        to.loadedVideoId = null;
        to.loadedTrackId = null;
        to.gain = 0;
        from.gain = 1;
        this.applyVolumes();
        return;
      }

      to.player?.unMute();
      this.applyVolumes();
      await this.crossfadeGains(from, to, crossfadeMs);
      if (seq !== this.switchSeq) {
        return;
      }

      if (from.player && from.ready) {
        from.player.stopVideo();
      }
      from.loadedVideoId = null;
      from.loadedTrackId = null;
      from.gain = 0;
      to.gain = 1;
      this.activeSlot = to.name;
      this.captureActiveWindowFades();
      this.applyVolumes();

      this.emittedNearEnd = false;
      this.localStatus.set('PLAYING');
      this.displayPositionS.set(startS);
      this.seekableMaxS.set(this.seekableWindowEnd());
      this.startPolling();
    } finally {
      if (seq === this.switchSeq) {
        this.crossfadeInProgress = false;
        this.finishCurrentCrossfadeRequested = false;
        this.pinDisplayDuringCrossfade = false;
        this.flushPendingTrack();
      }
    }
  }

  /**
   * Apply a track change that was requested while a crossfade was still running
   * (e.g. rapid playlist skips). Crossfades into the latest requested track so
   * the final selection is the one that actually plays.
   */
  private flushPendingTrack(): void {
    const pending = this.pendingTrack;
    this.pendingTrack = null;

    if (pending == null) return;
    if (this.status() !== 'PLAYING' || !this.hasTrack()) return;
    if (this.slotMatches(this.active(), pending.videoId, pending.trackId)) return;

    void this.crossfadeInto(
      pending.videoId,
      pending.trackId,
      this.windowStartFloor(),
      pending.crossfadeMs,
      true,
    );
  }

  private requestCurrentCrossfadeFinish(): void {
    this.finishCurrentCrossfadeRequested = true;
  }

  /**
   * Cancel an in-progress crossfade, keeping the current active slot playing and
   * discarding the incoming one. The bumped {@link switchSeq} makes any awaiting
   * crossfade bail at its next checkpoint.
   */
  private abortCrossfade(): void {
    this.switchSeq++;
    this.gainRampId++;
    this.clearGainRampTimer();
    this.crossfadeInProgress = false;
    this.finishCurrentCrossfadeRequested = false;
    this.pinDisplayDuringCrossfade = false;
    this.pendingTrack = null;

    const active = this.active();
    const idle = this.idle();
    active.gain = 1;
    idle.gain = 0;
    if (idle.player && idle.ready && idle.loadedVideoId) {
      try {
        idle.player.stopVideo();
      } catch {
        // ignore
      }
    }
    idle.loadedVideoId = null;
    idle.loadedTrackId = null;
    this.applyVolumes();
  }

  private slotMatches(
    slot: Slot,
    videoId: string | null,
    trackId: number | null,
  ): boolean {
    return slot.loadedVideoId === videoId && slot.loadedTrackId === trackId;
  }

  private ensureSlotPlayer(slot: Slot): Promise<YT.Player | null> {
    if (slot.player && slot.ready) {
      return Promise.resolve(slot.player);
    }

    if (slot.creating) {
      return slot.creating;
    }

    const mount = slot.mount();
    if (!mount) {
      return Promise.resolve(null);
    }

    slot.creating = this.api
      .load()
      .then(
        (yt) =>
          new Promise<YT.Player | null>((resolve) => {
            const player = new yt.Player(mount, {
              width: 320,
              height: 180,
              playerVars: {
                autoplay: 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                modestbranding: 1,
                playsinline: 1,
                rel: 0,
              },
              events: {
                onReady: () => {
                  this.zone.run(() => {
                    slot.ready = true;
                    slot.creating = null;
                    this.setSlotVolume(slot);
                    resolve(player);
                  });
                },
                onStateChange: (event) => this.onStateChange(slot, event),
                onError: () => {
                  this.zone.run(() => {
                    if (slot.name === this.activeSlot) {
                      this.localStatus.set('ERROR');
                      this.audioError.emit();
                    }
                  });
                },
              },
            });

            slot.player = player;
          }),
      )
      .catch(() => {
        slot.creating = null;
        this.zone.run(() => {
          if (slot.name === this.activeSlot) {
            this.localStatus.set('ERROR');
            this.audioError.emit();
          }
        });
        return null;
      });

    return slot.creating;
  }

  private onStateChange(slot: Slot, event: YT.OnStateChangeEvent): void {
    if (slot.name !== this.activeSlot) {
      return;
    }

    this.zone.run(() => {
      const state = event.data;

      if (state === YT.PlayerState.BUFFERING) {
        if (this.localStatus() === 'PLAYING') {
          this.localStatus.set('BUFFERING');
        }
        return;
      }

      if (state === YT.PlayerState.PLAYING) {
        this.localStatus.set('PLAYING');
        this.startPolling();
        return;
      }

      if (state === YT.PlayerState.ENDED && !this.crossfadeInProgress) {
        this.handleReachedEnd();
      }
    });
  }

  private startPolling(): void {
    this.stopPolling();
    this.zone.runOutsideAngular(() => {
      this.pollTimer = setInterval(
        () => this.tick(),
        BoardPlayerYtComponent.POLL_INTERVAL_MS,
      );
    });
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private tick(): void {
    const active = this.active();
    if (!active.player || !active.ready || this.isUserSeeking) {
      return;
    }

    const endS = this.windowEndCeil();
    const startS = this.windowStartFloor();
    const positionS = active.player.getCurrentTime();

    this.zone.run(() => {
      // During a window/track-switch crossfade the active slot is still the
      // outgoing one — its playhead doesn't belong to the incoming window, so
      // leave the display pinned to the target start set by crossfadeInto.
      if (this.crossfadeInProgress && this.pinDisplayDuringCrossfade) {
        return;
      }

      this.displayPositionS.set(
        Math.max(startS, Math.min(Math.floor(positionS), endS)),
      );
      this.seekableMaxS.set(this.seekableWindowEnd());

      if (this.crossfadeInProgress) {
        return;
      }

      const remainingS = endS - positionS;

      if (this.repeat()) {
        // Attempt the overlapping crossfade ahead of the seam — works in hidden
        // tabs too now that ramps run on timers (not rAF). If the incoming
        // player can't start, crossfadeInto aborts and we hard-loop at the seam.
        if (
          endS > 0 &&
          remainingS <= this.loopTriggerLeadS() &&
          active.loadedVideoId
        ) {
          void this.crossfadeInto(
            active.loadedVideoId,
            active.loadedTrackId,
            startS,
            this.loopCrossfadeMs(),
          );
          return;
        }

        // Reached the seam without a crossfade taking over (too short a window,
        // or the crossfade aborted): hard-cut loop as a fallback.
        if (endS > 0 && positionS >= endS) {
          this.hardLoop(startS);
        }
        return;
      }

      if (endS > 0 && positionS >= endS) {
        this.handleReachedEnd();
        return;
      }

      if (
        endS > 0 &&
        remainingS <= this.nearEndLeadS() &&
        !this.emittedNearEnd
      ) {
        this.emittedNearEnd = true;
        this.nearEnd.emit();
      }
    });
  }

  private hardLoop(startS: number): void {
    const active = this.active();
    if (!active.player || !active.ready) {
      return;
    }
    this.emittedNearEnd = false;
    active.player.seekTo(startS, true);
    active.player.playVideo();
    this.displayPositionS.set(startS);
  }

  private handleReachedEnd(): void {
    const active = this.active();

    if (this.repeat() && active.player && active.ready && active.loadedVideoId) {
      // Fallback hard loop (e.g. window too short for a crossfade lead).
      this.hardLoop(this.windowStartFloor());
      return;
    }

    this.stopPolling();
    if (active.player && active.ready) {
      active.player.pauseVideo();
    }
    this.localStatus.set('STOPPED');
    this.displayPositionS.set(this.windowEndCeil());
    this.ended.emit();
  }

  private stopAndReset(): void {
    this.stopPolling();
    this.switchSeq++;
    this.crossfadeInProgress = false;
    this.pendingTrack = null;
    this.finishCurrentCrossfadeRequested = false;
    this.emittedNearEnd = false;

    for (const slot of [this.slotA, this.slotB]) {
      slot.loadedVideoId = null;
      slot.loadedTrackId = null;
      if (slot.player && slot.ready) {
        slot.player.stopVideo();
      }
    }

    this.activeSlot = 'A';
    this.slotA.gain = 1;
    this.slotB.gain = 0;
    this.applyVolumes();

    this.localStatus.set('STOPPED');
    this.displayPositionS.set(this.windowStartFloor());
    this.seekableMaxS.set(this.windowStartFloor());
  }

  private forceMasterVolume(target: number): void {
    this.clearMasterRampTimer();
    this.masterRampId++;
    this.currentMaster = Math.max(0, Math.min(target, 1));
    this.lastMasterTarget = this.currentMaster;
    this.applyVolumes();
  }

  private updateMasterVolumeTarget(target: number, durationMs: number): void {
    // Angular effects re-run when either masterVolume OR masterFadeRampMs changes.
    // During the deck loop cleanup, loopFadeActive flips from true to false, which
    // changes masterFadeRampMs back to 0 while the target volume is still the same.
    // If we call rampMaster(target, 0) in that case, Firefox background tabs can
    // jump the incoming source from a partially-ramped volume straight to 100%.
    if (
      this.lastMasterTarget !== null &&
      Math.abs(target - this.lastMasterTarget) < 0.001
    ) {
      return;
    }

    this.lastMasterTarget = target;
    this.rampMaster(target, durationMs);
  }

  private rampMaster(target: number, durationMs: number): void {
    const id = ++this.masterRampId;
    this.clearMasterRampTimer();

    if (durationMs <= 0) {
      this.currentMaster = target;
      this.applyVolumes();
      return;
    }

    const startValue = this.currentMaster;
    const startTime = performance.now();

    // Use a timer (not requestAnimationFrame, which freezes in hidden tabs) so
    // the ramp still completes when the tab is backgrounded — throttled to
    // ~1s/step there, but it reaches the target via elapsed-time math.
    this.zone.runOutsideAngular(() => {
      const step = () => {
        if (id !== this.masterRampId) {
          return;
        }
        const t = Math.min(1, (performance.now() - startTime) / durationMs);
        this.currentMaster = startValue + (target - startValue) * t;
        this.applyVolumes();
        if (t >= 1) {
          this.clearMasterRampTimer();
        }
      };
      this.masterRampTimer = setInterval(step, 50);
      step();
    });
  }

  private clearMasterRampTimer(): void {
    if (this.masterRampTimer !== null) {
      clearInterval(this.masterRampTimer);
      this.masterRampTimer = null;
    }
  }

  /** Equal-power crossfade of two slot gains (from 1→0, to 0→1). */
  private crossfadeGains(
    from: Slot,
    to: Slot,
    durationMs: number,
  ): Promise<void> {
    const id = ++this.gainRampId;
    this.clearGainRampTimer();
    from.gain = 1;
    to.gain = 0;
    this.applyVolumes();

    if (durationMs <= 0) {
      from.gain = 0;
      to.gain = 1;
      this.applyVolumes();
      return Promise.resolve();
    }

    const startTime = performance.now();

    // Timer rather than requestAnimationFrame so the crossfade still progresses
    // (and resolves) when the tab is hidden — rAF is frozen there, which would
    // otherwise leave crossfadeInProgress stuck and break looping.
    return new Promise<void>((resolve) => {
      this.zone.runOutsideAngular(() => {
        const step = () => {
          if (id !== this.gainRampId) {
            resolve();
            return;
          }
          const t = this.finishCurrentCrossfadeRequested
            ? 1
            : Math.min(1, (performance.now() - startTime) / durationMs);
          const angle = (t * Math.PI) / 2;
          from.gain = Math.cos(angle);
          to.gain = Math.sin(angle);
          this.applyVolumes();
          if (t >= 1) {
            this.clearGainRampTimer();
            resolve();
          }
        };
        this.gainRampTimer = setInterval(step, 50);
        step();
      });
    });
  }

  private clearGainRampTimer(): void {
    if (this.gainRampTimer !== null) {
      clearInterval(this.gainRampTimer);
      this.gainRampTimer = null;
    }
  }

  private applyVolumes(): void {
    this.setSlotVolume(this.slotA);
    this.setSlotVolume(this.slotB);
  }

  private setSlotVolume(slot: Slot): void {
    if (!slot.player || !slot.ready) {
      return;
    }
    const level = Math.max(0, Math.min(this.currentMaster * slot.gain, 1));
    slot.player.setVolume(Math.round(level * 100));
  }

  private waitForPlaying(slot: Slot, timeoutMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const startTime = performance.now();
      const check = () => {
        if (!slot.player || !slot.ready) {
          resolve(false);
          return;
        }
        if (this.finishCurrentCrossfadeRequested) {
          resolve(false);
          return;
        }
        if (slot.player.getPlayerState() === YT.PlayerState.PLAYING) {
          resolve(true);
          return;
        }
        if (performance.now() - startTime > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(check, 80);
      };
      this.zone.runOutsideAngular(check);
    });
  }

  /**
   * Handles a change to the selected window while a track is loaded. Seeks the
   * active player to the new window start; ignored on the first evaluation and
   * for whole-track playback (so duration metadata arriving doesn't jump).
   */
  private onWindowChanged(key: string, startS: number): void {
    const isFirst = this.lastWindowKey === null;
    const changed = this.lastWindowKey !== key;
    this.lastWindowKey = key;

    if (isFirst || !changed || !this.hasSelectedWindow()) {
      return;
    }

    const active = this.active();
    if (
      this.crossfadeInProgress ||
      !active.loadedVideoId ||
      !active.player ||
      !active.ready
    ) {
      return;
    }

    this.emittedNearEnd = false;

    // Window editor: while the user drags a boundary, keep playing from the
    // current position if it still lies inside the resized window. Only when the
    // caret falls outside the new range do we fall through to repositioning.
    if (this.preservePositionOnWindowChange()) {
      const positionS = active.player.getCurrentTime();
      if (positionS >= startS && positionS <= this.windowEndCeil()) {
        this.seekableMaxS.set(this.seekableWindowEnd());
        return;
      }
    }

    // While playing, crossfade into the new window (same video, new start) using
    // the idle slot — same machinery as loop/track-switch. When not actively
    // playing, just reposition the playhead.
    if (active.player.getPlayerState() === YT.PlayerState.PLAYING) {
      void this.crossfadeInto(
        active.loadedVideoId,
        active.loadedTrackId,
        startS,
        this.switchCrossfadeMs(),
        true,
      );
      return;
    }

    active.player.seekTo(startS, true);
    this.displayPositionS.set(startS);
    this.seekableMaxS.set(this.seekableWindowEnd());
  }

  /**
   * Loop crossfade length: a window loops into itself, so the overlap is that
   * window's own crossfade (fade-in + fade-out), floored at the safety fade when
   * crossfading is turned off.
   */
  private loopCrossfadeMs(): number {
    return effectiveCrossfadeMs(this.incomingCrossfadeMs());
  }

  /**
   * Window/track switch crossfade length: the *longer* of the outgoing window's
   * crossfade (captured on the active slot) and the incoming window's crossfade,
   * floored at the safety fade when both are off.
   */
  private switchCrossfadeMs(): number {
    const forced = this.forcedCrossfadeMs();
    if (forced != null) {
      return forced;
    }
    return effectiveCrossfadeMs(this.activeCrossfadeMs, this.incomingCrossfadeMs());
  }

  /** Crossfade (fade-in + fade-out) of the window/track on the current inputs —
      i.e. the incoming side at a switch, or the looping window itself. */
  private incomingCrossfadeMs(): number {
    return sourceCrossfadeMs(this.windowFadeInMs(), this.windowFadeOutMs());
  }

  /** Record the now-active window's crossfade so a later switch can use it as the
      outgoing side. Called whenever a slot becomes the committed active one. */
  private captureActiveWindowFades(): void {
    this.activeCrossfadeMs = this.incomingCrossfadeMs();
  }

  /**
   * How far before the seam to signal `nearEnd`. The deck starts the symmetric
   * loop/advance crossfade here so it completes right at the seam, so the lead
   * equals the crossfade length (a small floor keeps a moment to spin up the
   * incoming source).
   */
  private nearEndLeadS(): number {
    // Playlist track switches advance through an async backend call, so fire
    // near-end a crossfade-plus-buffer early to give the next track time to load
    // and overlap rather than gapping after the current one ends.
    const forced = this.forcedCrossfadeMs();
    if (forced != null) {
      return Math.max(
        BoardPlayerYtComponent.MIN_NEAR_END_LEAD_S,
        forced / 1000 + BoardPlayerYtComponent.CROSSFADE_BUFFER_LEAD_S,
      );
    }
    return Math.max(
      BoardPlayerYtComponent.MIN_NEAR_END_LEAD_S,
      this.loopCrossfadeMs() / 1000,
    );
  }

  private loopTriggerLeadS(): number {
    return (
      this.loopCrossfadeMs() / 1000 +
      BoardPlayerYtComponent.CROSSFADE_BUFFER_LEAD_S
    );
  }

  private active(): Slot {
    return this.activeSlot === 'A' ? this.slotA : this.slotB;
  }

  private idle(): Slot {
    return this.activeSlot === 'A' ? this.slotB : this.slotA;
  }

  private windowStartFloor(): number {
    if (!this.hasSelectedWindow()) {
      return 0;
    }
    return Math.max(0, Math.floor(this.windowStartS() ?? 0));
  }

  private windowEndCeil(): number {
    const duration = this.durationS() ?? 0;
    if (!this.hasSelectedWindow()) {
      return duration;
    }
    return Math.max(this.windowStartFloor(), Math.ceil(this.windowEndS() ?? duration));
  }

  /**
   * Last position the user is allowed to seek to.
   *
   * The last few seconds are owned by the deck loop transition. Seeking into
   * that region can make the active source and the silent backup source swap
   * roles at the wrong time, so the UI seek range stops before it. Playback can
   * still naturally continue through the real window/video end.
   */
  private seekableWindowEnd(): number {
    const startS = this.windowStartFloor();
    const endS = this.windowEndCeil();
    // The crossfade tail is not seekable — that ending section is where the loop
    // crossfade runs.
    const tailS = this.loopCrossfadeMs() / 1000;
    return Math.max(startS, endS - tailS);
  }

  private clampToSeekableWindow(posS: number): number {
    return Math.max(
      this.windowStartFloor(),
      Math.min(posS, this.seekableWindowEnd()),
    );
  }


  private teardown(): void {
    this.stopPolling();
    this.clearMasterRampTimer();
    this.clearGainRampTimer();
    this.masterRampId++;
    this.gainRampId++;
    this.switchSeq++;
    this.crossfadeInProgress = false;
    this.pendingTrack = null;
    this.finishCurrentCrossfadeRequested = false;

    for (const slot of [this.slotA, this.slotB]) {
      slot.ready = false;
      slot.creating = null;
      slot.loadedVideoId = null;
      slot.loadedTrackId = null;
      const player = slot.player;
      slot.player = null;
      if (player) {
        try {
          player.destroy();
        } catch {
          // ignore teardown races
        }
      }
    }
  }
}
