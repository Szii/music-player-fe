import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CONTACT_EMAIL } from '../../constants/contact';

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
export class LegalContentComponent {
  readonly contactEmail = CONTACT_EMAIL;
}
