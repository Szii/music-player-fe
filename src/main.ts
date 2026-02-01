import { bootstrapApplication } from '@angular/platform-browser';
import { importProvidersFrom } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { environment } from './environments/environment';

import { ApiModule, BASE_PATH } from './app/api/generated';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideRouter(routes),                 // ✅ THIS is what you’re missing
    importProvidersFrom(ApiModule),
    { provide: BASE_PATH, useValue: environment.apiUrl },
  ],
});
