import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

import { ScrollLockService } from '../../../core/services/scroll-lock.service';
import { BottomSheetDragDirective } from '../bottom-sheet/bottom-sheet-drag.directive';

export interface UiSelectOption {
  label: string;
  value: any;
  subOptions?: UiSelectOption[];
  /** When true the option is shown greyed out and cannot be selected. */
  disabled?: boolean;
}

export interface UiSelectSubOptionEvent {
  parent: UiSelectOption;
  sub: UiSelectOption;
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [BottomSheetDragDirective],
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

      @if (isOpen() && panelRect(); as panel) {
        <div class="sel__scrim" aria-hidden="true" (pointerdown)="onScrimDown($event)"></div>
        <div
          #sheetEl
          class="app-popover-surface sel__panel"
          [style.top]="panel.top != null ? panel.top + 'px' : 'auto'"
          [style.bottom]="panel.bottom != null ? panel.bottom + 'px' : 'auto'"
          [style.left.px]="panel.left"
          [style.width.px]="panel.width"
          [style.max-height.px]="panel.maxHeight"
        >
          <button
            type="button"
            class="sel__handle"
            [appBottomSheetDrag]="sheetEl"
            (dismiss)="dismissSheet()"
            aria-label="Close"
          >
            <span class="sel__handle-bar" aria-hidden="true"></span>
          </button>

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
                (mouseenter)="onOptionHover(opt, i, $event)"
                (mousemove)="onOptionMouseMove(opt, i)"
                (mouseleave)="onOptionUnhover()"
              >
                <button
                  type="button"
                  class="app-popover-item sel__option"
                  [class.app-popover-item--selected]="currentValue() === opt.value"
                  [class.app-popover-item--highlighted]="highlightedIndex() === i"
                  [class.sel__option--has-sub]="(opt.subOptions?.length ?? 0) > 0"
                  [class.sel__option--disabled]="opt.disabled"
                  [disabled]="opt.disabled"
                  [attr.aria-disabled]="opt.disabled || null"
                  role="option"
                  [attr.aria-selected]="currentValue() === opt.value"
                  (click)="selectOption(opt)"
                >
                  <span class="sel__option-label">{{ opt.label }}</span>

                  @if ((opt.subOptions?.length ?? 0) > 0) {
                    <span
                      class="sel__option-subhint"
                      [class.sel__option-subhint--open]="hoveredOptionValue() === opt.value"
                      role="button"
                      tabindex="-1"
                      aria-label="Show windows for this track"
                      (click)="onMoreTap(opt, i, $event)"
                    >
                      <span class="sel__option-subhint-text">More</span>
                      <span class="sel__option-subhint-icon">›</span>
                    </span>
                  }

                  <span class="sel__option-check-slot" aria-hidden="true">
                    @if (currentValue() === opt.value) {
                      <span class="sel__option-check">✓</span>
                    }
                  </span>
                </button>

                @if (hoveredOptionValue() === opt.value && (opt.subOptions?.length ?? 0) > 0 && flyoutRect(); as fly) {
                  <div
                    class="app-popover-surface sel__flyout"
                    [style.top.px]="fly.top"
                    [style.left.px]="fly.left"
                    [style.max-height.px]="fly.maxHeight"
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
      position: fixed;
      z-index: 9999;
    }

    /* Scrim + drag handle are phone-only (see media query). */
    .sel__scrim,
    .sel__handle {
      display: none;
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

    .sel__option,
    .sel__flyout-option {
      border-bottom: 1px solid rgba(158, 98, 53, 0.12);
    }

    .sel__option {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 24px;
      align-items: center;
      column-gap: 10px;
      width: 100%;
    }

    .sel__flyout-option {
      display: flex;
      justify-content: space-between;
    }

    .sel__option:last-child,
    .sel__flyout-option:last-child {
      border-bottom: none;
    }

    .sel__option--disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .sel__option-label {
      grid-column: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sel__option-wrap {
      position: relative;
    }

    .sel__option-subhint {
      grid-column: 2;
      display: inline-flex;
      align-items: center;
      justify-self: end;
      gap: 6px;
      padding: 3px 7px 3px 8px;
      border: 1px solid rgba(88, 24, 13, 0.28);
      border-radius: 999px;
      background: rgba(201, 164, 76, 0.22);
      color: #58180d;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      box-shadow:
        inset 0 1px 0 rgba(255, 248, 236, 0.7),
        0 1px 2px rgba(88, 24, 13, 0.12);
      transition:
        transform 0.15s ease,
        border-color 0.15s ease,
        background 0.15s ease,
        color 0.15s ease;
    }

    .sel__option-subhint-icon {
      font-size: 18px;
      line-height: 0.8;
      font-weight: 900;
    }

    .sel__option--has-sub:hover .sel__option-subhint,
    .sel__option--has-sub:focus-visible .sel__option-subhint,
    .sel__option--has-sub.app-popover-item--highlighted .sel__option-subhint {
      border-color: var(--app-primary);
      background: rgba(201, 164, 76, 0.38);
      color: var(--app-primary);
      transform: translateX(2px);
    }

    .sel__option-subhint--open {
      border-color: var(--app-primary);
      background: rgba(201, 164, 76, 0.5);
      color: var(--app-primary);
    }

    .sel__option-check-slot {
      grid-column: 3;
      width: 24px;
      min-width: 24px;
      display: inline-flex;
      justify-content: center;
      align-items: center;
    }

    .sel__option-check {
      color: var(--app-primary);
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
    }

    .sel__flyout {
      position: fixed;
      z-index: 10000;
      min-width: 200px;
      width: 220px;
      max-width: 320px;
      overflow-y: auto;
    }

    .sel__no-match {
      padding: 10px 12px;
      font-size: 13px;
      color: var(--app-text-muted);
      font-style: italic;
    }

    /* Mobile: render the menu as a bottom sheet — full-width, bottom-anchored,
       large tap targets — instead of a narrow popover anchored to the trigger.
       Best practice for selects on small screens (NN/g, Material). Overrides
       the JS-computed inline position with !important. */
    @media (max-width: 640px) {
      .sel__trigger {
        min-height: 44px;
      }

      /* Dim everything behind the sheet (page or dialog) so it reads as one
         clean layer on top, not stacked surfaces. */
      .sel__scrim {
        display: block;
        position: fixed;
        inset: 0;
        z-index: 9998;
        background: rgba(15, 8, 3, 0.45);
        animation: sel-scrim-in 0.18s ease;
      }

      .sel__panel,
      .sel__flyout {
        position: fixed !important;
        top: auto !important;
        right: 0 !important;
        bottom: 0 !important;
        left: 0 !important;
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        /* Cap to a handful of rows so the list overflows and scrolls inside
           the sheet, rather than filling the screen with no inner scroll. */
        max-height: min(52vh, 416px) !important;
        border-radius: var(--app-radius-lg) var(--app-radius-lg) 0 0 !important;
        box-shadow: 0 -14px 36px rgba(15, 8, 3, 0.34) !important;
        animation: sel-sheet-up 0.2s ease !important;
      }

      /* Drag/tap handle at the top of the sheet (drag down or tap to close). */
      .sel__handle {
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 100%;
        height: 26px;
        padding: 0;
        border: none;
        background: transparent;
        cursor: grab;
      }

      .sel__handle-bar {
        width: 38px;
        height: 4px;
        border-radius: 999px;
        background: var(--app-border-color-soft);
      }

      /* Keep the scroll inside the sheet — don't chain to the page behind. */
      .sel__options {
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
      }

      .sel__option {
        min-height: 48px;
      }

      /* Bigger "More" tap target to open the windows sheet on touch. */
      .sel__option-subhint {
        padding: 8px 12px;
      }
    }

    @keyframes sel-sheet-up {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }

    @keyframes sel-scrim-in {
      from { opacity: 0; }
      to { opacity: 1; }
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
  readonly flyoutRect = signal<{ top: number; left: number; maxHeight: number } | null>(null);
  readonly highlightedIndex = signal<number>(-1);
  readonly highlightedSubIndex = signal<number>(-1);
  readonly inFlyoutMode = computed(() => this.highlightedSubIndex() >= 0);
  private flyoutCloseTimer: ReturnType<typeof setTimeout> | null = null;

  readonly isOpen = signal(false);
  readonly currentValue = signal<any>(null);
  readonly isDisabled = signal(false);
  readonly panelRect = signal<PanelRect | null>(null);
  readonly searchQuery = signal('');

  @ViewChild('trigger') triggerRef?: ElementRef<HTMLButtonElement>;
  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('optionsList') optionsListRef?: ElementRef<HTMLElement>;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly scrollLock = inject(ScrollLockService);

  constructor(private readonly el: ElementRef) {
    effect(() => {
      const len = this.filteredOptions().length;
      const idx = this.highlightedIndex();
      if (idx >= len) {
        this.highlightedIndex.set(len === 0 ? -1 : len - 1);
      }
    });

    // On mobile the panel is a bottom sheet that owns the screen: lock the
    // background scroll and (via the shared body class) hide the bottom nav so
    // it can't cover the sheet. Ref-counted, so this nests cleanly inside a
    // dialog that is already locked.
    effect((onCleanup) => {
      if (!this.isOpen()) return;
      if (typeof window === 'undefined') return;
      if (!window.matchMedia('(max-width: 640px)').matches) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
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
      this.resetHighlightFromCurrent();

      // Auto-focus the search on desktop only. On mobile the sheet would
      // immediately pop the keyboard over the options — let the user tap the
      // field to start searching.
      const isMobile =
        typeof window !== 'undefined' &&
        window.matchMedia('(max-width: 640px)').matches;
      if (this.enableSearch() && !isMobile) {
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
    const opts = this.filteredOptions();
    this.highlightedIndex.set(opts.findIndex(o => !o.disabled));
  }

  private moveHighlight(delta: number): void {
    if (this.inFlyoutMode()) {
      this.moveSubHighlight(delta);
      return;
    }

    const opts = this.filteredOptions();
    if (opts.length === 0) {
      this.highlightedIndex.set(-1);
      this.closeFlyout();
      return;
    }

    const current = this.highlightedIndex();
    const start = current < 0 ? (delta > 0 ? -1 : 0) : current;

    // Step over disabled options so arrow keys can't land on one.
    let next = start;
    for (let n = 0; n < opts.length; n++) {
      next = (next + delta + opts.length) % opts.length;
      if (!opts[next].disabled) break;
    }
    if (opts[next].disabled) return;

    this.highlightedIndex.set(next);
    this.highlightedSubIndex.set(-1);
    this.scrollOptionIntoView(next);

    this.openFlyoutForIndex(next, false);
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
    const idx = this.highlightedIndex();
    if (idx < 0) return false;

    return this.openFlyoutForIndex(idx, true);
  }

  private openFlyoutForIndex(index: number, enterFlyoutMode: boolean): boolean {
    const opts = this.filteredOptions();
    const parent = opts[index];

    if (!parent || parent.disabled || (parent.subOptions?.length ?? 0) === 0) {
      this.closeFlyout();
      return false;
    }

    const list = this.optionsListRef?.nativeElement;
    const row = list?.querySelector(
      `[data-option-index="${index}"] .sel__option`,
    ) as HTMLElement | null;

    if (row) {
      this.positionFlyoutFromElement(row);
    }

    this.clearFlyoutTimer();
    this.hoveredOptionValue.set(parent.value);
    this.highlightedSubIndex.set(enterFlyoutMode ? 0 : -1);

    return true;
  }

  private positionFlyoutFromElement(source: HTMLElement): void {
    const r = source.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const GAP = 4;
    const FLYOUT_WIDTH = 220;

    const desiredLeft = r.right + GAP;
    const left = desiredLeft + FLYOUT_WIDTH > vw
      ? Math.max(8, r.left - FLYOUT_WIDTH - GAP)
      : desiredLeft;

    const top = Math.min(r.top, vh - 80);
    const maxHeight = Math.max(80, vh - top - 16);

    this.flyoutRect.set({ top, left, maxHeight });
  }

  private closeFlyout(): void {
    this.hoveredOptionValue.set(null);
    this.flyoutRect.set(null);
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
    if (idx < 0 || idx >= opts.length || opts[idx].disabled) return false;
    this.selectOption(opts[idx]);
    this.enterCommitted.emit();
    return true;
  }

  open(): void {
    if (this.isDisabled() || this.isOpen()) return;
    this.toggle();
  }

  /** Tap the mobile bottom-sheet scrim to dismiss. Uses pointerdown +
      preventDefault so no ghost click / focus reaches the trigger (which would
      otherwise re-toggle the menu open). */
  onScrimDown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.dismissSheet();
  }

  /** Close the sheet (scrim tap or handle drag/tap) without re-focusing. */
  dismissSheet(): void {
    this.isOpen.set(false);
    this.searchQuery.set('');
    this.clearFlyoutTimer();
    this.hoveredOptionValue.set(null);
    this.highlightedIndex.set(-1);
    this.highlightedSubIndex.set(-1);
  }

  focusTrigger(): void {
    this.triggerRef?.nativeElement.focus();
  }

  selectOption(opt: UiSelectOption): void {
    if (opt.disabled) return;
    this.currentValue.set(opt.value);
    this.onChange(opt.value);
    this.onTouched();
    this.closeAndFocusTrigger();
  }

  onOptionMouseMove(opt: UiSelectOption, index: number): void {
    if (opt.disabled) return;
    this.highlightedIndex.set(index);
    this.highlightedSubIndex.set(-1);
  }

  selectSubOption(parent: UiSelectOption, sub: UiSelectOption): void {
    this.onTouched();
    this.subOptionSelected.emit({ parent, sub });
    this.closeAndFocusTrigger();
  }

  /** Tap the "More ›" affordance to open the sub-options flyout (touch
      equivalent of hovering it on desktop). Tapping it again closes it. */
  onMoreTap(opt: UiSelectOption, index: number, event: Event): void {
    event.stopPropagation();
    if (opt.disabled || (opt.subOptions?.length ?? 0) === 0) return;

    if (this.hoveredOptionValue() === opt.value) {
      this.closeFlyout();
      return;
    }

    this.highlightedIndex.set(index);
    this.clearFlyoutTimer();

    const wrap = (event.currentTarget as HTMLElement).closest('.sel__option-wrap');
    const source =
      (wrap?.querySelector('.sel__option') as HTMLElement | null) ??
      (event.currentTarget as HTMLElement);

    this.positionFlyoutFromElement(source);
    this.hoveredOptionValue.set(opt.value);
    this.highlightedSubIndex.set(0);
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

  onOptionHover(opt: UiSelectOption, index: number, event: MouseEvent): void {
    if (opt.disabled) {
      this.clearFlyoutTimer();
      this.hoveredOptionValue.set(null);
      this.flyoutRect.set(null);
      return;
    }

    this.highlightedIndex.set(index);
    this.highlightedSubIndex.set(-1);
    this.clearFlyoutTimer();

    if ((opt.subOptions?.length ?? 0) === 0) {
      this.hoveredOptionValue.set(null);
      this.flyoutRect.set(null);
      return;
    }

    const target = event.currentTarget as HTMLElement | null;
    if (target) {
      this.positionFlyoutFromElement(target);
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
    if (this.isOpen()) this.updatePanelRect();
  }

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