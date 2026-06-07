import { Injectable, signal } from '@angular/core';

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

/** Persists the banner's dismissed state so a reload/new session doesn't re-spam. */
const BANNER_DISMISSED_KEY = 'browser_warning_dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(BANNER_DISMISSED_KEY, '1');
    } else {
      localStorage.removeItem(BANNER_DISMISSED_KEY);
    }
  } catch {
    // Ignore storage failures (e.g. private mode / disabled storage).
  }
}

/**
 * App-wide browser-support state: whether the current browser is the supported
 * (Chromium) target, plus the open/closed state of the warning banner shown to
 * users on unsupported browsers. The dismissed state is persisted to
 * `localStorage`, so closing the banner keeps it closed across reloads and new
 * sessions (the navbar icon can still reopen it on demand).
 */
@Injectable({ providedIn: 'root' })
export class BrowserSupportService {
  /** True when the current browser is Chromium-based (the supported target). */
  readonly isChromium = detectChromium();

  /** True when an unsupported (non-Chromium) browser should be warned about. */
  readonly showWarning = !this.isChromium;

  /** Whether the warning banner is currently visible. Open unless dismissed before. */
  readonly bannerOpen = signal(!readDismissed());

  openBanner(): void {
    this.setOpen(true);
  }

  closeBanner(): void {
    this.setOpen(false);
  }

  toggleBanner(): void {
    this.setOpen(!this.bannerOpen());
  }

  private setOpen(open: boolean): void {
    this.bannerOpen.set(open);
    writeDismissed(!open);
  }
}
