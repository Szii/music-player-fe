import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DeviceCapabilitiesService } from '../../../core/services/device-capabilities.service';
import { NormalButtonComponent } from '../../ui/buttons/normal-button.component';
import { UiDialogShellComponent } from '../../ui/dialog-shell/ui-dialog-shell.component';
import { UiCharCounterComponent } from '../../ui/char-counter/ui-char-counter.component';
import { PromptDialogService } from './prompt-dialog.service';
import {
  PROFANITY_ERROR,
  hasProfanity,
} from '../../validators/profanity.validator';

@Component({
  selector: 'app-prompt-dialog',
  imports: [FormsModule, NormalButtonComponent, UiDialogShellComponent, UiCharCounterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:keydown.escape)': 'onEscape()',
  },
  templateUrl: './prompt-dialog.component.html',
  styleUrl: './prompt-dialog.component.scss',
})
export class PromptDialogComponent implements AfterViewChecked {
  readonly promptDialog = inject(PromptDialogService);
  readonly dialog = computed(() => this.promptDialog.dialog());
  readonly value = signal('');
  readonly profanityError = computed(() =>
    hasProfanity(this.value()) ? PROFANITY_ERROR : '',
  );
  readonly canSubmit = computed(
    () => this.value().trim().length > 0 && !this.profanityError(),
  );

  private readonly inputRef = viewChild<ElementRef<HTMLInputElement>>('inputEl');
  private readonly device = inject(DeviceCapabilitiesService);
  private needsFocus = false;

  constructor() {
    effect(() => {
      const dlg = this.promptDialog.dialog();
      if (dlg) {
        this.value.set(dlg.initialValue ?? '');
        this.needsFocus = true;
      } else {
        this.value.set('');
      }
    });
  }

  ngAfterViewChecked(): void {
    if (!this.needsFocus) return;
    // Only autofocus on precise-pointer devices (mouse/trackpad). On touch —
    // phones and tablets alike — this would pop the soft keyboard over the
    // dialog before the user has decided to type. Selecting the text only
    // matters when there's a keyboard anyway.
    if (!this.device.prefersAutoFocus()) {
      this.needsFocus = false;
      return;
    }
    const input = this.inputRef()?.nativeElement;
    if (!input) return;
    input.focus();
    input.select();
    this.needsFocus = false;
  }

  submit(): void {
    const trimmed = this.value().trim();
    if (!trimmed || this.profanityError()) return;
    this.promptDialog.submit(trimmed);
  }

  cancel(): void {
    this.promptDialog.cancel();
  }

  onEscape(): void {
    if (this.dialog()) {
      this.cancel();
    }
  }
}
