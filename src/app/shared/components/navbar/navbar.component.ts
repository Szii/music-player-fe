import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

import { SessionService } from '../../../core/auth/session.service';
import { BoardPlaybackService } from '../../../core/services/board-playback.service';
import { EnvironmentWarningsService } from '../../../core/services/environment-warnings.service';
import { UserMenuComponent } from '../user-menu/user-menu.component';

@Component({
  selector: 'app-navbar',
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, UserMenuComponent, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss'],
})
export class NavbarComponent {
  private readonly session = inject(SessionService);
  readonly boardPlayback = inject(BoardPlaybackService);
  readonly warnings = inject(EnvironmentWarningsService);

  logout(): void {
    this.session.logout();
  }
}
