/**
 * Extracts the 11-character YouTube video id from a track link.
 *
 * Accepts the common URL shapes stored in `Track.trackLink`:
 * - https://www.youtube.com/watch?v=VIDEOID
 * - https://youtu.be/VIDEOID
 * - https://www.youtube.com/embed/VIDEOID
 * - https://www.youtube.com/shorts/VIDEOID
 * - a bare VIDEOID
 *
 * Returns `null` when no valid id can be found.
 */
export function parseYoutubeId(link: string | null | undefined): string | null {
  if (!link) {
    return null;
  }

  const trimmed = link.trim();

  // Bare id.
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  if (host === 'youtu.be') {
    return normalizeId(url.pathname.split('/').filter(Boolean)[0]);
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const vParam = url.searchParams.get('v');
    if (vParam) {
      return normalizeId(vParam);
    }

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.length >= 2 && ['embed', 'shorts', 'v', 'live'].includes(segments[0])) {
      return normalizeId(segments[1]);
    }
  }

  return null;
}

function normalizeId(candidate: string | undefined): string | null {
  if (!candidate) {
    return null;
  }

  return /^[a-zA-Z0-9_-]{11}$/.test(candidate) ? candidate : null;
}
