import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';

import { Group, GroupRequest, Track } from '../../../../api/generated';

import { CreateGroupFormComponent } from '../../components/create-group-form/create-group-form.component';
import { GroupCardComponent, RenameEvent } from '../../components/group-card/group-card.component';
import {
  GroupTracksEditorComponent,
  GroupTracksSaveEvent,
} from '../../components/group-tracks-editor/group-tracks-editor.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import { GroupsStore } from '../../../../core/services/groups-store.service';
import { TracksStore } from '../../../../core/services/tracks-store.service';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiCreateCtaComponent } from '../../../../shared/ui/create-cta/ui-create-cta.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';
import { httpErrorMessage } from '../../../../shared/utils/http-error';

type GroupFilterMode = 'all' | 'empty' | 'withTracks';

type GroupSortMode =
  | 'nameAsc'
  | 'nameDesc'
  | 'tracksAsc'
  | 'tracksDesc';

@Component({
  selector: 'app-groups-page',
  imports: [
    CreateGroupFormComponent,
    GroupCardComponent,
    GroupTracksEditorComponent,
    UiAlertComponent,
    UiCreateCtaComponent,
    UiPageTitleComponent,
    UiListToolbarComponent,
    FooterComponent,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './groups-page.component.html',
  styleUrl: './groups-page.component.scss',
})
export class GroupsPageComponent implements OnInit {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  @ViewChild('createForm') createFormRef?: CreateGroupFormComponent;

  private readonly groupsStore = inject(GroupsStore);
  private readonly tracksStore = inject(TracksStore);
  private readonly toast = inject(ToastService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly groups = this.groupsStore.groups;
  readonly tracks = this.tracksStore.tracks;
  readonly loading = computed(() => this.groupsStore.loading() || this.tracksStore.loading());

  readonly errorMessage = computed(() => {
    if (this.groupsStore.failed()) return this.t('groups.err.load');
    if (this.tracksStore.ownFailed()) return this.t('stages.err.loadTracks');

    return '';
  });

  readonly updatingGroupId = signal<string | null>(null);

  private readonly editingGroupId = signal<string | null>(null);

  /** Derived from the store so the open editor always shows the saved tracks. */
  readonly editingGroup = computed<Group | null>(() => {
    const id = this.editingGroupId();
    if (id == null) return null;

    return this.groupsStore.groups().find(group => group.id === id) ?? null;
  });

  readonly search = signal('');
  readonly filterMode = persistentSignal<GroupFilterMode>('mpf:groups:filter', 'all');
  readonly sortMode = persistentSignal<GroupSortMode>('mpf:groups:sort', 'nameAsc');

  readonly filterOptions = [
    { label: this.t('groups.filter.all'), value: 'all' },
    { label: this.t('groups.withTracks'), value: 'withTracks' },
    { label: this.t('groups.filter.empty'), value: 'empty' },
  ];

  readonly sortOptions = [
    { label: this.t('sort.nameAsc'), value: 'nameAsc' },
    { label: this.t('sort.nameDesc'), value: 'nameDesc' },
    { label: this.t('sort.tracksAsc'), value: 'tracksAsc' },
    { label: this.t('sort.tracksDesc'), value: 'tracksDesc' },
  ];

  readonly filteredGroups = computed<Group[]>(() => {
    const query = this.search().trim().toLowerCase();
    const filter = this.filterMode();
    const sort = this.sortMode();

    const matching = this.groupsStore.groups().filter(group => {
      const trackCount = trackIdsOf(group).length;

      const matchesSearch =
        !query ||
        (group.listName ?? '').toLowerCase().includes(query) ||
        (group.tracks ?? []).some(track =>
          this.displayTrackName(track).toLowerCase().includes(query),
        );

      const matchesFilter =
        filter === 'all' ||
        (filter === 'empty' && trackCount === 0) ||
        (filter === 'withTracks' && trackCount > 0);

      return matchesSearch && matchesFilter;
    });

    return [...matching].sort((a, b) => compareGroups(a, b, sort));
  });

  ngOnInit(): void {
    forkJoin([this.groupsStore.load(), this.tracksStore.load()])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as GroupFilterMode);
  }

  setSortMode(value: unknown): void {
    this.sortMode.set(value as GroupSortMode);
  }

  createGroup(request: GroupRequest): void {
    this.groupsStore.create(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.createFormRef?.reset(),
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('groups.err.create') }));
          this.createFormRef?.reset();
        },
      });
  }

  async deleteGroup(group: Group): Promise<void> {
    if (group.id == null) return;

    const confirmed = await this.confirmDialog.confirm({
      title: this.t('groups.delete'),
      message: this.t('groups.deleteConfirm', { name: group.listName || group.id }),
      confirmText: this.t('common.delete'),
      cancelText: this.t('common.cancel'),
      variant: 'danger',
    });

    if (!confirmed) return;

    const groupId = group.id;
    this.updatingGroupId.set(groupId);

    this.groupsStore.remove(groupId)
      .pipe(
        finalize(() => this.updatingGroupId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          if (this.editingGroupId() === groupId) {
            this.closeTrackEditor();
          }

          this.toast.success(this.t('groups.msg.deleted'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('groups.err.delete') }));
        },
      });
  }

  renameGroup({ group, newName }: RenameEvent): void {
    if (group.id == null) return;

    this.saveGroup(group.id, { listName: newName, trackIds: trackIdsOf(group) }, false);
  }

  saveGroupTracks({ group, trackIds }: GroupTracksSaveEvent): void {
    if (group.id == null) return;

    this.saveGroup(group.id, { listName: group.listName ?? '', trackIds }, true);
  }

  openTrackEditor(group: Group): void {
    this.editingGroupId.set(group.id ?? null);
  }

  closeTrackEditor(): void {
    this.editingGroupId.set(null);
  }

  goToAddTrack(): void {
    this.closeTrackEditor();
    this.router.navigate(['/tracks']);
  }

  goToWorkshop(): void {
    this.closeTrackEditor();
    this.router.navigate(['/workshop']);
  }

  private saveGroup(
    groupId: string,
    request: GroupRequest,
    closeEditorOnSuccess: boolean,
  ): void {
    this.updatingGroupId.set(groupId);

    this.groupsStore.update(groupId, request)
      .pipe(
        finalize(() => this.updatingGroupId.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          if (closeEditorOnSuccess) {
            this.closeTrackEditor();
          }

          this.toast.success(this.t('groups.msg.updated'));
        },
        error: (err: unknown) => {
          console.error(err);
          this.toast.error(httpErrorMessage(err, { fallback: this.t('groups.err.update') }));
        },
      });
  }

  private displayTrackName(track: Track): string {
    return track.trackName || track.trackOriginalName || this.t('common.trackNum', { id: track.id });
  }
}

function trackIdsOf(group: Group): string[] {
  return (group.tracks ?? [])
    .map(track => track.id)
    .filter((id): id is string => id != null);
}

function compareGroups(a: Group, b: Group, sortMode: GroupSortMode): number {
  switch (sortMode) {
    case 'nameDesc':
      return compareNames(b.listName ?? '', a.listName ?? '');
    case 'tracksAsc':
      return trackIdsOf(a).length - trackIdsOf(b).length;
    case 'tracksDesc':
      return trackIdsOf(b).length - trackIdsOf(a).length;
    case 'nameAsc':
    default:
      return compareNames(a.listName ?? '', b.listName ?? '');
  }
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}
