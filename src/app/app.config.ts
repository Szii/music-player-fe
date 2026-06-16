import {
  ApplicationConfig,
  importProvidersFrom,
  inject,
  provideAppInitializer,
} from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { ApiModule, BASE_PATH } from './api/generated';
import { authErrorInterceptor, authInterceptor } from './core/auth/auth.interceptors';
import { TokenRenewalService } from './core/auth/token-renewal.service';

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
    // Resume token renewal on load: refresh an expired token off the cookie and
    // start the proactive timer before the app routes.
    provideAppInitializer(() => inject(TokenRenewalService).bootstrap()),
  ],
};

