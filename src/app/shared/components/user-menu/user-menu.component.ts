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
  template: `
    <div class="um" [class.um--open]="isOpen()">
      <button
        type="button"
        class="um__trigger"
        [attr.aria-expanded]="isOpen()"
        aria-haspopup="menu"
        aria-label="Open user menu"
        (click)="toggle()"
      >
        <span class="um__avatar" aria-hidden="true">{{ initial() }}</span>
        <span class="um__name">{{ displayName() }}</span>
        <span class="um__arrow" aria-hidden="true">
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.6"
              stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </button>

      @if (isOpen()) {
        <div class="app-popover-surface um__panel" role="menu">
          <a
            routerLink="/profile"
            class="app-popover-item"
            role="menuitem"
            (click)="onNavigate()"
          >
            <span class="um__item-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                stroke="currentColor" stroke-width="1.9"
                stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
            </span>
            User profile
          </a>

          <button
            type="button"
            class="app-popover-item app-popover-item--danger"
            role="menuitem"
            (click)="onLogout()"
          >
            <span class="um__item-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
                stroke="currentColor" stroke-width="1.9"
                stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
                <path d="M16 17l5-5-5-5" />
                <path d="M21 12H9" />
              </svg>
            </span>
            Log off
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: inline-flex;
      position: relative;
    }

    .um {
      position: relative;
      display: inline-flex;
    }

    .um__trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 2.3rem;
      padding: 0.3rem 0.7rem 0.3rem 0.35rem;
      border: 1px solid rgba(201, 164, 76, 0.85);
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0)),
        rgba(255, 255, 255, 0.03);
      color: #fff8ee;
      border-radius: var(--app-radius-sm);
      font-family: var(--app-font-heading);
      font-size: 0.82rem;
      letter-spacing: 0.04em;
      cursor: pointer;
      transition: background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .um__trigger:hover {
      background:
        linear-gradient(180deg, rgba(201, 164, 76, 0.14), rgba(201, 164, 76, 0.06)),
        rgba(255, 255, 255, 0.04);
      border-color: rgba(201, 164, 76, 1);
    }

    .um__trigger:focus-visible {
      outline: none;
      box-shadow:
        0 0 0 3px rgba(255, 228, 186, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .um--open .um__trigger {
      background:
        linear-gradient(180deg, rgba(201, 164, 76, 0.18), rgba(201, 164, 76, 0.08)),
        rgba(255, 255, 255, 0.04);
      border-color: rgba(201, 164, 76, 1);
    }

    .um__avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.7rem;
      height: 1.7rem;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--app-secondary) 0%, var(--app-secondary-hover) 100%);
      color: #2b1c0c;
      font-weight: 700;
      font-size: 0.9rem;
      text-transform: uppercase;
    }

    .um__name {
      max-width: 12ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .um__arrow {
      display: inline-flex;
      align-items: center;
      color: rgba(255, 248, 238, 0.85);
      transition: transform 0.18s ease;
    }

    .um--open .um__arrow {
      transform: rotate(180deg);
    }

    .um__panel {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 1100;
      min-width: 220px;
      padding: 0.35rem;
    }

    .um__panel .app-popover-item {
      border-radius: var(--app-radius-sm);
    }

    .um__item-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: currentColor;
    }

    @media (max-width: 900px) {
      /* In the slim top bar the trigger stays compact (avatar only) so it fits
         beside the brand; the panel anchors to the right edge and is clamped to
         the viewport so it never overflows. */
      .um__name {
        display: none;
      }

      .um__trigger {
        gap: 0.4rem;
        padding: 0.3rem 0.6rem;
      }

      .um__panel {
        right: 0;
        left: auto;
        min-width: 0;
        width: max-content;
        max-width: min(260px, calc(100vw - 20px));
      }
    }
  `],
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
