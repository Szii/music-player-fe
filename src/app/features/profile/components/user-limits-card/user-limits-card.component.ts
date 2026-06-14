import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { UserLimits, UserRankLevel } from '../../../../api/generated';

interface Quota {
  readonly label: string;
  readonly used: number;
  readonly max: number;
  readonly reached: boolean;
}

interface BoardRow {
  readonly key: string;
  readonly label: string;
  readonly used: number;
  readonly max: number;
  readonly reached: boolean;
}

interface WindowRow {
  readonly key: string;
  readonly label: string;
  readonly used: number;
  readonly max: number;
  readonly reached: boolean;
}

@Component({
  selector: 'app-user-limits-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="limits">
      <div class="limits__rank">
        <span class="limits__rank-label">Rank</span>
        <span class="limits__rank-value" [class.limits__rank-value--elite]="isUnrestricted()">
          {{ rankLabel() }}
        </span>
      </div>

      <ul class="limits__list">
        @for (q of quotas(); track q.label) {
          <li class="limits__row" [class.limits__row--reached]="q.reached">
            <span class="limits__row-label">{{ q.label }}</span>
            <span class="limits__row-value">
              {{ q.used }} / {{ q.max }}
            </span>
          </li>
        }
      </ul>

      @if (limits()) {
        <details class="limits__details" open>
          <summary class="limits__summary">
            Per-session board quotas ({{ perSessionBoards().length }})
          </summary>
          @if (perSessionBoards().length > 0) {
            <ul class="limits__list limits__list--scroll">
              @for (b of perSessionBoards(); track b.key) {
                <li class="limits__row" [class.limits__row--reached]="b.reached">
                  <span class="limits__row-label" [title]="b.label">{{ b.label }}</span>
                  <span class="limits__row-value">{{ b.used }} / {{ b.max }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="limits__empty">No active sessions yet.</p>
          }
        </details>

        <details class="limits__details">
          <summary class="limits__summary">
            Per-track window quotas ({{ perTrackWindows().length }})
          </summary>
          @if (perTrackWindows().length > 0) {
            <ul class="limits__list limits__list--scroll">
              @for (w of perTrackWindows(); track w.key) {
                <li class="limits__row" [class.limits__row--reached]="w.reached">
                  <span class="limits__row-label" [title]="w.label">{{ w.label }}</span>
                  <span class="limits__row-value">{{ w.used }} / {{ w.max }}</span>
                </li>
              }
            </ul>
          } @else {
            <p class="limits__empty">No tracks of your own yet.</p>
          }
        </details>
      }
    </div>
  `,
  styles: [`
    .limits {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .limits__rank {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }

    .limits__rank-label {
      font-family: var(--app-font-heading);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--app-text-muted);
    }

    .limits__rank-value {
      font-family: var(--app-font-heading);
      font-weight: 700;
      font-size: 1rem;
      color: var(--app-heading);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .limits__rank-value--elite {
      color: var(--app-secondary-hover);
    }

    .limits__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .limits__list--scroll {
      max-height: 280px;
      overflow-y: auto;
      padding-right: 0.25rem;
    }

    .limits__row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 1rem;
      padding: 0.45rem 0.75rem;
      border-radius: var(--app-radius-sm);
      background: rgba(88, 24, 13, 0.04);
    }

    .limits__row--reached {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }

    .limits__row-label {
      font-weight: 600;
      color: var(--app-heading);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .limits__row--reached .limits__row-label {
      color: var(--app-danger);
    }

    .limits__row-value {
      font-variant-numeric: tabular-nums;
      color: var(--app-text);
    }

    .limits__row--reached .limits__row-value {
      color: var(--app-danger);
      font-weight: 600;
    }

    .limits__details {
      border-top: 1px solid rgba(158, 98, 53, 0.18);
      padding-top: 0.75rem;
    }

    .limits__summary {
      cursor: pointer;
      color: var(--app-primary);
      font-family: var(--app-font-heading);
      font-size: 0.85rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      margin-bottom: 0.5rem;
    }

    .limits__empty {
      margin: 0;
      padding: 0.45rem 0.75rem;
      font-size: 0.9rem;
      font-style: italic;
      color: var(--app-text-muted);
    }
  `],
})
export class UserLimitsCardComponent {
  readonly limits = input<UserLimits | null>(null);
  readonly trackNames = input<ReadonlyMap<number, string>>(new Map());
  readonly sessionNames = input<ReadonlyMap<number, string>>(new Map());

  readonly rankLabel = computed(() => {
    const level = this.limits()?.level;
    if (level === UserRankLevel.Unrestricted) return 'Unrestricted';
    if (level === UserRankLevel.Normal) return 'Normal';
    return 'Unknown';
  });

  readonly isUnrestricted = computed(() => this.limits()?.level === UserRankLevel.Unrestricted);

  readonly quotas = computed<Quota[]>(() => {
    const l = this.limits();
    if (!l) return [];

    const out: Quota[] = [];

    if (l.groups) {
      out.push({
        label: 'Groups',
        used: l.groups.actualGroups ?? 0,
        max: l.groups.maxGroups ?? 0,
        reached: l.groups.groupLimitReached ?? false,
      });
    }

    if (l.tracks) {
      out.push({
        label: 'Tracks',
        used: l.tracks.actualTracks ?? 0,
        max: l.tracks.maxTracks ?? 0,
        reached: l.tracks.trackLimitReached ?? false,
      });
    }

    if (l.sessions) {
      out.push({
        label: 'Sessions',
        used: l.sessions.actualSessions ?? 0,
        max: l.sessions.maxSessions ?? 0,
        reached: l.sessions.sessionLimitReached ?? false,
      });
    }

    if (l.subscribes) {
      out.push({
        label: 'Subscribed tracks',
        used: l.subscribes.actualSubscribes ?? 0,
        max: l.subscribes.maxSubscribes ?? 0,
        reached: l.subscribes.subscribeLimitReached ?? false,
      });
    }

    return out;
  });

  readonly perSessionBoards = computed<BoardRow[]>(() => {
    const boards = this.limits()?.boards ?? [];
    const names = this.sessionNames();

    return boards
      .filter(b => b.sessionId != null)
      .map(b => {
        const sessionId = b.sessionId as number;
        const sessionName = names.get(sessionId);

        return {
          key: `session:${sessionId}`,
          label: sessionName ?? `Session #${sessionId}`,
          used: b.actualBoards ?? 0,
          max: b.maxBoards ?? 0,
          reached: b.boardLimitReached ?? false,
        };
      });
  });

  readonly perTrackWindows = computed<WindowRow[]>(() => {
    const windows = this.limits()?.windows ?? [];
    const names = this.trackNames();

    return windows
      .filter(w => w.trackId != null)
      .map(w => {
        const trackId = w.trackId as number;

        return {
          key: `id:${trackId}`,
          label: names.get(trackId) ?? `Track #${trackId}`,
          used: w.actualTrackWindows ?? 0,
          max: w.maxTrackWindows ?? 0,
          reached: w.trackWindowsLimitReached ?? false,
        };
      });
  });
}