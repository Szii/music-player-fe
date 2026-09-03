import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { parseYoutubeId } from '../../shared/utils/youtube-id';

const SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';
const MAX_RESULTS = 12;

/** Marks which backend produced a page token, so paging stays on one source. */
const PIPED_TOKEN_PREFIX = 'piped:';
const DATA_API_TOKEN_PREFIX = 'yt:';

/** A video the user can pick when creating a track. */
export interface YoutubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationS: number;
  /** Pre-formatted `m:ss` / `h:mm:ss`, so templates stay logic-free. */
  durationLabel: string;
  /** Random offset the preview snippet starts at — stable per result. */
  previewStartS: number;
  /** Canonical watch URL, ready to drop into the track form. */
  link: string;
}

/** One page of hits, plus the token that fetches the next one. */
export interface YoutubeSearchPage {
  results: YoutubeSearchResult[];
  nextPageToken: string | null;
}

const EMPTY_PAGE: YoutubeSearchPage = { results: [], nextPageToken: null };

interface PipedSearchResponse {
  nextpage?: string | null;
  items?: {
    url?: string;
    type?: string;
    title?: string;
    thumbnail?: string;
    uploaderName?: string;
    /** Seconds; -1 for a live stream. */
    duration?: number;
  }[];
}

interface SearchResponse {
  nextPageToken?: string;
  items?: {
    id?: { videoId?: string };
    snippet?: {
      title?: string;
      channelTitle?: string;
      thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    };
  }[];
}

interface VideosResponse {
  items?: { id?: string; contentDetails?: { duration?: string } }[];
}

/** Turns an ISO-8601 video duration (`PT4M13S`) into seconds. */
export function parseIsoDurationS(iso: string | undefined): number {
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso ?? '');
  if (!match) return 0;

  const [, d, h, m, s] = match;
  return (
    Number(d ?? 0) * 86400 +
    Number(h ?? 0) * 3600 +
    Number(m ?? 0) * 60 +
    Number(s ?? 0)
  );
}

export function formatDurationLabel(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Picks where a preview snippet starts: somewhere in the middle of the video,
 * so the user hears the body of the track instead of the intro.
 */
export function randomPreviewStartS(durationS: number): number {
  if (durationS < 30) return 0;
  return Math.floor(durationS * (0.15 + Math.random() * 0.5));
}

/** YouTube titles come back HTML-escaped (`&amp;`, `&#39;`). */
function decodeHtml(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent ?? '';
}

function toResult(
  videoId: string,
  title: string,
  channelTitle: string,
  thumbnailUrl: string,
  durationS: number,
): YoutubeSearchResult {
  return {
    videoId,
    title,
    channelTitle,
    thumbnailUrl,
    durationS,
    durationLabel: formatDurationLabel(durationS),
    previewStartS: randomPreviewStartS(durationS),
    link: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

/**
 * Searches YouTube so a track can be added without hunting down a link first.
 *
 * Two sources, in order:
 * 1. A Piped instance — no key and no quota, and it returns durations and a
 *    paging token directly. Instances are volunteer-run and go down, hence:
 * 2. The official Data API v3, used only when Piped fails and a key is set. It
 *    is capped at 10,000 quota units/day and a search costs 100, so it is a
 *    safety net, not the primary path.
 *
 * The Data API key is a browser key and ships in the bundle; restrict it to this
 * app's origin (HTTP referrer) and to the YouTube Data API in the Google console.
 *
 * Piped results are not filtered by embeddability (the Data API's
 * `videoEmbeddable` filter has no equivalent). A non-embeddable pick fails on
 * save, where the metadata step already reports it.
 */
@Injectable({ providedIn: 'root' })
export class YoutubeSearchService {
  private readonly http = inject(HttpClient);

  private readonly pipedUrl = environment.pipedApiUrl.replace(/\/+$/, '');
  private readonly dataApiKey = environment.youtubeApiKey;

  /** False when neither source is configured — the UI hides the search tab then. */
  readonly available = this.pipedUrl.length > 0 || this.dataApiKey.length > 0;

  /**
   * Pages already fetched this session, keyed by `query|pageToken`. Live search
   * re-issues the same query constantly (backspace, retype, scroll back up), so
   * repeats are served from here.
   * ponytail: unbounded — entries are ~12 small objects; cap it if a session
   * ever holds enough queries to matter.
   */
  private readonly cache = new Map<string, YoutubeSearchPage>();

  /** `pageToken` empty fetches the first page; pass `nextPageToken` for more. */
  search(query: string, pageToken = ''): Observable<YoutubeSearchPage> {
    const trimmed = query.trim();
    if (!trimmed || !this.available) return of(EMPTY_PAGE);

    const cacheKey = `${trimmed}|${pageToken}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return of(cached);

    return this.fetch(trimmed, pageToken).pipe(
      tap(page => this.cache.set(cacheKey, page)),
    );
  }

  private fetch(query: string, pageToken: string): Observable<YoutubeSearchPage> {
    // Continuing a listing: stay on whichever source started it.
    if (pageToken.startsWith(DATA_API_TOKEN_PREFIX)) {
      return this.searchDataApi(query, pageToken.slice(DATA_API_TOKEN_PREFIX.length));
    }
    if (pageToken.startsWith(PIPED_TOKEN_PREFIX)) {
      return this.searchPiped(query, pageToken.slice(PIPED_TOKEN_PREFIX.length));
    }

    if (!this.pipedUrl) return this.searchDataApi(query, '');

    return this.searchPiped(query, '').pipe(
      catchError((error: unknown) =>
        this.dataApiKey ? this.searchDataApi(query, '') : throwError(() => error),
      ),
    );
  }

  private searchPiped(query: string, nextpage: string): Observable<YoutubeSearchPage> {
    const url = nextpage
      ? `${this.pipedUrl}/nextpage/search`
      : `${this.pipedUrl}/search`;

    const params = new HttpParams({
      fromObject: {
        q: query,
        filter: 'videos',
        ...(nextpage ? { nextpage } : {}),
      },
    });

    return this.http.get<PipedSearchResponse>(url, { params }).pipe(
      map(response => ({
        results: (response.items ?? []).flatMap(item => {
          // Piped returns a site-relative `/watch?v=…`.
          const videoId = parseYoutubeId(`https://www.youtube.com${item.url ?? ''}`);
          // duration -1 marks a live stream, which cannot be a track.
          if (!videoId || item.type !== 'stream' || !item.duration || item.duration < 0) {
            return [];
          }

          return [
            toResult(
              videoId,
              item.title ?? '',
              item.uploaderName ?? '',
              item.thumbnail ?? '',
              item.duration,
            ),
          ];
        }),
        nextPageToken: response.nextpage
          ? `${PIPED_TOKEN_PREFIX}${response.nextpage}`
          : null,
      })),
    );
  }

  private searchDataApi(query: string, pageToken: string): Observable<YoutubeSearchPage> {
    if (!this.dataApiKey) return of(EMPTY_PAGE);

    const params = new HttpParams({
      fromObject: {
        part: 'snippet',
        type: 'video',
        videoEmbeddable: 'true',
        maxResults: String(MAX_RESULTS),
        q: query,
        key: this.dataApiKey,
        ...(pageToken ? { pageToken } : {}),
      },
    });

    return this.http.get<SearchResponse>(SEARCH_URL, { params }).pipe(
      switchMap(response =>
        this.withDurations(response.items ?? []).pipe(
          map(results => ({
            results,
            nextPageToken: response.nextPageToken
              ? `${DATA_API_TOKEN_PREFIX}${response.nextPageToken}`
              : null,
          })),
        ),
      ),
    );
  }

  /**
   * The Data API search endpoint does not return durations, and a preview needs
   * one to pick a sensible random start. One extra batched call covers every hit.
   * (Piped returns durations inline, so this is Data-API-only.)
   */
  private withDurations(
    items: NonNullable<SearchResponse['items']>,
  ): Observable<YoutubeSearchResult[]> {
    const ids = items
      .map(item => item.id?.videoId)
      .filter((id): id is string => !!id);

    if (ids.length === 0) return of([]);

    const params = new HttpParams({
      fromObject: {
        part: 'contentDetails',
        id: ids.join(','),
        key: this.dataApiKey,
      },
    });

    return this.http.get<VideosResponse>(VIDEOS_URL, { params }).pipe(
      map(response => {
        const durations = new Map<string, number>(
          (response.items ?? []).map(item => [
            item.id ?? '',
            parseIsoDurationS(item.contentDetails?.duration),
          ]),
        );

        return items.flatMap(item => {
          const videoId = item.id?.videoId;
          if (!videoId) return [];

          const snippet = item.snippet;

          return [
            toResult(
              videoId,
              decodeHtml(snippet?.title ?? ''),
              decodeHtml(snippet?.channelTitle ?? ''),
              snippet?.thumbnails?.medium?.url ??
                snippet?.thumbnails?.default?.url ??
                '',
              durations.get(videoId) ?? 0,
            ),
          ];
        });
      }),
    );
  }
}
