import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CommonModule } from '@angular/common';

export interface UiSelectOption {
  label: string;
  value: any;
}

interface PanelRect {
  top: number | null;
  bottom: number | null;
  left: number;
  width: number;
  maxHeight: number;
}

@Component({
  selector: 'ui-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiSelectComponent),
      multi: true,
    },
  ],
  template: `
    <div
      class="sel"
      [class.sel--open]="isOpen()"
      [class.sel--disabled]="isDisabled()"
    >
      <button
        #trigger
        type="button"
        class="sel__trigger"
        [disabled]="isDisabled()"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="listbox"
        (click)="toggle()"
      >
        <span
          class="sel__value"
          [class.sel__value--placeholder]="isNullValue()"
        >{{ selectedLabel() }}</span>

        <span class="sel__arrow" aria-hidden="true">
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

      <div
        *ngIf="isOpen()"
        class="sel__panel"
        [ngStyle]="panelStyle()"
      >
        <div *ngIf="enableSearch()" class="sel__search-wrap">
          <input
            #searchInput
            type="text"
            class="sel__search"
            placeholder="Search…"
            autocomplete="off"
            [value]="searchQuery()"
            (input)="searchQuery.set($any($event.target).value)"
            (click)="$event.stopPropagation()"
            (keydown)="onSearchKeydown($event)"
          />
        </div>

        <div class="sel__options" role="listbox">
          <button
            *ngFor="let opt of filteredOptions()"
            type="button"
            class="sel__option"
            [class.sel__option--selected]="currentValue() === opt.value"
            role="option"
            [attr.aria-selected]="currentValue() === opt.value"
            (click)="selectOption(opt)"
          >
            <span class="sel__option-label">{{ opt.label }}</span>
            <span
              *ngIf="currentValue() === opt.value"
              class="sel__option-check"
              aria-hidden="true"
            >✓</span>
          </button>

          <div *ngIf="filteredOptions().length === 0" class="sel__no-match">
            No matches
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .sel {
      position: relative;
    }

    .sel__trigger {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      min-height: 40px;
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

    .sel__trigger:hover:not(:disabled) {
      border-color: var(--app-border-color);
      background: #f5edd8;
    }

    .sel__trigger:focus-visible {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .sel--open .sel__trigger {
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .sel--disabled .sel__trigger {
      opacity: 0.55;
      cursor: not-allowed;
      background: var(--app-bg-muted);
    }

    .sel__value {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--app-text);
    }

    .sel__value--placeholder {
      color: var(--app-text-muted);
    }

    .sel__arrow {
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      color: var(--app-primary);
      transition: transform 0.18s ease;
    }

    .sel--open .sel__arrow {
      transform: rotate(180deg);
    }

    .sel__panel {
      z-index: 9999;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      background: #faf4e4;
      box-shadow:
        0 8px 28px rgba(15, 8, 3, 0.24),
        0 2px 8px rgba(15, 8, 3, 0.14);
      animation: sel-open 0.13s ease;
      overflow: hidden;
    }

    @keyframes sel-open {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .sel__search-wrap {
      flex-shrink: 0;
      padding: 8px 10px 6px;
      border-bottom: 1px solid rgba(158, 98, 53, 0.15);
      background:
        linear-gradient(90deg,
          transparent 0%,
          rgba(201, 164, 76, 0.55) 12%,
          #58180d 30%,
          rgba(201, 164, 76, 0.9) 50%,
          #58180d 70%,
          rgba(201, 164, 76, 0.55) 88%,
          transparent 100%
        ) top / 100% 3px no-repeat,
        #faf4e4;
      padding-top: 12px;
    }

    .sel__search {
      width: 100%;
      padding: 5px 10px;
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-sm);
      background: #fff8ec;
      color: var(--app-text);
      font-family: var(--app-font-body);
      font-size: 13px;
      outline: none;
      box-sizing: border-box;
    }

    .sel__search:focus {
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .sel__options {
      flex: 1;
      overflow-y: auto;
      min-height: 0;
    }

    .sel__option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: 100%;
      padding: 9px 12px;
      border: none;
      background: transparent;
      color: var(--app-text);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      border-bottom: 1px solid rgba(158, 98, 53, 0.12);
      transition: background 0.1s, color 0.1s;
    }

    .sel__option:last-child {
      border-bottom: none;
    }

    .sel__option:hover {
      background: var(--app-primary-soft);
      color: var(--app-heading);
    }

    .sel__option--selected {
      background: rgba(88, 24, 13, 0.06);
      color: var(--app-primary);
      font-weight: 600;
    }

    .sel__option--selected:hover {
      background: var(--app-primary-soft);
    }

    .sel__option-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sel__option-check {
      flex-shrink: 0;
      color: var(--app-primary);
      font-size: 11px;
      font-weight: 700;
    }

    .sel__no-match {
      padding: 10px 12px;
      font-size: 13px;
      color: var(--app-text-muted);
      font-style: italic;
    }
  `],
})
export class UiSelectComponent implements ControlValueAccessor {
  readonly options = input<UiSelectOption[]>([]);
  readonly nullOption = input<string | undefined>(undefined);
  readonly placeholder = input('Select…');
  readonly enableSearch = input(true);

  readonly isOpen = signal(false);
  readonly currentValue = signal<any>(null);
  readonly isDisabled = signal(false);
  readonly panelRect = signal<PanelRect | null>(null);
  readonly searchQuery = signal('');

  @ViewChild('trigger') triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly el: ElementRef) {}

  readonly allOptions = computed<UiSelectOption[]>(() => {
    const nullLabel = this.nullOption();
    const extra: UiSelectOption[] = nullLabel !== undefined
      ? [{ label: nullLabel, value: null }]
      : [];
    return [...extra, ...this.options()];
  });

  readonly filteredOptions = computed<UiSelectOption[]>(() => {
    if (!this.enableSearch()) return this.allOptions();

    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.allOptions();
    return this.allOptions().filter(o => o.label.toLowerCase().includes(q));
  });

  readonly isNullValue = computed(() => {
    const v = this.currentValue();
    return v === null || v === undefined;
  });

  readonly panelStyle = computed(() => {
    const r = this.panelRect();
    if (!r) return { display: 'none' };
    return {
      position: 'fixed',
      top: r.top != null ? `${r.top}px` : 'auto',
      bottom: r.bottom != null ? `${r.bottom}px` : 'auto',
      left: `${r.left}px`,
      width: `${r.width}px`,
      'max-height': `${r.maxHeight}px`,
    };
  });

  readonly selectedLabel = computed(() => {
    const v = this.currentValue();
    if (v === null || v === undefined) {
      return this.nullOption() ?? this.placeholder();
    }
    return this.options().find(o => o.value === v)?.label ?? this.placeholder();
  });

  writeValue(val: any): void {
    this.currentValue.set(val ?? null);
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  toggle(): void {
    if (this.isDisabled()) return;

    if (!this.isOpen()) {
      this.updatePanelRect();
      this.searchQuery.set('');
      this.isOpen.set(true);

      if (this.enableSearch()) {
        setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
      }
    } else {
      this.isOpen.set(false);
    }

    this.onTouched();
  }

  selectOption(opt: UiSelectOption): void {
    this.currentValue.set(opt.value);
    this.onChange(opt.value);
    this.onTouched();
    this.isOpen.set(false);
    this.searchQuery.set('');
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.isOpen.set(false);
      this.searchQuery.set('');
    } else if (event.key === 'Enter') {
      const opts = this.filteredOptions();
      if (opts.length === 1) {
        this.selectOption(opts[0]);
      }
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
      this.searchQuery.set('');
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.isOpen.set(false);
      this.searchQuery.set('');
    }
  }

  @HostListener('window:scroll')
  onScroll(): void {
    if (this.isOpen()) this.updatePanelRect();
  }

  @HostListener('window:resize')
  onResize(): void {
    if (this.isOpen()) this.updatePanelRect();
  }

  private updatePanelRect(): void {
    const trigger = this.triggerRef?.nativeElement
      ?? this.el.nativeElement.querySelector('button');
    if (!trigger) return;

    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight;
    const GAP = 8;
    const MAX_HEIGHT = 280;

    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;

    const openUpward = spaceAbove > spaceBelow && spaceBelow < MAX_HEIGHT;
    const availableSpace = openUpward ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(MAX_HEIGHT, availableSpace);

    if (openUpward) {
      this.panelRect.set({
        top: null,
        bottom: vh - r.top + GAP,
        left: r.left,
        width: r.width,
        maxHeight,
      });
    } else {
      this.panelRect.set({
        top: r.bottom + GAP,
        bottom: null,
        left: r.left,
        width: r.width,
        maxHeight,
      });
    }
  }
}