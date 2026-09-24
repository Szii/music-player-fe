import {
  ChangeDetectionStrategy,
  Component,
  inject,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
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
import {
  profanityErrorMessage,
  hasProfanity,
} from '../../../../shared/validators/profanity.validator';

const PREVIEW_ITEMS = 3;

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
    TranslocoPipe,
  ],
  host: {
    role: 'listitem',
  },
  templateUrl: './group-card.component.html',
  styleUrl: './group-card.component.scss',
})
export class GroupCardComponent {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  readonly group = input.required<Group>();
  readonly tracks = input<Track[]>([]);
  readonly updating = input(false);
  readonly hasSession = input(false);
  readonly inSession = input(false);
  readonly showSessionBadge = input(true);

  readonly deleteRequested = output<Group>();
  readonly addToSessionRequested = output<Group>();
  readonly removeFromSessionRequested = output<Group>();
  readonly renameRequested = output<RenameEvent>();
  readonly editTracksRequested = output<Group>();

  readonly renameOpen = signal(false);
  readonly editingName = signal('');
  readonly renameError = computed(() =>
    hasProfanity(this.editingName()) ? profanityErrorMessage() : '',
  );
  readonly nameMaxLength = FIELD_LIMITS.group.name;

  readonly trackCount = computed(() => this.group().tracks?.length ?? 0);

  readonly preview = computed(() => {
    const items = [...(this.group().tracks ?? [])]
      .sort((a, b) => (a.positionWithinGroup ?? 0) - (b.positionWithinGroup ?? 0));
    if (items.length === 0) return this.t('groups.previewEmpty');

    const shown = items
      .slice(0, PREVIEW_ITEMS)
      .map(item => item.trackName || item.trackOriginalName || '—')
      .join(' · ');
    const rest = items.length - PREVIEW_ITEMS;
    return rest > 0 ? `${shown} ${this.t('groups.previewMore', { count: rest })}` : shown;
  });

  readonly trackCountLabel = computed(() => {
    const count = this.trackCount();
    return this.t('groups.trackCount', { count });
  });

  menuItems(): ActionMenuItem[] {
    const busy = this.updating();
    const items: ActionMenuItem[] = [
      { id: 'tracks', label: this.t('groups.editTracks'), disabled: busy },
      { id: 'rename', label: this.t('groups.rename'), disabled: busy },
    ];

    if (this.hasSession()) {
      items.push(
        this.inSession()
          ? { id: 'removeFromSession', label: this.t('scope.removeFromSession'), disabled: busy }
          : { id: 'addToSession', label: this.t('scope.addToSession'), disabled: busy },
      );
    }

    items.push({ id: 'delete', label: this.t('groups.delete'), variant: 'danger', disabled: busy });
    return items;
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
      case 'addToSession':
        this.addToSessionRequested.emit(this.group());
        break;
      case 'removeFromSession':
        this.removeFromSessionRequested.emit(this.group());
        break;
    }
  }

  displayName(): string {
    const group = this.group();
    return group.listName || this.t('common.groupNum', { id: group.id });
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
    if (!name || hasProfanity(name)) return;

    this.renameRequested.emit({
      group: this.group(),
      newName: name,
    });

    this.closeRename();
  }
}