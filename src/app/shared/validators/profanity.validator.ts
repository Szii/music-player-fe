import { AbstractControl, ValidationErrors } from '@angular/forms';
import { translate } from '@jsverse/transloco';
import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from 'obscenity';

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/** True when the text contains blocklisted profanity. */
export function hasProfanity(value: string): boolean {
  return !!value && matcher.hasMatch(value);
}

/** Reactive-forms wrapper. Returns `{ profanity: true }` on a match. */
export function profanityValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string') return null;
  return hasProfanity(value) ? { profanity: true } : null;
}

/** Translated on call, so it follows the active language. */
export function profanityErrorMessage(): string {
  return translate('validation.profanity');
}
