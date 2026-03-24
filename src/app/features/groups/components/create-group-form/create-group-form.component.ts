import { Component, EventEmitter, Output, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { GroupRequest } from '../../../../api/generated';

@Component({
  selector: 'app-create-group-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="card mb-4">
      <div class="card-body">
        <h2 class="h5 mb-3">Create group</h2>
        <form [formGroup]="createForm" (ngSubmit)="submit()">
          <div class="mb-3">
            <label class="form-label">Group name</label>
            <input class="form-control" formControlName="listName" type="text" />
          </div>
          <button
            class="btn btn-primary"
            type="submit"
            [disabled]="submitting || !createForm.value.listName?.trim()"
          >
            {{ submitting ? 'Creating...' : 'Create group' }}
          </button>
        </form>
      </div>
    </div>
  `,
})
export class CreateGroupFormComponent {
  @Output() groupCreateRequested = new EventEmitter<GroupRequest>();

  private fb = inject(FormBuilder);

  submitting = false;

  createForm = this.fb.group({
    listName: [''],
  });

  submit(): void {
    const listName = this.createForm.value.listName?.trim();
    if (!listName) return;
    this.submitting = true;
    this.groupCreateRequested.emit({ listName });
  }

  reset(): void {
    this.createForm.reset({ listName: '' });
    this.submitting = false;
  }
}