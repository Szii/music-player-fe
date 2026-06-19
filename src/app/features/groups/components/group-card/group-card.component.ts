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
  templateUrl: './group-card.component.html',
  styleUrl: './group-card.component.scss',
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