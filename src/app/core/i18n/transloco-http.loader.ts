import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { Observable, from, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Translations for the active language, warmed by the inline script in
 * `index.html` so the request starts during HTML parse instead of after the bundle
 * boots. `data` never rejects; it resolves to `null` when the fetch failed.
 */
interface WarmedTranslation {
  lang: string;
  data: Promise<Translation | null>;
}

declare global {
  interface Window {
    __i18n?: WarmedTranslation;
  }
}

/** Loads `public/i18n/<lang>.json`, which Angular serves from the app root. */
@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  getTranslation(lang: string): Observable<Translation> {
    const warmed = this.takeWarmed(lang);

    if (!warmed) {
      return this.request(lang);
    }

    // Fall back to a real request if the warm-up failed, so a blocked or failed
    // preload can never leave the app without translations.
    return from(warmed).pipe(
      switchMap(translation => (translation ? of(translation) : this.request(lang))),
    );
  }

  /**
   * Hands over the warmed payload for `lang` once, then forgets it. Re-loading the
   * same language later (switch away and back) must hit the network rather than
   * replay the startup response.
   */
  private takeWarmed(lang: string): Promise<Translation | null> | null {
    if (typeof window === 'undefined') return null;

    const warmed = window.__i18n;
    if (warmed?.lang !== lang) return null;

    window.__i18n = undefined;

    return warmed.data;
  }

  private request(lang: string): Observable<Translation> {
    return this.http.get<Translation>(`i18n/${lang}.json`);
  }
}
