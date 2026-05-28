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
import {IconButtonComponent} from "../../../../shared/ui/buttons/ui-icon-button.component"

export interface RenameEvent {
  group: Group;
  newName: string;
}

@Component({
  selector: 'app-group-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, NormalButtonComponent, UiDialogShellComponent, IconButtonComponent],
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

        <app-icon-button
              icon="tracks"
              label=" Edit tracks"
              variant="primary"
              size="md"
              (click)="editTracksRequested.emit(group)"
            />

        <app-icon-button
              icon="edit"
              label=" Rename group"
              variant="secondary"
              size="md"
              (click)="openRename()"
            />

          <app-icon-button
              icon="delete"
              label="Delete group"
              variant="danger"
              size="md"
              (click)="deleteRequested.emit(group)"
            />

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

      <normal-button dialog-footer type="button" variant="secondary" (clicked)="closeRename()">
        Cancel
      </normal-button>

      <normal-button
        dialog-footer
        type="button"
        [disabled]="!editingName.trim()"
        (clicked)="confirmRename()"
      >
        Save
      </normal-button>
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
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      background:
        linear-gradient(90deg,
          transparent 0%,
          rgba(201, 164, 76, 0.55) 12%,
          #58180d 30%,
          rgba(201, 164, 76, 0.9) 50%,
          #58180d 70%,
          rgba(201, 164, 76, 0.55) 88%,
          transparent 100%
        ) top / 100% 3px no-repeat,
        var(--app-parchment);
      box-shadow: var(--app-shadow-soft);
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
      font-family: var(--app-font-heading);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: var(--app-heading);
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
      width: 36px;
      height: 36px;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-elevated);
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