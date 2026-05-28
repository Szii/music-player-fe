import { AbstractControl, ValidationErrors } from '@angular/forms';

export function matchPasswords(
  passwordKey: string = 'password',
  confirmKey: string = 'confirm',
) {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get(passwordKey)?.value;
    const confirm = control.get(confirmKey)?.value;
    if (!password || !confirm) return null;
    return password === confirm ? null : { passwordMismatch: true };
  };
}
