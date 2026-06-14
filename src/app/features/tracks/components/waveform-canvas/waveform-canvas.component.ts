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
  effect,
  inject,
  input,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export interface RegionChangeEvent {
  fromS: number;
  toS: number;
}

interface WaveformPalette {
  surface: string;
  elevated: string;
  primary: string;
  primarySoft: string;
  border: string;
  textMuted: string;
  surfaceMuted: string;
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
      height: 126px;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 14px;
      cursor: crosshair;
      user-select: none;
      -webkit-user-select: none;
      touch-action: pan-y;
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
      width: 34px;
      height: 100%;
      cursor: col-resize;
      z-index: 5;
      transform: translateX(-50%);
      background: transparent;
      transition: background 0.12s ease;
      touch-action: pan-y;
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
        height: 112px;
        border-radius: 12px;
      }

      .wf-handle {
        width: 44px;
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
  @Input() audioReady = false;
  @Input() loadingStream = false;
  @Input() downloadProgress = 0;
  @Input() streamError: string | null = null;
  @Input() waveformLoading = false;
  @Input() waveformReady = false;
  @Input() waveformError: string | null = null;
  @Input() handlesDisabled = false;

  /** Fade-in / fade-out length of the selected region, in seconds. Drives the
      width of the shaded fade ramps drawn at the region edges. */
  readonly fadeInS = input(0);
  readonly fadeOutS = input(0);

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
  private dragStartY = 0;
  private dragStartFromS = 0;
  private dragStartToS = 0;
  private touchGesture: 'pending' | 'horizontal' | 'vertical' | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private redrawFrameId: number | null = null;
  private viewReady = false;

  private palette: WaveformPalette | null = null;

  constructor() {
    // Redraw when the fade-length inputs change (signal inputs don't surface in
    // ngOnChanges). Guarded so it only acts once the canvas view exists.
    effect(() => {
      this.fadeInS();
      this.fadeOutS();
      if (this.viewReady) {
        this.scheduleRedraw();
      }
    });
  }

  /**
   * Reads the app design tokens off the host element so the canvas matches the
   * parchment/crimson theme. Cached once the element is available (the theme is
   * static at runtime).
   */
  private resolvePalette(): WaveformPalette {
    if (this.palette) {
      return this.palette;
    }

    const el = this.wrapRef?.nativeElement;
    const read = (name: string, fallback: string): string => {
      if (!el) return fallback;
      const value = getComputedStyle(el).getPropertyValue(name).trim();
      return value || fallback;
    };

    const palette: WaveformPalette = {
      surface: read('--app-surface', '#f2e8d4'),
      elevated: read('--app-surface-elevated', '#f8f2e4'),
      primary: read('--app-primary', '#58180d'),
      primarySoft: read('--app-primary-soft', '#f0d5c4'),
      border: read('--app-border-color', '#7a4220'),
      textMuted: read('--app-text-muted', '#7a4c2a'),
      surfaceMuted: read('--app-surface-muted', '#ccba98'),
    };

    if (el) {
      this.palette = palette;
    }

    return palette;
  }

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
      'waveformPeaks' in changes;

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

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    this.beginTouchDrag(side, touch.clientX, touch.clientY);
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

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    if (!this.handlesDisabled && clickS >= this.regionFromS && clickS <= this.regionToS) {
      this.beginTouchDrag('region', touch.clientX, touch.clientY);
      return;
    }

    this.beginTouchSeek(clickS, touch.clientX, touch.clientY);
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

    const p = this.resolvePalette();
    const fromPx = (this.regionFromS / this.durationS) * width;
    const toPx = (this.regionToS / this.durationS) * width;
    const regionWidth = Math.max(0, toPx - fromPx);
    const loadedPx = (Math.min(this.seekableMaxS, this.durationS) / this.durationS) * width;
    const midY = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Base parchment, with the loaded portion a touch brighter.
    ctx.fillStyle = p.surface;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = p.elevated;
    ctx.fillRect(0, 0, loadedPx, height);

    // Selected window: bright, gently warm-tinted band.
    ctx.fillStyle = p.elevated;
    ctx.fillRect(fromPx, 0, regionWidth, height);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = p.primarySoft;
    ctx.fillRect(fromPx, 0, regionWidth, height);
    ctx.restore();

    // Dim everything outside the selection so the window stands out.
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = p.border;
    ctx.fillRect(0, 0, fromPx, height);
    ctx.fillRect(toPx, 0, Math.max(0, width - toPx), height);
    ctx.restore();

    if (this.waveformPeaks.length > 0) {
      this.drawPeaks(ctx, width, height, fromPx, toPx, loadedPx, midY, p);
    } else {
      this.drawMidline(ctx, width, midY, p.surfaceMuted);
    }

    // Drawn after the waveform so the fade ramps stay visible over the bars.
    this.drawFadeZones(ctx, fromPx, toPx, height, p);

    // Strong crimson region edges + a top accent bar for prominence.
    ctx.fillStyle = p.primary;
    ctx.fillRect(fromPx - 1.25, 0, 2.5, height);
    ctx.fillRect(toPx - 1.25, 0, 2.5, height);
    ctx.fillRect(fromPx, 0, regionWidth, 3);
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

  private beginTouchDrag(mode: DragMode, clientX: number, clientY: number): void {
    this.startDrag(mode, clientX, clientY);
    this.touchGesture = 'pending';

    let onMove!: (event: TouchEvent) => void;
    let onUp!: () => void;

    const cleanup = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('touchcancel', onUp);
      this.dragging = null;
      this.touchGesture = null;
    };

    onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        cleanup();
        return;
      }

      const deltaX = touch.clientX - this.dragStartX;
      const deltaY = touch.clientY - this.dragStartY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (this.touchGesture === 'pending') {
        if (absY > 8 && absY > absX * 1.15) {
          this.touchGesture = 'vertical';
          cleanup();
          return;
        }

        if (absX > 8 && absX > absY) {
          this.touchGesture = 'horizontal';
        } else {
          return;
        }
      }

      if (this.touchGesture === 'horizontal') {
        event.preventDefault();
        this.onDragMove(touch.clientX);
      }
    };

    onUp = () => {
      cleanup();
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
    document.addEventListener('touchcancel', onUp);
  }

  private beginTouchSeek(targetS: number, clientX: number, clientY: number): void {
    let cancelled = false;
    let onMove!: (event: TouchEvent) => void;
    let onUp!: () => void;
    let onCancel!: () => void;

    const cleanup = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      document.removeEventListener('touchcancel', onCancel);
    };

    onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        cancelled = true;
        cleanup();
        return;
      }

      const absX = Math.abs(touch.clientX - clientX);
      const absY = Math.abs(touch.clientY - clientY);
      if (absX > 8 || absY > 8) {
        cancelled = true;
        cleanup();
      }
    };

    onUp = () => {
      cleanup();
      if (!cancelled) {
        this.zone.run(() => {
          this.seekRequested.emit(targetS);
        });
      }
    };

    onCancel = () => {
      cancelled = true;
      cleanup();
    };

    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onUp);
    document.addEventListener('touchcancel', onCancel);
  }

  private startDrag(mode: DragMode, clientX: number, clientY = 0): void {
    this.dragging = mode;
    this.dragStartX = clientX;
    this.dragStartY = clientY;
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
    palette: WaveformPalette,
  ): void {
    const regionWidth = Math.max(0, toPx - fromPx);
    if (regionWidth <= 0 || this.durationS <= 0 || this.canvasWidth <= 0) {
      return;
    }

    // Only the end crossfade region is drawn — there is no ramp at the start.
    const pxPerSecond = this.canvasWidth / this.durationS;
    const fadeOutWidth = Math.min(this.fadeOutS() * pxPerSecond, regionWidth);

    if (fadeOutWidth > 0) {
      this.drawFadeOutZone(ctx, toPx, fadeOutWidth, height, palette);
    }
  }

  private drawFadeOutZone(
    ctx: CanvasRenderingContext2D,
    toPx: number,
    fadeWidth: number,
    height: number,
    palette: WaveformPalette,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toPx, height);
    ctx.lineTo(toPx - fadeWidth, 0);
    ctx.lineTo(toPx, 0);
    ctx.closePath();
    ctx.clip();

    const gradient = ctx.createLinearGradient(toPx - fadeWidth, 0, toPx, 0);
    gradient.addColorStop(0, palette.primarySoft);
    gradient.addColorStop(1, palette.primary);

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = gradient;
    ctx.fillRect(toPx - fadeWidth, 0, fadeWidth, height);

    this.drawDiagonalStripes(ctx, toPx - fadeWidth, toPx, height, palette.primary, 'falling');
    ctx.restore();

    // Bold envelope ramp: volume falling 1 -> 0 across the fade-out.
    this.drawFadeRamp(ctx, toPx - fadeWidth, 0, toPx, height, palette.primary);
  }

  /** Draw a bold straight line for a fade envelope edge. */
  private drawFadeRamp(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: string,
  ): void {
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  private drawDiagonalStripes(
    ctx: CanvasRenderingContext2D,
    fromPx: number,
    toPx: number,
    height: number,
    color: string,
    direction: 'rising' | 'falling',
  ): void {
    ctx.save();
    ctx.globalAlpha = 0.38;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    const spacing = 7;
    for (let x = fromPx - height; x <= toPx + height; x += spacing) {
      ctx.beginPath();
      if (direction === 'rising') {
        ctx.moveTo(x, height);
        ctx.lineTo(x + height, 0);
      } else {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + height, height);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawPeaks(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    fromPx: number,
    toPx: number,
    loadedPx: number,
    midY: number,
    palette: WaveformPalette,
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
        ? palette.surfaceMuted
        : inRegion
          ? palette.primary
          : palette.textMuted;

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