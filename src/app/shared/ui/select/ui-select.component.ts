import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  forwardRef,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface UiSelectOption {
  label: string;
  value: any;
  subOptions?: UiSelectOption[];
}

export interface UiSelectSubOptionEvent {
  parent: UiSelectOption;
  sub: UiSelectOption;
}

interface PanelLayout {
  upward: boolean;
  maxHeight: number;
}

interface FlyoutLayout {
  alignLeft: boolean;
  maxHeight: number;
}

@Component({
  selector: 'ui-select',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

      @if (isOpen()) {
        <div
          class="app-popover-surface sel__panel"
          [class.sel__panel--upward]="panelLayout().upward"
          [style.max-height.px]="panelLayout().maxHeight"
        >
          @if (enableSearch()) {
            <div class="sel__search-wrap">
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
          }

          <div #optionsList class="sel__options" role="listbox">
            @for (opt of filteredOptions(); track opt.value; let i = $index) {
              <div
                class="sel__option-wrap"
                [attr.data-option-index]="i"
                (mouseenter)="onOptionHover(opt, $event)"
                (mousemove)="highlightedIndex.set(i)"
                (mouseleave)="onOptionUnhover()"
              >
                <button
                  type="button"
                  class="app-popover-item sel__option"
                  [class.app-popover-item--selected]="currentValue() === opt.value"
                  [class.app-popover-item--highlighted]="highlightedIndex() === i"
                  [class.sel__option--has-sub]="(opt.subOptions?.length ?? 0) > 0"
                  role="option"
                  [attr.aria-selected]="currentValue() === opt.value"
                  (click)="selectOption(opt)"
                >
                  <span class="sel__option-label">{{ opt.label }}</span>
                  @if ((opt.subOptions?.length ?? 0) > 0) {
                    <span class="sel__option-arrow" aria-hidden="true">▸</span>
                  }
                  @if (currentValue() === opt.value) {
                    <span class="sel__option-check" aria-hidden="true">✓</span>
                  }
                </button>

                @if (hoveredOptionValue() === opt.value && (opt.subOptions?.length ?? 0) > 0) {
                  <div
                    class="app-popover-surface sel__flyout"
                    [class.sel__flyout--left]="flyoutLayout().alignLeft"
                    [style.max-height.px]="flyoutLayout().maxHeight"
                    (mouseenter)="onFlyoutHover()"
                    (mouseleave)="onFlyoutUnhover()"
                  >
                    @for (sub of opt.subOptions; track sub.value; let si = $index) {
                      <button
                        type="button"
                        class="app-popover-item sel__flyout-option"
                        [class.app-popover-item--highlighted]="highlightedSubIndex() === si"
                        [attr.data-sub-index]="si"
                        (mousemove)="highlightedSubIndex.set(si)"
                        (click)="selectSubOption(opt, sub)"
                      >
                        {{ sub.label }}
                      </button>
                    }
                  </div>
                }
              </div>
            }

            @if (filteredOptions().length === 0) {
              <div class="sel__no-match">No matches</div>
            }
          </div>
        </div>
      }
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
      position: absolute;
      top: calc(100% + 8px);
      left: 0;
      right: 0;
      z-index: 100;
    }

    .sel__panel--upward {
      top: auto;
      bottom: calc(100% + 8px);
    }

    .sel__search-wrap {
      flex-shrink: 0;
      padding: 12px 10px 6px;
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

    /* Local-only: tighten the shared item visuals for the select rows,
       add justify-content + per-row divider that the generic class doesn't carry. */
    .sel__option,
    .sel__flyout-option {
      justify-content: space-between;
      border-bottom: 1px solid rgba(158, 98, 53, 0.12);
    }

    .sel__option:last-child,
    .sel__flyout-option:last-child {
      border-bottom: none;
    }

    .sel__option-label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sel__option-wrap {
      position: relative;
    }

    .sel__option-arrow {
      flex-shrink: 0;
      color: var(--app-text-muted);
      font-size: 12px;
      line-height: 1;
    }

    .sel__option--has-sub:hover .sel__option-arrow,
    .sel__option--has-sub:focus-visible .sel__option-arrow {
      color: var(--app-primary);
    }

    .sel__flyout {
      position: absolute;
      top: 0;
      left: calc(100% + 4px);
      z-index: 101;
      min-width: 200px;
      width: 220px;
      max-width: 320px;
      overflow-y: auto;
    }

    .sel__flyout--left {
      left: auto;
      right: calc(100% + 4px);
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
  host: {
    '(keydown)': 'onKeydown($event)',
    '(document:click)': 'onDocumentClick($event)',
    '(window:scroll)': 'onScroll()',
    '(window:resize)': 'onResize()',
  },
})
export class UiSelectComponent implements ControlValueAccessor {
  readonly options = input<UiSelectOption[]>([]);
  readonly nullOption = input<string | undefined>(undefined);
  readonly placeholder = input('Select…');
  readonly enableSearch = input(true);
  readonly navigateUpWhenClosed = input(false);

  readonly subOptionSelected = output<UiSelectSubOptionEvent>();
  readonly navigateNext = output<void>();
  readonly navigatePrev = output<void>();
  readonly navigateUp = output<void>();
  readonly escape = output<void>();
  readonly enterCommitted = output<void>();

  readonly hoveredOptionValue = signal<any>(null);
  readonly flyoutLayout = signal<FlyoutLayout>({ alignLeft: false, maxHeight: 280 });
  readonly highlightedIndex = signal<number>(-1);
  readonly highlightedSubIndex = signal<number>(-1);
  readonly inFlyoutMode = computed(() => this.highlightedSubIndex() >= 0);
  private flyoutCloseTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isOpen = signal(false);
  readonly currentValue = signal<any>(null);
  readonly isDisabled = signal(false);
  readonly panelLayout = signal<PanelLayout>({ upward: false, maxHeight: 280 });
  readonly searchQuery = signal('');

  @ViewChild('trigger') triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('optionsList') optionsListRef?: ElementRef<HTMLElement>;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(private readonly el: ElementRef) {
    effect(() => {
      const len = this.filteredOptions().length;
      const idx = this.highlightedIndex();
      if (idx >= len) {
        this.highlightedIndex.set(len === 0 ? -1 : len - 1);
      }
    });
  }

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
      this.updatePanelLayout();
      this.searchQuery.set('');
      this.isOpen.set(true);
      this.resetHighlightFromCurrent();

      if (this.enableSearch()) {
        setTimeout(() => this.searchInputRef?.nativeElement.focus(), 0);
      }
    } else {
      this.isOpen.set(false);
      this.clearFlyoutTimer();
      this.hoveredOptionValue.set(null);
      this.highlightedIndex.set(-1);
      this.highlightedSubIndex.set(-1);
    }

    this.onTouched();
  }

  private resetHighlightFromCurrent(): void {
    this.highlightedIndex.set(this.filteredOptions().length > 0 ? 0 : -1);
  }

  private moveHighlight(delta: number): void {
    if (this.inFlyoutMode()) {
      this.moveSubHighlight(delta);
      return;
    }

    const opts = this.filteredOptions();
    if (opts.length === 0) {
      this.highlightedIndex.set(-1);
      return;
    }
    const current = this.highlightedIndex();
    const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
    const next = (start + delta + opts.length) % opts.length;
    this.highlightedIndex.set(next);
    this.hoveredOptionValue.set(null);
    this.scrollOptionIntoView(next);
  }

  private moveSubHighlight(delta: number): void {
    const parent = this.highlightedParent();
    const subs = parent?.subOptions ?? [];
    if (subs.length === 0) return;
    const current = this.highlightedSubIndex();
    const start = current < 0 ? (delta > 0 ? -1 : 0) : current;
    const next = (start + delta + subs.length) % subs.length;
    this.highlightedSubIndex.set(next);
    this.scrollSubIntoView(next);
  }

  private highlightedParent(): UiSelectOption | null {
    const opts = this.filteredOptions();
    const idx = this.highlightedIndex();
    return idx >= 0 && idx < opts.length ? opts[idx] : null;
  }

  private scrollOptionIntoView(index: number): void {
    const list = this.optionsListRef?.nativeElement;
    if (!list) return;
    const row = list.querySelector(
      `[data-option-index="${index}"]`,
    ) as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }

  private scrollSubIntoView(index: number): void {
    const list = this.optionsListRef?.nativeElement;
    if (!list) return;
    const row = list.querySelector(
      `[data-sub-index="${index}"]`,
    ) as HTMLElement | null;
    row?.scrollIntoView({ block: 'nearest' });
  }

  private openFlyoutForHighlighted(): boolean {
    const parent = this.highlightedParent();
    if (!parent || (parent.subOptions?.length ?? 0) === 0) return false;

    const list = this.optionsListRef?.nativeElement;
    const row = list?.querySelector(
      `[data-option-index="${this.highlightedIndex()}"] .sel__option`,
    ) as HTMLElement | null;
    if (row) {
      this.updateFlyoutLayout(row);
    }

    this.clearFlyoutTimer();
    this.hoveredOptionValue.set(parent.value);
    this.highlightedSubIndex.set(0);
    return true;
  }

  private updateFlyoutLayout(row: HTMLElement): void {
    const r = row.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const FLYOUT_WIDTH = 220;
    const GAP = 4;

    const alignLeft = r.right + GAP + FLYOUT_WIDTH > vw;
    const maxHeight = Math.max(80, vh - r.top - 16);
    this.flyoutLayout.set({ alignLeft, maxHeight });
  }

  private closeFlyout(): void {
    this.hoveredOptionValue.set(null);
    this.highlightedSubIndex.set(-1);
    this.clearFlyoutTimer();
  }

  private commitHighlighted(): boolean {
    if (this.inFlyoutMode()) {
      const parent = this.highlightedParent();
      const subs = parent?.subOptions ?? [];
      const si = this.highlightedSubIndex();
      if (!parent || si < 0 || si >= subs.length) return false;
      this.selectSubOption(parent, subs[si]);
      this.enterCommitted.emit();
      return true;
    }

    const opts = this.filteredOptions();
    const idx = this.highlightedIndex();
    if (idx < 0 || idx >= opts.length) return false;
    this.selectOption(opts[idx]);
    this.enterCommitted.emit();
    return true;
  }

  open(): void {
    if (this.isDisabled() || this.isOpen()) return;
    this.toggle();
  }

  focusTrigger(): void {
    this.triggerRef?.nativeElement.focus();
  }

  selectOption(opt: UiSelectOption): void {
    this.currentValue.set(opt.value);
    this.onChange(opt.value);
    this.onTouched();
    this.closeAndFocusTrigger();
  }

  selectSubOption(parent: UiSelectOption, sub: UiSelectOption): void {
    this.onTouched();
    this.subOptionSelected.emit({ parent, sub });
    this.closeAndFocusTrigger();
  }

  private closeAndFocusTrigger(): void {
    this.isOpen.set(false);
    this.searchQuery.set('');
    this.clearFlyoutTimer();
    this.hoveredOptionValue.set(null);
    this.highlightedIndex.set(-1);
    this.highlightedSubIndex.set(-1);
    setTimeout(() => this.triggerRef?.nativeElement.focus(), 0);
  }

  onOptionHover(opt: UiSelectOption, event: MouseEvent): void {
    this.clearFlyoutTimer();
    if ((opt.subOptions?.length ?? 0) === 0) {
      this.hoveredOptionValue.set(null);
      return;
    }

    const target = event.currentTarget as HTMLElement | null;
    if (target) {
      this.updateFlyoutLayout(target);
    }

    this.hoveredOptionValue.set(opt.value);
  }

  onOptionUnhover(): void {
    this.scheduleFlyoutClose();
  }

  onFlyoutHover(): void {
    this.clearFlyoutTimer();
  }

  onFlyoutUnhover(): void {
    this.scheduleFlyoutClose();
  }

  private scheduleFlyoutClose(): void {
    this.clearFlyoutTimer();
    this.flyoutCloseTimer = setTimeout(() => {
      this.hoveredOptionValue.set(null);
      this.flyoutCloseTimer = null;
    }, 180);
  }

  private clearFlyoutTimer(): void {
    if (this.flyoutCloseTimer !== null) {
      clearTimeout(this.flyoutCloseTimer);
      this.flyoutCloseTimer = null;
    }
  }

  onSearchKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (this.inFlyoutMode()) {
        this.closeFlyout();
        return;
      }
      this.closeAndFocusTrigger();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      this.moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      event.stopPropagation();
      this.moveHighlight(-1);
      return;
    }

    if (event.key === 'ArrowRight') {
      if (this.openFlyoutForHighlighted()) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      if (this.inFlyoutMode()) {
        event.preventDefault();
        event.stopPropagation();
        this.closeFlyout();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (this.commitHighlighted()) return;
      const opts = this.filteredOptions();
      if (opts.length === 1) {
        this.selectOption(opts[0]);
        this.enterCommitted.emit();
      }
    }
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.el.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
      this.searchQuery.set('');
      this.clearFlyoutTimer();
      this.hoveredOptionValue.set(null);
      this.highlightedIndex.set(-1);
      this.highlightedSubIndex.set(-1);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      if (this.isOpen() && this.inFlyoutMode()) {
        this.closeFlyout();
        return;
      }
      if (this.isOpen()) {
        this.closeAndFocusTrigger();
        return;
      }
      event.preventDefault();
      this.escape.emit();
      return;
    }

    if (!this.isOpen()) {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.navigateNext.emit();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.navigatePrev.emit();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (this.navigateUpWhenClosed()) {
          this.navigateUp.emit();
        } else {
          this.open();
        }
        return;
      }
      if (
        event.key === 'Enter'
        || event.key === ' '
        || event.key === 'ArrowDown'
      ) {
        event.preventDefault();
        this.open();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveHighlight(-1);
      return;
    }

    if (event.key === 'ArrowRight') {
      if (this.openFlyoutForHighlighted()) {
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'ArrowLeft') {
      if (this.inFlyoutMode()) {
        event.preventDefault();
        this.closeFlyout();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitHighlighted();
    }
  }

  onScroll(): void {
    if (this.isOpen()) this.updatePanelLayout();
  }

  onResize(): void {
    if (this.isOpen()) this.updatePanelLayout();
  }

  private updatePanelLayout(): void {
    const trigger = this.triggerRef?.nativeElement
      ?? this.el.nativeElement.querySelector('button');
    if (!trigger) return;

    const r = trigger.getBoundingClientRect();
    const vh = window.innerHeight;
    const GAP = 8;
    const MAX_HEIGHT = 280;

    const spaceBelow = vh - r.bottom - GAP;
    const spaceAbove = r.top - GAP;

    const upward = spaceAbove > spaceBelow && spaceBelow < MAX_HEIGHT;
    const availableSpace = upward ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(MAX_HEIGHT, Math.max(80, availableSpace));

    this.panelLayout.set({ upward, maxHeight });
  }
}