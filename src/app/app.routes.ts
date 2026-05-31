import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guards';
import { emailInputsGuard } from './core/config/email-inputs.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/pages/login-page/login-page.component')
        .then(m => m.LoginPageComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/pages/register-page/register-page.component')
        .then(m => m.RegisterPageComponent),
  },
  {
    path: 'verify-email',
    canActivate: [emailInputsGuard],
    loadComponent: () =>
      import('./features/auth/pages/verify-email-page/verify-email-page.component')
        .then(m => m.VerifyEmailPageComponent),
  },
  {
    path: 'forgot-password',
    canActivate: [emailInputsGuard],
    loadComponent: () =>
      import('./features/auth/pages/forgot-password-request-page/forgot-password-request-page.component')
        .then(m => m.ForgotPasswordRequestPageComponent),
  },
  {
    path: 'reset-password',
    canActivate: [emailInputsGuard],
    loadComponent: () =>
      import('./features/auth/pages/reset-password-page/reset-password-page.component')
        .then(m => m.ResetPasswordPageComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./shared/components/shell/shell.component')
        .then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },
      {
        path: 'home',
        loadComponent: () =>
          import('./features/home/pages/home-page/home-page.component')
            .then(m => m.HomePageComponent),
      },
      {
        path: 'tracks',
        loadComponent: () =>
          import('./features/tracks/pages/tracks-page/tracks-page-component')
            .then(m => m.TracksPageComponent),
      },
      {
        path: 'boards',
        loadComponent: () =>
          import('./features/boards/pages/boards-page/boards-stub.component')
            .then(m => m.BoardsStubComponent),
      },
      {
        path: 'groups',
        loadComponent: () =>
          import('./features/groups/pages/groups-page/groups-page.component')
            .then(m => m.GroupsPageComponent),
      },
      {
        path: 'workshop',
        loadComponent: () =>
          import('./features/workshop/pages/workshop-page/workshop-page.component')
            .then(m => m.WorkshopPageComponent),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/pages/profile-page/profile-page.component')
            .then(m => m.ProfilePageComponent),
      },
      {
        path: '**',
        redirectTo: 'home',
      },
    ],
  },
  {
    path: '**',
    redirectTo: '',
  },
];