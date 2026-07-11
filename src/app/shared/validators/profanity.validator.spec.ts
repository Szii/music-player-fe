import { FormControl } from '@angular/forms';
import { profanityValidator } from './profanity.validator';

describe('profanityValidator', () => {
  const check = (value: unknown) =>
    profanityValidator(new FormControl(value));

  it('passes clean and empty values', () => {
    expect(check('Tavern Ambience')).toBeNull();
    expect(check('')).toBeNull();
    expect(check(null)).toBeNull();
  });

  it('flags profanity, including obfuscated forms', () => {
    expect(check('what the fuck')).toEqual({ profanity: true });
    expect(check('sh1t happens')).toEqual({ profanity: true });
  });

  it('does not flag the Scunthorpe problem', () => {
    expect(check('Scunthorpe')).toBeNull();
  });
});
