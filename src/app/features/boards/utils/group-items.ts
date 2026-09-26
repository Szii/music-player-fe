import { Board, Group, Track } from '../../../api/generated';

export interface PlaylistItemRef {
  trackId: string;
  windowId: string | null;
}

export function byGroupPosition(a: Track, b: Track): number {
  return (a.positionWithinGroup ?? 0) - (b.positionWithinGroup ?? 0);
}

/** Within a group, a track entry that stands in for one of its windows. */
export function isWindowItem(t: Track): boolean {
  return t.isWindow === true && t.windowId != null;
}

/** Distinguishes a whole-track entry from each of its window items. */
export function itemKeyOf(t: Track): string {
  return isWindowItem(t) ? `${t.id}::${t.windowId}` : `${t.id ?? ''}`;
}

export function itemRefKey(ref: PlaylistItemRef): string {
  return ref.windowId != null ? `${ref.trackId}::${ref.windowId}` : ref.trackId;
}

export function itemRefOf(t: Track): PlaylistItemRef {
  return { trackId: t.id ?? '', windowId: isWindowItem(t) ? t.windowId! : null };
}

/**
 * What a playlist board plays, in order: the selected group's items (whole tracks
 * and window items) by position, or the board's session tracks without a group.
 */
export function playlistItems(board: Board, groups: readonly Group[]): Track[] {
  const groupId = board.selectedGroup?.id;
  if (groupId == null) return board.availableTracks ?? [];
  const source = groups.find(group => group.id === groupId)?.tracks ?? board.selectedGroup?.tracks ?? [];
  return [...source].filter(item => item.id != null).sort(byGroupPosition);
}
