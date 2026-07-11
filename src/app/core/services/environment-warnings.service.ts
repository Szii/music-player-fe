import { Injectable, Signal, WritableSignal, computed, inject, signal } from '@angular/core';

import { DeviceCapabilitiesService } from './device-capabilities.service';

interface UserAgentBrand {
  readonly brand: string;
  readonly version: string;
}

interface UserAgentDataLike {
  readonly brands?: readonly UserAgentBrand[];
}

/**
 * Detects whether the current browser is Chromium-based. Prefers the
 * high-entropy `navigator.userAgentData.brands` (exposed by Chromium browsers),
 * falling back to a user-agent sniff for engines that don't implement it
 * (Firefox, Safari).
 */
function detectChromium(): boolean {
  const nav = navigator as Navigator & { userAgentData?: UserAgentDataLike };
  const brands = nav.userAgentData?.brands;
  if (brands && brands.length > 0) {
    return brands.some(b => /chromium/i.test(b.brand));
  }

  const ua = navigator.userAgent;
  if (/\b(Firefox|FxiOS)\b/i.test(ua)) return false;
  return /\b(Chrome|Chromium|CriOS|Edg|EdgA|OPR)\b/i.test(ua);
}

/** Stable identifier for each environment warning. */
export type WarningId = 'browser' | 'mobile-background';

/** An applicable warning with its current open/closed state, for the template. */
export interface ActiveWarning {
  readonly id: WarningId;
  readonly message: string;
  readonly open: Signal<boolean>;
}

interface WarningDefinition {
  readonly id: WarningId;
  /** Whether the warning's environment condition currently applies. */
  readonly applies: Signal<boolean>;
  /** Signal so a warning can reword itself as the environment changes (e.g. the
      mobile-background note flips once the browser is put in desktop mode). */
  readonly message: Signal<string>;
}

/** Per-warning `localStorage` key remembering that the user dismissed it once. */
const DISMISSED_KEYS: Record<WarningId, string> = {
  // Kept verbatim so existing dismissals carry over from before this warning
  // service was generalised.
  browser: 'browser_warning_dismissed',
  'mobile-background': 'mobile_background_warning_dismissed',
};

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(key: string, dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(key, '1');
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures (e.g. private mode / disabled storage).
  }
}

/**
 * App-wide environment-warning state. Each warning applies under a specific
 * environment condition (non-Chromium browser, mobile device, …), renders the
 * same dismissible banner, and remembers in `localStorage` that the user closed
 * it once — so it stays closed across reloads and new sessions while the navbar
 * icon can still reopen it on demand. When several conditions apply at once
 * (e.g. a non-Chromium browser on a phone) every matching warning is shown.
 */
@Injectable({ providedIn: 'root' })
export class EnvironmentWarningsService {
  private readonly device = inject(DeviceCapabilitiesService);

  private readonly isChromium = detectChromium();

  /**
   * A touch device whose browser is in "Desktop site" mode: the pointer is still
   * coarse (a phone/tablet) but the UA has lost its mobile token. In this mode
   * the YouTube iframe behaves like desktop, so background playback works — at
   * the cost of a shrunken desktop-width UI the page can't override.
   */
  private readonly isDesktopMode = computed(
    () => this.device.isMobile() && !/Mobi/i.test(navigator.userAgent),
  );

  private readonly mobileBackgroundMessage = computed(() =>
    this.isDesktopMode()
      ? 'Background playback is active (desktop site mode). The interface is desktop-sized, so it may look small — pinch to zoom.'
      : 'On mobile, boards stop playing once the app is in the background or the screen is off. Tip: turn on "Desktop mode" in your browser menu to keep audio playing in the background.',
  );

  private readonly definitions: readonly WarningDefinition[] = [
    {
      id: 'browser',
      applies: signal(!this.isChromium).asReadonly(),
      message: signal(
        'Audio playback works best in Chromium-based browsers. You may hit occasional issues here — if you do, try a Chromium-based browser.',
      ).asReadonly(),
    },
    {
      id: 'mobile-background',
      applies: this.device.isMobile,
      message: this.mobileBackgroundMessage,
    },
  ];

  private readonly openByWarning: Record<WarningId, WritableSignal<boolean>> = {
    browser: signal(!readDismissed(DISMISSED_KEYS.browser)),
    'mobile-background': signal(!readDismissed(DISMISSED_KEYS['mobile-background'])),
  };

  /** Warnings whose environment condition currently applies, with open state. */
  readonly activeWarnings = computed<ActiveWarning[]>(() =>
    this.definitions
      .filter(def => def.applies())
      .map(def => ({ id: def.id, message: def.message(), open: this.openByWarning[def.id] })),
  );

  /** True when at least one warning applies — drives the navbar warning icon. */
  readonly hasWarnings = computed(() => this.activeWarnings().length > 0);

  /** True when any applicable warning banner is currently shown. */
  readonly anyOpen = computed(() => this.activeWarnings().some(w => w.open()));

  /** Reopen every applicable banner, or hide them all if any is already open. */
  toggleBanners(): void {
    const next = !this.anyOpen();
    for (const warning of this.activeWarnings()) {
      this.setOpen(warning.id, next);
    }
  }

  closeBanner(id: WarningId): void {
    this.setOpen(id, false);
  }

  private setOpen(id: WarningId, open: boolean): void {
    this.openByWarning[id].set(open);
    writeDismissed(DISMISSED_KEYS[id], !open);
  }
}
