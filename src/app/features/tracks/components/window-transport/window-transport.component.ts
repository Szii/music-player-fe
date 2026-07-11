// window-transport.component.ts
import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';

@Component({
  selector: 'app-window-transport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './window-transport.component.html',
  styleUrl: './window-transport.component.scss',
})
export class WindowTransportComponent {
  readonly isPlaying = input(false);
  readonly playMode = input<'full' | 'selection'>('full');
  readonly fadeIn = input(false);
  readonly fadeOut = input(false);
  readonly playSelectionDisabled = input(false);

  readonly playAll = output<void>();
  readonly playSelection = output<void>();
  readonly fadeInChange = output<boolean>();
  readonly fadeOutChange = output<boolean>();
}
