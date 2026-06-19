import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProfileStore } from '../../../features/profile/data-access/profile-store.service';

@Component({
  selector: 'app-user-menu',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './user-menu.component.html',
  styleUrl: './user-menu.component.scss',
})
export class UserMenuComponent {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly store = inject(ProfileStore);

  readonly logout = output<void>();
  /** Emitted when a menu item navigates, so the parent nav can collapse. */
  readonly navigate = output<void>();

  readonly isOpen = signal(false);

  readonly displayName = computed(() => this.store.user()?.name ?? 'Account');

  readonly initial = computed(() => {
    const name = this.store.user()?.name;
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  });

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  constructor() {
    this.store.load();
  }

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  onNavigate(): void {
    this.close();
    this.navigate.emit();
  }

  onLogout(): void {
    this.close();
    this.logout.emit();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    if (this.host.nativeElement.contains(event.target as Node)) return;
    this.close();
  }

  onEscape(): void {
    if (this.isOpen()) this.close();
  }
}
