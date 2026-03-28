import {
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Track } from '../../../../api/generated';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';

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
  ],
  template: `
    <!-- Trigger button — always visible -->
    <normal-button (clicked)="open()">+ New board</normal-button>

    <!-- Backdrop + dialog -->
    <div class="modal-backdrop" *ngIf="isOpen" (click)="onBackdropClick($event)">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">

        <div class="modal__header">
          <h2 class="modal__title" id="modal-title">Create board</h2>
          <button class="modal__close" (click)="close()" aria-label="Close">✕</button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="modal__body">

          <ui-form-field label="Board name">
            <ui-text-input formControlName="name" placeholder="e.g. Tavern Ambience" />
          </ui-form-field>

          <div class="modal__field">
            <label class="app-form-label">Track</label>
            <select class="app-input" formControlName="selectedTrackId">
              <option [ngValue]="null">-- no track selected --</option>
              <option *ngFor="let track of tracks" [ngValue]="track.id">
                {{ track.trackName || track.trackOriginalName || ('Track #' + track.id) }}
              </option>
            </select>
          </div>

          <div class="modal__actions">
            <normal-button type="button" variant="secondary" (clicked)="close()">
              Cancel
            </normal-button>
            <normal-button type="submit" [disabled]="submitting" [loading]="submitting">
              Create board
            </normal-button>
          </div>

        </form>

      </div>
    </div>
  `,
  styles: [`
    /* ── Backdrop ── */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.45);
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

    /* ── Dialog ── */
    .modal {
      width: 100%;
      max-width: 440px;
      background: var(--app-surface);
      border: var(--app-border);
      border-radius: 14px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      animation: slide-in 0.18s ease;
    }

    @keyframes slide-in {
      from { opacity: 0; transform: translateY(-12px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)     scale(1);    }
    }

    /* ── Header ── */
    .modal__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 20px 14px;
      border-bottom: var(--app-border);
    }

    .modal__title {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--app-text);
    }

    .modal__close {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: var(--app-text-muted);
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, color 0.15s;
    }

    .modal__close:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
    }

    /* ── Body ── */
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

    /* ── Actions ── */
    .modal__actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding-top: 4px;
    }
  `],
})
export class CreateBoardFormComponent {
  private fb = inject(FormBuilder);

  @Input() tracks: Track[] = [];
  @Input() submitting = false;

  @Output() create = new EventEmitter<CreateBoardEvent>();

  isOpen = false;

  form = this.fb.group({
    name: [''],
    selectedTrackId: [null as number | null],
  });

  open(): void {
    this.isOpen = true;
  }

  close(): void {
    this.isOpen = false;
    this.form.reset({ name: '', selectedTrackId: null });
  }

  onBackdropClick(event: MouseEvent): void {
    // Close only when clicking the backdrop itself, not the dialog.
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  onSubmit(): void {
    const { name, selectedTrackId } = this.form.getRawValue();
    this.create.emit({ name: name || '', selectedTrackId });
    this.close();
  }
}