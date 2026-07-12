import { Injectable, signal } from '@angular/core';

export type AppLanguage = 'en' | 'cs';

export interface LanguageChoice {
  value: AppLanguage;
  label: string;
  flag: string;
}

export const LANGUAGE_CHOICES: readonly LanguageChoice[] = [
  { value: 'en', label: 'English', flag: 'flags/gb.svg' },
  { value: 'cs', label: 'Čeština', flag: 'flags/cz.svg' },
];

const STORAGE_KEY = 'app.language';
const DEFAULT_LANGUAGE: AppLanguage = 'en';

function isAppLanguage(value: string | null): value is AppLanguage {
  return value === 'en' || value === 'cs';
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly stored = localStorage.getItem(STORAGE_KEY);
  private readonly _language = signal<AppLanguage>(
    isAppLanguage(this.stored) ? this.stored : DEFAULT_LANGUAGE,
  );

  readonly language = this._language.asReadonly();

  setLanguage(language: AppLanguage): void {
    this._language.set(language);
    localStorage.setItem(STORAGE_KEY, language);
  }
}
