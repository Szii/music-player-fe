import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

export interface UiInlineSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * Small themed dropdown for use inside popovers/overlays.
 *
 * Unlike `ui-select`, its panel is positioned `absolute` relative to the
 * trigger (not `position: fixed`), so it renders correctly when nested inside a
 * CDK overlay. It closes on outside clicks via a capture-phase document
 * listener, which fires even when an ancestor stops click propagation (as the
 * board settings popover does).
 */
@Component({
  selector: 'ui-inline-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ui-inline-select.component.html',
  styleUrl: './ui-inline-select.component.scss',
})
export class UiInlineSelectComponent {
  readonly options = input<UiInlineSelectOption[]>([]);
  readonly value = input<string | null>(null);
  readonly ariaLabel = input<string>('');

  readonly valueChange = output<string>();

  readonly open = signal(false);

  readonly selectedLabel = computed(
    () => this.options().find(o => o.value === this.value())?.label ?? '',
  );

  private readonly el = inject(ElementRef<HTMLElement>);

  constructor() {
    const onDocumentClick = (event: MouseEvent) => {
      if (!this.open()) return;
      if (!this.el.nativeElement.contains(event.target as Node)) {
        this.open.set(false);
      }
    };
    // Capture phase so the close still fires when a popover ancestor stops
    // click propagation in the bubble phase.
    document.addEventListener('click', onDocumentClick, true);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('click', onDocumentClick, true),
    );
  }

  toggle(): void {
    this.open.update(open => !open);
  }

  select(option: UiInlineSelectOption): void {
    if (option.disabled) return;
    this.open.set(false);
    if (option.value !== this.value()) {
      this.valueChange.emit(option.value);
    }
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.stopPropagation();
      this.open.set(false);
    }
  }
}
