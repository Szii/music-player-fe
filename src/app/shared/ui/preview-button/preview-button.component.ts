import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  input,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TrackPreviewService } from '../../../core/services/track-preview.service';
import { parseYoutubeId } from '../../utils/youtube-id';

/**
 * Plays a short snippet of a track/window to check how it sounds. A single
 * toggle: click to play a few seconds (auto-stops), click again to stop early.
 * Hidden when the link isn't a playable YouTube URL.
 */
@Component({
  selector: 'app-preview-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  templateUrl: './preview-button.component.html',
  styleUrl: './preview-button.component.scss',
})
export class PreviewButtonComponent implements OnInit, OnDestroy {
  private readonly preview = inject(TrackPreviewService);

  /** Track link (YouTube URL) to preview. */
  readonly link = input<string | null>(null);
  /** Where to start the snippet, in seconds (e.g. a window start). */
  readonly startS = input(0);
  /** Unique key identifying this row's preview. */
  readonly previewKey = input.required<string>();
  readonly size = input<'sm' | 'md'>('sm');

  private readonly videoId = computed(() => parseYoutubeId(this.link()));
  readonly available = computed(() => this.videoId() != null);
  readonly active = computed(() => this.preview.activeKey() === this.previewKey());

  ngOnInit(): void {
    // Warm up the shared player when a previewable row appears, so the first
    // click is instant rather than waiting for the iframe to spin up.
    if (this.available()) {
      this.preview.preload();
    }
  }

  toggle(event: Event): void {
    // Never let the click bubble to a surrounding label/row.
    event.stopPropagation();
    event.preventDefault();

    const id = this.videoId();
    if (!id) return;

    if (this.active()) {
      this.preview.stop();
    } else {
      void this.preview.play(this.previewKey(), id, this.startS());
    }
  }

  ngOnDestroy(): void {
    // Leaving the page/dialog stops the snippet this row started.
    if (this.active()) {
      this.preview.stop();
    }
  }
}
