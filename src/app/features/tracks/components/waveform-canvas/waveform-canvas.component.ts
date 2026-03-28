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
        class="wf-handle wf-handle--left"
        [style.left.px]="regionLeftPx"
        (mousedown)="onHandleMouseDown($event, 'left')"
        (touchstart)="onHandleTouchStart($event, 'left')"
        *ngIf="audioReady"
      >
        <div class="wf-handle__grip"></div>
      </div>

      <div
        class="wf-handle wf-handle--right"
        [style.left.px]="regionRightPx"
        (mousedown)="onHandleMouseDown($event, 'right')"
        (touchstart)="onHandleTouchStart($event, 'right')"
        *ngIf="audioReady"
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
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

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

  private dragging: 'left' | 'right' | 'region' | null = null;
  private dragStartX = 0;
  private dragStartFromS = 0;
  private dragStartToS = 0;
  private resizeObserver: ResizeObserver | null = null;
  private viewReady = false;

  private readonly COLOR_PRIMARY = '#7a5c2e';
  private readonly COLOR_PRIMARY_SOFT = '#f1e6d2';
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
    this.sizeCanvas();
    this.updateRegionPixels();
    this.drawWaveform();
    this.setupResizeObserver();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) return;

    const needsRedraw =
      'durationS' in changes ||
      'regionFromS' in changes ||
      'regionToS' in changes ||
      'seekableMaxS' in changes ||
      'waveformPeaks' in changes ||
      'fadeIn' in changes ||
      'fadeOut' in changes;

    if (needsRedraw) {
      requestAnimationFrame(() => {
        this.sizeCanvas();
        this.updateRegionPixels();
        this.drawWaveform();
        this.cdr.markForCheck();
      });
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  sizeCanvas(): void {
    const canvas = this.canvasRef?.nativeElement;
    const wrap = this.wrapRef?.nativeElement;
    if (!canvas || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvasWidth = rect.width;
    this.canvasHeight = rect.height;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
  }

  drawWaveform(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = this.canvasWidth;
    const h = this.canvasHeight;
    if (w === 0 || h === 0 || this.durationS <= 0) return;

    const fromPx = (this.regionFromS / this.durationS) * w;
    const toPx = (this.regionToS / this.durationS) * w;
    const loadedPx = (Math.min(this.seekableMaxS, this.durationS) / this.durationS) * w;
    const midY = h / 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = this.COLOR_LOADED;
    ctx.fillRect(0, 0, loadedPx, h);

    ctx.fillStyle = this.COLOR_REGION_BG;
    ctx.fillRect(fromPx, 0, Math.max(0, toPx - fromPx), h);

    ctx.fillStyle = this.COLOR_OUTSIDE;
    ctx.fillRect(0, 0, fromPx, h);
    ctx.fillRect(toPx, 0, Math.max(0, w - toPx), h);

    ctx.fillStyle = this.COLOR_BORDER;
    ctx.fillRect(fromPx, 0, 1.5, h);
    ctx.fillRect(toPx - 1.5, 0, 1.5, h);

    if (this.fadeIn) {
      const fadeW = Math.min(40, (toPx - fromPx) * 0.25);
      ctx.fillStyle = this.COLOR_FADE;
      ctx.beginPath();
      ctx.moveTo(fromPx, h);
      ctx.lineTo(fromPx + fadeW, 0);
      ctx.lineTo(fromPx, 0);
      ctx.closePath();
      ctx.fill();
    }

    if (this.fadeOut) {
      const fadeW = Math.min(40, (toPx - fromPx) * 0.25);
      ctx.fillStyle = this.COLOR_FADE;
      ctx.beginPath();
      ctx.moveTo(toPx, h);
      ctx.lineTo(toPx - fadeW, 0);
      ctx.lineTo(toPx, 0);
      ctx.closePath();
      ctx.fill();
    }

    if (this.waveformPeaks.length > 0) {
      const barCount = this.waveformPeaks.length;
      const barWidth = w / barCount;
      const maxBarH = h * 0.42;

      for (let i = 0; i < barCount; i++) {
        const x = i * barWidth;
        const peak = Number(this.waveformPeaks[i] ?? 0);
        const barH = peak <= 0 ? 0 : Math.max(0.75, peak * maxBarH);
        const inRegion = x >= fromPx && x + barWidth <= toPx;
        const loaded = x <= loadedPx;

        ctx.fillStyle = !loaded
          ? this.COLOR_BAR_UNLOADED
          : inRegion
            ? this.COLOR_BAR_IN_REGION
            : this.COLOR_BAR_LOADED;

        if (barH > 0) {
          ctx.fillRect(x + 0.5, midY - barH, Math.max(1, barWidth - 1), barH * 2);
        }
      }
    } else {
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(w, midY);
      ctx.stroke();
    }

    ctx.strokeStyle = this.COLOR_MIDLINE;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(w, midY);
    ctx.stroke();
  }

  updateRegionPixels(): void {
    if (this.durationS <= 0 || this.canvasWidth <= 0) return;
    this.regionLeftPx = (this.regionFromS / this.durationS) * this.canvasWidth;
    this.regionRightPx = (this.regionToS / this.durationS) * this.canvasWidth;
  }

  onHandleMouseDown(e: MouseEvent, side: 'left' | 'right'): void {
    if (this.handlesDisabled) return;

    e.preventDefault();
    e.stopPropagation();
    this.startDrag(side, e.clientX);

    const onMove = (ev: MouseEvent) => this.onDragMove(ev.clientX);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.dragging = null;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onHandleTouchStart(e: TouchEvent, side: 'left' | 'right'): void {
    if (this.handlesDisabled) return;

    e.preventDefault();
    e.stopPropagation();
    this.startDrag(side, e.touches[0].clientX);

    const onMove = (ev: TouchEvent) => {
      ev.preventDefault();
      this.onDragMove(ev.touches[0].clientX);
    };

    const onUp = () => {
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onUp);
      this.dragging = null;
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onUp);
  }

  onCanvasMouseDown(e: MouseEvent): void {
    if (this.durationS <= 0 || this.canvasWidth <= 0) return;

    const x = e.offsetX;
    const clickS = (x / this.canvasWidth) * this.durationS;

    if (!this.handlesDisabled && clickS >= this.regionFromS && clickS <= this.regionToS) {
      this.startDrag('region', e.clientX);

      const onMove = (ev: MouseEvent) => this.onDragMove(ev.clientX);
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        this.dragging = null;
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      return;
    }

    this.seekRequested.emit(clickS);
  }

  onCanvasTouchStart(e: TouchEvent): void {
    if (this.durationS <= 0 || this.canvasWidth <= 0) return;

    const rect = this.wrapRef?.nativeElement?.getBoundingClientRect();
    if (!rect) return;

    const clickS = ((e.touches[0].clientX - rect.left) / this.canvasWidth) * this.durationS;

    if (!this.handlesDisabled && clickS >= this.regionFromS && clickS <= this.regionToS) {
      this.startDrag('region', e.touches[0].clientX);

      const onMove = (ev: TouchEvent) => {
        ev.preventDefault();
        this.onDragMove(ev.touches[0].clientX);
      };

      const onUp = () => {
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        this.dragging = null;
      };

      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onUp);
      return;
    }

    this.seekRequested.emit(clickS);
  }

  private startDrag(mode: 'left' | 'right' | 'region', clientX: number): void {
    this.dragging = mode;
    this.dragStartX = clientX;
    this.dragStartFromS = this.regionFromS;
    this.dragStartToS = this.regionToS;
  }

  private onDragMove(clientX: number): void {
    if (!this.dragging || this.durationS <= 0 || this.canvasWidth <= 0) return;

    const deltaS = ((clientX - this.dragStartX) / this.canvasWidth) * this.durationS;
    const minRegion = 0.1;

    let fromS = this.regionFromS;
    let toS = this.regionToS;

    if (this.dragging === 'left') {
      fromS = Math.round(
        Math.max(0, Math.min(this.dragStartFromS + deltaS, toS - minRegion)) * 10
      ) / 10;
    } else if (this.dragging === 'right') {
      toS = Math.round(
        Math.max(fromS + minRegion, Math.min(this.dragStartToS + deltaS, this.durationS)) * 10
      ) / 10;
    } else {
      const len = this.dragStartToS - this.dragStartFromS;
      const newFrom = Math.max(0, Math.min(this.dragStartFromS + deltaS, this.durationS - len));
      fromS = Math.round(newFrom * 10) / 10;
      toS = Math.round((newFrom + len) * 10) / 10;
    }

    this.zone.run(() => {
      this.regionChange.emit({ fromS, toS });
    });
  }

  private setupResizeObserver(): void {
    this.resizeObserver?.disconnect();

    const wrap = this.wrapRef?.nativeElement;
    if (!wrap) return;

    this.resizeObserver = new ResizeObserver(() => {
      this.zone.run(() => {
        this.sizeCanvas();
        this.updateRegionPixels();
        this.drawWaveform();
        this.cdr.markForCheck();
      });
    });

    this.resizeObserver.observe(wrap);
  }
}