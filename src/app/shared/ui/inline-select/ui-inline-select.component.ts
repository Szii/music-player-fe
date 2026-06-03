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
  template: `
    <div class="ui-inline-select" [class.ui-inline-select--open]="open()">
      <button
        type="button"
        class="ui-inline-select__trigger"
        aria-haspopup="listbox"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="ariaLabel() || null"
        (mousedown)="$event.preventDefault()"
        (keydown)="onTriggerKeydown($event)"
        (click)="$event.stopPropagation(); toggle()"
      >
        <span class="ui-inline-select__value">{{ selectedLabel() }}</span>
        <span class="ui-inline-select__arrow" aria-hidden="true">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path
              d="M1 1L5 5L9 1"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
      </button>

      @if (open()) {
        <div
          class="app-popover-surface ui-inline-select__panel"
          role="listbox"
          [attr.aria-label]="ariaLabel() || null"
        >
          @for (opt of options(); track opt.value) {
            <button
              type="button"
              role="option"
              class="app-popover-item ui-inline-select__option"
              [class.app-popover-item--selected]="value() === opt.value"
              [attr.aria-selected]="value() === opt.value"
              (mousedown)="$event.preventDefault()"
              (click)="$event.stopPropagation(); select(opt.value)"
            >
              <span class="ui-inline-select__option-label">{{ opt.label }}</span>
              @if (value() === opt.value) {
                <span class="ui-inline-select__option-check" aria-hidden="true">✓</span>
              }
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .ui-inline-select {
      position: relative;
      width: 100%;
    }

    .ui-inline-select__trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      min-height: 36px;
      padding: 0 10px 0 12px;
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-sm);
      background: #faf4e4;
      color: var(--app-text);
      font-family: var(--app-font-body);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
    }

    .ui-inline-select__trigger:hover {
      border-color: var(--app-border-color);
      background: #f5edd8;
    }

    .ui-inline-select__trigger:focus-visible,
    .ui-inline-select--open .ui-inline-select__trigger {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .ui-inline-select__value {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ui-inline-select__arrow {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      color: var(--app-primary);
      transition: transform 0.18s ease;
    }

    .ui-inline-select--open .ui-inline-select__arrow {
      transform: rotate(180deg);
    }

    .ui-inline-select__panel {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 5;
      width: 100%;
      min-width: 160px;
    }

    .ui-inline-select__option {
      justify-content: space-between;
      border-bottom: 1px solid rgba(158, 98, 53, 0.12);
    }

    .ui-inline-select__option:last-child {
      border-bottom: none;
    }

    .ui-inline-select__option-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ui-inline-select__option-check {
      flex-shrink: 0;
      color: var(--app-primary);
      font-weight: 800;
      line-height: 1;
    }
  `],
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

  select(value: string): void {
    this.open.set(false);
    if (value !== this.value()) {
      this.valueChange.emit(value);
    }
  }

  onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.open()) {
      event.stopPropagation();
      this.open.set(false);
    }
  }
}
