import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConnectedPosition, OverlayModule } from '@angular/cdk/overlay';
import { Board, Group, Track } from '../../../../api/generated';
import { BoardPlayerYtDeckComponent } from '../board-player-yt-deck/board-player-yt-deck.component';
import { PLAYLIST_CROSSFADE_MS } from '../../utils/crossfade';
import { parseYoutubeId } from '../../../../shared/utils/youtube-id';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import {
  UiSelectComponent,
} from '../../../../shared/ui/select/ui-select.component';
import { UiVolumeSliderComponent } from '../../../../shared/ui/volume-slider/ui-volume-slider.component';
import { UiPlayButtonComponent } from '../../../../shared/ui/play-button/ui-play-button.component';
import { UiChipComponent } from '../../../../shared/ui/chip/ui-chip.component';
import { UiIconComponent, UiIconName } from '../../../../shared/ui/icon/ui-icon.component';
import { UiInlineSelectComponent } from '../../../../shared/ui/inline-select/ui-inline-select.component';
import { UiAlertComponent } from '../../../../shared/ui/alert/ui-alert.component';
import { BoardShortcutsService } from '../../../../core/services/board-shortcuts.service';
import { ScrollLockService } from '../../../../core/services/scroll-lock.service';
import { BottomSheetDragDirective } from '../../../../shared/ui/bottom-sheet/bottom-sheet-drag.directive';
import { FIELD_LIMITS } from '../../../../shared/constants/field-limits';
import { UiCharCounterComponent } from '../../../../shared/ui/char-counter/ui-char-counter.component';

export interface PlaylistOptions {
  random: boolean;
}

export type PlaybackMode = 'single' | 'playlist' | 'sequence';

/**
 * Loop behaviour for single-track (non-playlist) playback, chosen from the
 * Playback-settings dropdown. `sequence` steps through the track's windows in
 * order; the others loop (or don't loop) the whole track / selected window.
 */
export type LoopMode = 'off' | 'whole' | 'sequence';

@Component({
  selector: 'app-board-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    OverlayModule,
    BoardPlayerYtDeckComponent,
    IconButtonComponent,
    UiSelectComponent,
    UiVolumeSliderComponent,
    UiPlayButtonComponent,
    UiChipComponent,
    UiIconComponent,
    UiInlineSelectComponent,
    UiAlertComponent,
    BottomSheetDragDirective,
    UiCharCounterComponent,
  ],
  host: {
    '(document:click)': 'onDocumentClick($event)',
  },
  template: `
    <div
      class="board-card"
      [class.board-card--playing]="isPlaying()"
      [class.board-card--expanded]="expanded()"
      (dblclick)="onCardActivate($event)">

      <div class="board-card__summary">
        <div class="board-card__summary-left">
          <div class="board-card__transport">
            <div
              class="board-card__play-wrap"
              [class.board-card__play-wrap--playlist]="playlistMode()"
              [class.board-card__play-wrap--playing]="isPlaying()">
              <ui-play-button
                size="md"
                [playing]="isPlaying()"
                [disabled]="!canStartPlayback()"
                [ariaLabel]="isPlaying() ? 'Stop playback' : 'Play board'"
                (clicked)="onPrimaryAction()"
              />
            </div>

            <ui-volume-slider
              class="board-card__volume board-card__volume--fader"
              [vertical]="true"
              ariaLabel="Board volume"
              [value]="displayedVolumePercent()"
              (preview)="onVolumePreview($event)"
              (commit)="onVolumeCommit($event)"
            />
          </div>

          <div class="board-card__summary-content">
            <div class="board-card__summary-top">
              <div class="board-card__title-wrap">
                <ng-container *ngIf="!renaming(); else renameTpl">
                  <span
                    class="board-card__title"
                    title="Double-click to rename"
                    (dblclick)="startRename()"
                  >{{ board().name || 'Unnamed board' }}</span>
                  <button
                    type="button"
                    class="board-card__rename-btn"
                    aria-label="Rename board"
                    (mousedown)="$event.preventDefault()"
                    (click)="startRename()"
                  >✎</button>
                </ng-container>
                <ng-template #renameTpl>
                  <div class="board-card__rename">
                    <input
                      #renameInput
                      type="text"
                      class="board-card__rename-input"
                      [value]="renameValue()"
                      [attr.maxlength]="nameMaxLength"
                      (input)="renameValue.set($any($event.target).value)"
                      (keydown)="onRenameKeydown($event)"
                      (blur)="commitRename()"
                    />
                    <ui-char-counter
                      [current]="renameValue().length"
                      [max]="nameMaxLength"
                    />
                  </div>
                </ng-template>
              </div>

              <div class="board-card__feature-chips">
                <ui-chip
                  variant="crimson"
                  size="sm"
                  shape="hex"
                  [tooltip]="modeChipTooltip()"
                >
                  <ui-icon class="ribbon-ico" [name]="modeIconName()" />
                  {{ modeChipLabel() }}
                </ui-chip>

                <ui-chip
                  variant="gold"
                  size="sm"
                  shape="hex"
                  [tooltip]="loopRibbonTooltip()"
                >
                  <ui-icon class="ribbon-ico" name="loop" />
                  {{ loopRibbonLabel() }}
                </ui-chip>

                @if (playlistMode()) {
                  <ui-chip
                    variant="gold"
                    size="sm"
                    shape="hex"
                    [tooltip]="randomRibbonTooltip()"
                  >
                    <ui-icon class="ribbon-ico" [name]="randomIconName()" />
                    {{ randomRibbonLabel() }}
                  </ui-chip>
                }

                @if (board().overplay) {
                  <ui-chip
                    variant="gold"
                    size="sm"
                    shape="hex"
                    tooltip="Overplay — overlap with other boards"
                  >
                    <ui-icon class="ribbon-ico" name="overlap" />
                    Overplay
                  </ui-chip>
                }

                @if (shortcut()) {
                  <ui-chip
                    variant="neutral"
                    size="sm"
                    [attr.title]="'Keyboard shortcut: ' + shortcut()"
                  >
                    <ui-icon class="ribbon-ico" name="keyboard" />
                    {{ shortcut() }}
                  </ui-chip>
                }
              </div>
            </div>

            <div class="board-card__summary-bottom">
              <div class="board-card__meta-line">
                <ui-chip
                  variant="neutral"
                  keyLabel="Group"
                  [tooltip]="currentGroupLabel()"
                >{{ currentGroupLabel() }}</ui-chip>

                <ui-chip
                  variant="neutral"
                  [keyLabel]="playlistMode() ? 'Now playing' : 'Track'"
                  [tooltip]="currentTrackLabel()"
                >{{ currentTrackLabel() }}</ui-chip>

                @if (!playlistMode()) {
                  <ui-chip
                    variant="neutral"
                    keyLabel="Window"
                    [tooltip]="currentWindowLabel()"
                  >{{ currentWindowLabel() }}</ui-chip>
                }
              </div>

              <ui-volume-slider
                class="board-card__volume board-card__volume--bar"
                ariaLabel="Board volume"
                [value]="displayedVolumePercent()"
                (preview)="onVolumePreview($event)"
                (commit)="onVolumeCommit($event)"
              />
            </div>
          </div>
        </div>

        <div class="board-card__summary-actions">
          <app-icon-button
            icon="delete"
            label="Delete board"
            variant="danger"
            size="md"
            (clicked)="delete.emit()"
          />

          <button
            #chevronBtn
            type="button"
            class="board-card__chevron"
            [class.board-card__chevron--open]="expanded()"
            (click)="toggleExpanded()"
            (keydown)="onChevronKeydown($event)"
            [attr.aria-label]="expanded() ? 'Collapse board' : 'Expand board'">
            ▾
          </button>
        </div>
      </div>

      @if (warningMessage(); as warning) {
        <ui-alert variant="warning" class="board-card__warning">
          {{ warning }}
        </ui-alert>
      }

      <div
        class="board-card__details"
        [class.board-card__details--open]="expanded()">
        <div class="board-card__details-inner">
          <div class="board-card__main">
            <div class="board-card__header">
              <div class="board-mode-switch" role="group" aria-label="Playback mode">
                <button
                  type="button"
                  class="board-mode-switch__btn"
                  [class.board-mode-switch__btn--active]="!playlistMode()"
                  title="Play one track — choose its loop mode in playback settings"
                  (mousedown)="$event.preventDefault()"
                  (click)="setPlaylistTab(false)">
                  ♫ Single
                </button>
                <button
                  type="button"
                  class="board-mode-switch__btn"
                  [class.board-mode-switch__btn--active]="playlistMode()"
                  [disabled]="!canUsePlaylist() && !playlistMode()"
                  [attr.title]="playlistButtonTitle()"
                  (mousedown)="$event.preventDefault()"
                  (click)="setPlaylistTab(true)">
                  ♫ Playlist
                </button>
              </div>

              <div class="board-card__header-actions">
                <div class="board-card__menu-wrap">
                  <button
                    cdkOverlayOrigin
                    #settingsOrigin="cdkOverlayOrigin"
                    type="button"
                    class="board-icon-btn"
                    [class.board-icon-btn--active]="settingsOpen()"
                    (mousedown)="$event.preventDefault()"
                    (click)="toggleSettingsMenu($event)"
                    title="Board settings"
                    aria-label="Board settings">
                    ⚙
                  </button>

                  <ng-template
                    cdkConnectedOverlay
                    [cdkConnectedOverlayOrigin]="settingsOrigin"
                    [cdkConnectedOverlayOpen]="settingsOpen()"
                    [cdkConnectedOverlayPositions]="settingsPositions"
                    [cdkConnectedOverlayHasBackdrop]="true"
                    [cdkConnectedOverlayBackdropClass]="'board-settings-backdrop'"
                    [cdkConnectedOverlayPanelClass]="'board-settings-pane'"
                    [cdkConnectedOverlayPush]="true"
                    [cdkConnectedOverlayFlexibleDimensions]="true"
                    [cdkConnectedOverlayViewportMargin]="12"
                    (backdropClick)="animateCloseSettings()"
                    (detach)="closeSettingsMenu()">
                    <div
                      #settingsSheet
                      class="board-settings-menu"
                      [class.board-settings-menu--closing]="settingsClosing()"
                      (click)="$event.stopPropagation()">
                      <button
                        type="button"
                        class="board-settings-menu__handle"
                        [appBottomSheetDrag]="settingsSheet"
                        (dismiss)="closeSettingsMenu()"
                        aria-label="Close settings">
                        <span class="board-settings-menu__handle-bar" aria-hidden="true"></span>
                      </button>
                      <div class="board-settings-menu__title">Playback settings</div>

                      <div class="board-settings-menu__items">
                        @if (playlistMode()) {
                          <label class="board-settings-item">
                            <div class="board-settings-item__copy">
                              <span class="board-settings-item__label">Random</span>
                              <span class="board-settings-item__hint">
                                Shuffle the group instead of playing it in order
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              [checked]="playlistOptions().random"
                              (change)="onPlaylistRandomToggle()" />
                          </label>
                        } @else {
                          <div class="board-settings-item board-settings-item--loop-mode">
                            <div class="board-settings-item__copy">
                              <span class="board-settings-item__label">Loop mode</span>
                              <span class="board-settings-item__hint">{{ loopModeHint() }}</span>
                            </div>
                            <ui-inline-select
                              class="board-loop-select"
                              ariaLabel="Loop mode"
                              [options]="loopModeChoices()"
                              [value]="loopMode()"
                              (valueChange)="onLoopModeSelected($event)" />
                          </div>
                        }

                        <label class="board-settings-item">
                          <div class="board-settings-item__copy">
                            <span class="board-settings-item__label">Overplay</span>
                            <span class="board-settings-item__hint">Allow overlap with other boards</span>
                          </div>
                          <input
                            type="checkbox"
                            [checked]="board().overplay ?? false"
                            (change)="toggleOverplay.emit()" />
                        </label>

                        <div class="board-settings-item board-settings-item--shortcut">
                          <div class="board-settings-item__copy">
                            <span class="board-settings-item__label">Keyboard shortcut</span>
                            <span class="board-settings-item__hint">
                              {{ capturingShortcut()
                                ? 'Press a key combination (Esc to cancel)'
                                : 'Toggle play/stop from the keyboard' }}
                            </span>
                          </div>
                          <div class="board-shortcut">
                            <span
                              *ngIf="capturingShortcut()"
                              class="board-shortcut__chip board-shortcut__chip--listening">
                              Listening…
                            </span>
                            <span
                              *ngIf="!capturingShortcut() && shortcut()"
                              class="board-shortcut__chip">
                              {{ shortcut() }}
                            </span>
                            <span
                              *ngIf="!capturingShortcut() && !shortcut()"
                              class="board-shortcut__chip board-shortcut__chip--empty">
                              None
                            </span>

                            <button
                              type="button"
                              class="board-shortcut__btn"
                              (mousedown)="$event.preventDefault()"
                              (click)="toggleCaptureShortcut()">
                              {{ capturingShortcut() ? 'Cancel' : (shortcut() ? 'Change' : 'Set') }}
                            </button>
                            <button
                              type="button"
                              class="board-shortcut__btn board-shortcut__btn--danger"
                              *ngIf="shortcut() && !capturingShortcut()"
                              (mousedown)="$event.preventDefault()"
                              (click)="clearShortcut()">
                              Clear
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </ng-template>
                </div>
              </div>
            </div>

            <div class="board-card__controls">
              <div class="board-field">
                <span class="board-field__label">
                  Group
                  @if (groupDesynced()) {
                    <span
                      class="board-field__desync"
                      role="img"
                      title="Selected group does not match the playing track — pick a track to switch"
                      aria-label="Group out of sync with playing track"
                    >⚠</span>
                  }
                </span>
                <ui-select
                  #groupSelectRef
                  class="board-control"
                  [class.board-control--desynced]="groupDesynced()"
                  [navigateUpWhenClosed]="true"
                  [options]="groupOptions()"
                  nullOption="All tracks"
                  [ngModel]="board().selectedGroup?.id ?? null"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="groupChange.emit($event)"
                  (navigateNext)="focusTrack()"
                  (navigateUp)="focusChevron()"
                  (escape)="focusChevron()"
                />
              </div>

              <div class="board-field">
                <span class="board-field__label">{{ playlistMode() ? 'Now playing' : 'Track' }}</span>
                <ng-container *ngIf="!playlistMode(); else nowPlayingTpl">
                  <ui-select
                    #trackSelectRef
                    class="board-control"
                    [navigateUpWhenClosed]="true"
                    [options]="trackOptions()"
                    nullOption="No track"
                    [ngModel]="displayedTrack()?.id ?? null"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="trackChange.emit($event)"
                    (subOptionSelected)="trackWithWindowChange.emit($event.sub.value)"
                    (enterCommitted)="requestPlay.emit()"
                    (navigateNext)="focusWindow()"
                    (navigatePrev)="focusGroup()"
                    (navigateUp)="focusChevron()"
                    (escape)="focusChevron()"
                  />
                </ng-container>
                <ng-template #nowPlayingTpl>
                  <div class="board-now-playing">
                    <div class="board-control board-field__readonly">{{ currentTrackLabel() }}</div>
                    <button
                      type="button"
                      class="board-skip-btn"
                      [disabled]="!isPlaying()"
                      (click)="skipNext.emit()"
                      aria-label="Skip to next track"
                      title="Skip to next track">⏭</button>
                  </div>
                </ng-template>
              </div>

              <div
                class="board-field"
                *ngIf="showWindowSelector()"
                [attr.title]="sequentialWindows() ? 'Sequence mode steps through every window automatically' : null">
                <span class="board-field__label">Window</span>
                <ui-select
                  #windowSelectRef
                  class="board-control"
                  [navigateUpWhenClosed]="true"
                  [options]="windowOptions()"
                  nullOption="Whole playback"
                  [disabled]="sequentialWindows()"
                  [ngModel]="selectedWindowId()"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="windowChange.emit($event)"
                  (enterCommitted)="requestPlay.emit()"
                  (navigatePrev)="focusTrack()"
                  (navigateUp)="focusChevron()"
                  (escape)="focusChevron()"
                />
              </div>
            </div>

            <div class="board-card__player">
              <app-board-player-yt-deck
                [showPrimaryButton]="false"
                [title]="board().name || ('Board #' + board().id)"
                [hasTrack]="!!board().selectedTrack"
                [trackId]="board().selectedTrack?.id ?? null"
                [videoId]="selectedVideoId()"
                [status]="status()"
                [durationS]="board().selectedTrack?.duration ?? null"
                [windowStartS]="selectedWindowStart()"
                [windowEndS]="selectedWindowEnd()"
                [hasSelectedWindow]="hasSelectedWindow()"
                [windowFadeInMs]="selectedWindowFadeInMs()"
                [windowFadeOutMs]="selectedWindowFadeOutMs()"
                [forcedCrossfadeMs]="playlistCrossfadeMs()"
                [repeat]="effectiveRepeat()"
                [masterVolume]="masterVolume()"
                [masterFadeRampMs]="masterFadeRampMs()"
                (playRequested)="play.emit()"
                (stopRequested)="stop.emit()"
                (ended)="ended.emit()"
                (nearEnd)="nearEnd.emit()"
                (audioError)="audioError.emit()"
              />
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="board-card__expand-hint"
        (click)="toggleExpanded()"
        [attr.aria-label]="expanded() ? 'Collapse board' : 'Expand board'"
        tabindex="-1"
      >
        <span class="board-card__expand-hint-icon" aria-hidden="true">⌄</span>
      </button>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .board-card {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 10px 14px 10px 11px;
      border: 1px solid var(--app-border-color-soft);
      border-left-width: 4px;
      border-left-color: transparent;
      border-radius: var(--app-radius-md);
      background:
        linear-gradient(90deg,
          transparent 0%,
          rgba(201, 164, 76, 0.55) 12%,
          #58180d 30%,
          rgba(201, 164, 76, 0.9) 50%,
          #58180d 70%,
          rgba(201, 164, 76, 0.55) 88%,
          transparent 100%
        ) top / 100% 3px no-repeat,
        var(--app-parchment);
      box-shadow: var(--app-shadow-soft);
      transition: border-color 0.18s ease, box-shadow 0.18s ease;
    }

    .board-card--playing {
      border-color: rgba(88, 24, 13, 0.35);
      border-left-color: #c9a44c;
      box-shadow: -3px 0 12px rgba(201, 164, 76, 0.3), var(--app-shadow-soft);
    }

    .board-card__summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
    }

    .board-card__summary-left {
      min-width: 0;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
    }

    .board-card__summary-content {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .board-card__summary-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .board-card__title-wrap {
      min-width: 0;
      display: flex;
      align-items: center;
    }

    .board-card__title {
      font-family: var(--app-font-heading);
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.2;
      color: var(--app-heading);
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: text;
    }

    .board-card__rename-btn {
      flex-shrink: 0;
      margin-left: 6px;
      padding: 0 4px;
      border: none;
      background: transparent;
      color: var(--app-text-muted);
      font-size: 14px;
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.15s;
      line-height: 1;
    }

    .board-card__title-wrap:hover .board-card__rename-btn {
      opacity: 1;
    }

    .board-card__rename {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .board-card__rename-input {
      width: 100%;
      min-width: 0;
      padding: 2px 6px;
      border: 1px solid var(--app-primary);
      border-radius: var(--app-radius-sm);
      background: #fff8ec;
      color: var(--app-heading);
      font-family: var(--app-font-heading);
      font-size: 1rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      outline: none;
      box-shadow: var(--app-focus-ring);
    }

    .board-card__feature-chips {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
      flex-shrink: 0;
    }

    /* Ribbon chip leading icon. */
    .ribbon-ico {
      font-size: 1.3em;
      margin-right: 5px;
      vertical-align: -0.24em;
      opacity: 0.9;
    }

    .board-card__transport {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    /* Desktop/tablet: horizontal bar in the bottom row. Mobile: vertical fader
       under the play button. Only one is shown per breakpoint. */
    .board-card__volume--fader {
      display: none;
    }

    .board-card__play-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .board-card__play-wrap--playlist::before {
      content: '';
      position: absolute;
      inset: -7px;
      border-radius: 50%;
      border: 2.5px dashed rgba(201, 164, 76, 0.55);
      pointer-events: none;
      transition: border-color 0.3s ease, border-width 0.3s ease;
    }

    .board-card__play-wrap--playlist.board-card__play-wrap--playing::before {
      border: 2.5px dashed rgba(201, 164, 76, 0.95);
      box-shadow: 0 0 8px rgba(201, 164, 76, 0.35);
      animation: playlist-orbit 10s linear infinite;
    }

    @keyframes playlist-orbit {
      to { transform: rotate(360deg); }
    }

    .board-card__summary-bottom {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(200px, 300px);
      gap: 12px;
      align-items: center;
      min-width: 0;
    }

    .board-card__meta-line {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .board-card__summary-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .board-card__chevron {
      width: 36px;
      height: 36px;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: #faf4e4;
      color: var(--app-primary);
      font-size: 16px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s, box-shadow 0.15s, background 0.15s, transform 0.18s ease;
    }

    .board-card__chevron:hover {
      border-color: var(--app-border-color);
      background: #f5edd8;
    }

    .board-card__chevron:focus {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .board-card__chevron--open {
      transform: rotate(180deg);
    }

    /* Bottom expand affordance (phone carousel): tap the chevron to toggle. */
    .board-card__expand-hint {
      display: none;
      width: 100%;
      align-items: center;
      justify-content: center;
      padding: 0;
      margin-top: 4px;
      border: none;
      background: transparent;
      color: var(--app-text-soft);
      cursor: pointer;
    }

    .board-card__expand-hint-icon {
      font-size: 22px;
      line-height: 0.5;
      transition: transform 0.2s ease;
    }

    .board-card--expanded .board-card__expand-hint-icon {
      transform: rotate(180deg);
    }

    .board-icon-btn {
      width: 36px;
      height: 36px;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-elevated);
      color: var(--app-text-muted);
      font-size: 16px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .board-icon-btn:hover,
    .board-icon-btn--active {
      color: var(--app-primary);
      border-color: rgba(88, 24, 13, 0.3);
      background: var(--app-primary-soft);
    }

    .board-card__warning {
      display: block;
      margin-top: 10px;
    }

    /* Expand/collapse animates real height via grid 0fr→1fr (no max-height
       jank, symmetric, no collapse delay). Inner clips during the transition;
       selects/settings are fixed/CDK overlays so they're never clipped, and
       there's no display toggle so the player keeps playing while collapsed. */
    .board-card__details {
      display: grid;
      grid-template-rows: 0fr;
      opacity: 0;
      pointer-events: none;
      transition:
        grid-template-rows 0.26s cubic-bezier(0.4, 0, 0.2, 1),
        opacity 0.18s ease;
    }

    .board-card__details--open {
      grid-template-rows: 1fr;
      opacity: 1;
      pointer-events: auto;
    }

    /* Inline padding (cancelled by the negative margin) keeps focus rings from
       being clipped by the overflow used for the height animation. */
    .board-card__details-inner {
      min-height: 0;
      overflow: hidden;
      padding: 12px 4px 0;
      margin-inline: -4px;
    }

    .board-card__main {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .board-card__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
    }

    .board-card__header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      position: relative;
    }

    .board-mode-switch {
      display: inline-flex;
      padding: 3px;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-muted);
    }

    .board-mode-switch__btn {
      border: 0;
      background: transparent;
      color: var(--app-text-muted);
      padding: 6px 12px;
      border-radius: var(--app-radius-xs);
      font-family: var(--app-font-heading);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    }

    .board-mode-switch__btn--active {
      background: var(--app-surface-elevated);
      color: var(--app-primary);
      box-shadow: 0 1px 3px rgba(88, 24, 13, 0.1);
    }

    .board-mode-switch__btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .board-card__menu-wrap {
      position: relative;
    }

    .board-settings-menu {
      min-width: 280px;
      width: max-content;
      max-width: calc(100vw - 24px);
      padding: 10px;
      border-radius: var(--app-radius-md);
      border: 1px solid var(--app-border-color);
      border-top: 2px solid var(--app-primary);
      background: var(--app-parchment);
      box-shadow: var(--app-shadow);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .board-settings-menu__items {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: min(420px, calc(100vh - 120px));
      overflow-y: auto;
      overflow-x: hidden;
      max-width: 100%;
      padding-right: 2px;
    }

    .board-settings-menu__items > .board-settings-item {
      flex: 0 0 auto;
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
    }

    .board-settings-menu__title {
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--app-heading);
      padding: 2px 4px 6px;
      border-bottom: 1px solid var(--app-border-color-soft);
    }

    .board-settings-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-height: 48px;
      padding: 8px 10px;
      border-radius: 10px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      user-select: none;
      transition: background 0.15s;
    }

    .board-settings-item:hover {
      background: var(--app-primary-soft);
    }

    .board-settings-item__copy {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .board-settings-item__label {
      font-size: 14px;
      font-weight: 700;
      color: var(--app-text);
    }

    .board-settings-item__hint {
      font-size: 12px;
      color: var(--app-text-muted);
    }

    .board-settings-item input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--app-primary);
      cursor: pointer;
    }

    .board-loop-select {
      flex-shrink: 0;
      width: 168px;
    }

    .board-settings-item--shortcut {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }

    .board-shortcut {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .board-shortcut__chip {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      border-radius: var(--app-radius-xs);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-elevated);
      font-family: var(--app-font-heading);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--app-primary);
      font-variant-numeric: tabular-nums;
    }

    .board-shortcut__chip--empty {
      color: var(--app-text-muted);
      background: transparent;
      font-weight: 600;
    }

    .board-shortcut__chip--listening {
      color: var(--app-warning);
      background: var(--app-warning-soft);
      border-color: rgba(158, 110, 16, 0.25);
      animation: board-shortcut-pulse 1s ease-in-out infinite;
    }

    @keyframes board-shortcut-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.55; }
    }

    .board-shortcut__btn {
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-elevated);
      color: var(--app-text);
      border-radius: var(--app-radius-xs);
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }

    .board-shortcut__btn:hover {
      background: var(--app-primary-soft);
      color: var(--app-primary);
      border-color: rgba(88, 24, 13, 0.3);
    }

    .board-shortcut__btn--danger {
      color: var(--app-danger);
      border-color: rgba(158, 24, 24, 0.22);
    }

    .board-shortcut__btn--danger:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
      border-color: rgba(158, 24, 24, 0.35);
    }

    .board-card__controls {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
      align-items: end;
    }

    .board-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      /* Let a long label ellipsise instead of widening the card. */
      min-width: 0;
    }

    .board-field__label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--app-heading);
    }

    .board-field__desync {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      font-size: 11px;
      line-height: 1;
      color: var(--app-warning, #9e6e10);
      cursor: help;
    }

    .board-control--desynced {
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--app-warning, #9e6e10) 55%, transparent);
      border-radius: var(--app-radius-sm);
    }

    .board-control {
      min-height: 40px;
      width: 100%;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-parchment-soft);
      color: var(--app-text);
      font-size: 14px;
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    .board-control:focus {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .board-field__readonly {
      display: flex;
      align-items: center;
      padding: 0 12px;
      color: var(--app-primary);
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .board-now-playing {
      display: flex;
      align-items: stretch;
      gap: 8px;
      min-width: 0;
    }

    .board-now-playing .board-field__readonly {
      flex: 1;
      min-width: 0;
    }

    .board-skip-btn {
      flex-shrink: 0;
      width: 40px;
      padding: 0;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: #faf4e4;
      color: var(--app-primary);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      transition: border-color 0.15s, background 0.15s, box-shadow 0.15s;
    }

    .board-skip-btn:hover:not(:disabled) {
      border-color: var(--app-border-color);
      background: #f5edd8;
    }

    .board-skip-btn:focus-visible {
      outline: none;
      border-color: var(--app-primary);
      box-shadow: var(--app-focus-ring);
    }

    .board-skip-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .board-card__player {
      padding-top: 12px;
      border-top: 1px solid var(--app-border-color-soft);
    }

    @media (max-width: 1100px) {
      .board-card__summary-top {
        flex-direction: column;
        align-items: flex-start;
      }

      .board-card__feature-chips {
        justify-content: flex-start;
      }

      .board-card__summary-bottom {
        grid-template-columns: minmax(0, 1fr);
      }
    }

    /* Phones (≤sm): vertical fader + compact stacked layout. 640–900 keeps the
       horizontal desktop-style row, which uses the width better. */
    @media (max-width: 640px) {
      /* Delete floats in the top-right corner instead of reserving a column,
         so the play/title, ribbons, info and volume all span the full board
         width and simply flow underneath it. */
      .board-card__summary {
        position: relative;
        grid-template-columns: minmax(0, 1fr);
        gap: 10px;
      }

      .board-card__summary-actions {
        position: absolute;
        top: 0;
        right: 0;
        z-index: 1;
      }

      /* Three stacked zones, each on its own full-width row:
           1. header  — play/stop control + board name
           2. ribbons — board-state chips (mode / loop / overplay / shortcut)
           3. info    — now-playing list (group/track/window) + volume
         Flattening summary-content and summary-top lets their children take
         part directly in this grid. */
      .board-card__summary-left {
        align-items: center;
        grid-template-columns: auto minmax(0, 1fr);
        grid-template-areas:
          'play  title'
          'ribbons ribbons'
          'info  info';
        column-gap: 12px;
        row-gap: 12px;
      }

      .board-card__summary-content,
      .board-card__summary-top {
        display: contents;
      }

      .board-card__transport {
        grid-area: play;
      }

      .board-card__title-wrap {
        grid-area: title;
        /* Keep the name clear of the floated delete button in the corner. */
        padding-right: 3rem;
      }

      .board-card__feature-chips {
        grid-area: ribbons;
        gap: 5px;
      }

      /* Compact state ribbons so the whole row stays tidy on phones. */
      .board-card__feature-chips ::ng-deep .ui-chip--hex.ui-chip--sm {
        padding: 2px 11px;
        font-size: 9px;
        gap: 3px;
      }

      .board-card__feature-chips .ribbon-ico {
        font-size: 1.1em;
        margin-right: 3px;
      }

      .board-card__summary-bottom {
        grid-area: info;
      }

      /* Meta reads as a definition list (key left, value right, thin
         separators) rather than pills. */
      .board-card__meta-line {
        flex-direction: column;
        align-items: stretch;
        gap: 0;
      }

      .board-card__meta-line ::ng-deep ui-chip {
        display: block;
        min-width: 0;
        max-width: 100%;
      }

      /* Block-level flex (not inline-flex) so the row is bounded to the card.
         Key sits in a fixed left column; the value fills the rest and wraps
         instead of truncating, so it stays fully readable at any width. */
      .board-card__meta-line ::ng-deep .ui-chip {
        display: flex;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        align-items: baseline;
        justify-content: flex-start;
        gap: 10px;
        padding: 7px 2px;
        background: transparent;
        border: none;
        border-radius: 0;
        box-shadow: none;
        border-bottom: 1px solid rgba(122, 66, 32, 0.14);
      }

      .board-card__meta-line ::ng-deep .ui-chip__key {
        flex: 0 0 4.5em;
      }

      .board-card__meta-line ::ng-deep .ui-chip__body {
        flex: 1 1 auto;
        min-width: 0;
        text-align: left;
        white-space: normal;
        overflow-wrap: anywhere;
        /* Show at most two lines, then ellipsis (full text stays in tooltip). */
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        overflow: hidden;
      }

      .board-card__meta-line ::ng-deep ui-chip:last-child .ui-chip {
        border-bottom: none;
      }

      .board-card__header {
        /* space-between: when both fit, switch left / gear right; when too
           narrow the gear wraps and (alone on its line) sits flush left. */
        flex-direction: row;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .board-card__header-actions {
        justify-content: flex-end;
      }

      .board-card__controls {
        grid-template-columns: minmax(0, 1fr);
      }

      /* Volume is a full-width horizontal bar at the bottom of the info zone. */
      .board-card__volume--fader {
        display: none;
      }

      .board-card__volume--bar {
        display: block;
        width: 100%;
        max-width: 20rem;
        justify-self: center;
        margin-inline: auto;
      }

      .board-card__summary-bottom {
        row-gap: 14px;
      }

      /* Toggle via the bottom chevron; top-right keeps just delete. */
      .board-card__chevron {
        display: none;
      }

      .board-card__expand-hint {
        display: flex;
      }

      /* Tighter padding on phones (was a separate 480px tweak; folded into the
         single phone breakpoint). */
      .board-card {
        padding: 12px;
      }
    }
  `],
})
export class BoardCardComponent implements OnInit {
  readonly board = input.required<Board>();
  readonly availableGroups = input<Group[]>([]);
  readonly status = input<'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR'>('STOPPED');
  readonly selectedWindowId = input<number | null>(null);
  readonly masterVolume = input(1);
  readonly masterFadeRampMs = input(0);
  readonly volumePercent = input<number>(100);
  readonly playlistMode = input(false);
  readonly playlistOptions = input<PlaylistOptions>({ random: false });
  /**
   * Sequence mode plays the selected track's windows one after another. The page
   * receives it from the backend-backed board state and keeps it mutually
   * exclusive with playlist mode.
   */
  readonly sequentialWindows = input(false);

  readonly isPlaying = computed(() => this.status() === 'PLAYING');

  /** YouTube video id parsed from the selected track's link. */
  readonly selectedVideoId = computed(() =>
    parseYoutubeId(this.board().selectedTrack?.trackLink ?? null),
  );

  readonly delete = output<void>();
  readonly groupChange = output<number | null>();
  readonly trackChange = output<number | null>();
  readonly windowChange = output<number | null>();
  readonly trackWithWindowChange = output<{ trackId: number | null; windowId: number | null }>();
  readonly loopModeChange = output<LoopMode>();
  readonly toggleOverplay = output<void>();
  readonly play = output<void>();
  readonly stop = output<void>();
  readonly ended = output<void>();
  readonly nearEnd = output<void>();
  readonly audioError = output<void>();
  readonly modeChange = output<PlaybackMode>();
  readonly playlistOptionsChange = output<PlaylistOptions>();
  readonly skipNext = output<void>();
  readonly volumePreviewChange = output<number>();
  readonly volumeCommit = output<number>();
  readonly rename = output<string>();
  readonly navigateBoardUp = output<void>();
  readonly navigateBoardDown = output<void>();
  readonly requestPlay = output<void>();

  readonly settingsOpen = signal(false);
  /** Mobile only: plays the settings sheet's slide-down before it's removed. */
  readonly settingsClosing = signal(false);
  private settingsCloseTimer: ReturnType<typeof setTimeout> | null = null;
  readonly expanded = signal(false);
  readonly renaming = signal(false);
  readonly renameValue = signal('');
  readonly nameMaxLength = FIELD_LIMITS.board.name;
  readonly displayedVolumePercent = signal(100);
  readonly capturingShortcut = signal(false);

  readonly settingsPositions: ConnectedPosition[] = [
    {
      originX: 'end',
      originY: 'bottom',
      overlayX: 'end',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'end',
      originY: 'top',
      overlayX: 'end',
      overlayY: 'bottom',
      offsetY: -8,
    },
    {
      originX: 'start',
      originY: 'bottom',
      overlayX: 'start',
      overlayY: 'top',
      offsetY: 8,
    },
    {
      originX: 'start',
      originY: 'top',
      overlayX: 'start',
      overlayY: 'bottom',
      offsetY: -8,
    },
  ];
  @ViewChild('renameInput') renameInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('groupSelectRef') groupSelectRef?: UiSelectComponent;
  @ViewChild('trackSelectRef') trackSelectRef?: UiSelectComponent;
  @ViewChild('windowSelectRef') windowSelectRef?: UiSelectComponent;
  @ViewChild('chevronBtn') chevronBtnRef?: ElementRef<HTMLButtonElement>;

  focusGroup(): void {
    this.groupSelectRef?.focusTrigger();
  }

  focusTrack(): void {
    this.trackSelectRef?.focusTrigger();
  }

  focusWindow(): void {
    this.windowSelectRef?.focusTrigger();
  }

  focusChevron(): void {
    this.chevronBtnRef?.nativeElement.focus();
  }

  onChevronKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.expanded() ? this.focusGroup() : this.navigateBoardDown.emit();
        return;

      case 'ArrowUp':
        event.preventDefault();
        this.navigateBoardUp.emit();
        return;

      case 'Escape':
        if (this.expanded()) {
          event.preventDefault();
          this.setExpanded(false);
        }
        return;

      case 'Enter':
      case ' ':
        event.preventDefault();
        this.toggleExpanded();
        return;
    }
  }

  private readonly shortcutsService = inject(BoardShortcutsService);
  private shortcutCaptureHandler: ((event: KeyboardEvent) => void) | null = null;

  readonly shortcut = computed(() => {
    const id = this.board().id;
    if (id == null) return null;
    return this.shortcutsService.shortcuts()[id] ?? null;
  });


  readonly displayedTrack = computed(() => {
    const board = this.board();
    const selected = board.selectedTrack;
    if (!selected) return null;
    const tracks = board.availableTracks ?? [];
    return tracks.some(t => t.id === selected.id) ? selected : null;
  });

  readonly groupDesynced = computed(() => {
    const board = this.board();
    if (!board.selectedTrack || !board.selectedGroup) return false;
    const tracks = board.availableTracks ?? [];
    return !tracks.some(t => t.id === board.selectedTrack?.id);
  });

  private readonly playingTrackWindows = computed(
    () => this.board().selectedTrack?.trackWindows ?? [],
  );

  readonly windows = computed(() => this.displayedTrack()?.trackWindows ?? []);

  readonly selectedWindow = computed(() => {
    const id = this.selectedWindowId();
    if (id == null) return null;
    return this.playingTrackWindows().find(w => (w as any).id === id) ?? null;
  });

  readonly hasSelectedWindow = computed(() =>
    !this.playlistMode() && !this.sequenceUnavailable() && this.selectedWindow() != null,
  );

  readonly selectedWindowStart = computed(() =>
    this.hasSelectedWindow() ? (this.selectedWindow() as any).positionFrom : null,
  );

  readonly selectedWindowEnd = computed(() =>
    this.hasSelectedWindow() ? (this.selectedWindow() as any).positionTo : null,
  );

  /**
   * Fade lengths (ms) that drive the player's crossfade: the selected window's
   * fades when one is active, otherwise the track's own ("whole track") fades.
   */
  readonly selectedWindowFadeInMs = computed(() => {
    const window = this.hasSelectedWindow() ? this.selectedWindow() : null;
    return window?.fadeInDurationMs ?? this.board().selectedTrack?.fadeInDurationMs ?? 0;
  });

  readonly selectedWindowFadeOutMs = computed(() => {
    const window = this.hasSelectedWindow() ? this.selectedWindow() : null;
    return window?.fadeOutDurationMs ?? this.board().selectedTrack?.fadeOutDurationMs ?? 0;
  });

  /** Playlist track-to-track uses a fixed crossfade (whole tracks advancing
      through an async backend call); other modes derive it from the fades. */
  readonly playlistCrossfadeMs = computed(() =>
    this.playlistMode() ? PLAYLIST_CROSSFADE_MS : null,
  );

  // In sequence mode the page advances windows and loops the whole sequence, so
  // the player itself must not loop the current window. When the track can't be
  // sequenced (fewer than two windows) the sequence falls back to looping the
  // whole track, so the player loops instead of stopping at the end.
  readonly effectiveRepeat = computed(() => {
    if (this.playlistMode()) return false;
    if (this.sequentialWindows()) return !this.canSequenceWindows();
    return this.board().repeat ?? false;
  });

  readonly showWindowSelector = computed(() =>
    !this.playlistMode() && this.windows().length > 0,
  );

  /** Playlist mode needs at least one playable track in the selected group. */
  readonly canUsePlaylist = computed(() =>
    this.getPlaylistCandidates(this.board().selectedGroup?.id ?? null).length >= 1,
  );

  readonly playlistButtonTitle = computed(() =>
    this.canUsePlaylist()
      ? 'Play through the selected group'
      : 'This group has no tracks to play',
  );

  /**
   * Inline warning shown on the board when its current configuration can't play
   * as set up: a window sequence on a track without enough windows (it falls back
   * to looping the whole track), or a playlist on a group with no tracks.
   */
  readonly warningMessage = computed<string | null>(() => {
    if (this.playlistMode()) {
      return this.canUsePlaylist()
        ? null
        : 'This group has no tracks to play. Pick a group that has tracks.';
    }

    if (this.board().selectedTrack && this.sequenceUnavailable()) {
      return 'Window sequence needs at least two windows on this track — playing the whole track on loop instead.';
    }

    return null;
  });

  // The board state is only Single or Playlist; sequence is surfaced through the
  // loop ribbon, not as a board state.
  readonly modeChipLabel = computed(() =>
    this.playlistMode() ? 'Playlist' : 'Single',
  );

  readonly modeIconName = computed<UiIconName>(() =>
    this.playlistMode() ? 'playlist' : 'single',
  );

  readonly modeChipTooltip = computed(() =>
    this.playlistMode() ? 'Playlist mode' : 'Single-track mode',
  );

  // Always-present loop ribbon. In playlist mode each track plays to its end, so
  // looping is fixed to "whole track".
  readonly loopRibbonLabel = computed(() => {
    if (this.playlistMode()) return 'Whole';
    switch (this.loopMode()) {
      case 'whole':
        return 'Whole';
      case 'sequence':
        return 'Sequence';
      default:
        return 'Off';
    }
  });

  /** Full loop wording for the chip tooltip — the visible label is iconified. */
  readonly loopRibbonTooltip = computed(() => {
    if (this.playlistMode()) return 'Loop: whole playback';
    switch (this.loopMode()) {
      case 'whole':
        return 'Loop: whole playback';
      case 'sequence':
        return 'Loop: window sequence';
      default:
        return 'Loop: off';
    }
  });

  readonly randomRibbonLabel = computed(() =>
    this.playlistOptions().random ? 'Shuffle' : 'In order',
  );

  readonly randomIconName = computed<UiIconName>(() =>
    this.playlistOptions().random ? 'shuffle' : 'ordered',
  );

  readonly randomRibbonTooltip = computed(() =>
    this.playlistOptions().random
      ? 'Shuffle the group'
      : 'Play the group in order',
  );

  readonly canStartPlayback = computed(() => {
    if (!this.playlistMode()) {
      return !!this.board().selectedTrack;
    }

    return this.getPlaylistCandidates(this.board().selectedGroup?.id ?? null).length > 0;
  });

  readonly currentTrackLabel = computed(() => {
    const t = this.board().selectedTrack;
    return t ? (t.trackName || t.trackOriginalName || ('Track #' + t.id)) : '—';
  });

  readonly currentGroupLabel = computed(() =>
    this.board().selectedGroup?.listName || 'All tracks',
  );

  readonly currentWindowLabel = computed(() => {
    if (this.playlistMode()) return 'Auto';
    const w = this.selectedWindow() as any;
    if (!w) return 'Whole playback';
    return w.name || 'Window';
  });

  /** Windows belonging to the selected track; sequencing needs at least two. */
  private readonly selectedTrackWindowCount = computed(
    () => this.board().selectedTrack?.trackWindows?.length ?? 0,
  );

  /** Window sequence only makes sense with two or more windows to step between. */
  readonly canSequenceWindows = computed(() => this.selectedTrackWindowCount() >= 2);

  /**
   * Sequence mode is selected but the track can't be sequenced (fewer than two
   * windows). Playback falls back to looping the whole track.
   */
  readonly sequenceUnavailable = computed(
    () => !this.playlistMode() && this.sequentialWindows() && !this.canSequenceWindows(),
  );

  readonly loopModeChoices = computed<{ value: LoopMode; label: string; disabled?: boolean }[]>(() => [
    { value: 'off', label: 'Off' },
    { value: 'whole', label: 'Whole playback' },
    // Disable sequencing when the track lacks the windows to step through.
    { value: 'sequence', label: 'Window sequence', disabled: !this.canSequenceWindows() },
  ]);

  /** Current single-track loop behaviour, derived from the board flags. */
  readonly loopMode = computed<LoopMode>(() => {
    if (this.sequentialWindows()) return 'sequence';
    return this.board().repeat ? 'whole' : 'off';
  });

  readonly loopModeHint = computed(() => {
    switch (this.loopMode()) {
      case 'whole':
        return 'Loops the track or selected window';
      case 'sequence':
        return 'Steps through every window, looping the sequence';
      default:
        return 'Plays once, then stops';
    }
  });

  readonly groupOptions = computed(() =>
    // A group with no tracks has nothing to select or play, so disable it.
    this.availableGroups().map(g => ({
      label: g.listName || ('Group #' + g.id),
      value: g.id,
      disabled: (g.tracks?.length ?? 0) === 0,
    })),
  );

  readonly trackOptions = computed(() => {
    // In sequence mode only tracks with at least two windows can be sequenced;
    // the rest are shown but disabled so the active sequence isn't dropped.
    const sequencing = this.sequentialWindows();

    return (this.board().availableTracks ?? []).map(t => {
      const trackWindows = t.trackWindows ?? [];
      // Sequence mode plays the windows automatically, so picking an individual
      // window from the track dropdown makes no sense — hide the sub-options there.
      const subOptions = !sequencing && trackWindows.length > 0
        ? [
            {
              label: 'Whole playback',
              value: { trackId: t.id ?? null, windowId: null },
            },
            ...trackWindows.map(w => ({
              label: (w as any).name || 'Window',
              value: { trackId: t.id ?? null, windowId: (w as any).id ?? null },
            })),
          ]
        : undefined;

      return {
        label: t.trackName || t.trackOriginalName || ('Track #' + t.id),
        value: t.id,
        subOptions,
        disabled: sequencing && trackWindows.length < 2,
      };
    });
  });

  readonly windowOptions = computed(() =>
    this.windows().map(w => ({
      label: (w as any).name || 'Window #' + (w as any).id,
      value: (w as any).id,
    })),
  );

  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly scrollLock = inject(ScrollLockService);
  constructor() {
    effect(() => {
      const pct = this.volumePercent();
      this.displayedVolumePercent.set(clampPct(pct));
    });

    // On mobile the settings popover is a bottom sheet that owns the screen:
    // lock background scroll and (via the shared body class) hide the bottom nav
    // so it doesn't overlap the sheet. Ref-counted, mobile only.
    effect((onCleanup) => {
      if (!this.settingsOpen()) return;
      if (typeof window === 'undefined') return;
      if (!window.matchMedia('(max-width: 640px)').matches) return;
      this.scrollLock.lock();
      onCleanup(() => this.scrollLock.unlock());
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.endShortcutCapture();
    });
  }

  toggleCaptureShortcut(): void {
    if (this.capturingShortcut()) {
      this.endShortcutCapture();
      return;
    }

    this.capturingShortcut.set(true);
    this.shortcutsService.suspendTriggers();

    this.shortcutCaptureHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.endShortcutCapture();
        return;
      }

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;

      const formatted = BoardShortcutsService.formatEvent(event);
      if (!formatted) return;

      const id = this.board().id;
      if (id == null) {
        this.endShortcutCapture();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.shortcutsService.setShortcut(id, formatted);
      this.endShortcutCapture();
    };

    document.addEventListener('keydown', this.shortcutCaptureHandler, true);
  }

  clearShortcut(): void {
    const id = this.board().id;
    if (id == null) return;
    this.shortcutsService.clearShortcut(id);
  }

  private endShortcutCapture(): void {
    if (this.shortcutCaptureHandler) {
      document.removeEventListener('keydown', this.shortcutCaptureHandler, true);
      this.shortcutCaptureHandler = null;
    }
    if (this.capturingShortcut()) {
      this.capturingShortcut.set(false);
    }
    this.shortcutsService.resumeTriggers();
  }

  onDocumentClick(event: MouseEvent): void {
    if (!this.settingsOpen()) return;
    if (!(event.target instanceof Node)) return;
    if (!this.elementRef.nativeElement.contains(event.target)) {
      // Use the animated close; guarded so it doesn't race the backdrop click.
      this.animateCloseSettings();
    }
  }

  toggleExpanded(): void {
    this.setExpanded(!this.expanded());
  }

  private setExpanded(expanded: boolean): void {
    this.expanded.set(expanded);
    if (!expanded) this.closeSettingsMenu();
  }

  startRename(): void {
    this.renameValue.set(this.board().name || '');
    this.renaming.set(true);
    setTimeout(() => this.renameInputRef?.nativeElement.select(), 0);
  }

  commitRename(): void {
    if (!this.renaming()) return;
    this.renaming.set(false);
    const name = this.renameValue().trim();
    if (name && name !== this.board().name) {
      this.rename.emit(name);
    }
  }

  onRenameKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
    } else if (event.key === 'Escape') {
      this.renaming.set(false);
    }
  }

  toggleSettingsMenu(event: MouseEvent): void {
    event.stopPropagation();
    if (this.settingsOpen()) {
      this.animateCloseSettings();
      return;
    }
    if (this.settingsCloseTimer) {
      clearTimeout(this.settingsCloseTimer);
      this.settingsCloseTimer = null;
    }
    this.settingsClosing.set(false);
    this.settingsOpen.set(true);
  }

  /**
   * Close the settings popover. On mobile (where it's a bottom sheet) play a
   * slide-down first, mirroring the open animation, then remove it.
   */
  animateCloseSettings(): void {
    if (this.settingsClosing()) return;

    const isMobile =
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 640px)').matches;
    if (!isMobile) {
      this.closeSettingsMenu();
      return;
    }

    this.settingsClosing.set(true);
    this.settingsCloseTimer = setTimeout(() => {
      this.settingsCloseTimer = null;
      this.closeSettingsMenu();
    }, 200);
  }

  closeSettingsMenu(): void {
    this.settingsOpen.set(false);
    this.settingsClosing.set(false);
    this.endShortcutCapture();
  }

  /**
   * The mode switch now only toggles playlist vs single-track playback; the
   * sequence option moved into the Loop-mode dropdown. Switching to single from
   * sequence is done via that dropdown, so an already-non-playlist board ignores
   * a "Single" click and keeps its current loop mode.
   */
  setPlaylistTab(playlist: boolean): void {
    if (playlist === this.playlistMode()) return;
    this.modeChange.emit(playlist ? 'playlist' : 'single');
  }

  onLoopModeSelected(mode: string): void {
    if (mode === this.loopMode()) return;
    this.loopModeChange.emit(mode as LoopMode);
  }

  onPlaylistRandomToggle(): void {
    this.playlistOptionsChange.emit({
      ...this.playlistOptions(),
      random: !this.playlistOptions().random,
    });
  }

  onVolumePreview(value: number): void {
    const v = clampPct(value);
    this.displayedVolumePercent.set(v);
    this.volumePreviewChange.emit(v);
  }

  onVolumeCommit(value: number): void {
    const v = clampPct(value);
    this.displayedVolumePercent.set(v);
    this.volumeCommit.emit(v);
  }

  onPrimaryAction(): void {
    if (this.isPlaying()) {
      this.stop.emit();
      return;
    }

    this.play.emit();
  }

  /** Double-tap / double-click on empty card space toggles play. */
  onCardActivate(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (
      target.closest(
        'button, a, input, select, textarea, ui-select, ui-inline-select, ui-volume-slider, .board-card__title-wrap',
      )
    ) {
      return;
    }
    this.onPrimaryAction();
  }



  private getPlaylistCandidates(groupId: number | null): Track[] {
    const unique = new Map<number, Track>();

    const tracks =
      groupId == null
        ? (this.board().availableTracks ?? [])
        : (this.availableGroups().find(group => group.id === groupId)?.tracks ?? []);

    for (const track of tracks) {
      if (track?.id != null) {
        unique.set(track.id, track);
      }
    }

    return Array.from(unique.values());
  }
}

function clampPct(v: number): number {
  const n = Number(v);
  return Number.isFinite(n)
    ? Math.max(0, Math.min(Math.round(n), 100))
    : 100;
}