import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

import { LanguageSelectComponent } from '../../../../shared/components/language-select/language-select.component';
import { TutorialService } from '../../../tutorial/data-access/tutorial.service';

/**
 * Language picker and tutorial trigger for the signed-out pages, where there is
 * no navbar to hang them off.
 */
@Component({
  selector: 'app-auth-toolbar',
  imports: [LanguageSelectComponent, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-toolbar.component.html',
  styleUrl: './auth-toolbar.component.scss',
})
export class AuthToolbarComponent {
  readonly tutorial = inject(TutorialService);
}
