import { Validators } from '@angular/forms';

import { FIELD_LIMITS } from '../../../shared/constants/field-limits';

/**
 * Mirrors `UserRegisterRequest.name` in the OpenAPI spec. Letters, digits, dot,
 * underscore and hyphen; must start and end with a letter or digit. Notably it
 * cannot contain `@`, so a username can never be mistaken for an email at login.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,28}[A-Za-z0-9]$/;

export const USERNAME_MIN_LENGTH = 3;

export const usernameValidators = [
  Validators.required,
  Validators.minLength(USERNAME_MIN_LENGTH),
  Validators.maxLength(FIELD_LIMITS.user.name),
  Validators.pattern(USERNAME_PATTERN),
];

/** Interpolation params every username message may reference. */
export const USERNAME_ERROR_PARAMS = {
  min: USERNAME_MIN_LENGTH,
  max: FIELD_LIMITS.user.name,
};

/**
 * The translation key covering every way a username can be malformed. Callers
 * translate it with `USERNAME_ERROR_PARAMS`; empty string means "no error".
 */
export function usernameErrorKey(control: { hasError(code: string): boolean }): string {
  if (control.hasError('required')) return 'validation.usernameRequired';
  if (control.hasError('minlength')) return 'validation.usernameMin';
  if (control.hasError('maxlength')) return 'validation.usernameMax';
  if (control.hasError('pattern')) return 'validation.usernamePattern';
  return '';
}
