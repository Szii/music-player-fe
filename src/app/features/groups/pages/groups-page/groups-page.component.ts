import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  MusicGroupsService,
  MusicTracksService,
  Group,
  GroupRequest,
  Track,
} from '../../../../api/generated';

@Component({
  selector: 'app-groups-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <a routerLink="/" class="btn btn-outline-primary">Home</a>
      </div>

      <h1 class="mb-4">Groups</h1>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="h5 mb-3">Create group</h2>
          <form [formGroup]="createForm" (ngSubmit)="createGroup()">
            <div class="mb-3">
              <label class="form-label">Group name</label>
              <input class="form-control" formControlName="listName" type="text" />
            </div>
            <button
              class="btn btn-primary"
              type="submit"
              [disabled]="creating || !createForm.value.listName?.trim()"
            >
              {{ creating ? 'Creating...' : 'Create group' }}
            </button>
          </form>
        </div>
      </div>

      <div *ngIf="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>
      <div *ngIf="loading">Loading...</div>
      <div *ngIf="!loading && groups.length === 0" class="alert alert-info">No groups yet.</div>

      <div *ngIf="!loading" class="row g-3">
        <div class="col-12" *ngFor="let group of groups; trackBy: trackByGroupId">
          <div class="card">
            <div class="card-body">

              <div class="d-flex justify-content-between align-items-start mb-3">
                <div>
                  <div *ngIf="editingGroupId !== group.id">
                    <h2 class="h5 mb-0">{{ group.listName || ('Group #' + group.id) }}</h2>
                  </div>
                  <div *ngIf="editingGroupId === group.id" class="d-flex gap-2 align-items-center">
                    <input
                      class="form-control form-control-sm"
                      style="width: 200px;"
                      [value]="editingName"
                      (input)="editingName = $any($event.target).value"
                      (keydown.enter)="saveRename(group)"
                      (keydown.escape)="cancelRename()"
                    />
                    <button class="btn btn-sm btn-outline-success" (click)="saveRename(group)">Save</button>
                    <button class="btn btn-sm btn-outline-secondary" (click)="cancelRename()">Cancel</button>
                  </div>
                </div>
                <div class="d-flex gap-2">
                  <button
                    *ngIf="editingGroupId !== group.id"
                    class="btn btn-outline-secondary btn-sm"
                    (click)="startRename(group)"
                  >Rename</button>
                  <button
                    class="btn btn-outline-danger btn-sm"
                    (click)="deleteGroup(group)"
                  >Delete</button>
                </div>
              </div>

              <div *ngIf="tracks.length > 0">
                <strong class="d-block mb-2">Tracks:</strong>
                <div *ngFor="let track of tracks" class="form-check">
                  <input
                    class="form-check-input"
                    type="checkbox"
                    [id]="'g' + group.id + '-t' + track.id"
                    [checked]="isTrackInGroup(group, track)"
                    (change)="onTrackToggle(group, track, $any($event.target).checked)"
                    [disabled]="updatingGroupId === group.id"
                  />
                  <label class="form-check-label" [for]="'g' + group.id + '-t' + track.id">
                    {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
                  </label>
                </div>
              </div>
              <div *ngIf="tracks.length === 0" class="text-muted small">
                No tracks available. Create some tracks first.
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class GroupsPageComponent implements OnInit {
  private fb = inject(FormBuilder);
  private groupsApi = inject(MusicGroupsService);
  private tracksApi = inject(MusicTracksService);

  groups: Group[] = [];
  tracks: Track[] = [];
  loading = false;
  errorMessage = '';
  creating = false;

  private ownTracks: Track[] = [];
  private subscribedTracks: Track[] = [];

  editingGroupId: number | null = null;
  editingName = '';
  updatingGroupId: number | null = null;

  createForm = this.fb.group({
    listName: [''],
  });

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.errorMessage = '';

    let groupsDone = false;
    let tracksDone = false;
    let subscribedDone = false;
    const done = () => { if (groupsDone && tracksDone && subscribedDone) this.loading = false; };

    this.groupsApi.getUserGroups().subscribe({
      next: (data) => { this.groups = data ?? []; },
      error: (err) => { console.error('getUserGroups failed', err); this.errorMessage = 'Loading groups failed.'; groupsDone = true; done(); },
      complete: () => { groupsDone = true; done(); },
    });

    this.tracksApi.getUserTracks().subscribe({
      next: (data) => { this.ownTracks = data ?? []; this.mergeTracks(); },
      error: (err) => { console.error('getUserTracks failed', err); this.errorMessage = this.errorMessage || 'Loading tracks failed.'; tracksDone = true; done(); },
      complete: () => { tracksDone = true; done(); },
    });

    this.tracksApi.getUserSubscribedTracks().subscribe({
      next: (data) => { this.subscribedTracks = data ?? []; this.mergeTracks(); },
      error: (err) => { console.error('getUserSubscribedTracks failed', err); subscribedDone = true; done(); },
      complete: () => { subscribedDone = true; done(); },
    });
  }

  createGroup(): void {
    const listName = this.createForm.value.listName?.trim();
    if (!listName) return;

    this.creating = true;
    const body: GroupRequest = { listName };

    this.groupsApi.createGroup({ groupRequest: body }).subscribe({
      next: (created) => {
        console.log('createGroup response', created);
        this.createForm.reset({ listName: '' });
        this.groups = [...this.groups, created];
      },
      error: (err) => { console.error('createGroup failed', err); alert('Creating group failed.'); },
      complete: () => { this.creating = false; },
    });
  }

  deleteGroup(group: Group): void {
    if (group.id == null) return;
    if (!confirm(`Delete group "${group.listName || group.id}"?`)) return;

    const groupId = group.id;
    this.groupsApi.deleteGroup({ groupId }).subscribe({
      next: () => { this.groups = this.groups.filter(g => g.id !== groupId); },
      error: (err) => { console.error('deleteGroup failed', err); alert('Deleting group failed.'); },
    });
  }

  startRename(group: Group): void {
    this.editingGroupId = group.id ?? null;
    this.editingName = group.listName ?? '';
  }

  cancelRename(): void {
    this.editingGroupId = null;
    this.editingName = '';
  }

  saveRename(group: Group): void {
    if (group.id == null) return;
    const newName = this.editingName.trim();
    if (!newName) return;

    const groupId = group.id;
    const trackIds = this.getTrackIds(group);

    this.updateGroup(groupId, newName, trackIds, () => this.cancelRename());
  }

  isTrackInGroup(group: Group, track: Track): boolean {
    if (!group.tracks || track.id == null) return false;
    return group.tracks.some(t => t.id === track.id);
  }

  onTrackToggle(group: Group, track: Track, checked: boolean): void {
    if (group.id == null || track.id == null) return;

    const groupId = group.id;
    const currentIds = this.getTrackIds(group);
    let newIds: number[];

    if (checked) {
      if (currentIds.includes(track.id)) return;
      newIds = [...currentIds, track.id];
    } else {
      newIds = currentIds.filter(id => id !== track.id);
    }

    this.updateGroup(groupId, group.listName ?? '', newIds);
  }

  private updateGroup(groupId: number, listName: string, trackIds: number[], onSuccess?: () => void): void {
    this.updatingGroupId = groupId;
    const body: GroupRequest = { listName, trackIds };

    console.log('updateGroup request', { groupId, body });

    this.groupsApi.updateGroup({ groupId, groupRequest: body }).subscribe({
      next: (updated) => {
        console.log('updateGroup response', updated);
        this.groups = this.groups.map(g => g.id === groupId ? updated : g);
        onSuccess?.();
      },
      error: (err) => {
        console.error('updateGroup failed', err);
        alert('Updating group failed. Check console for details.');
      },
      complete: () => { this.updatingGroupId = null; },
    });
  }

  trackByGroupId(_index: number, group: Group): number {
    return group.id ?? 0;
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