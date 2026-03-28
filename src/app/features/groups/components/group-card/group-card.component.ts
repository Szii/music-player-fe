import {
  Component,
  EventEmitter,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Group, Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';

export interface RenameEvent {
  group: Group;
  newName: string;
}

@Component({
  selector: 'app-group-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NormalButtonComponent, UiDialogShellComponent],
  template: `
    <div class="group-card">
      <div class="group-card__header">
        <div class="group-card__identity">
          <span class="group-card__title">
            {{ group.listName || ('Group #' + group.id) }}
          </span>

          <span class="group-card__count">
            {{ trackCount }} track{{ trackCount === 1 ? '' : 's' }}
          </span>
        </div>

        <div class="group-card__actions">
          <normal-button
            type="button"
            variant="secondary"
            size="sm"
            [disabled]="updating"
            (clicked)="editTracksRequested.emit(group)"
          >
            Edit tracks
          </normal-button>

          <button
            type="button"
            class="group-card__icon-btn group-card__icon-btn--rename"
            (click)="openRename()"
            title="Rename"
          >
            ✎
          </button>

          <button
            type="button"
            class="group-card__icon-btn group-card__icon-btn--delete"
            (click)="deleteRequested.emit(group)"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>

      <ng-template #noTracksTpl>
        <div class="group-card__empty">
          No tracks assigned yet.
        </div>
      </ng-template>
    </div>

    <ui-dialog-shell
      *ngIf="renameOpen"
      title="Rename group"
      [showFooter]="true"
      (closed)="closeRename()"
    >
      <div class="rename-form">
        <label class="app-form-label">Group name</label>
        <input
          class="app-input"
          type="text"
          [(ngModel)]="editingName"
          placeholder="e.g. Combat Music"
          (keydown.enter)="confirmRename()"
          (keydown.escape)="closeRename()"
        />
      </div>

      <div dialog-footer>
        <normal-button type="button" variant="secondary" (clicked)="closeRename()">
          Cancel
        </normal-button>

        <normal-button
          type="button"
          [disabled]="!editingName.trim()"
          (clicked)="confirmRename()"
        >
          Save
        </normal-button>
      </div>
    </ui-dialog-shell>
  `,
  styles: [`
    :host {
      display: block;
    }

    .group-card {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 18px 20px;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 16px;
      box-shadow: var(--app-shadow);
    }

    .group-card__header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }

    .group-card__identity {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .group-card__title {
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--app-text);
      line-height: 1.2;
      word-break: break-word;
    }

    .group-card__count {
      font-size: 0.95rem;
      color: var(--app-text-muted);
    }

    .group-card__actions {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .group-card__icon-btn {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      border: 1px solid var(--app-border-color);
      background: var(--app-surface);
      color: var(--app-text-muted);
      font-size: 15px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 1;
      padding: 0;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .group-card__icon-btn--rename:hover {
      background: var(--app-primary-soft);
      border-color: var(--app-primary);
      color: var(--app-primary);
    }

    .group-card__icon-btn--delete {
      border-color: var(--app-danger-soft);
      color: var(--app-danger);
    }

    .group-card__icon-btn--delete:hover {
      background: var(--app-danger-soft);
      border-color: var(--app-danger);
    }

    .group-card__preview {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .group-card__preview-label {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--app-text-muted);
    }

    .group-card__empty {
      color: var(--app-text-muted);
      font-style: italic;
      font-size: 0.95rem;
    }

    .rename-form {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    @media (max-width: 700px) {
      .group-card {
        padding: 16px;
      }

      .group-card__header {
        flex-direction: column;
        align-items: stretch;
      }

      .group-card__actions {
        justify-content: flex-start;
      }
    }
  `],
})
export class GroupCardComponent {
  @Input({ required: true }) group!: Group;
  @Input() tracks: Track[] = [];
  @Input() updating = false;

  @Output() deleteRequested = new EventEmitter<Group>();
  @Output() renameRequested = new EventEmitter<RenameEvent>();
  @Output() editTracksRequested = new EventEmitter<Group>();

  renameOpen = false;
  editingName = '';

  get trackCount(): number {
    return this.group?.tracks?.length ?? 0;
  }

  get previewTrackNames(): string[] {
    return (this.group?.tracks ?? [])
      .slice(0, 3)
      .map(track => track.trackName || track.trackOriginalName || `Track #${track.id}`);
  }

  get remainingCount(): number {
    return Math.max(0, this.trackCount - this.previewTrackNames.length);
  }

  openRename(): void {
    this.editingName = this.group.listName ?? '';
    this.renameOpen = true;
  }

  closeRename(): void {
    this.renameOpen = false;
    this.editingName = '';
  }

  confirmRename(): void {
    const name = this.editingName.trim();
    if (!name) return;
    this.renameRequested.emit({ group: this.group, newName: name });
    this.closeRename();
  }
}