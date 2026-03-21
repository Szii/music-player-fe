import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { environment } from '../environments/environment';
import { ApiModule, BASE_PATH } from './api/generated';
import { authInterceptor } from './core/auth/auth.interceptors';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    importProvidersFrom(ApiModule),
    { provide: BASE_PATH, useValue: environment.apiUrl },
  ],
};

