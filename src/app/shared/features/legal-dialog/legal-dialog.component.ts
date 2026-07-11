import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { UiDialogShellComponent } from '../../ui/dialog-shell/ui-dialog-shell.component';
import { LegalContentComponent } from '../../components/legal-content/legal-content.component';
import { LegalDialogService } from './legal-dialog.service';

@Component({
  selector: 'app-legal-dialog',
  imports: [UiDialogShellComponent, LegalContentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-dialog.component.html',
  styleUrl: './legal-dialog.component.scss',
})
export class LegalDialogComponent {
  readonly legalDialog = inject(LegalDialogService);
}
