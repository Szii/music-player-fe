import { formatDuration } from './duration';

describe('formatDuration', () => {
  it('formats minutes and seconds', () => {
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(253)).toBe('4:13');
  });

  it('switches to hours from an hour up', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(14716)).toBe('4:05:16');
  });

  it('renders a dash when there is no value', () => {
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(null)).toBe('—');
  });
});
