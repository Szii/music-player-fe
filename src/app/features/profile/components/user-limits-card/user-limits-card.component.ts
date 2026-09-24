import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

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
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-limits-card.component.html',
  styleUrl: './user-limits-card.component.scss',
})
export class UserLimitsCardComponent {
  private readonly transloco = inject(TranslocoService);

  /** Read by `t()` so every label recomputes when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  readonly limits = input<UserLimits | null>(null);
  readonly trackNames = input<ReadonlyMap<string, string>>(new Map());
  readonly sessionNames = input<ReadonlyMap<string, string>>(new Map());

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate(key, params);
  }

  readonly rankLabel = computed(() => {
    const level = this.limits()?.level;
    if (level === UserRankLevel.Unrestricted) return this.t('profile.limits.rankUnrestricted');
    if (level === UserRankLevel.Normal) return this.t('profile.limits.rankNormal');
    return this.t('profile.limits.rankUnknown');
  });

  readonly isUnrestricted = computed(() => this.limits()?.level === UserRankLevel.Unrestricted);

  readonly quotas = computed<Quota[]>(() => {
    const l = this.limits();
    if (!l) return [];

    const out: Quota[] = [];

    if (l.groups) {
      out.push({
        label: this.t('profile.limits.groups'),
        used: l.groups.actualGroups ?? 0,
        max: l.groups.maxGroups ?? 0,
        reached: l.groups.groupLimitReached ?? false,
      });
    }

    if (l.tracks) {
      out.push({
        label: this.t('profile.limits.tracks'),
        used: l.tracks.actualTracks ?? 0,
        max: l.tracks.maxTracks ?? 0,
        reached: l.tracks.trackLimitReached ?? false,
      });
    }

    if (l.sessions) {
      out.push({
        label: this.t('profile.limits.sessions'),
        used: l.sessions.actualSessions ?? 0,
        max: l.sessions.maxSessions ?? 0,
        reached: l.sessions.sessionLimitReached ?? false,
      });
    }

    if (l.subscribes) {
      out.push({
        label: this.t('profile.limits.subscribedSessions'),
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
        const sessionId = b.sessionId as string;
        const sessionName = names.get(sessionId);

        return {
          key: `session:${sessionId}`,
          label: sessionName ?? this.t('profile.limits.sessionFallback', { id: sessionId }),
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
        const trackId = w.trackId as string;

        return {
          key: `id:${trackId}`,
          label: names.get(trackId) ?? this.t('profile.limits.trackFallback', { id: trackId }),
          used: w.actualTrackWindows ?? 0,
          max: w.maxTrackWindows ?? 0,
          reached: w.trackWindowsLimitReached ?? false,
        };
      });
  });
}