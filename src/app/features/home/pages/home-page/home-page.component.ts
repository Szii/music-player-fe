import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="home-page">

      <header class="home-hero">
        <div class="home-hero__ornament" aria-hidden="true">✦</div>
        <h1 class="home-hero__title">Sound Master's Lair</h1>
        <p class="home-hero__subtitle">
          Craft the perfect atmosphere for your adventures
        </p>
        <div class="home-hero__rule" aria-hidden="true"></div>
      </header>

      <nav class="home-nav" aria-label="Main navigation">
        <a routerLink="/tracks" class="home-card">
          <div class="home-card__glyph" aria-hidden="true">
            <svg class="home-card__icon" viewBox="0 0 24 24">
              <path d="M9 18V5l10-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="16" cy="16" r="3" />
            </svg>
          </div>
          <div class="home-card__body">
            <div class="home-card__title">Tracks</div>
            <div class="home-card__text">
              Manage your music library and define precise playback windows for each track.
            </div>
          </div>
          <div class="home-card__chevron" aria-hidden="true">›</div>
        </a>

        <a routerLink="/boards" class="home-card">
          <div class="home-card__glyph" aria-hidden="true">
            <svg class="home-card__icon" viewBox="0 0 24 24">
              <rect x="4" y="4" width="6" height="6" rx="1" />
              <rect x="14" y="4" width="6" height="6" rx="1" />
              <rect x="4" y="14" width="6" height="6" rx="1" />
              <rect x="14" y="14" width="6" height="6" rx="1" />
            </svg>
          </div>
          <div class="home-card__body">
            <div class="home-card__title">Boards</div>
            <div class="home-card__text">
              Play tracks live with seamless switching, windows replaying, volume control, and looping.
            </div>
          </div>
          <div class="home-card__chevron" aria-hidden="true">›</div>
        </a>

        <a routerLink="/groups" class="home-card">
          <div class="home-card__glyph" aria-hidden="true">
            <svg class="home-card__icon" viewBox="0 0 24 24">
              <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
            </svg>
          </div>
          <div class="home-card__body">
            <div class="home-card__title">Groups</div>
            <div class="home-card__text">
              Organize tracks into themed groups for quick access during sessions.
            </div>
          </div>
          <div class="home-card__chevron" aria-hidden="true">›</div>
        </a>

        <a routerLink="/workshop" class="home-card">
          <div class="home-card__glyph" aria-hidden="true">
            <svg class="home-card__icon" viewBox="0 0 24 24">
              <path d="M14.7 6.3a4.5 4.5 0 0 0-5.9 5.9L4 17v3h3l4.8-4.8a4.5 4.5 0 0 0 5.9-5.9l-3 3-3-3z" />
            </svg>
          </div>
          <div class="home-card__body">
            <div class="home-card__title">Workshop</div>
            <div class="home-card__text">
              Subscribe to tracks from other bards or publish your own compositions.
            </div>
          </div>
          <div class="home-card__chevron" aria-hidden="true">›</div>
        </a>
      </nav>

      <footer class="home-footer">
        <span class="home-footer__rule" aria-hidden="true">— ✦ —</span>
        <p class="home-footer__text">The stage is set. The torches are lit.</p>
      </footer>

    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    /* ── Page shell ──────────────────────────────────────────────────────────── */
    .home-page {
      max-width: 720px;
      margin: 0 auto;
      padding: 2rem 1rem 3rem;
      display: flex;
      flex-direction: column;
      gap: 2.5rem;
    }

    /* ── Hero ───────────────────────────────────────────────────────────────── */
    .home-hero {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }

    .home-hero__ornament {
      font-size: 1.6rem;
      color: var(--app-secondary);
      line-height: 1;
      filter: drop-shadow(0 0 8px rgba(201, 164, 76, 0.5));
    }

    .home-hero__title {
      margin: 0;
      font-family: var(--app-font-heading);
      font-size: clamp(1.75rem, 5vw, 2.8rem);
      font-weight: 700;
      letter-spacing: 0.05em;
      color: var(--app-heading);
      text-shadow:
        0 2px 4px rgba(88, 24, 13, 0.2),
        0 0 40px rgba(201, 164, 76, 0.12);
      line-height: 1.15;
    }

    .home-hero__subtitle {
      margin: 0;
      font-size: 1rem;
      color: var(--app-text-muted);
      font-style: italic;
      letter-spacing: 0.02em;
    }

    .home-hero__rule {
      width: 100%;
      max-width: 340px;
      height: 2px;
      border-radius: 999px;
      background: var(--app-divider-decor);
      margin-top: 0.25rem;
    }

    /* ── Nav cards ──────────────────────────────────────────────────────────── */
    .home-nav {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .home-card {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr) 28px;
      align-items: center;
      gap: 16px;
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
      color: inherit;
      text-decoration: none;
      transition:
        transform 0.14s ease,
        box-shadow 0.14s ease,
        border-color 0.14s ease;
    }

    .home-card:hover {
      transform: translateY(-2px);
      border-color: rgba(201, 164, 76, 0.7);
      box-shadow:
        var(--app-shadow-soft),
        0 0 0 1px rgba(201, 164, 76, 0.3),
        0 0 16px rgba(201, 164, 76, 0.1);
    }

    .home-card__glyph {
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--app-secondary);
      background: rgba(201, 164, 76, 0.1);
      border: 1px solid rgba(201, 164, 76, 0.3);
      border-radius: var(--app-radius-sm);
      flex-shrink: 0;
      line-height: 1;
    }

    .home-card__icon {
      width: 27px;
      height: 27px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.9;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .home-card__body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .home-card__title {
      font-family: var(--app-font-heading);
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: 0.03em;
      color: var(--app-heading);
      line-height: 1.2;
    }

    .home-card__text {
      font-size: 0.9rem;
      color: var(--app-text-muted);
      line-height: 1.45;
    }

    .home-card__chevron {
      font-size: 1.4rem;
      color: var(--app-secondary);
      opacity: 0.7;
      transition: transform 0.14s ease, opacity 0.14s ease;
      text-align: center;
      line-height: 1;
    }

    .home-card:hover .home-card__chevron {
      transform: translateX(3px);
      opacity: 1;
    }

    /* ── Footer flourish ────────────────────────────────────────────────────── */
    .home-footer {
      text-align: center;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .home-footer__rule {
      font-size: 1.1rem;
      color: var(--app-secondary);
      letter-spacing: 0.3em;
      opacity: 0.7;
    }

    .home-footer__text {
      margin: 0;
      font-family: var(--app-font-heading);
      font-size: 0.82rem;
      font-weight: 600;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--app-text-muted);
    }

    @media (max-width: 600px) {
      .home-page {
        padding: 1.25rem 0.75rem 2rem;
        gap: 2rem;
      }

      .home-card {
        grid-template-columns: 44px minmax(0, 1fr) 24px;
        gap: 12px;
        padding: 14px 16px;
      }

      .home-card__glyph {
        width: 44px;
        height: 44px;
      }

      .home-card__icon {
        width: 24px;
        height: 24px;
      }
    }
  `],
})
export class HomePageComponent {}