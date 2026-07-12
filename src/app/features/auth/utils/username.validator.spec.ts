import { USERNAME_PATTERN } from './username.validator';

describe('USERNAME_PATTERN', () => {
  const valid = ['abc', 'user', 'alice1', 'a.b_c-d', 'A1b', 'a'.repeat(30)];
  const invalid = [
    'ab',                 // 2 chars: the pattern's own floor is 3, matching minLength
    'A1',
    'a'.repeat(31),       // longer than 30
    'alice@example.com',  // an email can never pass as a username
    'has space',
    '.alice',             // leading separator
    'alice.',             // trailing separator
    '-alice',
    'alice-',
    '_alice',
    'ali!ce',
    '',
  ];

  for (const name of valid) {
    it(`accepts "${name}"`, () => expect(USERNAME_PATTERN.test(name)).toBe(true));
  }

  for (const name of invalid) {
    it(`rejects "${name}"`, () => expect(USERNAME_PATTERN.test(name)).toBe(false));
  }
});
