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

/**
 * App-wide browser-support state: whether the current browser is the supported
 * (Chromium) target, plus the open/closed state of the warning banner shown to
 * users on unsupported browsers.
 */
@Injectable({ providedIn: 'root' })
export class BrowserSupportService {
  /** True when the current browser is Chromium-based (the supported target). */
  readonly isChromium = detectChromium();

  /** True when an unsupported (non-Chromium) browser should be warned about. */
  readonly showWarning = !this.isChromium;

  /** Whether the warning banner is currently visible. Shown by default. */
  readonly bannerOpen = signal(true);

  openBanner(): void {
    this.bannerOpen.set(true);
  }

  closeBanner(): void {
    this.bannerOpen.set(false);
  }

  toggleBanner(): void {
    this.bannerOpen.update(open => !open);
  }
}
