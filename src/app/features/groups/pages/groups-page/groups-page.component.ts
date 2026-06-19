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
  template: `
    <div class="app-page group-page">
      <ui-page-title title="Groups" />

      <app-create-group-form
        #createForm
        [showTrigger]="groups.length > 0"
        (groupCreateRequested)="createGroup($event)"
      />

      @if (errorMessage) {
        <ui-alert variant="danger">
          {{ errorMessage }}
        </ui-alert>
      }

      @if (loading) {
        <div class="app-muted groups-page__loading">Loading...</div>
      } @else if (groups.length === 0) {
        <ui-create-cta
          label="Create your first group"
          (clicked)="createForm.open()"
        />
      } @else {
        <ui-list-toolbar
          [(search)]="search"
          searchPlaceholder="Search groups"
          [filterValue]="filterMode()"
          [filterOptions]="filterOptions"
          filterLabel="Filter"
          (filterValueChange)="setFilterMode($event)"
          [sortValue]="sortMode()"
          [sortOptions]="sortOptions"
          (sortValueChange)="setSortMode($event)"
          [filteredCount]="filteredGroups().length"
          [totalCount]="groups.length"
          itemLabel="group"
        />

        @if (filteredGroups().length > 0) {
          <div class="groups-list" role="list">
            @for (group of filteredGroups(); track group.id) {
              <app-group-card
                [group]="group"
                [tracks]="tracks"
                [updating]="updatingGroupId === group.id"
                (deleteRequested)="deleteGroup($event)"
                (renameRequested)="renameGroup($event)"
                (editTracksRequested)="openTrackEditor($event)"
              />
            }
          </div>
        } @else {
          <p class="app-empty-note">No groups match the current search or filter.</p>
        }
      }

      @if (editingGroup; as group) {
        <app-group-tracks-editor
          [group]="group"
          [tracks]="tracks"
          [saving]="updatingGroupId === group.id"
          (cancel)="closeTrackEditor()"
          (save)="saveGroupTracks($event)"
          (addTrack)="goToAddTrack()"
          (browseWorkshop)="goToWorkshop()"
        />
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    /* Match the tracks "+" trigger spacing; :has() keeps the gap off the
       empty state where the create CTA renders instead. */
    app-create-group-form:has(app-icon-button) {
      display: block;
      margin-bottom: var(--space-sm);
    }

    ui-list-toolbar {
      display: block;
      margin-bottom: 1rem;
    }

    .groups-page__loading {
      margin-top: 1rem;
    }

    /* Desktop: fluid card grid that uses the horizontal space. Collapses to a
       single column below md — the same breakpoint the tables switch at — so
       the page doesn't read as a mobile layout above 900px. */
    .groups-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 14px;
      margin: 0;
      padding: 0;
      /* Desktop: only the cards scroll; the title + create + toolbar stay
         pinned — the same internal-scroll approach the tables use. */
      max-height: calc(100dvh - 360px);
      overflow-y: auto;
      scrollbar-gutter: stable;
    }

    @media (max-width: 900px) {
      .groups-list {
        grid-template-columns: 1fr;
        /* Mobile: natural full-page scroll instead of a nested scroll area. */
        max-height: none;
        overflow: visible;
      }
    }
  `],
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