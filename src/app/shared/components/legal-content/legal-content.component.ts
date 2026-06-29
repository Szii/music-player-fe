import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * The Privacy & Terms prose. Presentational and self-contained so it can be
 * shown both on the /legal page and inside a dialog (e.g. from registration,
 * so the user never navigates away from the form).
 */
@Component({
  selector: 'app-legal-content',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-content.component.html',
  styleUrl: './legal-content.component.scss',
})
export class LegalContentComponent {}
