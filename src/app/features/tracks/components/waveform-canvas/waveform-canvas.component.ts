// waveform-canvas.component.ts
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface RegionChangeEvent {
  fromS: number;
  toS: number;
}

type DragMode = 'left' | 'right' | 'region';

@Component({
  selector: 'app-waveform-canvas',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wf-wrap" #waveformWrap>
      <canvas
        #waveformCanvas
        class="wf-canvas"
        (mousedown)="onCanvasMouseDown($event)"
        (touchstart)="onCanvasTouchStart($event)"
      ></canvas>

      <div
        *ngIf="audioReady"
        class="wf-handle wf-handle--left"
        [style.left.px]="regionLeftPx"
        (mousedown)="onHandleMouseDown($event, 'left')"
        (touchstart)="onHandleTouchStart($event, 'left')"
      >
        <div class="wf-handle__grip"></div>
      </div>

      <div
        *ngIf="audioReady"
        class="wf-handle wf-handle--right"
        [style.left.px]="regionRightPx"
        (mousedown)="onHandleMouseDown($event, 'right')"
        (touchstart)="onHandleTouchStart($event, 'right')"
      >
        <div class="wf-handle__grip"></div>
      </div>

      <div class="wf-playhead" [style.left.px]="playheadPx" *ngIf="audioReady"></div>

      <div class="wf-overlay" *ngIf="loadingStream && !audioReady && !streamError">
        <div class="wf-overlay__stack">
          <span>Loading audio preview…</span>
          <small *ngIf="downloadProgress > 0">{{ downloadProgress }}%</small>
        </div>
      </div>

      <div
        class="wf-overlay"
        *ngIf="!waveformReady && !waveformLoading && !waveformError && !streamError && !loadingStream && audioReady"
      >
        <span>Waveform not available yet…</span>
      </div>

      <div class="wf-overlay" *ngIf="waveformLoading && !waveformReady && !waveformError">
        <span>Loading waveform…</span>
      </div>

      <div class="wf-overlay wf-overlay--error" *ngIf="streamError || waveformError">
        <span>{{ streamError || waveformError }}</span>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .wf-wrap {
      position: relative;
      height: 180px;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 14px;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
      flex-shrink: 0;
      overflow: hidden;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35);
    }

    .wf-canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .wf-handle {
      position: absolute;
      top: 0;
      width: 20px;
      height: 100%;
      cursor: col-resize;
      z-index: 5;
      transform: translateX(-50%);
      background: transparent;
      transition: background 0.12s ease;
    }

    .wf-handle:hover,
    .wf-handle:active {
      background: rgba(122, 92, 46, 0.08);
    }

    .wf-handle__grip {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 6px;
      height: 44px;
      background: var(--app-primary);
      border-radius: 999px;
      box-shadow:
        0 1px 4px rgba(0, 0, 0, 0.18),
        0 0 0 2px rgba(255, 255, 255, 0.9);
    }

    .wf-playhead {
      position: absolute;
      top: 0;
      width: 2px;
      height: 100%;
      background: var(--app-danger);
      z-index: 4;
      pointer-events: none;
      box-shadow: 0 0 6px rgba(159, 47, 47, 0.35);
    }

    .wf-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.76);
      color: var(--app-text-muted);
      font-size: 13px;
      z-index: 10;
      text-align: center;
      backdrop-filter: blur(2px);
      padding: 16px;
    }

    .wf-overlay__stack {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .wf-overlay__stack small {
      font-size: 11px;
      color: var(--app-text-muted);
    }

    .wf-overlay--error {
      color: var(--app-danger);
      background: rgba(255, 246, 246, 0.84);
    }

    @media (max-width: 700px) {
      .wf-wrap {
        height: 160px;
        border-radius: 12px;
      }

      .wf-handle__grip {
        height: 38px;
      }
    }
  `],
})
export class WaveformCanvasComponent implements OnChanges, AfterViewInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);

  private static readonly MIN_REGION_S = 0.1;

  @Input() durationS = 0;
  @Input() regionFromS = 0;
  @Input() regionToS = 0;
  @Input() seekableMaxS = 0;
  @Input() playheadPx = 0;
  @Input() waveformPeaks: number[] = [];
  @Input() fadeIn = false;
  @Input() fadeOut = false;
  @Input() audioReady = false;
  @Input() loadingStream = false;
  @Input() downloadProgress = 0;
  @Input() streamError: string | null = null;
  @Input() waveformLoading = false;
  @Input() waveformReady = false;
  @Input() waveformError: string | null = null;
  @Input() handlesDisabled = false;

  @Output() regionChange = new EventEmitter<RegionChangeEvent>();
  @Output() seekRequested = new EventEmitter<number>();

  @ViewChild('waveformCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('waveformWrap') wrapRef!: ElementRef<HTMLDivElement>;

  regionLeftPx = 0;
  regionRightPx = 0;
  canvasWidth = 0;
  canvasHeight = 0;

  private dragging: DragMode | null = null;
  private dragStartX = 0;
  private dragStartFromS = 0;
  private dragStartToS = 0;
  private resizeObserver: ResizeObserver | null = null;
  private redrawFrameId: number | null = null;
  private viewReady = false;

  private readonly COLOR_REGION_BG = 'rgba(122,92,46,0.07)';
  private readonly COLOR_OUTSIDE = 'rgba(0,0,0,0.04)';
  private readonly COLOR_BORDER = 'rgba(122,92,46,0.45)';
  private readonly COLOR_LOADED = 'rgba(91,155,213,0.08)';
  private readonly COLOR_BAR_IN_REGION = '#7a5c2e';
  private readonly COLOR_BAR_LOADED = '#94a3b8';
  private readonly COLOR_BAR_UNLOADED = '#d1d5db';
  private readonly COLOR_MIDLINE = 'rgba(0,0,0,0.06)';
  private readonly COLOR_FADE = 'rgba(122,92,46,0.12)';

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.scheduleRedraw();
    this.setupResizeObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) {
      return;
    }

    const needsRedraw =
      'durationS' in changes ||
      'regionFromS' in changes ||
      'regionToS' in changes ||
      'seekableMaxS' in changes ||
      'waveformPeaks' in changes ||
      'fadeIn' in changes ||
      'fadeOut' in changes;

    if (needsRedraw) {
      this.scheduleRedraw();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();

    if (this.redrawFrameId !== null) {
      cancelAnimationFrame(this.redrawFrameId);
      this.redrawFrameId = null;
    }
  }

  onHandleMouseDown(event: MouseEvent, side: 'left' | 'right'): void {
    if (this.handlesDisabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.beginMouseDrag(side, event.clientX);
  }

  onHandleTouchStart(event: TouchEvent, side: 'left' | 'right'): void {
    if (this.handlesDisabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.beginTouchDrag(side, event.touches[0].clientX);
  }

  onCanvasMouseDown(event: MouseEvent): void {
    if (this.durationS <= 0 || this.canvasWidth <= 0) {
      return;
    }

    const clickS = this.clamp(
      (event.offsetX / this.canvasWidth) * this.durationS,
      0,
      this.durationS,
    );

    if (!this.handlesDisabled && clickS >= this.regionFromS && clickS <= this.regionToS) {
      this.beginMouseDrag('region', event.clientX);
      return;
    }

    this.seekRequested.emit(clickS);
  }

  onCanvasTouchStart(event: TouchEvent): void {
    if (this.durationS <= 0 || this.canvasWidth <= 0) {
      return;
    }

    const rect = this.wrapRef?.nativeElement?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const clickS = this.clamp(
      ((event.touches[0].clientX - rect.left) / this.canvasWidth) * this.durationS,
      0,
      this.durationS,
    );

    if (!this.handlesDisabled && clickS >= this.regionFromS && clickS <= this.regionToS) {
      this.beginTouchDrag('region', event.touches[0].clientX);
      return;
    }

    this.seekRequested.emit(clickS);
  }

  drawWaveform(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const width = this.canvasWidth;
    const height = this.canvasHeight;
    if (width === 0 || height === 0 || this.durationS <= 0) {
      return;
    }

    const fromPx = (this.regionFromS / this.durationS) * width;
    const toPx = (this.regionToS / this.durationS) * width;
    const loadedPx = (Math.min(this.seekableMaxS, this.durationS) / this.durationS) * width;
    const midY = height / 2;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = this.COLOR_LOADED;
    ctx.fillRect(0, 0, loadedPx, height);

    ctx.fillStyle = this.COLOR_REGION_BG;
    ctx.fillRect(fromPx, 0, Math.max(0, toPx - fromPx), height);

    ctx.fillStyle = this.COLOR_OUTSIDE;
    ctx.fillRect(0, 0, fromPx, height);
    ctx.fillRect(toPx, 0, Math.max(0, width - toPx), height);

    ctx.fillStyle = this.COLOR_BORDER;
    ctx.fillRect(fromPx, 0, 1.5, height);
    ctx.fillRect(toPx - 1.5, 0, 1.5, height);

    this.drawFadeZones(ctx, fromPx, toPx, height);

    if (this.waveformPeaks.length > 0) {
      this.drawPeaks(ctx, width, height, fromPx, toPx, loadedPx, midY);
    } else {
      this.drawMidline(ctx, width, midY, '#cbd5e1');
    }

    this.drawMidline(ctx, width, midY, this.COLOR_MIDLINE);
  }

  sizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    const wrap = this.wrapRef?.nativeElement;
    if (!canvas || !wrap) {
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
  }

  updateRegionPixels(): void {
    if (this.durationS <= 0 || this.canvasWidth <= 0) {
      return;
    }

    this.regionLeftPx = (this.regionFromS / this.durationS) * this.canvasWidth;
    this.regionRightPx = (this.regionToS / this.durationS) * this.canvasWidth;
  }

  private beginMouseDrag(mode: DragMode, clientX: number): void {
    this.startDrag(mode, clientX);

    const onMove = (event: MouseEvent) => this.onDragMove(event.clientX);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.dragging = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  private beginTouchDrag(mode: DragMode, clientX: number): void {
    this.startDrag(mode, clientX);

    const onMove = (event: TouchEvent) => {
      event.preventDefault();
      this.onDragMove(event.touches[0].clientX);
    };

    const onUp = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      this.dragging = null;
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  private startDrag(mode: DragMode, clientX: number): void {
    this.dragging = mode;
    this.dragStartX = clientX;
    this.dragStartFromS = this.regionFromS;
    this.dragStartToS = this.regionToS;
  }

  private onDragMove(clientX: number): void {
    if (!this.dragging || this.durationS <= 0 || this.canvasWidth <= 0) {
      return;
    }

    const deltaS = ((clientX - this.dragStartX) / this.canvasWidth) * this.durationS;

    let fromS = this.dragStartFromS;
    let toS = this.dragStartToS;

    if (this.dragging === 'left') {
      fromS = this.roundToTenth(
        this.clamp(
          this.dragStartFromS + deltaS,
          0,
          this.dragStartToS - WaveformCanvasComponent.MIN_REGION_S,
        ),
      );
    } else if (this.dragging === 'right') {
      toS = this.roundToTenth(
        this.clamp(
          this.dragStartToS + deltaS,
          this.dragStartFromS + WaveformCanvasComponent.MIN_REGION_S,
          this.durationS,
        ),
      );
    } else {
      const length = this.dragStartToS - this.dragStartFromS;
      const newFrom = this.clamp(
        this.dragStartFromS + deltaS,
        0,
        this.durationS - length,
      );

      fromS = this.roundToTenth(newFrom);
      toS = this.roundToTenth(newFrom + length);
    }

    this.zone.run(() => {
      this.regionChange.emit({ fromS, toS });
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver?.disconnect();

    const wrap = this.wrapRef?.nativeElement;
    if (!wrap) {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.zone.run(() => {
        this.scheduleRedraw();
      });
    });

    this.resizeObserver.observe(wrap);
  }

  private scheduleRedraw(): void {
    if (this.redrawFrameId !== null) {
      cancelAnimationFrame(this.redrawFrameId);
    }

    this.redrawFrameId = requestAnimationFrame(() => {
      this.redrawFrameId = null;
      this.sizeCanvas();
      this.updateRegionPixels();
      this.drawWaveform();
      this.cdr.markForCheck();
    });
  }

  private drawFadeZones(
    ctx: CanvasRenderingContext2D,
    fromPx: number,
    toPx: number,
    height: number,
  ): void {
    const fadeWidth = Math.min(40, (toPx - fromPx) * 0.25);

    if (this.fadeIn) {
      ctx.fillStyle = this.COLOR_FADE;
      ctx.beginPath();
      ctx.moveTo(fromPx, height);
      ctx.lineTo(fromPx + fadeWidth, 0);
      ctx.lineTo(fromPx, 0);
      ctx.closePath();
      ctx.fill();
    }

    if (this.fadeOut) {
      ctx.fillStyle = this.COLOR_FADE;
      ctx.beginPath();
      ctx.moveTo(toPx, height);
      ctx.lineTo(toPx - fadeWidth, 0);
      ctx.lineTo(toPx, 0);
      ctx.closePath();
      ctx.fill();
    }
  }

  private drawPeaks(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fromPx: number,
    toPx: number,
    loadedPx: number,
    midY: number,
  ): void {
    const barCount = this.waveformPeaks.length;
    const barWidth = width / barCount;
    const maxBarHeight = height * 0.42;

    for (let index = 0; index < barCount; index++) {
      const x = index * barWidth;
      const peak = Number(this.waveformPeaks[index] ?? 0);
      const barHeight = peak <= 0 ? 0 : Math.max(0.75, peak * maxBarHeight);
      const inRegion = x >= fromPx && x + barWidth <= toPx;
      const loaded = x <= loadedPx;

      ctx.fillStyle = !loaded
        ? this.COLOR_BAR_UNLOADED
        : inRegion
          ? this.COLOR_BAR_IN_REGION
          : this.COLOR_BAR_LOADED;

      if (barHeight > 0) {
        ctx.fillRect(x + 0.5, midY - barHeight, Math.max(1, barWidth - 1), barHeight * 2);
      }
    }
  }

  private drawMidline(
    ctx: CanvasRenderingContext2D,
    width: number,
    midY: number,
    color: string,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(value, max));
  }

  private roundToTenth(value: number): number {
    return Math.round(value * 10) / 10;
  }
}