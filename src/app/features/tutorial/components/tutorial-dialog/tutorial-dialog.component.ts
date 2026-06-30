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
  },
  templateUrl: './tutorial-dialog.component.html',
  styleUrl: './tutorial-dialog.component.scss',
})
export class TutorialDialogComponent {
  readonly tutorial = inject(TutorialService);

  private readonly slide = viewChild<ElementRef<HTMLElement>>('slide');

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

  onTouchStart(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
  }

  onTouchEnd(event: TouchEvent): void {
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
   * API — no DOM recreation, so the image never reloads/flashes. The `src`
   * binding updates in place; images are preloaded by the service.
   */
  private animate(direction: 'next' | 'prev'): void {
    if (this.prefersReducedMotion()) return;

    // Defer one frame so the new step's bindings are flushed to the DOM first.
    requestAnimationFrame(() => {
      const el = this.slide()?.nativeElement;
      if (!el) return;

      const from = direction === 'next' ? '28px' : '-28px';
      el.animate(
        [
          { opacity: 0, transform: `translateX(${from})` },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 220, easing: 'ease' },
      );
    });
  }

  private prefersReducedMotion(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }
}
