import { youtubeErrorReason } from './youtube-metadata.service';

describe('youtubeErrorReason', () => {
  // 101/150 is the case that bit us: a YouTube Music "art track" whose uploader
  // forbids embedded playback. It can never play here, so it must not be reported
  // as a generic "check the link" that invites a pointless retry.
  it('maps both embed-forbidden codes to embeddingDisabled', () => {
    expect(youtubeErrorReason(101)).toBe('embeddingDisabled');
    expect(youtubeErrorReason(150)).toBe('embeddingDisabled');
  });

  it('maps 100 to unavailable', () => {
    expect(youtubeErrorReason(100)).toBe('unavailable');
  });

  it('maps 2 to invalidId', () => {
    expect(youtubeErrorReason(2)).toBe('invalidId');
  });

  it('falls back to unknown for anything else', () => {
    expect(youtubeErrorReason(5)).toBe('unknown');
    expect(youtubeErrorReason(999)).toBe('unknown');
  });
});
