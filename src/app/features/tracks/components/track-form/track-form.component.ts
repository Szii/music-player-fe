import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { NormalButtonComponent } from '../../../../shared/ui/buttons/normal-button.component';
import { UiFormFieldComponent } from '../../../../shared/ui/form-field/ui-form-field.component';
import { UiTextInputComponent } from '../../../../shared/ui/text-input/ui-text-input.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiDialogShellComponent } from '../../../../shared/ui/dialog-shell/ui-dialog-shell.component';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import {
  profanityErrorMessage,
  hasProfanity,
  profanityValidator,
} from '../../../../shared/validators/profanity.validator';
import {
  YoutubeSearchResult,
  YoutubeSearchService,
} from '../../../../core/services/youtube-search.service';
import { YoutubeSearchComponent } from '../youtube-search/youtube-search.component';

export interface TrackFormEvent {
  trackName: string;
  trackLink: string;
}

/** How the user supplies the video: paste a link, or search YouTube. */
export type TrackLinkSource = 'link' | 'search';

@Component({
  selector: 'app-track-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    NormalButtonComponent,
    UiFormFieldComponent,
    UiTextInputComponent,
    IconButtonComponent,
    UiDialogShellComponent,
    YoutubeSearchComponent,
    TranslocoPipe,
  ],
  templateUrl: './track-form.component.html',
  styleUrl: './track-form.component.scss',
})
export class TrackFormComponent {
  private readonly transloco = inject(TranslocoService);

  /** Read by t() so labels recompute when the language changes. */
  private readonly activeLang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang(),
  });

  private t(key: string, params?: Record<string, unknown>): string {
    this.activeLang();
    return this.transloco.translate<string>(key, params);
  }

  private readonly fb = inject(FormBuilder);

  readonly editingTrackId = input<string | null>(null);
  readonly editTrackName = input('');
  readonly editTrackLink = input('');
  /** Disallow changing the link (track has windows or is published). */
  readonly lockTrackLink = input(false);
  readonly submitting = input(false);
  readonly showTrigger = input(true);

  readonly save = output<TrackFormEvent>();
  readonly cancel = output<void>();

  readonly isOpen = signal(false);

  readonly limits = FIELD_LIMITS.track;

  private readonly youtubeSearch = inject(YoutubeSearchService);

  readonly linkSource = signal<TrackLinkSource>('link');
  /** Searching only makes sense while creating, and only with a key configured. */
  readonly canSearch = computed(
    () => this.youtubeSearch.available && !this.isEditing(),
  );

  readonly isEditing = computed(() => this.editingTrackId() != null);
  readonly linkLocked = computed(() => this.isEditing() && this.lockTrackLink());
  readonly trackLinkMaxLength = computed(() =>
    this.isEditing() ? this.limits.linkUpdate : this.limits.linkCreate,
  );

  readonly form = this.fb.group({
    trackName: this.fb.nonNullable.control('', [profanityValidator]),
    trackLink: this.fb.nonNullable.control('', [Validators.required]),
  });

  private readonly trackNameValue = toSignal(
    this.form.controls.trackName.valueChanges,
    { initialValue: '' },
  );
  readonly trackNameError = computed(() =>
    hasProfanity(this.trackNameValue()) ? profanityErrorMessage() : '',
  );

  readonly trackLinkError = computed(() => {
    const control = this.form.controls.trackLink;
    if (!control.touched || !control.invalid) return '';
    if (control.hasError('required')) return this.t('tracks.linkRequired');
    return this.t('tracks.invalidValue');
  });

  constructor() {
    let previousEditingId: string | null | undefined = undefined;

    effect(() => {
      const currentEditingId = this.editingTrackId();

      if (currentEditingId != null && currentEditingId !== previousEditingId) {
        this.form.reset({
          trackName: this.editTrackName(),
          trackLink: this.editTrackLink(),
        });
        this.isOpen.set(true);
      }

      if (currentEditingId == null && previousEditingId != null) {
        this.form.reset({
          trackName: '',
          trackLink: '',
        });
        this.isOpen.set(false);
      }

      previousEditingId = currentEditingId;
    });

    // Lock/unlock the link control. A disabled control is excluded from
    // validation but still returned by getRawValue(), so the unchanged link is
    // submitted on save.
    effect(() => {
      const control = this.form.controls.trackLink;
      if (this.linkLocked()) {
        if (control.enabled) control.disable({ emitEvent: false });
      } else if (control.disabled) {
        control.enable({ emitEvent: false });
      }
    });
  }

  open(): void {
    if (this.isEditing()) return;
    this.isOpen.set(true);
  }

  setLinkSource(source: TrackLinkSource): void {
    this.linkSource.set(source);
  }

  /** Fills the form from a search hit and returns to the link view to confirm. */
  useSearchResult(result: YoutubeSearchResult): void {
    this.form.patchValue({
      trackLink: result.link,
      trackName:
        this.form.controls.trackName.value.trim() ||
        result.title.slice(0, this.limits.name),
    });
    this.linkSource.set('link');
  }

  close(): void {
    this.isOpen.set(false);
    this.linkSource.set('link');

    this.form.reset({
      trackName: '',
      trackLink: '',
    });

    if (this.isEditing()) {
      this.cancel.emit();
    }
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const { trackName, trackLink } = this.form.getRawValue();

    this.save.emit({
      trackName: trackName || '',
      trackLink: trackLink || '',
    });
  }

  resetForm(): void {
    this.form.reset({
      trackName: '',
      trackLink: '',
    });
  }
}