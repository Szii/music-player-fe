import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  TranslocoLoader,
  TranslocoService,
  Translation,
  provideTransloco,
} from '@jsverse/transloco';
import { Observable, of } from 'rxjs';

import en from '../../public/i18n/en.json';

/** The real English catalogue, so specs assert the copy users actually see. */
export const EN_TRANSLATION = en as Translation;

class TestTranslocoLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of(EN_TRANSLATION);
  }
}

/**
 * Loads the English catalogue into the already-configured TestBed synchronously.
 * The loader is async, so specs that translate during the same tick (rather than
 * rendering) need the translation pushed in up front.
 */
export function loadTranslocoTesting(): void {
  const service = TestBed.inject(TranslocoService);
  service.setTranslation(EN_TRANSLATION, 'en');
  service.setActiveLang('en');
}

/**
 * Transloco wired up for specs. Needed by anything that translates — including
 * the plain `translate()` helper in `http-error`, which resolves through the
 * service instance rather than injection.
 */
export function provideTranslocoTesting(): Provider[] {
  return [
    provideTransloco({
      config: {
        availableLangs: ['en'],
        defaultLang: 'en',
        fallbackLang: 'en',
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: false,
        prodMode: true,
      },
      loader: TestTranslocoLoader,
    }),
  ];
}
