import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';

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
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { UiEmptyStateComponent } from '../../../../shared/ui/empty-state/ui-empty-state.component';
import { UiPageTitleComponent } from '../../../../shared/ui/page-title/ui-page-title.component';
import { ToastService } from '../../../../shared/features/toast/toast.service';
import { ConfirmDialogService } from '../../../../shared/features/confirm-dialog/confirm-dialog.service';

@Component({
  selector: 'app-groups-page',
  standalone: true,
  imports: [
    CommonModule,
    CreateGroupFormComponent,
    GroupCardComponent,
    GroupTracksEditorComponent,
    UiAlertComponent,
    UiEmptyStateComponent,
    UiPageTitleComponent,
  ],
  template: `
    <div class="app-page group-page">
      <ui-page-title title="Groups" />

      <app-create-group-form
        #createForm
        (groupCreateRequested)="createGroup($event)"
      />

      <ui-alert *ngIf="errorMessage" variant="danger">
        {{ errorMessage }}
      </ui-alert>

      <div *ngIf="loading" class="app-muted groups-page__loading">Loading...</div>

      <ui-empty-state
        *ngIf="!loading && groups.length === 0"
        title="No groups yet"
        message="Create your first group to get started."
      />

      <div *ngIf="!loading && groups.length > 0" class="groups-list-wrap">
        <div class="groups-list">
          <app-group-card
            *ngFor="let group of groups; trackBy: trackByGroupId"
            [group]="group"
            [tracks]="tracks"
            [updating]="updatingGroupId === group.id"
            (deleteRequested)="deleteGroup($event)"
            (renameRequested)="renameGroup($event)"
            (editTracksRequested)="openTrackEditor($event)"
          />
        </div>
      </div>

      <app-group-tracks-editor
        *ngIf="editingGroup"
        [group]="editingGroup"
        [tracks]="tracks"
        [saving]="updatingGroupId === editingGroup.id"
        (cancel)="closeTrackEditor()"
        (save)="saveGroupTracks($event)"
      />
    </div>
  `,
  styles: [`
    :host {
      display: block;
      --groups-list-max-height: min(58dvh, 720px);
    }

    .groups-page__loading {
      margin-top: 1rem;
    }

    .groups-list-wrap {
      margin-top: 1.25rem;
      max-height: var(--groups-list-max-height);
      overflow-y: auto;
      overflow-x: hidden;
      padding-right: 4px;
    }

    .groups-list {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    @media (max-width: 860px) {
      :host {
        --groups-list-max-height: min(52dvh, 640px);
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

  groups: Group[] = [];
  tracks: Track[] = [];
  loading = false;
  errorMessage = '';
  updatingGroupId: number | null = null;
  editingGroup: Group | null = null;

  private ownTracks: Track[] = [];
  private subscribedTracks: Track[] = [];

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = '';

    let groupsDone = false, tracksDone = false, subscribedDone = false;
    const done = () => {
      if (groupsDone && tracksDone && subscribedDone) this.loading = false;
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
        alert('Creating group failed.');
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
      this.toast.error('Deleting group failed.');
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

  saveGroupTracks({ group, trackIds }: GroupTracksSaveEvent): void {
    if (group.id == null) return;
    this.updateGroup(group.id, group.listName ?? '', trackIds, true);
  }

  trackByGroupId(_: number, group: Group): number {
    return group.id ?? 0;
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
      },
      error: (err) => {
        console.error(err);
        alert('Updating group failed.');
      },
      complete: () => {
        this.updatingGroupId = null;
      },
    });
  }

  private getTrackIds(group: Group): number[] {
    return (group.tracks ?? []).map(t => t.id).filter((id): id is number => id != null);
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
}