import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Group, Track } from '../../../../api/generated';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';

export interface RenameEvent {
  group: Group;
  newName: string;
}

@Component({
  selector: 'app-group-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NormalButtonComponent, UiDialogShellComponent, IconButtonComponent],
  template: `
    <div class="group-card">
      <div class="group-card__header">
        <div class="group-card__identity">
          <span class="group-card__title">
            {{ group().listName || ('Group #' + group().id) }}
          </span>

          <span class="group-card__count">
            {{ trackCount() }} track{{ trackCount() === 1 ? '' : 's' }}
          </span>
        </div>

        <div class="group-card__actions">
          <app-icon-button
            icon="tracks"
            label="Edit tracks"
            variant="primary"
            size="md"
            (clicked)="editTracksRequested.emit(group())"
          />

          <app-icon-button
            icon="edit"
            label="Rename group"
            variant="secondary"
            size="md"
            (clicked)="openRename()"
          />

          <app-icon-button
            icon="delete"
            label="Delete group"
            variant="danger"
            size="md"
            (clicked)="deleteRequested.emit(group())"
          />
        </div>
      </div>
    </div>

    @if (renameOpen()) {
      <ui-dialog-shell
        title="Rename group"
        [showFooter]="true"
        (closed)="closeRename()"
      >
        <div class="rename-form">
          <label class="app-form-label">Group name</label>
          <input
            class="app-input"
            type="text"
            [ngModel]="editingName()"
            (ngModelChange)="editingName.set($event)"
            [ngModelOptions]="{ standalone: true }"
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
          [disabled]="!editingName().trim()"
          (clicked)="confirmRename()"
        >
          Save
        </normal-button>
      </ui-dialog-shell>
    }
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
  readonly group = input.required<Group>();
  readonly tracks = input<Track[]>([]);
  readonly updating = input(false);

  readonly deleteRequested = output<Group>();
  readonly renameRequested = output<RenameEvent>();
  readonly editTracksRequested = output<Group>();

  readonly renameOpen = signal(false);
  readonly editingName = signal('');

  readonly trackCount = computed(() => this.group().tracks?.length ?? 0);

  openRename(): void {
    this.editingName.set(this.group().listName ?? '');
    this.renameOpen.set(true);
  }

  closeRename(): void {
    this.renameOpen.set(false);
    this.editingName.set('');
  }

  confirmRename(): void {
    const name = this.editingName().trim();
    if (!name) return;
    this.renameRequested.emit({ group: this.group(), newName: name });
    this.closeRename();
  }
}
