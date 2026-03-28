import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AudioStreamManager } from '../../../../shared/features/audio-stream-manager/audio-stream-manager';
import { PlayerControlsComponent } from '../player-controls/player-controls.component';

type PlayerStatus = 'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR';

@Component({
  selector: 'app-board-player',
  standalone: true,
  imports: [CommonModule, PlayerControlsComponent],
  template: `
    <app-player-controls
      [title]="title"
      [hasTrack]="hasTrack"
      [status]="localStatus"
      [positionS]="displayPositionS"
      [durationS]="fullDurationS"
      [seekableMaxS]="seekableMaxS"
      [windowStartS]="hasSelectedWindow ? windowStartS : null"
      [windowEndS]="hasSelectedWindow ? windowEndS : null"
      [disabled]="localStatus === 'BUFFERING'"
      (play)="onPlay()"
      (stop)="onStop()"
      (seekPreview)="onSeekPreview($event)"
      (seekCommit)="onSeekCommit($event)"
    />

    <audio #audio hidden preload="none"
      (ended)="onAudioEnded()"
      (error)="onAudioElementError()">
    </audio>
  `,
})
export class BoardPlayerComponent implements OnChanges, OnDestroy {
  @Input() title = '';
  @Input() hasTrack = false;
  @Input() trackId: number | null = null;
  @Input() status: PlayerStatus = 'STOPPED';
  @Input() streamUrl: string | null = null;
  @Input() durationS: number | null = null;
  @Input() windowStartS: number | null = null;
  @Input() windowEndS: number | null = null;
  @Input() hasSelectedWindow = false;
  @Input() repeat = false;

  @Output() playRequested = new EventEmitter<void>();
  @Output() stopRequested = new EventEmitter<void>();
  @Output() ended = new EventEmitter<void>();
  @Output() audioError = new EventEmitter<void>();

  @ViewChild('audio') audioRef?: ElementRef<HTMLAudioElement>;

  localStatus: PlayerStatus = 'STOPPED';
  displayPositionS = 0;
  seekableMaxS = 0;

  get effectiveStartS(): number {
    return this.hasSelectedWindow ? (this.windowStartS ?? 0) : 0;
  }

  get effectiveEndS(): number {
    return this.hasSelectedWindow
      ? (this.windowEndS ?? this.durationS ?? 0)
      : (this.durationS ?? 0);
  }

  get effectiveDurationS(): number {
    return Math.max(0, this.effectiveEndS - this.effectiveStartS);
  }

  get fullDurationS(): number {
    return this.durationS ?? 0;
  }

  private stream = new AudioStreamManager();
  private suppressNextError = false;
  private positionTimer: ReturnType<typeof setInterval> | null = null;
  private activeStreamUrl: string | null = null;
  private connectToken = 0;

  constructor(private zone: NgZone) {
    this.stream.onProgress = (_bytes, complete, _seekableS) => {
      this.zone.run(() => {
        if (complete) {
          this.seekableMaxS = this.effectiveEndS;
        }
      });
    };

    this.stream.onError = () => {
      this.zone.run(() => {
        this.localStatus = 'STOPPED';
        this.audioError.emit();
      });
    };
  }

  ngOnChanges(changes: SimpleChanges): void {
    const trackChanged =
      'trackId' in changes &&
      !changes['trackId'].firstChange &&
      changes['trackId'].previousValue !== changes['trackId'].currentValue;

    if (trackChanged) {
      this.tearDown();
    }

    if (
      'windowStartS' in changes ||
      'windowEndS' in changes ||
      'durationS' in changes ||
      'hasSelectedWindow' in changes
    ) {
      this.displayPositionS = this.clampToPlayable(this.displayPositionS);
      this.seekableMaxS = this.clampToPlayable(this.seekableMaxS);
    }

    if (
      'status' in changes ||
      'streamUrl' in changes ||
      'windowStartS' in changes ||
      'windowEndS' in changes ||
      'durationS' in changes ||
      'hasSelectedWindow' in changes ||
      'trackId' in changes
    ) {
      this.syncWithBackend();
    }
  }

  ngOnDestroy(): void {
    this.tearDown();
  }

  onPlay(): void {
    this.playRequested.emit();
  }

  onStop(): void {
    this.stopRequested.emit();
  }

  onSeekPreview(rawValue: number): void {
    const requested = Math.floor(rawValue);
    const playableMin = this.effectiveStartS;
    const playableMax = Math.min(
      Math.max(this.effectiveStartS, this.seekableMaxS),
      this.effectiveEndS
    );

    if (requested < playableMin || requested > playableMax) {
      this.displayPositionS = this.getActualPlaybackPositionS();
      return;
    }

    this.displayPositionS = Math.max(playableMin, Math.min(requested, playableMax));
  }

  onSeekCommit(rawValue: number): void {
    const requested = Math.floor(rawValue);
    const playableMin = this.effectiveStartS;
    const playableMax = Math.min(
      Math.max(this.effectiveStartS, this.seekableMaxS),
      this.effectiveEndS
    );

    if (requested < playableMin || requested > playableMax) {
      this.displayPositionS = this.getActualPlaybackPositionS();
      return;
    }

    const clamped = Math.max(playableMin, Math.min(requested, playableMax));
    this.displayPositionS = clamped;
    this.seekLocalStreaming(clamped);
  }

  onAudioEnded(): void {
    if (this.repeat) {
      const audio = this.audioRef?.nativeElement;
      if (audio) {
        audio.currentTime = 0;
        audio.play().catch(err => console.warn('repeat play failed', err));
        this.displayPositionS = this.effectiveStartS;
        this.localStatus = 'PLAYING';
        return;
      }
    }

    this.localStatus = 'STOPPED';
    this.ended.emit();
  }

  onAudioElementError(): void {
    if (this.suppressNextError) {
      this.suppressNextError = false;
      return;
    }
    console.warn('board-player audio element error');
    this.audioError.emit();
  }

  private syncWithBackend(): void {
    if (!this.hasTrack || !this.streamUrl || this.trackId == null) {
      this.tearDown();
      return;
    }

    if (this.status === 'PLAYING' && this.streamUrl) {
      const shouldReconnect =
        this.streamUrl !== this.activeStreamUrl ||
        this.localStatus === 'STOPPED';

      if (shouldReconnect) {
        this.tearDown();
        this.localStatus = 'BUFFERING';
        this.connectStream(this.streamUrl);
      }
      return;
    }

    if (this.status === 'PAUSED') {
      this.audioRef?.nativeElement?.pause();
      this.localStatus = 'PAUSED';
      return;
    }

    if (this.status === 'STOPPED') {
      this.tearDown();
    }
  }

  private connectStream(url: string): void {
    const token = ++this.connectToken;
    this.activeStreamUrl = url;

    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    this.seekableMaxS = this.effectiveStartS;
    this.displayPositionS = this.effectiveStartS;

    const useMse = 'MediaSource' in window;

    this.stream.load(url, {
      audioElement: useMse ? audio : undefined,
      useMse,
      estimatedDurationS: this.effectiveDurationS,
      windowStartS: this.effectiveStartS,
    }).catch(err => {
      if (token !== this.connectToken) return;
      console.warn('stream load failed', err);
      this.localStatus = 'STOPPED';
      this.audioError.emit();
    });

    if (!useMse) {
      audio.src = url;
      audio.load();
    }

    audio.play().catch(err => console.warn('play failed', err));
    this.localStatus = 'PLAYING';
    this.startPositionTimer();
  }

  private seekLocalStreaming(targetS: number): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    const clamped = this.clampToPlayable(targetS);
    const audioTime = clamped - this.effectiveStartS;

    if (this.stream.usingBlob) {
      if (this.stream.isBlobSeekable(audioTime)) {
        audio.currentTime = audioTime;
      } else {
        this.stream.switchToBlobSrc(audioTime, this.localStatus === 'PLAYING');
      }
      this.displayPositionS = clamped;
      return;
    }

    if (this.stream.isInMseBuffer(audioTime)) {
      audio.currentTime = audioTime;
      this.displayPositionS = clamped;
      return;
    }

    const wasPlaying = this.localStatus === 'PLAYING';
    this.suppressNextError = true;
    this.stream.switchToBlobSrc(audioTime, wasPlaying);
    this.displayPositionS = clamped;
    this.localStatus = wasPlaying ? 'PLAYING' : 'PAUSED';
  }

  private startPositionTimer(): void {
    this.stopPositionTimer();
    this.positionTimer = setInterval(() => {
      this.zone.run(() => this.tickDisplay());
    }, 250);
  }

  private stopPositionTimer(): void {
    if (this.positionTimer !== null) {
      clearInterval(this.positionTimer);
      this.positionTimer = null;
    }
  }

  private tickDisplay(): void {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return;

    const rawDisplay = Math.floor(this.effectiveStartS + audio.currentTime);
    this.displayPositionS = Math.max(
      this.effectiveStartS,
      Math.min(rawDisplay, this.effectiveEndS)
    );

    if (!this.stream.streamComplete) {
      this.seekableMaxS = Math.max(
        this.effectiveStartS,
        Math.min(this.getStreamingBufferedEndS(audio), this.effectiveEndS)
      );
    } else {
      this.seekableMaxS = this.effectiveEndS;
    }

    if (
      this.hasSelectedWindow &&
      this.effectiveDurationS > 0 &&
      audio.currentTime >= this.effectiveDurationS
    ) {
      if (this.repeat) {
        audio.currentTime = 0;
        this.displayPositionS = this.effectiveStartS;
        this.localStatus = 'PLAYING';
      } else {
        audio.pause();
        this.displayPositionS = this.effectiveEndS;
        this.localStatus = 'STOPPED';
        this.ended.emit();
      }
    }
  }

  private tearDown(): void {
    this.connectToken++;
    this.stopPositionTimer();
    this.activeStreamUrl = null;

    const audio = this.audioRef?.nativeElement;
    if (audio) {
      audio.pause();
      this.suppressNextError = true;
      audio.removeAttribute('src');
      audio.load();
    }

    this.stream.destroy();
    this.localStatus = 'STOPPED';
    this.displayPositionS = this.effectiveStartS;
    this.seekableMaxS = this.effectiveStartS;
  }

  private clampToPlayable(posS: number): number {
    const minS = this.effectiveStartS;
    const maxSeekable = Math.max(this.effectiveStartS, this.seekableMaxS);
    const maxS = Math.min(maxSeekable, this.effectiveEndS);
    return Math.max(minS, Math.min(posS, maxS));
  }

  private getActualPlaybackPositionS(): number {
    const audio = this.audioRef?.nativeElement;
    if (!audio) return this.displayPositionS;
    return Math.max(
      this.effectiveStartS,
      Math.min(
        Math.floor(this.effectiveStartS + audio.currentTime),
        this.effectiveEndS
      )
    );
  }

  private getStreamingBufferedEndS(audio: HTMLAudioElement): number {
    if (audio.buffered.length > 0) {
      return Math.floor(this.effectiveStartS + audio.buffered.end(audio.buffered.length - 1));
    }
    return Math.floor(this.stream.estimatedDownloadedS);
  }
}