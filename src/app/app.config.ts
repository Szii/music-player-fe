import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { ApiModule, BASE_PATH } from './api/generated';
import { authErrorInterceptor, authInterceptor } from './core/auth/auth.interceptors';
import { TokenRenewalService } from './core/auth/token-renewal.service';
import { TranslocoHttpLoader } from './core/i18n/transloco-http.loader';
import { LanguageService } from './core/services/language.service';

export const appConfig: ApplicationConfig = {
  providers: [
    // Land at the top of the page on every navigation, and restore the previous
    // scroll position on back/forward.
    provideRouter(
      routes,
      withInMemoryScrolling({
        scrollPositionRestoration: 'enabled',
        anchorScrolling: 'enabled',
      }),
    ),
    provideHttpClient(withInterceptors([authInterceptor, authErrorInterceptor])),
    importProvidersFrom(ApiModule),
    { provide: BASE_PATH, useValue: environment.apiUrl },
    provideTransloco({
      config: {
        availableLangs: ['en', 'cs'],
        defaultLang: 'en',
        fallbackLang: 'en',
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
    // Resume token renewal on load: refresh an expired token off the cookie and
    // start the proactive timer before the app routes.
    provideAppInitializer(() => inject(TokenRenewalService).bootstrap()),
    // Block the first render until the stored language is loaded, so the UI
    // never flashes translation keys.
    provideAppInitializer(() => {
      const language = inject(LanguageService).language();
      return inject(TranslocoService).load(language);
    }),
  ],
};

