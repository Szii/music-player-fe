import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/features/toast/toast-container.component';
import { ConfirmDialogComponent } from './shared/features/confirm-dialog/confirm-dialog.component';
import { PromptDialogComponent } from './shared/features/prompt-dialog/prompt-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastContainerComponent, ConfirmDialogComponent, PromptDialogComponent],
  template: `
    <router-outlet />
    <app-toast-container />
    <app-confirm-dialog />
    <app-prompt-dialog />
  `,
})
export class AppComponent {}
