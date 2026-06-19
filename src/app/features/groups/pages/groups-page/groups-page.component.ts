import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';

import {
  MusicGroupsService,
  MusicTracksService,
  Group,
  GroupRequest,
  Track,
} from '../../../../api/generated';

import { CreateGroupFormComponent } from '../../components/create-group-form/create-group-form.component';
import { GroupCardComponent, RenameEvent } from '../../components/group-card/group-card.component';
import {
  GroupTracksEditorComponent,
  GroupTracksSaveEvent,
} from '../../components/group-tracks-editor/group-tracks-editor.component';
import { persistentSignal } from '../../../../shared/utils/persistent-signal';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiCreateCtaComponent } from '../../../../shared/ui/create-cta/ui-create-cta.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { UiListToolbarComponent } from '../../../../shared/ui/list-toolbar/ui-list-toolbar.component';
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
  standalone: true,
  imports: [
    CreateGroupFormComponent,
    GroupCardComponent,
    GroupTracksEditorComponent,
    UiAlertComponent,
    UiCreateCtaComponent,
    UiPageTitleComponent,
    UiListToolbarComponent,
  ],
  templateUrl: './groups-page.component.html',
  styleUrl: './groups-page.component.scss',
})
export class GroupsPageComponent implements OnInit {
  @ViewChild('createForm') createFormRef?: CreateGroupFormComponent;

  private groupsApi = inject(MusicGroupsService);
  private tracksApi = inject(MusicTracksService);
  private toast = inject(ToastService);
  private confirmDialog = inject(ConfirmDialogService);
  private router = inject(Router);

  groups: Group[] = [];
  tracks: Track[] = [];
  loading = false;
  errorMessage = '';
  updatingGroupId: number | null = null;
  editingGroup: Group | null = null;

  search = '';
  readonly filterMode = persistentSignal<GroupFilterMode>('mpf:groups:filter', 'all');
  readonly sortMode = persistentSignal<GroupSortMode>('mpf:groups:sort', 'nameAsc');

  readonly filterOptions = [
    { label: 'All groups', value: 'all' },
    { label: 'With tracks', value: 'withTracks' },
    { label: 'Empty', value: 'empty' },
  ];

  readonly sortOptions = [
    { label: 'Name A–Z', value: 'nameAsc' },
    { label: 'Name Z–A', value: 'nameDesc' },
    { label: 'Fewest tracks', value: 'tracksAsc' },
    { label: 'Most tracks', value: 'tracksDesc' },
  ];

  private ownTracks: Track[] = [];
  private subscribedTracks: Track[] = [];

  ngOnInit(): void {
    this.loadData();
  }

  setFilterMode(value: unknown): void {
    this.filterMode.set(value as GroupFilterMode);
  }

  setSortMode(value: unknown): void {
    this.sortMode.set(value as GroupSortMode);
  }

  filteredGroups(): Group[] {
    const query = this.search.trim().toLowerCase();
    const filter = this.filterMode();
    const sort = this.sortMode();

    const filtered = this.groups.filter(group => {
      const trackCount = this.getTrackIds(group).length;

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

    return [...filtered].sort((a, b) => this.compareGroups(a, b, sort));
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = '';

    let groupsDone = false;
    let tracksDone = false;
    let subscribedDone = false;

    const done = () => {
      if (groupsDone && tracksDone && subscribedDone) {
        this.loading = false;
      }
    };

    this.groupsApi.getUserGroups().subscribe({
      next: (data) => {
        this.groups = this.sortGroups(data ?? []);
      },
      error: (err) => {
        console.error(err);
        this.errorMessage = 'Loading groups failed.';
        groupsDone = true;
        done();
      },
      complete: () => {
        groupsDone = true;
        done();
      },
    });

    this.tracksApi.getUserTracks().subscribe({
      next: (data) => {
        this.ownTracks = data ?? [];
        this.mergeTracks();
      },
      error: (err) => {
        console.error(err);
        this.errorMessage ||= 'Loading tracks failed.';
        tracksDone = true;
        done();
      },
      complete: () => {
        tracksDone = true;
        done();
      },
    });

    this.tracksApi.getUserSubscribedTracks().subscribe({
      next: (data) => {
        this.subscribedTracks = data ?? [];
        this.mergeTracks();
      },
      error: (err) => {
        console.error(err);
        subscribedDone = true;
        done();
      },
      complete: () => {
        subscribedDone = true;
        done();
      },
    });
  }

  createGroup(req: GroupRequest): void {
    this.groupsApi.createGroup({ groupRequest: req }).subscribe({
      next: (created) => {
        this.groups = this.sortGroups([...this.groups, created]);
        this.createFormRef?.reset();
      },
      error: (err) => {
        console.error(err);
        this.toast.error(httpErrorMessage(err, { fallback: 'Creating group failed.' }));
        this.createFormRef?.reset();
      },
    });
  }

  async deleteGroup(group: Group): Promise<void> {
    if (group.id == null) return;

    const confirmed = await this.confirmDialog.confirm({
      title: 'Delete group',
      message: `Delete group "${group.listName || group.id}"?`,
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (!confirmed) return;

    const groupId = group.id;
    this.updatingGroupId = groupId;

    this.groupsApi.deleteGroup({ groupId }).subscribe({
      next: () => {
        this.groups = this.groups.filter(g => g.id !== groupId);

        if (this.editingGroup?.id === groupId) {
          this.editingGroup = null;
        }

        this.toast.success('Group deleted.');
      },
      error: (err) => {
        console.error(err);
        this.toast.error(httpErrorMessage(err, { fallback: 'Deleting group failed.' }));
      },
      complete: () => {
        this.updatingGroupId = null;
      },
    });
  }

  renameGroup({ group, newName }: RenameEvent): void {
    if (group.id == null) return;
    this.updateGroup(group.id, newName, this.getTrackIds(group), false);
  }

  openTrackEditor(group: Group): void {
    this.editingGroup = group;
  }

  closeTrackEditor(): void {
    this.editingGroup = null;
  }

  goToAddTrack(): void {
    this.closeTrackEditor();
    this.router.navigate(['/tracks']);
  }

  goToWorkshop(): void {
    this.closeTrackEditor();
    this.router.navigate(['/workshop']);
  }

  saveGroupTracks({ group, trackIds }: GroupTracksSaveEvent): void {
    if (group.id == null) return;
    this.updateGroup(group.id, group.listName ?? '', trackIds, true);
  }

  private updateGroup(
    groupId: number,
    listName: string,
    trackIds: number[],
    closeEditorOnSuccess: boolean,
  ): void {
    this.updatingGroupId = groupId;

    this.groupsApi.updateGroup({ groupId, groupRequest: { listName, trackIds } }).subscribe({
      next: (updated) => {
        this.groups = this.sortGroups(this.groups.map(g => g.id === groupId ? updated : g));

        if (this.editingGroup?.id === groupId) {
          this.editingGroup = updated;
        }

        if (closeEditorOnSuccess) {
          this.editingGroup = null;
        }

        this.toast.success('Group updated.');
      },
      error: (err) => {
        console.error(err);
        this.toast.error(httpErrorMessage(err, { fallback: 'Updating group failed.' }));
      },
      complete: () => {
        this.updatingGroupId = null;
      },
    });
  }

  private getTrackIds(group: Group): number[] {
    return (group.tracks ?? [])
      .map(t => t.id)
      .filter((id): id is number => id != null);
  }

  private mergeTracks(): void {
    const seen = new Set<number>();
    const merged: Track[] = [];

    for (const t of [...this.ownTracks, ...this.subscribedTracks]) {
      if (t.id != null && !seen.has(t.id)) {
        seen.add(t.id);
        merged.push(t);
      }
    }

    this.tracks = merged;
  }

  private sortGroups(groups: Group[]): Group[] {
    return [...groups].sort((a, b) => {
      const nameA = a.listName ?? '';
      const nameB = b.listName ?? '';
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }

  private compareGroups(a: Group, b: Group, sortMode: GroupSortMode): number {
    switch (sortMode) {
      case 'nameDesc':
        return this.compareStrings(b.listName ?? '', a.listName ?? '');
      case 'tracksAsc':
        return this.getTrackIds(a).length - this.getTrackIds(b).length;
      case 'tracksDesc':
        return this.getTrackIds(b).length - this.getTrackIds(a).length;
      case 'nameAsc':
      default:
        return this.compareStrings(a.listName ?? '', b.listName ?? '');
    }
  }

  private compareStrings(a: string, b: string): number {
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  }

  private displayTrackName(track: Track): string {
    return track.trackName || track.trackOriginalName || ('Track #' + track.id);
  }
}