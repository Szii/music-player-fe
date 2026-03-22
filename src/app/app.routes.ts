import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guards';
import { guestGuard } from './core/auth/guest.guards';

export const routes: Routes = [
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/pages/register-page/register-page.component')
        .then(m => m.RegisterPageComponent),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/pages/login-page/login-page.component')
        .then(m => m.LoginPageComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/auth/pages/home-page/home-page-component')
        .then(m => m.HomePageComponent),
  },
  {
  path: 'boards',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./features/boards/pages/boards-page/boards-page.component')
      .then(m => m.BoardsPageComponent),
},
  {
  path: 'groups',
  canActivate: [authGuard],
  loadComponent: () =>
    import('./features/groups/pages/groups-page/groups-page.component')
      .then(m => m.GroupsPageComponent),
},
  { path: '**', redirectTo: '' },
];