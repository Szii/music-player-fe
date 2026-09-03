import {
  formatDurationLabel,
  parseIsoDurationS,
  randomPreviewStartS,
} from './youtube-search.service';

describe('youtube-search helpers', () => {
  it('parses ISO-8601 video durations', () => {
    expect(parseIsoDurationS('PT13S')).toBe(13);
    expect(parseIsoDurationS('PT4M13S')).toBe(253);
    expect(parseIsoDurationS('PT1H2M3S')).toBe(3723);
    expect(parseIsoDurationS('PT2H')).toBe(7200);
    expect(parseIsoDurationS('P1DT1H')).toBe(90000);
    expect(parseIsoDurationS(undefined)).toBe(0);
    expect(parseIsoDurationS('nonsense')).toBe(0);
  });

  it('formats durations', () => {
    expect(formatDurationLabel(9)).toBe('0:09');
    expect(formatDurationLabel(253)).toBe('4:13');
    expect(formatDurationLabel(3723)).toBe('1:02:03');
  });

  it('picks a preview start inside the video', () => {
    expect(randomPreviewStartS(20)).toBe(0);

    for (let i = 0; i < 50; i++) {
      const start = randomPreviewStartS(600);
      expect(start).toBeGreaterThanOrEqual(90);
      expect(start).toBeLessThan(600);
    }
  });
});
