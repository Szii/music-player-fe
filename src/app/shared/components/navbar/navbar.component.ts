import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SessionService } from '../../../core/auth/session.service';
import { NormalButtonComponent } from '../../../shared/ui/buttons/normal-button.component';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, NormalButtonComponent],
  template: `
    <nav class="app-navbar">
      <div class="app-navbar__inner">
        <div class="app-navbar__brand">
          <a
            routerLink="/"
            class="app-navbar__brand-link"
            (click)="menuOpen = false"
          >
            DnD Music
          </a>
        </div>

        <button
          type="button"
          class="app-navbar__toggle"
          (click)="menuOpen = !menuOpen"
          aria-label="Toggle navigation"
          [attr.aria-expanded]="menuOpen"
        >
          ☰
        </button>

        <div
          class="app-navbar__content"
          [class.app-navbar__content--open]="menuOpen"
        >
          <div class="app-navbar__links">
            <a
              class="app-navbar__link"
              routerLink="/"
              routerLinkActive="app-navbar__link--active"
              [routerLinkActiveOptions]="{ exact: true }"
              (click)="menuOpen = false"
            >
              Home
            </a>

            <a
              class="app-navbar__link"
              routerLink="/boards"
              routerLinkActive="app-navbar__link--active"
              (click)="menuOpen = false"
            >
              Boards
            </a>

            <a
              class="app-navbar__link"
              routerLink="/groups"
              routerLinkActive="app-navbar__link--active"
              (click)="menuOpen = false"
            >
              Groups
            </a>

            <a
              class="app-navbar__link"
              routerLink="/workshop"
              routerLinkActive="app-navbar__link--active"
              (click)="menuOpen = false"
            >
              Workshop
            </a>
          </div>

          <div class="app-navbar__actions">
            <normal-button
              type="button"
              variant="secondary"
              size="sm"
              (clicked)="logout()"
            >
              Log off
            </normal-button>
          </div>
        </div>
      </div>
    </nav>
  `,
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  private session = inject(SessionService);
  private router = inject(Router);

  menuOpen = false;

  logout(): void {
    this.session.clear();
    void this.router.navigateByUrl('/login');
  }
}