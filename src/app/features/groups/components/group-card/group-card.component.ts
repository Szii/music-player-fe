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
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiCharCounterComponent } from '../../../../shared/ui/char-counter/ui-char-counter.component';
import {
  ActionMenuItem,
  UiActionMenuComponent,
} from '../../../../shared/ui/action-menu/ui-action-menu.component';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';

export interface RenameEvent {
  group: Group;
  newName: string;
}

@Component({
  selector: 'app-group-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NormalButtonComponent,
    UiDialogShellComponent,
    UiChipComponent,
    UiCharCounterComponent,
    UiActionMenuComponent,
  ],
  host: {
    role: 'listitem',
  },
  template: `
    <div class="group-card">
      <div class="group-card__header">
        <span class="group-card__title" [title]="displayName()">
          {{ displayName() }}
        </span>

        <div class="group-card__header-actions">
          <ui-chip
            class="group-card__count"
            [variant]="trackCount() > 0 ? 'success' : 'gold'"
            size="sm"
            shape="hex"
            [dot]="true"
          >
            {{ trackCountLabel() }}
          </ui-chip>

          <ui-action-menu
            [items]="menuItems()"
            [disabled]="updating()"
            [triggerLabel]="'Actions for ' + displayName()"
            (select)="onMenuSelect($event)"
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
            [maxlength]="nameMaxLength"
            (keydown.enter)="confirmRename()"
            (keydown.escape)="closeRename()"
          />
          <ui-char-counter [current]="editingName().length" [max]="nameMaxLength" />
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
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .group-card {
      display: block;
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      padding: 22px 24px 18px;
      border: 1px solid var(--app-border-color-soft);
      border-radius: var(--app-radius-md);
      background: var(--app-surface);
      box-shadow: var(--app-shadow-soft);
      overflow: hidden;
    }

    .group-card__header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 14px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .group-card__title {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      overflow-wrap: anywhere;
      font-weight: 700;
      font-size: 1.05rem;
      line-height: 1.25;
      color: var(--app-text);
    }

    .group-card__header-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .group-card__count {
      max-width: 100%;
      min-width: 0;
    }

    .rename-form {
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
      max-width: 100%;
    }

    /* Chip stays top-right with the title ellipsizing (same as the shared
       entity-list head), so the header needs no narrow-screen collapse. */
    @media (max-width: 640px) {
      .group-card {
        padding: 18px 20px;
      }

      .group-card__actions {
        margin-top: 16px;
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
  readonly nameMaxLength = FIELD_LIMITS.group.name;

  readonly trackCount = computed(() => this.group().tracks?.length ?? 0);

  readonly trackCountLabel = computed(() => {
    const count = this.trackCount();
    return `${count} track${count === 1 ? '' : 's'}`;
  });

  menuItems(): ActionMenuItem[] {
    const busy = this.updating();
    return [
      { id: 'tracks', label: 'Edit tracks', disabled: busy },
      { id: 'rename', label: 'Rename group', disabled: busy },
      { id: 'delete', label: 'Delete group', variant: 'danger', disabled: busy },
    ];
  }

  onMenuSelect(id: string): void {
    switch (id) {
      case 'tracks':
        this.editTracksRequested.emit(this.group());
        break;
      case 'rename':
        this.openRename();
        break;
      case 'delete':
        this.deleteRequested.emit(this.group());
        break;
    }
  }

  displayName(): string {
    const group = this.group();
    return group.listName || ('Group #' + group.id);
  }

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

    this.renameRequested.emit({
      group: this.group(),
      newName: name,
    });

    this.closeRename();
  }
}