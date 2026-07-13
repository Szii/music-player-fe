import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/features/toast/toast-container.component';
import { ConfirmDialogComponent } from './shared/features/confirm-dialog/confirm-dialog.component';
import { PromptDialogComponent } from './shared/features/prompt-dialog/prompt-dialog.component';
import { PromptDialogService } from './shared/features/prompt-dialog/prompt-dialog.service';
import { InfoDialogComponent } from './shared/features/info-dialog/info-dialog.component';
import { TutorialDialogComponent } from './features/tutorial/components/tutorial-dialog/tutorial-dialog.component';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    ToastContainerComponent,
    ConfirmDialogComponent,
    PromptDialogComponent,
    InfoDialogComponent,
    TutorialDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
})
export class AppComponent {
  private readonly promptDialog = inject(PromptDialogService);

  /**
   * Gates the `@defer` block around the prompt dialog. That dialog is the only
   * eager importer of the profanity validator, which pulls in the ~48 kB
   * `obscenity` dataset — deferring it keeps that out of the initial bundle, so a
   * visitor on the login page no longer downloads (and builds) a word list they
   * may never need. The chunk is prefetched on idle, so opening stays instant.
   */
  readonly isPromptOpen = computed(() => this.promptDialog.dialog() !== null);
}
