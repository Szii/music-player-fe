import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SHOW_EMAIL_INPUTS } from './feature-flags';

/**
 * Blocks the email-based account routes when {@link SHOW_EMAIL_INPUTS} is off,
 * redirecting to the login page.
 */
export const emailInputsGuard: CanActivateFn = () => {
  const router = inject(Router);

  return SHOW_EMAIL_INPUTS ? true : router.parseUrl('/login');
};
