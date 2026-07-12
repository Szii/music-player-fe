import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

import {
  AppLanguage,
  LANGUAGE_CHOICES,
  LanguageService,
} from '../../../core/services/language.service';
import { UiSelectComponent, UiSelectOption } from '../../ui/select/ui-select.component';

/** The language dropdown (flag + native name). Used on the profile and the auth pages. */
@Component({
  selector: 'app-language-select',
  imports: [UiSelectComponent, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-select.component.html',
  styleUrl: './language-select.component.scss',
})
export class LanguageSelectComponent {
  private readonly languages = inject(LanguageService);

  readonly options: UiSelectOption[] = LANGUAGE_CHOICES.map(choice => ({
    value: choice.value,
    label: choice.label,
    icon: choice.flag,
  }));

  readonly control = new FormControl<AppLanguage>(this.languages.language(), {
    nonNullable: true,
  });

  constructor() {
    this.control.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(language => this.languages.setLanguage(language));
  }
}
