import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  MusicGroupsService,
  MusicTracksService,
  Group,
  GroupRequest,
  Track,
} from '../../../../api/generated';

import { CreateGroupFormComponent } from '../../components/create-group-form/create-group-form.component';
import { GroupCardComponent, TrackToggleEvent, RenameEvent } from '../../components/group-card/group-card.component';

@Component({
  selector: 'app-groups-page',
  standalone: true,
  imports: [CommonModule, RouterLink, CreateGroupFormComponent, GroupCardComponent],
  template: `
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <a routerLink="/" class="btn btn-outline-primary">Home</a>
      </div>

      <h1 class="mb-4">Groups</h1>

      <app-create-group-form
        #createForm
        (groupCreateRequested)="createGroup($event)"
      />

      <div *ngIf="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
      <div *ngIf="loading">Loading...</div>
      <div *ngIf="!loading && groups.length === 0" class="alert alert-info">No groups yet.</div>

      <div *ngIf="!loading" class="row g-3">
        <div class="col-12" *ngFor="let group of groups; trackBy: trackByGroupId">
          <app-group-card
            [group]="group"
            [tracks]="tracks"
            [updating]="updatingGroupId === group.id"
            (deleteRequested)="deleteGroup($event)"
            (renameRequested)="renameGroup($event)"
            (trackToggled)="onTrackToggle($event)"
          />
        </div>
      </div>
    </div>
  `,
})
export class GroupsPageComponent implements OnInit {
  @ViewChild('createForm') createFormRef?: CreateGroupFormComponent;

  private groupsApi = inject(MusicGroupsService);
  private tracksApi = inject(MusicTracksService);

  groups: Group[] = [];
  tracks: Track[] = [];
  loading = false;
  errorMessage = '';
  updatingGroupId: number | null = null;

  private ownTracks: Track[] = [];
  private subscribedTracks: Track[] = [];

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = '';

    let groupsDone = false;
    let tracksDone = false;
    let subscribedDone = false;

    const done = () => {
      if (groupsDone && tracksDone && subscribedDone) this.loading = false;
    };

    this.groupsApi.getUserGroups().subscribe({
      next: (data) => { this.groups = data ?? []; },
      error: (err) => { console.error(err); this.errorMessage = 'Loading groups failed.'; groupsDone = true; done(); },
      complete: () => { groupsDone = true; done(); },
    });

    this.tracksApi.getUserTracks().subscribe({
      next: (data) => { this.ownTracks = data ?? []; this.mergeTracks(); },
      error: (err) => { console.error(err); this.errorMessage = this.errorMessage || 'Loading tracks failed.'; tracksDone = true; done(); },
      complete: () => { tracksDone = true; done(); },
    });

    this.tracksApi.getUserSubscribedTracks().subscribe({
      next: (data) => { this.subscribedTracks = data ?? []; this.mergeTracks(); },
      error: (err) => { console.error(err); subscribedDone = true; done(); },
      complete: () => { subscribedDone = true; done(); },
    });
  }

  createGroup(req: GroupRequest): void {
    this.groupsApi.createGroup({ groupRequest: req }).subscribe({
      next: (created) => {
        this.groups = [...this.groups, created];
        this.createFormRef?.reset();
      },
      error: (err) => { console.error(err); alert('Creating group failed.'); this.createFormRef?.reset(); },
    });
  }

  deleteGroup(group: Group): void {
    if (group.id == null) return;
    if (!confirm(`Delete group "${group.listName || group.id}"?`)) return;

    const groupId = group.id;
    this.groupsApi.deleteGroup({ groupId }).subscribe({
      next: () => { this.groups = this.groups.filter(g => g.id !== groupId); },
      error: (err) => { console.error(err); alert('Deleting group failed.'); },
    });
  }

  renameGroup({ group, newName }: RenameEvent): void {
    if (group.id == null) return;
    const trackIds = this.getTrackIds(group);
    this.updateGroup(group.id, newName, trackIds);
  }

  onTrackToggle({ group, track, checked }: TrackToggleEvent): void {
    if (group.id == null || track.id == null) return;
    const currentIds = this.getTrackIds(group);
    const newIds = checked
      ? [...new Set([...currentIds, track.id])]
      : currentIds.filter(id => id !== track.id);
    this.updateGroup(group.id, group.listName ?? '', newIds);
  }

  trackByGroupId(_index: number, group: Group): number {
    return group.id ?? 0;
  }

  private updateGroup(groupId: number, listName: string, trackIds: number[]): void {
    this.updatingGroupId = groupId;
    const body: GroupRequest = { listName, trackIds };

    this.groupsApi.updateGroup({ groupId, groupRequest: body }).subscribe({
      next: (updated) => {
        this.groups = this.groups.map(g => g.id === groupId ? updated : g);
      },
      error: (err) => { console.error(err); alert('Updating group failed.'); },
      complete: () => { this.updatingGroupId = null; },
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
}