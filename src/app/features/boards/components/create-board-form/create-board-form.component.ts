import { Component, EventEmitter, inject, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';

export interface CreateBoardEvent {
  name: string;
  selectedTrackId: number | null;
}

@Component({
  selector: 'app-create-board-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="card mb-4">
      <div class="card-body">
        <h2 class="h5 mb-3">Create board</h2>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <div class="mb-3">
            <label class="form-label">Board name</label>
            <input class="form-control" formControlName="name" type="text" />
          </div>

          <div class="mb-3">
            <label class="form-label">Current track</label>
            <select class="form-select" formControlName="selectedTrackId">
              <option [ngValue]="null">-- no track selected --</option>
              <option *ngFor="let track of tracks" [ngValue]="track.id">
                {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
              </option>
            </select>
          </div>

          <button
            class="btn btn-primary"
            type="submit"
            [disabled]="submitting"
          >
            {{ submitting ? 'Creating...' : 'Create board' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class CreateBoardFormComponent {
  private fb = inject(FormBuilder);

  @Input() tracks: Track[] = [];
  @Input() submitting = false;

  @Output() create = new EventEmitter<CreateBoardEvent>();

  form = this.fb.group({
    name: [''],
    selectedTrackId: [null as number | null],
  });

  onSubmit(): void {
    const { name, selectedTrackId } = this.form.getRawValue();
    this.create.emit({ name: name || '', selectedTrackId });
    this.form.reset({ name: '', selectedTrackId: null });
  }
}