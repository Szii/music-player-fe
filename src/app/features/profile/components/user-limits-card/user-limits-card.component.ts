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
  templateUrl: './user-limits-card.component.html',
  styleUrl: './user-limits-card.component.scss',
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