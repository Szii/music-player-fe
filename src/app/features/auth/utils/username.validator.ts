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

/** The single message covering every way a username can be malformed. */
export function usernameErrorMessage(control: {
  hasError(code: string): boolean;
}): string {
  if (control.hasError('required')) return 'Username is required.';
  if (control.hasError('minlength')) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters.`;
  }
  if (control.hasError('maxlength')) {
    return `Username must be at most ${FIELD_LIMITS.user.name} characters.`;
  }
  if (control.hasError('pattern')) {
    return 'Use letters, digits, dot, underscore or hyphen. Must start and end with a letter or digit.';
  }
  return '';
}
