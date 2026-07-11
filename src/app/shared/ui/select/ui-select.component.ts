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

import { DeviceCapabilitiesService } from '../../../core/services/device-capabilities.service';
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
  templateUrl: './ui-select.component.html',
  styleUrl: './ui-select.component.scss',
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
  @ViewChild(BottomSheetDragDirective) private sheetDrag?: BottomSheetDragDirective;

  private onChange: (v: any) => void = () => {};
  private onTouched: () => void = () => {};

  private readonly scrollLock = inject(ScrollLockService);
  private readonly device = inject(DeviceCapabilitiesService);

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

      // Auto-focus the search on precise-pointer devices (mouse/trackpad) only.
      // On touch devices — phones *and* tablets — focusing would immediately pop
      // the soft keyboard over the options, so let the user tap the field to
      // start searching. Keyed on input modality, not viewport width, so a wide
      // tablet doesn't get desktop behaviour.
      if (this.enableSearch() && this.device.prefersAutoFocus()) {
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
    // Slide the sheet out (same as drag/handle close) before removing it.
    if (this.sheetDrag) {
      this.sheetDrag.close();
    } else {
      this.dismissSheet();
    }
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

    // On touch, an open window flyout has no hover to dismiss it, so the first
    // tap on any row just closes the flyout instead of selecting that track.
    if (!this.isHoverDevice() && this.hoveredOptionValue() !== null) {
      this.closeFlyout();
      return;
    }

    this.currentValue.set(opt.value);
    this.onChange(opt.value);
    this.onTouched();
    this.closeAndFocusTrigger();
  }

  /**
   * True only on real hover-capable pointers. Touch devices fire synthetic
   * mouseenter/mousemove/mouseleave on tap; treating those as hover makes the
   * "More" flyout open on mouseenter and then get toggled shut by the tap's
   * click, forcing a second tap. Hover handlers no-op on touch so a single tap
   * opens the flyout.
   */
  private isHoverDevice(): boolean {
    return this.device.canHover();
  }

  onOptionMouseMove(opt: UiSelectOption, index: number): void {
    if (!this.isHoverDevice()) return;
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
    if (!this.isHoverDevice()) return;
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
    if (!this.isHoverDevice()) return;
    this.scheduleFlyoutClose();
  }

  onFlyoutHover(): void {
    this.clearFlyoutTimer();
  }

  onFlyoutUnhover(): void {
    if (!this.isHoverDevice()) return;
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