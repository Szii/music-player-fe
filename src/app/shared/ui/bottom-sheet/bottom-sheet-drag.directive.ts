import { Directive, ElementRef, inject, input, output } from '@angular/core';

/**
 * Native-style drag/tap-to-dismiss for a bottom sheet, applied to the sheet's
 * grab handle. Bind the sheet element to drag/measure as the directive value:
 *
 * ```html
 * <div #sheet class="my-sheet">
 *   <button class="my-sheet__handle"
 *           [appBottomSheetDrag]="sheet"
 *           (dismiss)="close()"></button>
 *   …
 * </div>
 * ```
 *
 * - Dragging the handle translates the sheet down with the finger.
 * - On release, the sheet is dismissed if it was dragged past
 *   {@link dismissThreshold} of its height or flicked down quickly; otherwise it
 *   springs back open.
 * - A tap on the handle (no real movement) also dismisses.
 */
@Directive({
  selector: '[appBottomSheetDrag]',
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '[style.touchAction]': '"none"',
  },
})
export class BottomSheetDragDirective {
  /** Sheet element translated while dragging and measured for the threshold. */
  readonly sheet = input.required<HTMLElement>({ alias: 'appBottomSheetDrag' });
  /** Fraction of the sheet height a downward drag must pass to dismiss. */
  readonly dismissThreshold = input(0.5);

  readonly dismiss = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private pointerId: number | null = null;
  private startY = 0;
  private lastY = 0;
  private lastT = 0;
  private velocity = 0;
  private delta = 0;
  private moved = false;

  private readonly onMove = (e: PointerEvent): void => this.handleMove(e);
  private readonly onUp = (e: PointerEvent): void => this.handleUp(e);

  onPointerDown(event: PointerEvent): void {
    if (this.pointerId !== null) return;
    this.pointerId = event.pointerId;
    this.startY = this.lastY = event.clientY;
    this.lastT = event.timeStamp;
    this.velocity = 0;
    this.delta = 0;
    this.moved = false;

    const sheet = this.sheet();
    sheet.style.transition = 'none';
    sheet.style.willChange = 'transform';

    document.addEventListener('pointermove', this.onMove);
    document.addEventListener('pointerup', this.onUp);
    document.addEventListener('pointercancel', this.onUp);
    event.preventDefault();
  }

  private handleMove(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;

    const dt = event.timeStamp - this.lastT;
    if (dt > 0) this.velocity = (event.clientY - this.lastY) / dt;
    this.lastY = event.clientY;
    this.lastT = event.timeStamp;

    // Downward only — an upward drag just keeps the sheet in place.
    this.delta = Math.max(0, event.clientY - this.startY);
    if (this.delta > 4) this.moved = true;
    this.sheet().style.transform = `translateY(${this.delta}px)`;
  }

  private handleUp(event: PointerEvent): void {
    if (event.pointerId !== this.pointerId) return;
    this.pointerId = null;
    document.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointercancel', this.onUp);

    const sheet = this.sheet();
    sheet.style.willChange = '';

    const passedDistance =
      this.delta / (sheet.offsetHeight || 1) >= this.dismissThreshold();
    const flickedDown = this.velocity > 0.6; // px/ms

    // A tap (no real movement) closes too.
    if (!this.moved || passedDistance || flickedDown) {
      sheet.style.transition = 'transform 0.2s ease';
      sheet.style.transform = 'translateY(100%)';
      window.setTimeout(() => this.dismiss.emit(), 190);
      return;
    }

    // Spring back open.
    sheet.style.transition = 'transform 0.2s ease';
    sheet.style.transform = 'translateY(0)';
    window.setTimeout(() => {
      sheet.style.transition = '';
      sheet.style.transform = '';
    }, 200);
  }
}
