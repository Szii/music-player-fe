import {
  ChangeDetectionStrategy,
  Component,
  inject,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  Group,
  GroupTrackRequest,
  Track,
  TrackWindow,
} from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { PreviewButtonComponent } from '../../../../shared/ui/preview-button/preview-button.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import { previewMidpointS as midpointS } from '../../../../shared/utils/preview';
import { formatDuration } from '../../../../shared/utils/duration';

export interface GroupTracksSaveEvent {
  group: Group;
  /** Ordered group items. Array order is the saved position. */
  items: GroupTrackRequest[];
}

type TrackFilterMode = 'all' | 'selected' | 'session';
type EditorMode = 'select' | 'arrange';

/** One ordered entry in the group: a whole track or one of its windows. */
interface EditorItem {
  /** Stable key: trackId, or `trackId:windowId` for a window item. */
  key: string;
  trackId: string;
  windowId: string | null;
  /** Per-group name the user typed; empty means "use the track/window own name". */
  name: string;
}

function itemKey(trackId: string, windowId: string | null): string {
  return windowId ? `${trackId}:${windowId}` : trackId;
}

@Component({
  selector: 'app-group-tracks-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NormalButtonComponent,
    IconButtonComponent,
    UiChipComponent,
    UiDialogShellComponent,
    UiListToolbarComponent,
    PreviewButtonComponent,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    TranslocoPipe,
  ],
  templateUrl: './group-tracks-editor.component.html',
  styleUrl: './group-tracks-editor.component.scss',
})
export class GroupTracksEditorComponent {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  readonly group = input.required<Group>();
  readonly tracks = input<Track[]>([]);
  readonly sessionTrackIds = input<ReadonlySet<string> | null>(null);
  readonly saving = input(false);

  readonly cancel = output<void>();
  readonly save = output<GroupTracksSaveEvent>();
  readonly addTrack = output<void>();

  readonly search = signal('');
  readonly filterMode = persistentSignal<TrackFilterMode>('mpf:groups:editor:filter', 'all');

  /** Which panel of the dialog is showing. */
  readonly mode = signal<EditorMode>('select');

  /** Ordered group items (membership + order + per-group names). */
  readonly items = signal<EditorItem[]>([]);

  private readonly selectedKeys = computed(
    () => new Set(this.items().map(item => item.key)),
  );

  private readonly selectedTrackIds = computed(
    () => new Set(this.items().map(item => item.trackId)),
  );

  readonly filterOptions = computed(() => [
    { label: this.t('common.all'), value: 'all' },
    { label: this.t('groups.selectedOnly'), value: 'selected' },
    ...(this.sessionTrackIds() != null
      ? [{ label: this.t('scope.inThisSession'), value: 'session' }]
      : []),
  ]);

  readonly effectiveFilterMode = computed<TrackFilterMode>(() => {
    const mode = this.filterMode();
    return mode === 'session' && this.sessionTrackIds() == null ? 'all' : mode;
  });

  readonly selectedCount = computed(() => this.items().length);

  readonly dialogSubtitle = computed(() => {
    const g = this.group();
    const name = g.listName || this.t('common.groupNum', { id: g.id });
    return this.t('groups.editorSubtitle', { name, count: this.selectedCount() });
  });

  readonly filteredTracks = computed(() => {
    const q = this.search().trim().toLowerCase();
    const mode = this.effectiveFilterMode();
    const selected = this.selectedTrackIds();
    const inSession = this.sessionTrackIds();

    return this.tracks().filter(track => {
      const matchesFilter =
        mode === 'all' ||
        (mode === 'selected' && track.id != null && selected.has(track.id)) ||
        (mode === 'session' && track.id != null && inSession != null && inSession.has(track.id));

      if (!matchesFilter) return false;
      if (!q) return true;

      const haystack = [track.trackName, track.trackOriginalName, track.owner?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  });

  constructor() {
    effect(() => {
      const g = this.group();
      this.tracks();
      this.resetFromGroup(g);
    });
  }

  // ── mode ────────────────────────────────────────────────────────────

  openArrange(): void {
    this.mode.set('arrange');
  }

  backToSelect(): void {
    this.mode.set('select');
  }

  // ── select view (membership) ────────────────────────────────────────

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as TrackFilterMode);
  }

  windowsOf(track: Track): TrackWindow[] {
    return [...(track.trackWindows ?? [])].sort(
      (a, b) => (a.positionWithinTrack ?? 0) - (b.positionWithinTrack ?? 0),
    );
  }

  isWholeSelected(track: Track): boolean {
    return track.id != null && this.selectedKeys().has(itemKey(track.id, null));
  }

  isWindowSelected(track: Track, win: TrackWindow): boolean {
    return (
      track.id != null &&
      win.id != null &&
      this.selectedKeys().has(itemKey(track.id, win.id))
    );
  }

  toggleWhole(track: Track, checked: boolean): void {
    if (track.id == null) return;
    if (checked) {
      this.appendItem(track.id, null);
    } else {
      this.removeItem(itemKey(track.id, null));
    }
  }

  toggleWindow(track: Track, win: TrackWindow, checked: boolean): void {
    if (track.id == null || win.id == null) return;
    if (checked) {
      this.appendItem(track.id, win.id);
    } else {
      this.removeItem(itemKey(track.id, win.id));
    }
  }

  selectAllFiltered(): void {
    this.items.update(current => {
      const keys = new Set(current.map(item => item.key));
      const next = [...current];

      for (const track of this.filteredTracks()) {
        if (track.id == null) continue;
        const key = itemKey(track.id, null);
        if (keys.has(key)) continue;
        keys.add(key);
        next.push({ key, trackId: track.id, windowId: null, name: '' });
      }

      return next;
    });
  }

  clearAll(): void {
    this.items.set([]);
  }

  // ── arrange view (rename + reorder) ─────────────────────────────────

  removeItem(key: string): void {
    this.items.update(current => current.filter(item => item.key !== key));
  }

  renameItem(key: string, name: string): void {
    this.items.update(current =>
      current.map(item => (item.key === key ? { ...item, name } : item)),
    );
  }

  drop(event: CdkDragDrop<EditorItem[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    this.items.update(current => {
      const next = [...current];
      moveItemInArray(next, event.previousIndex, event.currentIndex);
      return next;
    });
  }

  onHandleKeydown(item: EditorItem, event: KeyboardEvent): void {
    if (this.saving()) return;
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.moveItem(item.key, -1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.moveItem(item.key, 1);
    }
  }

  isWindow(item: EditorItem): boolean {
    return item.windowId != null;
  }

  typeLabel(item: EditorItem): string {
    return this.isWindow(item) ? this.t('groups.windowChip') : this.t('groups.wholeTrack');
  }

  parentName(item: EditorItem): string {
    if (!this.isWindow(item)) return '';
    const track = this.sourceTrack(item.trackId);
    return track ? this.displayName(track) : item.trackId;
  }

  /** Track link to preview for an item (its underlying track). */
  previewLink(item: EditorItem): string | null {
    return this.sourceTrack(item.trackId)?.trackLink ?? null;
  }

  /** Preview from the middle so the snippet lands in the meat of the track/window,
      not a quiet intro. A window item previews the middle of its own range. */
  previewStartS(item: EditorItem): number {
    const track = this.sourceTrack(item.trackId);
    if (item.windowId) {
      const win = track?.trackWindows?.find(w => w.id === item.windowId);
      if (win?.positionFrom != null && win.positionTo != null) {
        return Math.floor((win.positionFrom + win.positionTo) / 2);
      }
      return win?.positionFrom ?? 0;
    }
    return midpointS(track?.duration);
  }

  /** Middle of a whole track, for the select-view preview. */
  trackMidS(track: Track): number {
    return midpointS(track.duration);
  }

  itemNamePlaceholder(item: EditorItem): string {
    return this.ownName(item);
  }

  // ── save ────────────────────────────────────────────────────────────

  onSave(): void {
    const items = this.items().map<GroupTrackRequest>(item => {
      const trimmed = item.name.trim();
      // Only send a per-group name when it overrides the own name, so inherited
      // names stay inherited instead of becoming copies.
      const name = trimmed && trimmed !== this.ownName(item) ? trimmed : null;
      return { trackId: item.trackId, windowId: item.windowId, name };
    });

    this.save.emit({ group: this.group(), items });
  }

  // ── display helpers ─────────────────────────────────────────────────

  displayName(track: Track): string {
    return (
      track.trackName ||
      track.trackOriginalName ||
      this.t('common.trackNum', { id: track.id })
    );
  }

  formatDuration(seconds?: number): string {
    return formatDuration(seconds);
  }

  trackById(_index: number, track: Track): string | number {
    return track.id ?? _index;
  }

  windowById(_index: number, win: TrackWindow): string | number {
    return win.id ?? _index;
  }

  itemById(_index: number, item: EditorItem): string {
    return item.key;
  }

  // ── internals ───────────────────────────────────────────────────────

  private moveItem(key: string, direction: 1 | -1): void {
    this.items.update(current => {
      const index = current.findIndex(item => item.key === key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;

      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  private appendItem(trackId: string, windowId: string | null): void {
    const key = itemKey(trackId, windowId);
    this.items.update(current =>
      current.some(item => item.key === key)
        ? current
        : [...current, { key, trackId, windowId, name: '' }],
    );
  }

  private sourceTrack(trackId: string): Track | undefined {
    return this.tracks().find(track => track.id === trackId);
  }

  /** The track's (or window's) own name — placeholder and override baseline. */
  private ownName(item: EditorItem): string {
    const track = this.sourceTrack(item.trackId);
    if (!track) return '';

    if (item.windowId) {
      const win = (track.trackWindows ?? []).find(w => w.id === item.windowId);
      return win?.name?.trim() || this.t('windows.untitled');
    }

    return this.displayName(track);
  }

  private resetFromGroup(group: Group): void {
    const items = [...(group.tracks ?? [])]
      .sort((a, b) => (a.positionWithinGroup ?? 0) - (b.positionWithinGroup ?? 0))
      .flatMap<EditorItem>(track => {
        if (track.id == null) return [];
        const windowId = track.windowId ?? null;
        return [
          {
            key: itemKey(track.id, windowId),
            trackId: track.id,
            windowId,
            // In a group response, trackName is the effective (per-group or own) name.
            name: track.trackName ?? '',
          },
        ];
      });

    this.items.set(items);
    this.search.set('');
    this.mode.set('select');
  }
}
