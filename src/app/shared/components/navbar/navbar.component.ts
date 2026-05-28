import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { SessionService } from '../../../core/auth/session.service';
import { BoardPlaybackService } from '../../../core/services/board-playback.service';
import { UserMenuComponent } from '../user-menu/user-menu.component';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, UserMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="app-navbar">
      <div class="app-navbar__inner">
        <div class="app-navbar__brand">
          <a
            routerLink="/"
            class="app-navbar__brand-link"
            (click)="closeMenu()"
          >
            DnD Music
          </a>
        </div>

        <button
          type="button"
          class="app-navbar__toggle"
          (click)="toggleMenu()"
          aria-label="Toggle navigation"
          [attr.aria-expanded]="menuOpen"
          [attr.aria-controls]="menuId"
        >
          ☰
        </button>

        <div
          [id]="menuId"
          class="app-navbar__content"
          [class.app-navbar__content--open]="menuOpen"
        >
          <div class="app-navbar__links">
            <a
              class="app-navbar__link"
              routerLink="/tracks"
              routerLinkActive="app-navbar__link--active"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="closeMenu()"
            >
              Tracks
            </a>

            <a
              class="app-navbar__link"
              routerLink="/boards"
              routerLinkActive="app-navbar__link--active"
              (click)="closeMenu()"
            >
              Boards
              @if (boardPlayback.isAnyPlaying()) {
                <span class="app-navbar__playing-dot" aria-label="Playing"></span>
              }
            </a>

            <a
              class="app-navbar__link"
              routerLink="/groups"
              routerLinkActive="app-navbar__link--active"
              (click)="closeMenu()"
            >
              Groups
            </a>

            <a
              class="app-navbar__link"
              routerLink="/workshop"
              routerLinkActive="app-navbar__link--active"
              (click)="closeMenu()"
            >
              Workshop
            </a>
          </div>

          <div class="app-navbar__actions">
            <app-user-menu (logout)="logout()" />
          </div>
        </div>
      </div>
    </nav>
  `,
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  private static nextMenuId = 0;

  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly boardPlayback = inject(BoardPlaybackService);

  readonly menuId = `app-navbar-menu-${NavbarComponent.nextMenuId++}`;

  menuOpen = false;

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  logout(): void {
    this.closeMenu();
    this.session.clear();
    void this.router.navigateByUrl('/login');
  }
}
