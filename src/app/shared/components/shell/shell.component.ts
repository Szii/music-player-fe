import { Component, HostListener, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';
import { BrowserWarningBannerComponent } from '../browser-warning-banner/browser-warning-banner.component';
import { BoardPlaybackService } from '../../../core/services/board-playback.service';
import { BrowserSupportService } from '../../../core/services/browser-support.service';
import { BoardsPageComponent } from '../../../features/boards/pages/boards-page/boards-page.component';
import { filter, skip } from 'rxjs';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, BoardsPageComponent, BrowserWarningBannerComponent],
  template: `
    <div class="app-shell">
      <app-navbar></app-navbar>

      @if (browserSupport.showWarning && browserSupport.bannerOpen()) {
        <app-browser-warning-banner (close)="browserSupport.closeBanner()" />
      }

      <main class="app-shell__main">
        <!-- Always kept alive so audio continues across navigation -->
        <app-boards-page [style.display]="isBoardsRoute() ? '' : 'none'"></app-boards-page>

        <!-- All other pages render here; hidden while on /boards so the stub is invisible -->
        <div [style.display]="isBoardsRoute() ? 'none' : ''">
          <router-outlet></router-outlet>
        </div>
      </main>
    </div>
  `,
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent {
  private readonly boardPlayback = inject(BoardPlaybackService);
  readonly browserSupport = inject(BrowserSupportService);
  readonly isBoardsRoute = signal(false);

  constructor() {
    const router = inject(Router);

    this.isBoardsRoute.set(router.url.startsWith('/boards'));

    // skip(1): first navigation is the initial load, ngOnInit already calls loadData().
    router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        skip(1),
      )
      .subscribe((e) => {
        const onBoards = e.urlAfterRedirects.startsWith('/boards');
        this.isBoardsRoute.set(onBoards);
        if (onBoards) {
          this.boardPlayback.refresh();
        }
      });
  }

  @HostListener('window:beforeunload')
  onUnload(): void {
    document.querySelectorAll<HTMLAudioElement>('audio').forEach((el) => {
      el.pause();
    });
    this.boardPlayback.stopAll();
  }
}
