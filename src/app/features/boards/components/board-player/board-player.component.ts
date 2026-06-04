import {
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { combineLatest, distinctUntilChanged, skip } from 'rxjs';
import { BoardPlayerAudioSourceManager } from '../../../../shared/features/audio-stream-manager/board-audio-stream-manager';
import { PlayerControlsComponent } from '../player-controls/player-controls.component';
import { LoopBlendKind, LoopBlendService } from './loop-blend.service';
import { deriveCrossfadeMs } from '../../utils/crossfade';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';
type AudioSlot = 'A' | 'B';

interface SlotPlaybackContext {
  startS: number;
  endS: number;
  durationS: number;
  hasSelectedWindow: boolean;
  fadeInMs: number;
  fadeOutMs: number;
}

interface SlotFadePolicy {
  suppressFadeIn: boolean;
  suppressFadeOut: boolean;
}

@Component({
  selector: 'app-board-player',
  standalone: true,
  imports: [CommonModule, PlayerControlsComponent],
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

    <audio
      #audioA
      hidden
      preload="none"
      (ended)="onAudioEnded('A')"
      (error)="onAudioElementError('A')"
      (timeupdate)="onAudioTimeUpdate('A')"
      (play)="onAudioPlay('A')"
      (pause)="onAudioPause('A')"
      (seeking)="onAudioTimeUpdate('A')"
      (seeked)="onAudioSeeked('A')"
    ></audio>

    <audio
      #audioB
      hidden
      preload="none"
      (ended)="onAudioEnded('B')"
      (error)="onAudioElementError('B')"
      (timeupdate)="onAudioTimeUpdate('B')"
      (play)="onAudioPlay('B')"
      (pause)="onAudioPause('B')"
      (seeking)="onAudioTimeUpdate('B')"
      (seeked)="onAudioSeeked('B')"
    ></audio>
  `,
})
export class BoardPlayerComponent implements OnInit, OnDestroy {
  /** Fallback crossfades when the relevant window/track has no fades set. */
  private static readonly DEFAULT_SWITCH_CROSSFADE_MS = 2000;
  private static readonly DEFAULT_LOOP_CROSSFADE_MS = 3000;
  private static readonly LOOP_PREPARE_LEAD_MS = 3000;
  private static readonly PLAYLIST_PRELOAD_LEAD_MS = 3000;
  /** Fade applied to a plain start (stopped → playing) and a plain stop
      (playing → stopped). Crossfades between tracks/loops use their own
      longer fades and bypass this. */
  private static readonly MANUAL_FADE_MS = 400;

  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  private readonly loopBlend = inject(LoopBlendService);

  readonly title = input('');
  readonly hasTrack = input(false);
  readonly trackId = input<number | null>(null);
  readonly status = input<PlayerStatus>('STOPPED');
  readonly streamUrl = input<string | null>(null);
  readonly durationS = input<number | null>(null);
  readonly windowStartS = input<number | null>(null);
  readonly windowEndS = input<number | null>(null);
  readonly windowFadeInMs = input(0);
  readonly windowFadeOutMs = input(0);
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

  @ViewChild('audioA') audioARef?: ElementRef<HTMLAudioElement>;
  @ViewChild('audioB') audioBRef?: ElementRef<HTMLAudioElement>;

  readonly localStatus = signal<PlayerStatus>('STOPPED');
  readonly displayPositionS = signal(0);
  readonly seekableMaxS = signal(0);
  readonly fullDurationS = signal(0);

  private streamA = new BoardPlayerAudioSourceManager();
  private streamB = new BoardPlayerAudioSourceManager();

  private suppressNextErrorA = false;
  private suppressNextErrorB = false;

  private positionTimer: ReturnType<typeof setInterval> | null = null;
  private windowBoundaryTimer: ReturnType<typeof setTimeout> | null = null;
  private loopPrepareTimer: ReturnType<typeof setTimeout> | null = null;
  private playlistPreloadTimer: ReturnType<typeof setTimeout> | null = null;
  private naturalFadeOutTimer: ReturnType<typeof setTimeout> | null = null;
  private naturalFadeOutKey: string | null = null;

  private activeSlot: AudioSlot = 'A';
  private currentStreamUrl: string | null = null;
  private pendingStreamUrl: string | null = null;
  private pendingTrackSwitchTrackId: number | null = null;
  private emittedNearEndKey: string | null = null;

  private switchSequence = 0;
  private connectGeneration = 0;

  private gainA = 1;
  private gainB = 0;
  private rampId = 0;

  private audioCtx: AudioContext | null = null;
  private sourceA: MediaElementAudioSourceNode | null = null;
  private sourceB: MediaElementAudioSourceNode | null = null;
  private gainNodeA: GainNode | null = null;
  private gainNodeB: GainNode | null = null;
  private masterGainNode: GainNode | null = null;
  private webAudioUnavailable = false;

  private loopCrossfadeInProgress = false;
  private pendingSelectionReload = false;
  private uiPinnedToWindowStart = false;
  private isUserSeeking = false;

  private slotContextA: SlotPlaybackContext = this.emptyContext();
  private slotContextB: SlotPlaybackContext = this.emptyContext();

  private fadePolicyA: SlotFadePolicy = this.emptyFadePolicy();
  private fadePolicyB: SlotFadePolicy = this.emptyFadePolicy();

  private pendingTargetContext: SlotPlaybackContext | null = null;

  private readonly visibilityChangeHandler = () => {
    this.zone.run(() => {
      this.reconcilePlaybackState();
      this.scheduleWindowBoundaryCheck();
    });
  };

  constructor() {
    this.streamA.onProgress = (_b, complete, seekableMaxS) => {
      this.zone.run(() => {
        if (this.activeSlot !== 'A') return;
        const ctx = this.getActiveContext();
        this.seekableMaxS.set(
          complete
            ? ctx.endS
            : Math.max(ctx.startS, Math.min(seekableMaxS, ctx.endS)),
        );
      });
    };

    this.streamB.onProgress = (_b, complete, seekableMaxS) => {
      this.zone.run(() => {
        if (this.activeSlot !== 'B') return;
        const ctx = this.getActiveContext();
        this.seekableMaxS.set(
          complete
            ? ctx.endS
            : Math.max(ctx.startS, Math.min(seekableMaxS, ctx.endS)),
        );
      });
    };

    this.streamA.onError = () => {
      this.zone.run(() => {
        if (this.activeSlot !== 'A') return;
        this.clearWindowBoundaryTimer();
        this.clearLoopPrepareTimer();
        this.clearPlaylistPreloadTimer();
        this.localStatus.set('STOPPED');
        this.audioError.emit();
      });
    };

    this.streamB.onError = () => {
      this.zone.run(() => {
        if (this.activeSlot !== 'B') return;
        this.clearWindowBoundaryTimer();
        this.clearLoopPrepareTimer();
        this.clearPlaylistPreloadTimer();
        this.localStatus.set('STOPPED');
        this.audioError.emit();
      });
    };

    combineLatest([
      toObservable(this.status),
      toObservable(this.streamUrl),
      toObservable(this.windowStartS),
      toObservable(this.windowEndS),
      toObservable(this.durationS),
      toObservable(this.hasSelectedWindow),
      toObservable(this.trackId),
      toObservable(this.hasTrack),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.syncWithBackend());

    toObservable(this.trackId)
      .pipe(
        distinctUntilChanged(),
        skip(1),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.onTrackChanged());

    combineLatest([
      toObservable(this.windowStartS),
      toObservable(this.windowEndS),
      toObservable(this.hasSelectedWindow),
    ])
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onWindowChanged());

    combineLatest([
      toObservable(this.windowStartS),
      toObservable(this.windowEndS),
      toObservable(this.durationS),
      toObservable(this.hasSelectedWindow),
      toObservable(this.trackId),
    ])
      .pipe(skip(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (
          !this.uiPinnedToWindowStart &&
          !this.pendingStreamUrl &&
          !this.isUserSeeking &&
          this.pendingTrackSwitchTrackId == null
        ) {
          this.displayPositionS.set(
            this.clampToPlayable(this.displayPositionS()),
          );
          this.seekableMaxS.set(this.clampToPlayable(this.seekableMaxS()));
        }
      });

    combineLatest([
      toObservable(this.masterVolume),
      toObservable(this.windowFadeInMs),
      toObservable(this.windowFadeOutMs),
      toObservable(this.windowStartS),
      toObservable(this.windowEndS),
      toObservable(this.hasSelectedWindow),
      toObservable(this.repeat),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applyAllVolumes());

    toObservable(this.masterVolume)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((target) => this.applyMasterGain(target));

    toObservable(this.durationS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((v) => this.fullDurationS.set(v ?? 0));
  }

  ngOnInit(): void {
    document.addEventListener('visibilitychange', this.visibilityChangeHandler);
  }

  ngOnDestroy(): void {
    document.removeEventListener(
      'visibilitychange',
      this.visibilityChangeHandler,
    );
    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();
    this.cancelRamp();
    this.tearDownAll();

    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
      this.sourceA = null;
      this.sourceB = null;
      this.gainNodeA = null;
      this.gainNodeB = null;
      this.masterGainNode = null;
    }
  }

  private onTrackChanged(): void {
    const currentlyActive =
      this.status() === 'PLAYING' ||
      this.status() === 'BUFFERING' ||
      this.localStatus() === 'PLAYING' ||
      this.localStatus() === 'BUFFERING';

    if (currentlyActive) {
      this.pendingTrackSwitchTrackId = this.trackId();
      this.pendingSelectionReload = false;
      this.pendingTargetContext = null;
      this.uiPinnedToWindowStart = false;
      return;
    }

    this.pendingTrackSwitchTrackId = null;
    this.cancelRamp();
    this.tearDownAll();
  }

  private onWindowChanged(): void {
    this.pendingSelectionReload = true;
    this.pinDisplayToWindowStart(false, this.buildCurrentInputContext());
  }

  onPlay(): void {
    // Construct/resume the audio graph synchronously inside the click handler
    // so browsers that gate AudioContext on a user gesture (Safari, mobile
    // Chrome) accept the unlock.
    this.ensureAudioGraph();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => {});
    }
    this.playRequested.emit();
  }

  onStop(): void {
    this.stopRequested.emit();
  }

  onSeekPreview(rawValue: number): void {
    const clamped = this.clampToWindow(Math.floor(rawValue));
    this.isUserSeeking = true;
    this.displayPositionS.set(clamped);
  }

  onSeekCommit(rawValue: number): void {
    const clamped = this.clampToWindow(Math.floor(rawValue));
    this.isUserSeeking = true;
    this.displayPositionS.set(clamped);
    this.seekLocalStreaming(clamped);
    this.applyAllVolumes();
    // Seeking can land before the natural-fade-out point — restore the slot
    // gain to 1 and re-arm the schedule from the new position.
    this.clearNaturalFadeOutTimer();
    if (!this.repeat() && this.localStatus() === 'PLAYING') {
      this.rampSlotGain(this.activeSlot, this.getSlotGain(this.activeSlot), 1, 0);
    }
  }

  onAudioTimeUpdate(slot: AudioSlot): void {
    if (slot !== this.activeSlot) return;
    this.reconcilePlaybackState();
  }

  onAudioSeeked(slot: AudioSlot): void {
    if (slot !== this.activeSlot) return;
    this.isUserSeeking = false;
    this.reconcilePlaybackState();
  }

  onAudioPlay(slot: AudioSlot): void {
    if (slot !== this.activeSlot) return;
    this.startPositionTimer();
    this.scheduleWindowBoundaryCheck();
  }

  onAudioPause(slot: AudioSlot): void {
    if (slot !== this.activeSlot) return;
    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();
  }

  onAudioEnded(slot: AudioSlot): void {
    if (slot !== this.activeSlot) return;

    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();

    if (this.repeat()) {
      if (!this.loopCrossfadeInProgress) {
        void this.crossfadeLoop();
      }
      return;
    }

    // A URL-switch crossfade is already in progress — don't kill its state.
    if (this.pendingStreamUrl != null) {
      return;
    }

    this.stopPositionTimer();
    this.markPlaybackEnded(this.getActiveContext());
    this.ended.emit();
  }

  onAudioElementError(slot: AudioSlot): void {
    if (slot === 'A' && this.suppressNextErrorA) {
      this.suppressNextErrorA = false;
      return;
    }
    if (slot === 'B' && this.suppressNextErrorB) {
      this.suppressNextErrorB = false;
      return;
    }
    if (slot !== this.activeSlot) return;

    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();
    console.warn('board-player audio element error');
    this.localStatus.set('STOPPED');
    this.audioError.emit();
  }

  private syncWithBackend(): void {
    if (!this.hasTrack() || !this.streamUrl() || this.trackId() == null) {
      this.cancelRamp();
      this.clearWindowBoundaryTimer();
      this.clearLoopPrepareTimer();
      this.clearPlaylistPreloadTimer();
      this.pendingStreamUrl = null;
      this.pendingTrackSwitchTrackId = null;
      this.emittedNearEndKey = null;
      this.loopCrossfadeInProgress = false;
      this.pendingSelectionReload = false;
      this.uiPinnedToWindowStart = false;
      this.pendingTargetContext = null;
      this.tearDownAll();
      return;
    }

    const url = this.streamUrl()!;

    if (this.status() === 'PLAYING') {
      const initialStart =
        this.currentStreamUrl == null || this.localStatus() === 'STOPPED';

      const streamChanged =
        this.currentStreamUrl != null && url !== this.currentStreamUrl;

      const waitingForFreshTrackSource =
        this.pendingTrackSwitchTrackId != null &&
        this.pendingTrackSwitchTrackId === this.trackId();

      const trackSwitchReady =
        waitingForFreshTrackSource &&
        this.currentStreamUrl != null &&
        url !== this.currentStreamUrl;

      const selectionReload =
        this.pendingSelectionReload && !waitingForFreshTrackSource;

      if (initialStart) {
        if (this.pendingStreamUrl === url) return;
        const ctx = this.buildCurrentInputContext();
        this.beginPendingTransition(url, ctx);
        void this.connectIntoSlot(this.activeSlot, url, true, ctx);
        return;
      }

      if (trackSwitchReady) {
        if (this.pendingStreamUrl === url) return;
        const ctx = this.buildCurrentInputContext();
        this.beginPendingTransition(url, ctx);
        void this.crossfadeToUrl(url, ctx);
        return;
      }

      if (waitingForFreshTrackSource) {
        return;
      }

      if (selectionReload) {
        if (this.pendingStreamUrl === url) return;
        const ctx = this.buildCurrentInputContext();
        this.beginPendingTransition(url, ctx);
        void this.crossfadeToUrl(url, ctx);
        return;
      }

      const resumeSameStream =
        this.currentStreamUrl === url && this.localStatus() === 'PAUSED';

      if (resumeSameStream) {
        this.getAudio(this.activeSlot)
          ?.play()
          .catch((e) => console.warn('resume failed', e));
        this.localStatus.set('PLAYING');
        this.startPositionTimer();
        this.scheduleWindowBoundaryCheck();
        return;
      }

      if (this.pendingStreamUrl === url) return;

      if (streamChanged) {
        const ctx = this.buildCurrentInputContext();
        this.beginPendingTransition(url, ctx);
        void this.crossfadeToUrl(url, ctx);
      }

      return;
    }

    if (this.status() === 'PAUSED') {
      this.getAudio(this.activeSlot)?.pause();
      this.localStatus.set('PAUSED');
      this.clearWindowBoundaryTimer();
      this.clearLoopPrepareTimer();
      this.clearPlaylistPreloadTimer();
      return;
    }

    if (this.status() === 'STOPPED') {
      this.clearWindowBoundaryTimer();
      this.clearLoopPrepareTimer();
      this.clearPlaylistPreloadTimer();

      const wasAudiblyPlaying =
        this.localStatus() === 'PLAYING' && !!this.audioCtx;

      if (wasAudiblyPlaying) {
        // Manual fade-out before teardown. A subsequent operation (new play,
        // track switch, etc.) bumps switchSequence and the scheduled teardown
        // bails out.
        const slot = this.activeSlot;
        this.rampSlotGain(slot, this.getSlotGain(slot), 0, BoardPlayerComponent.MANUAL_FADE_MS);
        this.localStatus.set('STOPPED');
        const seq = ++this.switchSequence;
        setTimeout(() => {
          if (seq !== this.switchSequence) return;
          if (this.status() !== 'STOPPED') return;
          this.finalizeStop();
        }, BoardPlayerComponent.MANUAL_FADE_MS);
        return;
      }

      this.finalizeStop();
    }
  }

  private finalizeStop(): void {
    this.cancelRamp();
    this.clearNaturalFadeOutTimer();
    this.pendingStreamUrl = null;
    this.pendingTrackSwitchTrackId = null;
    this.emittedNearEndKey = null;
    this.loopCrossfadeInProgress = false;
    this.pendingSelectionReload = false;
    this.uiPinnedToWindowStart = false;
    this.pendingTargetContext = null;
    this.tearDownAll();
  }

  private getSlotGain(slot: AudioSlot): number {
    return slot === 'A' ? this.gainA : this.gainB;
  }

  private async crossfadeToUrl(
    url: string,
    targetContext: SlotPlaybackContext,
  ): Promise<void> {
    const seq = ++this.switchSequence;
    const fromSlot = this.activeSlot;
    const toSlot = this.otherSlot(fromSlot);
    const fromPolicy = this.cloneFadePolicy(this.getFadePolicy(fromSlot));
    let committed = false;

    this.loopCrossfadeInProgress = false;

    try {
      this.tearDownSlot(toSlot);
      await this.connectIntoSlot(toSlot, url, false, targetContext);

      if (seq !== this.switchSequence) return;

      const incoming = this.getAudio(toSlot);
      if (!incoming) {
        this.clearPendingTransition();
        return;
      }

      // Keep the previous stream alive until the crossfade finishes.
      // Aborting it here can make the outgoing track stop or underrun before
      // the scheduled gain ramp reaches zero, which sounds like an abrupt fade.
      // Also suppress the selected-window fade-out on the outgoing slot while
      // switching. Otherwise the normal window envelope and the switch ramp can
      // stack together, making the old track disappear before the new one is
      // fully blended in.
      this.patchFadePolicy(fromSlot, { suppressFadeOut: true });
      this.patchFadePolicy(toSlot, { suppressFadeIn: true });

      this.setGain(toSlot, 0);
      this.applyAllVolumes();

      const playResult = await Promise.race([
        incoming
          .play()
          .then(() => 'ok' as const)
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === 'AbortError') {
              console.warn(
                'crossfade AbortError (background throttle) — continuing',
              );
              return 'timeout' as const;
            }
            console.warn('crossfade play failed', err);
            return 'error' as const;
          }),
        new Promise<'timeout'>((resolve) =>
          setTimeout(() => resolve('timeout'), 3000),
        ),
      ]);

      if (playResult === 'error') {
        this.tearDownSlot(toSlot);
        this.clearPendingTransition();
        this.localStatus.set('STOPPED');
        this.audioError.emit();
        return;
      }

      if (seq !== this.switchSequence) return;

      await this.crossfadeSlots(
        fromSlot,
        toSlot,
        this.switchCrossfadeMs(),
        'switch',
      );

      if (seq !== this.switchSequence) return;

      this.tearDownSlot(fromSlot);
      this.activeSlot = toSlot;
      this.currentStreamUrl = url;
      this.pendingTrackSwitchTrackId = null;
      this.clearPendingTransition();
      this.localStatus.set('PLAYING');
      committed = true;

      const ctx = this.getActiveContext();
      this.displayPositionS.set(ctx.startS);
      this.seekableMaxS.set(ctx.startS);

      this.setGain(fromSlot, 0);
      this.setGain(toSlot, 1);
      this.applyAllVolumes();

      this.startPositionTimer();
      this.scheduleWindowBoundaryCheck();
    } finally {
      if (!committed) {
        this.setFadePolicy(fromSlot, fromPolicy);
        if (this.activeSlot !== toSlot) {
          this.resetFadePolicy(toSlot);
        }
        this.applyAllVolumes();
      }
    }
  }

  private async connectIntoSlot(
    slot: AudioSlot,
    url: string,
    makeCurrentUrl: boolean,
    slotContext: SlotPlaybackContext,
  ): Promise<void> {
    const audio = this.getAudio(slot);
    const stream = this.getStream(slot);
    if (!audio) return;

    this.ensureAudioGraph();
    await this.ensureAudioContextRunning();

    const generation = ++this.connectGeneration;
    this.setSlotContext(slot, slotContext);
    this.resetFadePolicy(slot);

    audio.pause();
    audio.volume = 0;
    if (slot === 'A') this.suppressNextErrorA = true;
    else this.suppressNextErrorB = true;
    audio.removeAttribute('src');
    audio.load();

    const maxStoredBytes = slotContext.hasSelectedWindow
      ? 64 * 1024 * 1024
      : undefined;

    const loadPromise = stream.load(url, {
      audioElement: audio,
      useMse: 'MediaSource' in window,
      estimatedDurationS: slotContext.durationS,
      windowStartS: slotContext.startS,
      maxStoredBytes,
    });

    const ready = await this.waitForAudioReady(audio, generation);

    if (!ready || generation !== this.connectGeneration) {
      loadPromise.catch(() => {});
      return;
    }

    audio.currentTime = 0;

    if (makeCurrentUrl) {
      this.currentStreamUrl = url;
      this.pendingStreamUrl = null;
      this.pendingSelectionReload = false;
      this.pendingTrackSwitchTrackId = null;
      this.uiPinnedToWindowStart = false;
      this.pendingTargetContext = null;
      this.emittedNearEndKey = null;
      this.clearNaturalFadeOutTimer();
      // Manual fade-in on plain start.
      this.setGain(slot, 0);
      this.rampSlotGain(slot, 0, 1, BoardPlayerComponent.MANUAL_FADE_MS);

      this.displayPositionS.set(slotContext.startS);
      this.seekableMaxS.set(slotContext.startS);
      this.applyAllVolumes();

      audio.play().catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.warn('initial play AbortError (background throttle)');
        } else {
          console.warn('play failed', err);
        }
      });

      this.localStatus.set('PLAYING');
      this.startPositionTimer();
      this.scheduleWindowBoundaryCheck();
    }

    loadPromise.catch((err) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('stream background load error', err);
    });
  }

  private waitForAudioReady(
    audio: HTMLAudioElement,
    generation: number,
  ): Promise<boolean> {
    if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve(generation === this.connectGeneration);
    }

    return new Promise<boolean>((resolve) => {
      const onReady = () => {
        cleanup();
        resolve(generation === this.connectGeneration);
      };

      const onError = () => {
        cleanup();
        resolve(false);
      };

      const poll = setInterval(() => {
        if (generation !== this.connectGeneration) {
          cleanup();
          resolve(false);
        }
      }, 50);

      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onReady);
        audio.removeEventListener('canplay', onReady);
        audio.removeEventListener('loadeddata', onReady);
        audio.removeEventListener('error', onError);
        clearInterval(poll);
      };

      audio.addEventListener('loadedmetadata', onReady, { once: true });
      audio.addEventListener('canplay', onReady, { once: true });
      audio.addEventListener('loadeddata', onReady, { once: true });
      audio.addEventListener('error', onError, { once: true });
    });
  }

  private async crossfadeSlots(
    fromSlot: AudioSlot,
    toSlot: AudioSlot,
    durationMs: number,
    blendKind: LoopBlendKind = 'switch',
  ): Promise<void> {
    this.cancelRamp();

    if (durationMs <= 0) {
      this.setGain(fromSlot, 0);
      this.setGain(toSlot, 1);
      this.applyAllVolumes();
      return;
    }

    const graphReady = this.ensureAudioGraph();
    await this.ensureAudioContextRunning();

    const ctx = this.audioCtx;
    const fromNode = this.getGainNode(fromSlot);
    const toNode = this.getGainNode(toSlot);

    if (!graphReady || !ctx || !fromNode || !toNode) {
      this.setGain(fromSlot, 0);
      this.setGain(toSlot, 1);
      this.applyAllVolumes();
      return;
    }

    const rampId = ++this.rampId;
    const now = ctx.currentTime;
    const durationS = durationMs / 1000;

    const { fromCurve, toCurve } = this.loopBlend.buildGainCurves({
      kind: blendKind,
      steps: 96,
    });

    try {
      fromNode.gain.cancelScheduledValues(now);
      toNode.gain.cancelScheduledValues(now);
      fromNode.gain.setValueAtTime(fromNode.gain.value, now);
      toNode.gain.setValueAtTime(toNode.gain.value, now);
      fromNode.gain.setValueCurveAtTime(fromCurve, now, durationS);
      toNode.gain.setValueCurveAtTime(toCurve, now, durationS);
    } catch (err) {
      console.warn('crossfade scheduling failed, snapping', err);
      this.setGain(fromSlot, 0);
      this.setGain(toSlot, 1);
      this.applyAllVolumes();
      return;
    }

    if (fromSlot === 'A') {
      this.gainA = 0;
      this.gainB = 1;
    } else {
      this.gainA = 1;
      this.gainB = 0;
    }

    // Wait for the scheduled ramp to finish. setTimeout may be throttled in
    // background tabs, but the audio fade itself has already executed on the
    // audio clock — this only delays JS cleanup, not the audible fade.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, durationMs + 40);
    });

    if (rampId !== this.rampId) return;
    this.applyAllVolumes();
  }

  private async crossfadeLoop(): Promise<void> {
    if (this.loopCrossfadeInProgress) return;

    const seq = ++this.switchSequence;
    const fromSlot = this.activeSlot;
    const toSlot = this.otherSlot(fromSlot);
    const loopContext = this.getActiveContext();
    const fromAudioEnded = this.getAudio(fromSlot)?.ended ?? false;
    const loopCrossfadeMs = fromAudioEnded ? 0 : this.getEffectiveLoopCrossfadeMs(loopContext);
    const fromPolicy = this.cloneFadePolicy(this.getFadePolicy(fromSlot));
    let committed = false;

    this.loopCrossfadeInProgress = true;
    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();

    try {
      const fromStream = this.getStream(fromSlot);
      const toStream = this.getStream(toSlot);
      const toAudio = this.getAudio(toSlot);

      if (!toAudio || loopContext.durationS <= 0) {
        return;
      }

      this.tearDownSlot(toSlot);
      this.setSlotContext(toSlot, loopContext);
      this.resetFadePolicy(toSlot);

      this.patchFadePolicy(fromSlot, { suppressFadeOut: true });
      this.patchFadePolicy(toSlot, {
        suppressFadeIn: true,
        suppressFadeOut: true,
      });

      const prepared = fromStream.cloneBufferedLoopTo(
        toStream,
        toAudio,
        0,
        loopContext.durationS,
        loopContext.startS,
      );

      if (!prepared) {
        console.warn(
          'loop crossfade fallback: buffered clone unavailable, restarting current slot',
          {
            hasSelectedWindow: loopContext.hasSelectedWindow,
            durationS: loopContext.durationS,
            startS: loopContext.startS,
          },
        );

        const restarted = fromStream.restartFromBuffer(
          true,
          loopContext.durationS,
        );

        if (!restarted || seq !== this.switchSequence) {
          this.stopPositionTimer();
          this.markPlaybackEnded(loopContext);
          this.ended.emit();
          return;
        }

        this.setFadePolicy(fromSlot, {
          suppressFadeIn: true,
          suppressFadeOut: true,
        });
        this.setGain(fromSlot, 1);
        this.setGain(toSlot, 0);
        this.applyAllVolumes();

        this.localStatus.set('PLAYING');
        this.displayPositionS.set(loopContext.startS);
        this.seekableMaxS.set(loopContext.endS);

        this.startPositionTimer();
        this.scheduleWindowBoundaryCheck();
        return;
      }

      if (seq !== this.switchSequence) return;

      this.setGain(toSlot, 0);
      this.applyAllVolumes();

      let hardRejected = false;

      try {
        await toAudio.play();
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          console.warn('loop play AbortError (background throttle) — continuing');
        } else {
          console.warn('loop play failed', err);
          hardRejected = true;
        }
      }

      if (hardRejected || seq !== this.switchSequence) return;

      await this.crossfadeSlots(fromSlot, toSlot, loopCrossfadeMs, 'loop');

      if (seq !== this.switchSequence) return;

      this.tearDownSlot(fromSlot);
      this.activeSlot = toSlot;
      this.localStatus.set('PLAYING');
      committed = true;

      const ctx = this.getActiveContext();
      this.displayPositionS.set(ctx.startS);
      this.seekableMaxS.set(ctx.endS);

      this.setGain(fromSlot, 0);
      this.setGain(toSlot, 1);
      this.applyAllVolumes();

      this.startPositionTimer();
      this.scheduleWindowBoundaryCheck();
    } finally {
      if (!committed) {
        this.setFadePolicy(fromSlot, fromPolicy);
        if (this.activeSlot !== toSlot) {
          this.resetFadePolicy(toSlot);
        }
        this.applyAllVolumes();
      }

      if (seq === this.switchSequence) {
        this.loopCrossfadeInProgress = false;
      }
    }
  }

  private seekLocalStreaming(targetS: number): void {
    const audio = this.getAudio(this.activeSlot);
    const stream = this.getStream(this.activeSlot);
    const ctx = this.getActiveContext();
    if (!audio) return;

    const clamped = this.clampToWindow(targetS);
    const audioTime = clamped - ctx.startS;
    const wasPlaying = this.localStatus() === 'PLAYING';

    const canSeekInPlace =
      !stream.usingBlob && stream.isInMseBuffer(audioTime);

    if (canSeekInPlace) {
      audio.currentTime = audioTime;
    } else {
      if (this.activeSlot === 'A') this.suppressNextErrorA = true;
      else this.suppressNextErrorB = true;

      const ok = stream.switchToBlobSrc(audioTime, wasPlaying);
      if (!ok) {
        this.isUserSeeking = false;
        return;
      }

      this.localStatus.set(wasPlaying ? 'PLAYING' : 'PAUSED');
    }

    this.displayPositionS.set(clamped);
    this.applyAllVolumes();
    this.scheduleWindowBoundaryCheck();
  }

  private startPositionTimer(): void {
    this.stopPositionTimer();
    this.zone.runOutsideAngular(() => {
      this.positionTimer = setInterval(() => this.tickDisplay(), 100);
    });
  }

  private stopPositionTimer(): void {
    if (this.positionTimer !== null) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }

  private tickDisplay(): void {
    this.updateDisplayFromPlayback();
  }

  private updateDisplayFromPlayback(): void {
    if (this.isUserSeeking) return;

    if (this.pendingStreamUrl || this.uiPinnedToWindowStart) {
      const ctx = this.pendingTargetContext ?? this.buildCurrentInputContext();
      this.displayPositionS.set(ctx.startS);
      this.applyAllVolumes();
      return;
    }

    const audio = this.getAudio(this.activeSlot);
    const ctx = this.getActiveContext();
    if (!audio) return;

    const rawDisplay = Math.floor(ctx.startS + audio.currentTime);
    this.displayPositionS.set(
      Math.max(ctx.startS, Math.min(rawDisplay, ctx.endS)),
    );
    this.applyAllVolumes();
  }

  private reconcilePlaybackState(): void {
    this.updateDisplayFromPlayback();

    if (this.pendingStreamUrl || this.uiPinnedToWindowStart) return;
    if (this.isUserSeeking) return;
    if (this.localStatus() !== 'PLAYING') return;

    const audio = this.getAudio(this.activeSlot);
    const ctx = this.getActiveContext();
    if (!audio) return;

    this.maybeStartLoopCrossfade(audio, ctx);

    const rawDisplay = Math.floor(ctx.startS + audio.currentTime);
    const pastEnd =
      (ctx.endS > 0 && rawDisplay >= ctx.endS) ||
      (ctx.durationS > 0 && audio.currentTime >= ctx.durationS);

    if (pastEnd) {
      this.handleReachedWindowEnd(audio, ctx);
      return;
    }

    this.scheduleWindowBoundaryCheck();
  }

  private handleReachedWindowEnd(
    audio: HTMLAudioElement,
    ctx: SlotPlaybackContext,
  ): void {
    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();

    if (!this.repeat()) {
      audio.pause();
      this.stopPositionTimer();
      this.markPlaybackEnded(ctx);
      this.ended.emit();
      return;
    }

    if (!this.loopCrossfadeInProgress) {
      void this.crossfadeLoop();
    }
  }

  private scheduleWindowBoundaryCheck(): void {
    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();
    if (this.repeat()) {
      this.clearNaturalFadeOutTimer();
    }

    if (this.localStatus() !== 'PLAYING') return;
    if (
      this.pendingStreamUrl ||
      this.uiPinnedToWindowStart ||
      this.isUserSeeking
    ) {
      return;
    }

    const audio = this.getAudio(this.activeSlot);
    const ctx = this.getActiveContext();
    if (!audio || ctx.durationS <= 0) return;

    const remainingMs = Math.max(0, (ctx.durationS - audio.currentTime) * 1000);

    if (!this.repeat()) {
      this.scheduleNaturalFadeOut(remainingMs, ctx);

      const nearEndKey = this.getNearEndKey();

      if (remainingMs <= BoardPlayerComponent.PLAYLIST_PRELOAD_LEAD_MS) {
        if (this.emittedNearEndKey !== nearEndKey) {
          this.emittedNearEndKey = nearEndKey;
          queueMicrotask(() => {
            if (this.localStatus() === 'PLAYING' && !this.pendingStreamUrl) {
              this.nearEnd.emit();
            }
          });
        }
      } else {
        const triggerInMs =
          remainingMs - BoardPlayerComponent.PLAYLIST_PRELOAD_LEAD_MS;

        this.zone.runOutsideAngular(() => {
          this.playlistPreloadTimer = setTimeout(() => {
            this.zone.run(() => {
              if (
                this.localStatus() === 'PLAYING' &&
                !this.pendingStreamUrl &&
                this.emittedNearEndKey !== nearEndKey
              ) {
                this.emittedNearEndKey = nearEndKey;
                this.nearEnd.emit();
              }
            });
          }, triggerInMs);
        });
      }
    }

    if (this.repeat() && !this.loopCrossfadeInProgress) {
      const activeStream = this.getStream(this.activeSlot);

      if (activeStream.hasBufferedLoopRange(ctx.durationS)) {
        const prepareLeadMs = this.getLoopPrepareLeadMs(ctx);
        const triggerInMs = Math.max(0, remainingMs - prepareLeadMs);

        this.zone.runOutsideAngular(() => {
          this.loopPrepareTimer = setTimeout(() => {
            this.zone.run(() => {
              if (
                !this.loopCrossfadeInProgress &&
                this.localStatus() === 'PLAYING'
              ) {
                void this.crossfadeLoop();
              }
            });
          }, triggerInMs);
        });
      }
    }

    this.zone.runOutsideAngular(() => {
      this.windowBoundaryTimer = setTimeout(() => {
        this.zone.run(() => this.reconcilePlaybackState());
      }, Math.max(20, remainingMs + 60));
    });
  }

  private clearWindowBoundaryTimer(): void {
    if (this.windowBoundaryTimer !== null) {
      clearTimeout(this.windowBoundaryTimer);
      this.windowBoundaryTimer = null;
    }
  }

  private clearLoopPrepareTimer(): void {
    if (this.loopPrepareTimer !== null) {
      clearTimeout(this.loopPrepareTimer);
      this.loopPrepareTimer = null;
    }
  }

  private clearPlaylistPreloadTimer(): void {
    if (this.playlistPreloadTimer !== null) {
      clearTimeout(this.playlistPreloadTimer);
      this.playlistPreloadTimer = null;
    }
  }

  private clearNaturalFadeOutTimer(): void {
    if (this.naturalFadeOutTimer !== null) {
      clearTimeout(this.naturalFadeOutTimer);
      this.naturalFadeOutTimer = null;
    }
    this.naturalFadeOutKey = null;
  }

  /** Schedule a fade-out that finishes at the track's natural end when loop
      is off, so playback doesn't cut off abruptly. Re-entrant on every
      timeupdate; only the first call per playback actually schedules. */
  private scheduleNaturalFadeOut(remainingMs: number, ctx: SlotPlaybackContext): void {
    if (this.repeat()) return;
    if (this.pendingStreamUrl) return;
    if (this.localStatus() !== 'PLAYING') return;
    if (ctx.durationS <= 0) return;

    const slot = this.activeSlot;
    const key = `${slot}:${this.currentStreamUrl}:${ctx.startS}:${ctx.durationS}`;

    if (this.naturalFadeOutKey === key) return;

    const fadeMs = BoardPlayerComponent.MANUAL_FADE_MS;
    const triggerInMs = remainingMs - fadeMs;

    this.naturalFadeOutKey = key;

    if (triggerInMs <= 0) {
      // We're already inside the fade-out window — start immediately,
      // shortened to whatever time remains.
      const duration = Math.max(0, remainingMs);
      this.rampSlotGain(slot, this.getSlotGain(slot), 0, duration);
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.naturalFadeOutTimer = setTimeout(() => {
        this.zone.run(() => {
          if (
            this.localStatus() !== 'PLAYING' ||
            this.repeat() ||
            this.pendingStreamUrl ||
            this.naturalFadeOutKey !== key
          ) {
            return;
          }
          this.rampSlotGain(slot, this.getSlotGain(slot), 0, fadeMs);
        });
      }, triggerInMs);
    });
  }

  private applyAllVolumes(): void {
    const audioA = this.audioARef?.nativeElement;
    const audioB = this.audioBRef?.nativeElement;

    if (audioA) {
      audioA.volume = this.resolveSlotVolume('A', audioA, this.slotContextA);
    }

    if (audioB) {
      audioB.volume = this.resolveSlotVolume('B', audioB, this.slotContextB);
    }
  }

  private resolveSlotVolume(
    slot: AudioSlot,
    audio: HTMLAudioElement,
    ctx: SlotPlaybackContext,
  ): number {
    const gain = slot === 'A' ? this.gainA : this.gainB;
    const envelope =
      gain > 0.0001 ? this.computeWindowVolume(slot, audio, ctx) : 1;
    const gainFactor = this.audioCtx ? 1 : gain;
    const masterFactor = this.audioCtx ? 1 : this.masterVolume();

    return Math.max(0, Math.min(envelope * gainFactor * masterFactor, 1));
  }

  private computeWindowVolume(
    slot: AudioSlot,
    audio: HTMLAudioElement,
    ctx: SlotPlaybackContext,
  ): number {
    if (!ctx.hasSelectedWindow || ctx.durationS <= 0) return 1;

    const policy = this.getFadePolicy(slot);
    const pos = Math.max(0, Math.min(audio.currentTime, ctx.durationS));
    const maxFadeLen = ctx.durationS / 2;
    const fadeInLen = Math.min(ctx.fadeInMs / 1000, maxFadeLen);
    const fadeOutLen = Math.min(ctx.fadeOutMs / 1000, maxFadeLen);

    let volume = 1;

    if (fadeInLen > 0 && !policy.suppressFadeIn) {
      volume = Math.min(volume, Math.max(0, Math.min(pos / fadeInLen, 1)));
    }

    if (fadeOutLen > 0 && !policy.suppressFadeOut) {
      volume = Math.min(
        volume,
        Math.max(0, Math.min((ctx.durationS - pos) / fadeOutLen, 1)),
      );
    }

    return Math.max(0, Math.min(volume, 1));
  }

  private markPlaybackEnded(ctx: SlotPlaybackContext): void {
    this.currentStreamUrl = null;
    this.pendingStreamUrl = null;
    this.pendingTrackSwitchTrackId = null;
    this.pendingTargetContext = null;
    this.pendingSelectionReload = false;
    this.uiPinnedToWindowStart = false;
    this.loopCrossfadeInProgress = false;
    this.isUserSeeking = false;
    this.emittedNearEndKey = null;
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();
    this.setSlotContext(this.activeSlot, this.buildCurrentInputContext());
    this.resetFadePolicy(this.activeSlot);
    this.displayPositionS.set(ctx.endS);
    this.seekableMaxS.set(ctx.endS);
    this.localStatus.set('STOPPED');
  }

  private tearDownAll(): void {
    this.switchSequence++;
    this.connectGeneration++;
    this.stopPositionTimer();
    this.clearWindowBoundaryTimer();
    this.clearLoopPrepareTimer();
    this.clearPlaylistPreloadTimer();
    this.clearNaturalFadeOutTimer();

    this.tearDownSlot('A');
    this.tearDownSlot('B');

    this.currentStreamUrl = null;
    this.pendingStreamUrl = null;
    this.pendingTrackSwitchTrackId = null;
    this.pendingSelectionReload = false;
    this.uiPinnedToWindowStart = false;
    this.pendingTargetContext = null;
    this.isUserSeeking = false;
    this.emittedNearEndKey = null;
    this.localStatus.set('STOPPED');
    this.displayPositionS.set(this.buildCurrentInputContext().startS);
    this.seekableMaxS.set(this.buildCurrentInputContext().startS);
    this.gainA = this.activeSlot === 'A' ? 1 : 0;
    this.gainB = this.activeSlot === 'B' ? 1 : 0;
    this.slotContextA = this.emptyContext();
    this.slotContextB = this.emptyContext();
    this.fadePolicyA = this.emptyFadePolicy();
    this.fadePolicyB = this.emptyFadePolicy();
  }

  private tearDownSlot(slot: AudioSlot): void {
    const audio = this.getAudio(slot);
    const stream = this.getStream(slot);

    if (audio) {
      audio.pause();
      audio.volume = 0;
      if (slot === 'A') this.suppressNextErrorA = true;
      else this.suppressNextErrorB = true;
      audio.removeAttribute('src');
      audio.load();
    }

    stream.destroy();
    this.setSlotContext(slot, this.emptyContext());
    this.resetFadePolicy(slot);
  }

  private clearPendingTransition(): void {
    this.pendingStreamUrl = null;
    this.uiPinnedToWindowStart = false;
    this.pendingSelectionReload = false;
    this.pendingTargetContext = null;
  }

  private beginPendingTransition(url: string, ctx: SlotPlaybackContext): void {
    this.pendingStreamUrl = url;
    this.pendingTargetContext = this.cloneContext(ctx);
    this.localStatus.set('BUFFERING');
    this.pinDisplayToWindowStart(true, ctx);
  }

  private pinDisplayToWindowStart(
    forceBuffering: boolean,
    ctx: SlotPlaybackContext,
  ): void {
    this.uiPinnedToWindowStart = true;
    this.displayPositionS.set(ctx.startS);
    this.seekableMaxS.set(ctx.startS);

    if (forceBuffering && this.status() === 'PLAYING') {
      this.localStatus.set('BUFFERING');
    }
  }

  private maybeStartLoopCrossfade(
    audio: HTMLAudioElement,
    ctx: SlotPlaybackContext,
  ): void {
    if (!this.repeat()) return;
    if (this.loopCrossfadeInProgress || this.pendingStreamUrl) return;
    if (ctx.durationS <= 0) return;

    const activeStream = this.getStream(this.activeSlot);
    if (!activeStream.hasBufferedLoopRange(ctx.durationS)) return;

    const remainingMs = Math.max(0, (ctx.durationS - audio.currentTime) * 1000);

    if (remainingMs <= this.getLoopPrepareLeadMs(ctx)) {
      void this.crossfadeLoop();
    }
  }

  private getEffectiveLoopCrossfadeMs(ctx: SlotPlaybackContext): number {
    const windowDurationMs = Math.max(0, ctx.durationS * 1000);

    return Math.min(
      this.loopCrossfadeMs(),
      Math.max(140, Math.floor(windowDurationMs * 0.45)),
    );
  }

  private getLoopPrepareLeadMs(ctx: SlotPlaybackContext): number {
    const loopCrossfadeMs = this.getEffectiveLoopCrossfadeMs(ctx);

    return Math.max(
      180,
      Math.min(
        BoardPlayerComponent.LOOP_PREPARE_LEAD_MS,
        loopCrossfadeMs + 1500,
      ),
    );
  }

  private cancelRamp(): void {
    this.rampId++;
    if (this.audioCtx) {
      const now = this.audioCtx.currentTime;
      for (const node of [this.gainNodeA, this.gainNodeB]) {
        if (!node) continue;
        try {
          const held = node.gain.value;
          node.gain.cancelScheduledValues(now);
          node.gain.setValueAtTime(held, now);
        } catch {}
      }
    }
  }

  private setGain(slot: AudioSlot, value: number): void {
    if (slot === 'A') this.gainA = value;
    else this.gainB = value;

    if (this.audioCtx) {
      const node = this.getGainNode(slot);
      if (node) {
        const now = this.audioCtx.currentTime;
        try {
          node.gain.cancelScheduledValues(now);
          node.gain.setValueAtTime(value, now);
        } catch {}
      }
    }
  }

  /** Linear ramp of a slot gain from `from` to `to` over `durationMs`. Used
      for plain start/stop fades; crossfade paths drive their own ramps. */
  private rampSlotGain(
    slot: AudioSlot,
    from: number,
    to: number,
    durationMs: number,
  ): void {
    if (slot === 'A') this.gainA = to;
    else this.gainB = to;

    if (!this.audioCtx) return;
    const node = this.getGainNode(slot);
    if (!node) return;

    const now = this.audioCtx.currentTime;
    try {
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(from, now);
      if (durationMs > 0) {
        node.gain.linearRampToValueAtTime(to, now + durationMs / 1000);
      } else {
        node.gain.setValueAtTime(to, now);
      }
    } catch {}
  }

  private getGainNode(slot: AudioSlot): GainNode | null {
    return slot === 'A' ? this.gainNodeA : this.gainNodeB;
  }

  private ensureAudioGraph(): boolean {
    if (this.audioCtx) return true;
    if (this.webAudioUnavailable) return false;

    const audioA = this.audioARef?.nativeElement;
    const audioB = this.audioBRef?.nativeElement;
    if (!audioA || !audioB) return false;

    const Ctor: typeof AudioContext | undefined =
      (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) {
      this.webAudioUnavailable = true;
      return false;
    }

    try {
      const ctx = new Ctor();
      const sourceA = ctx.createMediaElementSource(audioA);
      const sourceB = ctx.createMediaElementSource(audioB);
      const gainA = ctx.createGain();
      const gainB = ctx.createGain();
      const masterGain = ctx.createGain();
      gainA.gain.value = this.gainA;
      gainB.gain.value = this.gainB;
      masterGain.gain.value = this.masterVolume();

      sourceA.connect(gainA).connect(masterGain);
      sourceB.connect(gainB).connect(masterGain);
      masterGain.connect(ctx.destination);

      this.audioCtx = ctx;
      this.sourceA = sourceA;
      this.sourceB = sourceB;
      this.gainNodeA = gainA;
      this.gainNodeB = gainB;
      this.masterGainNode = masterGain;
      return true;
    } catch (err) {
      console.warn('Web Audio graph init failed; falling back', err);
      this.webAudioUnavailable = true;
      return false;
    }
  }

  private applyMasterGain(target: number): void {
    if (!this.audioCtx || !this.masterGainNode) return;

    const node = this.masterGainNode;
    const now = this.audioCtx.currentTime;
    const rampMs = this.masterFadeRampMs();
    const clampedTarget = Math.max(0, Math.min(target, 1));

    try {
      const current = node.gain.value;
      node.gain.cancelScheduledValues(now);
      node.gain.setValueAtTime(current, now);
      if (rampMs > 0) {
        node.gain.linearRampToValueAtTime(
          clampedTarget,
          now + rampMs / 1000,
        );
      } else {
        node.gain.setValueAtTime(clampedTarget, now);
      }
    } catch {
      // ignore — fall back to snap on next applyAllVolumes
    }
  }

  private async ensureAudioContextRunning(): Promise<void> {
    if (!this.audioCtx) return;
    if (this.audioCtx.state !== 'suspended') return;
    try {
      await this.audioCtx.resume();
    } catch {}
  }

  private getAudio(slot: AudioSlot): HTMLAudioElement | null {
    return slot === 'A'
      ? (this.audioARef?.nativeElement ?? null)
      : (this.audioBRef?.nativeElement ?? null);
  }

  private getStream(slot: AudioSlot): BoardPlayerAudioSourceManager {
    return slot === 'A' ? this.streamA : this.streamB;
  }

  private otherSlot(slot: AudioSlot): AudioSlot {
    return slot === 'A' ? 'B' : 'A';
  }

  private getNearEndKey(): string {
    return `${this.trackId() ?? 'none'}|${this.currentStreamUrl ?? this.streamUrl() ?? 'none'}`;
  }

  private clampToPlayable(posS: number): number {
    const ctx = this.getRuntimeContext();
    const maxS = Math.min(Math.max(ctx.startS, this.seekableMaxS()), ctx.endS);
    return Math.max(ctx.startS, Math.min(posS, maxS));
  }

  private clampToWindow(posS: number): number {
    const ctx = this.getRuntimeContext();
    return Math.max(ctx.startS, Math.min(posS, ctx.endS));
  }

  /** Loop crossfade derived from the looping window's fades (default fallback). */
  private loopCrossfadeMs(): number {
    return deriveCrossfadeMs(
      this.windowFadeOutMs(),
      this.windowFadeInMs(),
      BoardPlayerComponent.DEFAULT_LOOP_CROSSFADE_MS,
    );
  }

  /** Track/window switch crossfade derived from the window fades (default fallback). */
  private switchCrossfadeMs(): number {
    return deriveCrossfadeMs(
      this.windowFadeOutMs(),
      this.windowFadeInMs(),
      BoardPlayerComponent.DEFAULT_SWITCH_CROSSFADE_MS,
    );
  }

  private buildCurrentInputContext(): SlotPlaybackContext {
    const startS = this.hasSelectedWindow() ? (this.windowStartS() ?? 0) : 0;
    const endS = this.hasSelectedWindow()
      ? (this.windowEndS() ?? this.durationS() ?? 0)
      : (this.durationS() ?? 0);

    return {
      startS,
      endS,
      durationS: Math.max(0, endS - startS),
      hasSelectedWindow: this.hasSelectedWindow(),
      fadeInMs: this.windowFadeInMs(),
      fadeOutMs: this.windowFadeOutMs(),
    };
  }

  private getSlotContext(slot: AudioSlot): SlotPlaybackContext {
    return slot === 'A' ? this.slotContextA : this.slotContextB;
  }

  private setSlotContext(slot: AudioSlot, ctx: SlotPlaybackContext): void {
    if (slot === 'A') this.slotContextA = this.cloneContext(ctx);
    else this.slotContextB = this.cloneContext(ctx);
  }

  private getActiveContext(): SlotPlaybackContext {
    return this.getSlotContext(this.activeSlot);
  }

  private getRuntimeContext(): SlotPlaybackContext {
    if (this.pendingStreamUrl || this.uiPinnedToWindowStart) {
      return this.pendingTargetContext ?? this.buildCurrentInputContext();
    }

    const active = this.getActiveContext();
    if (
      active.durationS > 0 ||
      active.hasSelectedWindow ||
      this.currentStreamUrl
    ) {
      return active;
    }

    return this.buildCurrentInputContext();
  }

  private emptyContext(): SlotPlaybackContext {
    return {
      startS: 0,
      endS: 0,
      durationS: 0,
      hasSelectedWindow: false,
      fadeInMs: 0,
      fadeOutMs: 0,
    };
  }

  private cloneContext(ctx: SlotPlaybackContext): SlotPlaybackContext {
    return { ...ctx };
  }

  private emptyFadePolicy(): SlotFadePolicy {
    return {
      suppressFadeIn: false,
      suppressFadeOut: false,
    };
  }

  private cloneFadePolicy(policy: SlotFadePolicy): SlotFadePolicy {
    return { ...policy };
  }

  private getFadePolicy(slot: AudioSlot): SlotFadePolicy {
    return slot === 'A' ? this.fadePolicyA : this.fadePolicyB;
  }

  private setFadePolicy(slot: AudioSlot, policy: SlotFadePolicy): void {
    if (slot === 'A') this.fadePolicyA = policy;
    else this.fadePolicyB = policy;
  }

  private patchFadePolicy(
    slot: AudioSlot,
    patch: Partial<SlotFadePolicy>,
  ): void {
    this.setFadePolicy(slot, {
      ...this.getFadePolicy(slot),
      ...patch,
    });
  }

  private resetFadePolicy(slot: AudioSlot): void {
    this.setFadePolicy(slot, this.emptyFadePolicy());
  }
}