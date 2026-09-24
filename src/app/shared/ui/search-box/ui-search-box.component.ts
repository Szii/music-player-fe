import { ChangeDetectionStrategy, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'ui-search-box',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-search-box.component.html',
  styleUrl: './ui-search-box.component.scss',
})
export class UiSearchBoxComponent {
  readonly value = input('');
  /** Empty falls back to the translated default. */
  readonly placeholder = input('');
  /** Accessible name, for when no visible label sits next to the box. */
  readonly ariaLabel = input('');

  readonly valueChange = output<string>();

  private readonly field = viewChild<ElementRef<HTMLInputElement>>('field');

  focus(): void {
    this.field()?.nativeElement.focus();
  }

  clear(): void {
    this.valueChange.emit('');
  }
}
