import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { APP_VERSION } from '../../constants/app-version';
import { CONTACT_EMAIL } from '../../constants/contact';
import { LegalDialogService } from '../../features/legal-dialog/legal-dialog.service';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  readonly legalDialog = inject(LegalDialogService);
  readonly year = new Date().getFullYear();
  readonly version = APP_VERSION;
  readonly contactEmail = CONTACT_EMAIL;
}
