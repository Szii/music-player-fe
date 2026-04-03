import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiSelectComponent } from '../../../../shared/ui/select/ui-select.component';

export interface CreateBoardEvent {
  name: string;
  selectedTrackId: number | null;
}

@Component({
  selector: 'app-create-board-form',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiFormFieldComponent,
    UiTextInputComponent,
    NormalButtonComponent,
    IconButtonComponent,
    UiSelectComponent,
  ],
  template: `
        <app-icon-button
                        icon="plus"
                        label="Add board"
                        variant="primary"
                        size="lg"
                        (clicked)="open()"
                      />

    <div class="modal-backdrop" *ngIf="isOpen()" (click)="close()">
      <div
        class="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        (click)="$event.stopPropagation()"
      >
        <div class="modal__header">
          <h2 class="modal__title" id="modal-title">Create board</h2>
          <button class="modal__close" type="button" (click)="close()" aria-label="Close">
            ✕
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="modal__body">
          <ui-form-field label="Board name">
            <ui-text-input
              formControlName="name"
              placeholder="e.g. Tavern Ambience"
            />
          </ui-form-field>

          <div class="modal__field">
            <label class="app-form-label">Track</label>
            <ui-select
              [options]="trackOptions()"
              nullOption="— no track selected —"
              formControlName="selectedTrackId"
            />
          </div>

          <div class="modal__actions">
            <normal-button type="button" variant="secondary" (clicked)="close()">
              Cancel
            </normal-button>

            <normal-button
              type="submit"
              [disabled]="submitting()"
              [loading]="submitting()"
            >
              Create board
            </normal-button>
          </div>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse at center, rgba(88, 24, 13, 0.1), transparent 60%),
        linear-gradient(180deg, rgba(10, 5, 2, 0.6), rgba(10, 5, 2, 0.72));
      backdrop-filter: blur(3px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fade-in 0.15s ease;
    }

    @keyframes fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .modal {
      width: 100%;
      max-width: 440px;
      background: var(--app-parchment);
      border: 1px solid var(--app-border-color);
      border-top: 3px solid var(--app-primary);
      border-radius: var(--app-radius-lg);
      box-shadow:
        0 28px 72px rgba(8, 3, 1, 0.48),
        0 10px 30px rgba(8, 3, 1, 0.26),
        inset 0 0 0 3px rgba(201, 164, 76, 0.1);
      overflow: hidden;
      animation: slide-in 0.18s ease;
    }

    @keyframes slide-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid var(--app-border-color-soft);
      background: var(--app-header-surface);
      position: relative;
    }

    .modal__header::after {
      content: '';
      position: absolute;
      left: 20px;
      right: 20px;
      bottom: 0;
      height: 2px;
      border-radius: 999px;
      background: var(--app-divider-decor);
    }

    .modal__title {
      margin: 0;
      font-family: var(--app-font-heading);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--app-heading);
      text-shadow: 0 1px 2px rgba(88, 24, 13, 0.12);
    }

    .modal__close {
      width: 28px;
      height: 28px;
      border-radius: var(--app-radius-xs);
      border: 1px solid rgba(88, 24, 13, 0.12);
      background: transparent;
      color: var(--app-text-muted);
      font-size: 13px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .modal__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
      border-color: rgba(158, 24, 24, 0.22);
    }

    .modal__body {
      display: flex;
      flex-direction: column;
      gap: 16px;
      padding: 20px;
    }

    .modal__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .modal__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 4px;
    }
  `],
})
export class CreateBoardFormComponent {
  private readonly fb = inject(FormBuilder);

  readonly tracks = input<Track[]>([]);
  readonly submitting = input(false);

  readonly create = output<CreateBoardEvent>();

  readonly isOpen = signal(false);

  readonly trackOptions = computed(() =>
    this.tracks().map(t => ({
      label: t.trackName || t.trackOriginalName || ('Track #' + t.id),
      value: t.id,
    })),
  );

  readonly form = this.fb.group({
    name: this.fb.nonNullable.control(''),
    selectedTrackId: this.fb.control<number | null>(null),
  });

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
    this.form.reset({
      name: '',
      selectedTrackId: null,
    });
  }

  onSubmit(): void {
    const { name, selectedTrackId } = this.form.getRawValue();

    this.create.emit({
      name: name || '',
      selectedTrackId: selectedTrackId ?? null,
    });

    this.close();
  }
}