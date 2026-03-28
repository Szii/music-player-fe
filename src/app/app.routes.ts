import { Routes } from '@angular/router';
import { authGuard } from './/core/auth/auth.guards';  // your existing guard

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
    path: '',
    loadComponent: () =>
      import('.//shared/components/shell/shell.component')
        .then(m => m.ShellComponent),
    canActivate: [authGuard],  
    children: [
      {
        path: '',
        loadComponent: () =>
          import('.//features/auth/pages/home-page/home-page-component')
            .then(m => m.HomePageComponent),
      },
      {
        path: 'boards',
        loadComponent: () =>
          import('./features/boards/pages/boards-page/boards-page.component')
            .then(m => m.BoardsPageComponent),
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
    ],
  },

  { path: '**', redirectTo: '' },
];