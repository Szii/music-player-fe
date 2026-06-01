import { parseYoutubeId } from './youtube-id';

describe('parseYoutubeId', () => {
  it('parses a standard watch URL', () => {
    expect(parseYoutubeId('https://www.youtube.com/watch?v=9cQHRUobKYY')).toBe(
      '9cQHRUobKYY',
    );
  });

  it('parses a watch URL with extra query params', () => {
    expect(
      parseYoutubeId(
        'https://www.youtube.com/watch?v=9cQHRUobKYY&list=RD9cQHRUobKYY&start_radio=1',
      ),
    ).toBe('9cQHRUobKYY');
  });

  it('parses a youtu.be short URL', () => {
    expect(parseYoutubeId('https://youtu.be/9cQHRUobKYY')).toBe('9cQHRUobKYY');
  });

  it('parses embed and shorts URLs', () => {
    expect(parseYoutubeId('https://www.youtube.com/embed/9cQHRUobKYY')).toBe(
      '9cQHRUobKYY',
    );
    expect(parseYoutubeId('https://www.youtube.com/shorts/9cQHRUobKYY')).toBe(
      '9cQHRUobKYY',
    );
  });

  it('accepts a bare id', () => {
    expect(parseYoutubeId('9cQHRUobKYY')).toBe('9cQHRUobKYY');
  });

  it('returns null for non-YouTube or malformed input', () => {
    expect(parseYoutubeId('https://example.com/audio.mp3')).toBeNull();
    expect(parseYoutubeId('not a url')).toBeNull();
    expect(parseYoutubeId('')).toBeNull();
    expect(parseYoutubeId(null)).toBeNull();
    expect(parseYoutubeId(undefined)).toBeNull();
  });
});
