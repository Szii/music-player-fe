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
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';

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
    IconButtonComponent,
    UiChipComponent,
  ],
  host: {
    role: 'listitem',
  },
  template: `
    <div class="group-card">
      <div class="group-card__header">
        <div class="group-card__identity">
          <span class="group-card__title" [title]="displayName()">
            {{ displayName() }}
          </span>

          @if (tracksPreview(); as preview) {
            <span class="group-card__subtitle" [title]="preview">
              {{ preview }}
            </span>
          } @else {
            <span class="group-card__subtitle">
              No tracks assigned yet
            </span>
          }
        </div>

        <ui-chip
          class="group-card__count"
          [variant]="trackCount() > 0 ? 'success' : 'gold'"
          size="sm"
          shape="hex"
          [dot]="true"
        >
          {{ trackCountLabel() }}
        </ui-chip>
      </div>

      <div class="group-card__actions">
        <app-icon-button
          icon="tracks"
          label="Edit tracks"
          variant="primary"
          size="md"
          [disabled]="updating()"
          (clicked)="editTracksRequested.emit(group())"
        />

        <app-icon-button
          icon="edit"
          label="Rename group"
          variant="secondary"
          size="md"
          [disabled]="updating()"
          (clicked)="openRename()"
        />

        <app-icon-button
          icon="delete"
          label="Delete group"
          variant="danger"
          size="md"
          [disabled]="updating()"
          (clicked)="deleteRequested.emit(group())"
        />
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
      align-items: start;
      gap: 14px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .group-card__identity {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
    }

    .group-card__title {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 700;
      font-size: 1.05rem;
      line-height: 1.25;
      color: var(--app-text);
    }

    .group-card__subtitle {
      display: block;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.95rem;
      line-height: 1.35;
      color: var(--app-text-muted);
    }

    .group-card__count {
      justify-self: end;
      max-width: 100%;
      min-width: 0;
    }

    .group-card__actions {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
      margin-top: 18px;
      overflow: hidden;
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

  readonly trackCount = computed(() => this.group().tracks?.length ?? 0);

  readonly trackCountLabel = computed(() => {
    const count = this.trackCount();
    return `${count} track${count === 1 ? '' : 's'}`;
  });

  readonly tracksPreview = computed(() => {
    const groupTracks = this.group().tracks ?? [];

    if (groupTracks.length === 0) {
      return '';
    }

    const names = groupTracks
      .map(track => this.displayTrackName(track))
      .filter(Boolean);

    const visible = names.slice(0, 3).join(' · ');
    const remaining = names.length - 3;

    return remaining > 0
      ? `${visible} · +${remaining} more`
      : visible;
  });

  displayName(): string {
    return this.group().listName || ('Group #' + this.group().id);
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

  private displayTrackName(track: Track): string {
    return track.trackName || track.trackOriginalName || ('Track #' + track.id);
  }
}