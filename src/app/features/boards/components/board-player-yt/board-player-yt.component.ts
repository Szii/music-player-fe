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

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';
type SlotName = 'A' | 'B';

interface Slot {
  readonly name: SlotName;
  readonly mount: () => HTMLDivElement | null;
  player: YT.Player | null;
  ready: boolean;
  creating: Promise<YT.Player | null> | null;
  loadedVideoId: string | null;
  /** Crossfade gain 0..1, multiplied by the master volume. */
  gain: number;
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
  private static readonly NEAR_END_LEAD_S = 3;
  private static readonly POLL_INTERVAL_MS = 250;
  private static readonly LOOP_CROSSFADE_MS = 2000;
  private static readonly SWITCH_CROSSFADE_MS = 2000;
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
  readonly repeat = input(false);
  readonly masterVolume = input(1);
  readonly masterFadeRampMs = input(0);
  readonly showPrimaryButton = input(true);

  readonly playRequested = output<void>();
  readonly stopRequested = output<void>();
  readonly ended = output<void>();
  readonly nearEnd = output<void>();
  readonly audioError = output<void>();

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
    gain: 1,
  };
  private readonly slotB: Slot = {
    name: 'B',
    mount: () => this.mountBRef?.nativeElement ?? null,
    player: null,
    ready: false,
    creating: null,
    loadedVideoId: null,
    gain: 0,
  };

  private activeSlot: SlotName = 'A';
  private currentMaster = 1;
  private masterRampId = 0;
  private gainRampId = 0;
  private masterRampTimer: ReturnType<typeof setInterval> | null = null;
  private gainRampTimer: ReturnType<typeof setInterval> | null = null;
  private switchSeq = 0;
  private crossfadeInProgress = false;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private emittedNearEnd = false;
  private isUserSeeking = false;
  private lastWindowKey: string | null = null;

  constructor() {
    // Drive the imperative YouTube players from the declarative inputs.
    effect(() => {
      const status = this.status();
      const videoId = this.videoId();
      const hasTrack = this.hasTrack();
      // Touch window/repeat so changes re-evaluate boundaries while playing.
      this.windowStartS();
      this.windowEndS();
      this.hasSelectedWindow();
      this.repeat();

      this.sync(status, hasTrack ? videoId : null);
    });

    effect(() => {
      this.rampMaster(
        Math.max(0, Math.min(this.masterVolume(), 1)),
        this.masterFadeRampMs(),
      );
    });

    effect(() => this.fullDurationS.set(this.durationS() ?? 0));

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
    this.displayPositionS.set(this.clampToWindow(Math.floor(rawValue)));
  }

  onSeekCommit(rawValue: number): void {
    const target = this.clampToWindow(Math.floor(rawValue));
    this.displayPositionS.set(target);
    this.isUserSeeking = false;
    this.emittedNearEnd = false;

    const active = this.active();
    if (active.player && active.ready) {
      active.player.seekTo(target, true);
    }
  }

  private sync(status: PlayerStatus, videoId: string | null): void {
    if (!videoId) {
      this.stopAndReset();
      return;
    }

    if (status === 'PLAYING') {
      if (this.crossfadeInProgress) {
        return;
      }

      const active = this.active();

      if (active.loadedVideoId == null) {
        void this.startInitial(videoId);
        return;
      }

      if (active.loadedVideoId !== videoId) {
        void this.crossfadeInto(
          videoId,
          this.windowStartFloor(),
          BoardPlayerYtComponent.SWITCH_CROSSFADE_MS,
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

  private async startInitial(videoId: string): Promise<void> {
    const active = this.active();
    const player = await this.ensureSlotPlayer(active);
    if (!player) {
      return;
    }

    const startS = this.windowStartFloor();
    active.loadedVideoId = videoId;
    active.gain = 1;
    this.idle().gain = 0;
    this.emittedNearEnd = false;
    this.localStatus.set('BUFFERING');

    player.loadVideoById(videoId, startS);
    this.applyVolumes();
    player.playVideo();

    this.displayPositionS.set(startS);
    this.seekableMaxS.set(startS);
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
    startS: number,
    crossfadeMs: number,
  ): Promise<void> {
    if (this.crossfadeInProgress) {
      return;
    }

    this.crossfadeInProgress = true;
    const seq = ++this.switchSeq;
    const from = this.active();
    const to = this.idle();

    try {
      const toPlayer = await this.ensureSlotPlayer(to);
      if (!toPlayer || seq !== this.switchSeq) {
        return;
      }

      to.loadedVideoId = videoId;
      to.gain = 0;
      this.applyVolumes();
      // loadVideoById auto-plays, but nudge it explicitly — helps the incoming
      // player start in a backgrounded (but audible) tab.
      toPlayer.loadVideoById(videoId, startS);
      toPlayer.playVideo();

      const playing = await this.waitForPlaying(
        to,
        BoardPlayerYtComponent.PLAYING_WAIT_TIMEOUT_MS,
      );
      if (seq !== this.switchSeq) {
        return;
      }

      // Incoming slot never started (e.g. autoplay blocked) — abort without
      // swapping so we never crossfade into silence. The active slot keeps
      // playing and will hard-loop at the seam.
      if (!playing) {
        if (to.player && to.ready) {
          to.player.stopVideo();
        }
        to.loadedVideoId = null;
        to.gain = 0;
        from.gain = 1;
        this.applyVolumes();
        return;
      }

      await this.crossfadeGains(from, to, crossfadeMs);
      if (seq !== this.switchSeq) {
        return;
      }

      if (from.player && from.ready) {
        from.player.stopVideo();
      }
      from.loadedVideoId = null;
      from.gain = 0;
      to.gain = 1;
      this.activeSlot = to.name;
      this.applyVolumes();

      this.emittedNearEnd = false;
      this.localStatus.set('PLAYING');
      this.displayPositionS.set(startS);
      this.seekableMaxS.set(this.windowEndCeil());
      this.startPolling();
    } finally {
      if (seq === this.switchSeq) {
        this.crossfadeInProgress = false;
      }
    }
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
      this.displayPositionS.set(
        Math.max(startS, Math.min(Math.floor(positionS), endS)),
      );
      this.seekableMaxS.set(endS);

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
            startS,
            BoardPlayerYtComponent.LOOP_CROSSFADE_MS,
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
        remainingS <= BoardPlayerYtComponent.NEAR_END_LEAD_S &&
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
    this.emittedNearEnd = false;

    for (const slot of [this.slotA, this.slotB]) {
      slot.loadedVideoId = null;
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
          const t = Math.min(1, (performance.now() - startTime) / durationMs);
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

    // While playing, crossfade into the new window (same video, new start) using
    // the idle slot — same machinery as loop/track-switch. When not actively
    // playing, just reposition the playhead.
    if (active.player.getPlayerState() === YT.PlayerState.PLAYING) {
      void this.crossfadeInto(
        active.loadedVideoId,
        startS,
        BoardPlayerYtComponent.SWITCH_CROSSFADE_MS,
      );
      return;
    }

    active.player.seekTo(startS, true);
    this.displayPositionS.set(startS);
    this.seekableMaxS.set(this.windowEndCeil());
  }

  private loopTriggerLeadS(): number {
    return (
      BoardPlayerYtComponent.LOOP_CROSSFADE_MS / 1000 +
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

  private clampToWindow(posS: number): number {
    return Math.max(this.windowStartFloor(), Math.min(posS, this.windowEndCeil()));
  }

  private teardown(): void {
    this.stopPolling();
    this.clearMasterRampTimer();
    this.clearGainRampTimer();
    this.masterRampId++;
    this.gainRampId++;
    this.switchSeq++;
    this.crossfadeInProgress = false;

    for (const slot of [this.slotA, this.slotB]) {
      slot.ready = false;
      slot.creating = null;
      slot.loadedVideoId = null;
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
