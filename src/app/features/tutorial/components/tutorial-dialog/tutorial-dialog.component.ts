import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';

import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { TutorialService } from '../../data-access/tutorial.service';

@Component({
  selector: 'app-tutorial-dialog',
  imports: [NormalButtonComponent, UiDialogShellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
    '(document:touchstart)': 'onTouchStart($event)',
    '(document:touchend)': 'onTouchEnd($event)',
  },
  templateUrl: './tutorial-dialog.component.html',
  styleUrl: './tutorial-dialog.component.scss',
})
export class TutorialDialogComponent {
  readonly tutorial = inject(TutorialService);

  private readonly slide = viewChild<ElementRef<HTMLElement>>('slide');
  private readonly image = viewChild<ElementRef<HTMLImageElement>>('image');

  private touchStartX = 0;
  private touchStartY = 0;

  onEscape(): void {
    if (this.tutorial.isOpen()) {
      this.tutorial.close();
    }
  }

  goNext(): void {
    if (this.tutorial.isLast()) return;
    this.tutorial.next();
    this.animate('next');
  }

  goPrev(): void {
    if (this.tutorial.isFirst()) return;
    this.tutorial.prev();
    this.animate('prev');
  }

  goTo(index: number): void {
    const current = this.tutorial.index();
    if (current === null || index === current) return;
    const direction = index > current ? 'next' : 'prev';
    this.tutorial.goTo(index);
    this.animate(direction);
  }

  onTouchStart(event: TouchEvent): void {
    if (!this.tutorial.isOpen()) return;
    const touch = event.changedTouches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  onTouchEnd(event: TouchEvent): void {
    if (!this.tutorial.isOpen()) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - this.touchStartX;
    const dy = touch.clientY - this.touchStartY;

    // Ignore taps and vertical scrolls; only act on a clear horizontal swipe.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) this.goNext();
    else this.goPrev();
  }

  /**
   * Slide the (stable) content element in from the side via the Web Animations
   * API — no DOM recreation, so the image never reloads. The element is kept
   * hidden until the new step's image has finished decoding, so the previous
   * image can't flash while the new one is still being decoded (the PNGs are
   * large enough that decode is visible).
   */
  private animate(direction: 'next' | 'prev'): void {
    if (this.prefersReducedMotion()) return;

    const el = this.slide()?.nativeElement;
    if (!el) return;

    // Hide synchronously so the in-place src swap happens while invisible.
    el.style.opacity = '0';

    // Defer one frame so the new step's bindings (image src, body) are in the
    // DOM, then wait for the image to decode before revealing.
    requestAnimationFrame(() => {
      const img = this.image()?.nativeElement;
      const reveal = () => this.playSlide(el, direction);

      if (img) {
        img.decode().then(reveal).catch(reveal);
      } else {
        // Q&A step has no image — nothing to wait for.
        reveal();
      }
    });
  }

  private playSlide(el: HTMLElement, direction: 'next' | 'prev'): void {
    const from = direction === 'next' ? '28px' : '-28px';
    const anim = el.animate(
      [
        { opacity: 0, transform: `translateX(${from})` },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 220, easing: 'ease' },
    );
    anim.onfinish = () => {
      el.style.opacity = '';
    };
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
