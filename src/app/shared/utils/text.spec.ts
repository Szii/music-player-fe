import { truncateAtWord } from './text';

describe('truncateAtWord', () => {
  it('keeps text that already fits', () => {
    expect(truncateAtWord('Tavern Music', 40)).toBe('Tavern Music');
  });

  it('cuts at the last whole word and drops trailing separators', () => {
    expect(truncateAtWord('We are Alive! | Tavern Music for RPG & DnD | Medieval Folk Song', 40))
      .toBe('We are Alive! | Tavern Music for RPG');
  });

  it('hard-cuts a single word longer than the limit', () => {
    expect(truncateAtWord('Supercalifragilistic', 5)).toBe('Super');
  });
});
