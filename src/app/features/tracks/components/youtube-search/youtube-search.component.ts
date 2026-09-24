import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, distinctUntilChanged, finalize, map, of, switchMap } from 'rxjs';
import {
  YoutubeSearchPage,
  YoutubeSearchResult,
  YoutubeSearchService,
} from '../../../../core/services/youtube-search.service';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { PreviewButtonComponent } from '../../../../shared/ui/preview-button/preview-button.component';
import { UiSearchBoxComponent } from '../../../../shared/ui/search-box/ui-search-box.component';

/** Below this, a query is too vague to spend a search request on. */
const MIN_QUERY_LENGTH = 3;
/** Long enough that a typed word does not fire a request per keystroke. */
const DEBOUNCE_MS = 450;
/** Distance from the bottom of the list that triggers the next page. */
const LOAD_MORE_THRESHOLD_PX = 120;

/**
 * Finds a YouTube video by keyword instead of by link. Results stream in as the
 * user types and extend on scroll; each hit can be previewed (a short snippet
 * from a random point) before it is picked.
 */
@Component({
  selector: 'app-youtube-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslocoPipe,
    NormalButtonComponent,
    PreviewButtonComponent,
    UiSearchBoxComponent,
  ],
  templateUrl: './youtube-search.component.html',
  styleUrl: './youtube-search.component.scss',
})
export class YoutubeSearchComponent {
  private readonly search = inject(YoutubeSearchService);
  private readonly destroyRef = inject(DestroyRef);

  readonly picked = output<YoutubeSearchResult>();

  private readonly searchBox = viewChild(UiSearchBoxComponent);

  focus(): void {
    this.searchBox()?.focus();
  }

  readonly query = signal('');
  readonly results = signal<readonly YoutubeSearchResult[]>([]);
  /** First page of a new query — replaces the list. */
  readonly loading = signal(false);
  /** Another page of the current query — appends to the list. */
  readonly loadingMore = signal(false);
  readonly failed = signal(false);
  /** A search has run at least once — separates "no hits" from "not searched". */
  readonly searched = signal(false);

  private readonly nextPageToken = signal<string | null>(null);
  /** The query the current results belong to, so paging cannot mix queries. */
  private readonly loadedQuery = signal('');

  readonly hasMore = computed(() => this.nextPageToken() !== null);

  constructor() {
    toObservable(this.query)
      .pipe(
        map(query => query.trim()),
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap(query => {
          this.reset();

          if (query.length < MIN_QUERY_LENGTH) return of(null);

          this.loading.set(true);
          return this.search.search(query).pipe(
            map(page => ({ query, page })),
            catchError(() => {
              this.failed.set(true);
              return of(null);
            }),
            finalize(() => this.loading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(result => {
        if (!result) return;

        this.loadedQuery.set(result.query);
        this.searched.set(true);
        this.apply(result.page, false);
      });
  }

  /**
   * ponytail: scroll-position check rather than an IntersectionObserver — the
   * list is one small scroll container, so there is nothing to gain from an
   * observer's extra wiring.
   */
  onResultsScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (remaining <= LOAD_MORE_THRESHOLD_PX) {
      this.loadMore();
    }
  }

  loadMore(): void {
    const token = this.nextPageToken();
    const query = this.loadedQuery();

    if (!token || !query || this.loading() || this.loadingMore()) return;

    this.loadingMore.set(true);
    this.failed.set(false);
    // Cleared up front so a scroll event mid-request cannot re-request the page.
    this.nextPageToken.set(null);

    this.search
      .search(query, token)
      .pipe(
        catchError(() => {
          this.failed.set(true);
          // Restore the token so the "load more" button comes back as a retry.
          this.nextPageToken.set(token);
          return of(null);
        }),
        finalize(() => this.loadingMore.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(page => {
        if (page) this.apply(page, true);
      });
  }

  private apply(page: YoutubeSearchPage, append: boolean): void {
    // YouTube can repeat a video across pages; @for keys on videoId, which must
    // stay unique.
    const existing = append ? this.results() : [];
    const seen = new Set(existing.map(result => result.videoId));

    this.results.set([
      ...existing,
      ...page.results.filter(result => !seen.has(result.videoId)),
    ]);
    this.nextPageToken.set(page.nextPageToken);
  }

  private reset(): void {
    this.results.set([]);
    this.nextPageToken.set(null);
    this.loadedQuery.set('');
    this.failed.set(false);
    this.searched.set(false);
  }
}
