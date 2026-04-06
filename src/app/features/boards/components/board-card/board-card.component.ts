import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Board, Group, Track } from '../../../../api/generated';
import { BoardPlayerComponent } from '../board-player/board-player.component';
import { IconButtonComponent } from '../../../../shared/ui/buttons/ui-icon-button.component';
import { UiSelectComponent } from '../../../../shared/ui/select/ui-select.component';

export interface PlaylistOptions {
  random: boolean;
}

@Component({
  selector: 'app-board-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    BoardPlayerComponent,
    IconButtonComponent,
    UiSelectComponent,
  ],
  template: `
    <div
      class="board-card"
      [class.board-card--playing]="status() === 'PLAYING'"
      [class.board-card--expanded]="expanded()"
      [class.board-card--playlist]="playlistMode()">

      <div class="board-card__summary">
        <div class="board-card__summary-left">
          <div
            class="board-card__play-wrap"
            [class.board-card__play-wrap--playlist]="playlistMode()"
            [class.board-card__play-wrap--playing]="status() === 'PLAYING'">
            <button
              type="button"
              class="board-card__summary-play"
              [class.board-card__summary-play--stop]="status() === 'PLAYING'"
              [disabled]="!canStartPlayback()"
              (click)="onPrimaryAction()"
              [attr.aria-label]="status() === 'PLAYING' ? 'Stop playback' : 'Play board'">
              <span *ngIf="status() !== 'PLAYING'">▶</span>
              <span *ngIf="status() === 'PLAYING'">■</span>
            </button>
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
                    (click)="startRename()"
                  >✎</button>
                </ng-container>
                <ng-template #renameTpl>
                  <input
                    #renameInput
                    type="text"
                    class="board-card__rename-input"
                    [value]="renameValue()"
                    (input)="renameValue.set($any($event.target).value)"
                    (keydown)="onRenameKeydown($event)"
                    (blur)="commitRename()"
                  />
                </ng-template>
              </div>

              <div class="board-card__feature-chips">
                <span
                  class="board-card__mode-chip"
                  [class.board-card__mode-chip--playlist]="playlistMode()">
                  <span class="board-chip__dot" aria-hidden="true"></span>
                  {{ playlistMode() ? '♫ Playlist' : '♫ Single' }}
                </span>
                <span
                  class="board-card__feature-chip"
                  *ngFor="let feature of compactFeatureLabels()">
                  <span class="board-chip__dot" aria-hidden="true"></span>
                  {{ feature }}
                </span>
              </div>
            </div>

            <div class="board-card__summary-bottom">
              <div class="board-card__meta-line">
                <span class="board-card__meta-pill board-card__meta-pill--group">
                  <span class="board-card__meta-key">Group</span>
                  <span class="board-card__meta-value">{{ currentGroupLabel() }}</span>
                </span>

                <span class="board-card__meta-pill board-card__meta-pill--track">
                  <span class="board-card__meta-key">{{ playlistMode() ? 'Now playing' : 'Track' }}</span>
                  <span class="board-card__meta-value">{{ currentTrackLabel() }}</span>
                </span>

                <span
                  *ngIf="!playlistMode()"
                  class="board-card__meta-pill board-card__meta-pill--window">
                  <span class="board-card__meta-key">Window</span>
                  <span class="board-card__meta-value">{{ currentWindowLabel() }}</span>
                </span>
              </div>

              <div class="board-card__summary-volume">
                <span class="board-card__summary-volume-icon" aria-hidden="true">🔊</span>
                <input
                  type="range"
                  class="board-card__summary-volume-slider"
                  min="0"
                  max="100"
                  step="1"
                  [value]="displayedVolumePercent()"
                  aria-label="Board volume"
                  (input)="onVolumeInput($event)"
                  (change)="onVolumeChange($event)"
                />
                <span class="board-card__summary-volume-value">{{ displayedVolumePercent() }}%</span>
              </div>
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
            type="button"
            class="board-card__chevron"
            [class.board-card__chevron--open]="expanded()"
            (click)="toggleExpanded()"
            [attr.aria-label]="expanded() ? 'Collapse board' : 'Expand board'">
            ▾
          </button>
        </div>
      </div>

      <div
        class="board-card__details"
        [class.board-card__details--open]="expanded()">
        <div class="board-card__details-inner">
          <div class="board-card__main">
            <div class="board-card__header">
              <div class="board-mode-switch" aria-label="Playback mode">
                <button
                  type="button"
                  class="board-mode-switch__btn"
                  [class.board-mode-switch__btn--active]="!playlistMode()"
                  (click)="setPlaybackMode(false)">
                  ♫ Single
                </button>
                <button
                  type="button"
                  class="board-mode-switch__btn"
                  [class.board-mode-switch__btn--active]="playlistMode()"
                  (click)="setPlaybackMode(true)">
                  ♫ Playlist
                </button>
              </div>

              <div class="board-card__header-actions">
                <div class="board-card__menu-wrap">
                  <button
                    type="button"
                    class="board-icon-btn"
                    [class.board-icon-btn--active]="settingsOpen()"
                    (click)="toggleSettingsMenu($event)"
                    title="Board settings"
                    aria-label="Board settings">
                    ⚙
                  </button>

                  <div
                    *ngIf="settingsOpen()"
                    class="board-settings-menu"
                    (click)="$event.stopPropagation()">
                    <div class="board-settings-menu__title">Playback settings</div>

                    <label class="board-settings-item">
                      <div class="board-settings-item__copy">
                        <span class="board-settings-item__label">{{ secondaryOptionLabel() }}</span>
                        <span class="board-settings-item__hint">
                          {{
                            playlistMode()
                              ? 'Playlist mode always picks tracks at random from the selected group'
                              : 'Play track or its window in a seamless loop'
                          }}
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        [checked]="secondaryOptionChecked()"
                        [disabled]="playlistMode()"
                        (change)="onSecondaryOptionToggle($event)" />
                    </label>

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
                  </div>
                </div>
              </div>
            </div>

            <div class="board-card__controls">
              <div class="board-field">
                <span class="board-field__label">Group</span>
                <ui-select
                  class="board-control"
                  [options]="groupOptions()"
                  nullOption="All tracks"
                  [ngModel]="board().selectedGroup?.id ?? null"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="onGroupSelected($event)"
                />
              </div>

              <div class="board-field">
                <span class="board-field__label">{{ playlistMode() ? 'Now playing' : 'Track' }}</span>
                <ng-container *ngIf="!playlistMode(); else nowPlayingTpl">
                  <ui-select
                    class="board-control"
                    [options]="trackOptions()"
                    nullOption="No track"
                    [ngModel]="board().selectedTrack?.id ?? null"
                    [ngModelOptions]="{ standalone: true }"
                    (ngModelChange)="trackChange.emit($event)"
                  />
                </ng-container>
                <ng-template #nowPlayingTpl>
                  <div class="board-control board-field__readonly">{{ currentTrackLabel() }}</div>
                </ng-template>
              </div>

              <div class="board-field" *ngIf="showWindowSelector()">
                <span class="board-field__label">Window</span>
                <ui-select
                  class="board-control"
                  [options]="windowOptions()"
                  nullOption="Whole track"
                  [ngModel]="selectedWindowId()"
                  [ngModelOptions]="{ standalone: true }"
                  (ngModelChange)="windowChange.emit($event)"
                />
              </div>
            </div>

            <div class="board-card__player">
              <app-board-player
                [showPrimaryButton]="false"
                [title]="board().name || ('Board #' + board().id)"
                [hasTrack]="!!board().selectedTrack"
                [trackId]="board().selectedTrack?.id ?? null"
                [status]="status()"
                [streamUrl]="streamUrl()"
                [durationS]="board().selectedTrack?.duration ?? null"
                [windowStartS]="selectedWindowStart()"
                [windowEndS]="selectedWindowEnd()"
                [hasSelectedWindow]="hasSelectedWindow()"
                [repeat]="effectiveRepeat()"
                [masterVolume]="masterVolume()"
                (playRequested)="play.emit()"
                (stopRequested)="stop.emit()"
                (ended)="onPlayerEnded()"
                (nearEnd)="onPlayerNearEnd()"
                (audioError)="audioError.emit()"
              />
            </div>
          </div>
        </div>
      </div>
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

    .board-card__summary-play {
      width: 42px;
      height: 42px;
      border: 0;
      border-radius: 999px;
      background: var(--app-primary);
      color: #fff;
      font-size: 18px;
      font-weight: 800;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 8px 16px color-mix(in srgb, var(--app-primary) 18%, transparent);
    }

    .board-card__summary-play:disabled {
      opacity: 0.45;
      cursor: not-allowed;
      box-shadow: none;
    }

    .board-card__summary-play--stop {
      background: var(--app-danger);
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

    .board-card__rename-input {
      flex: 1;
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

    .board-card__mode-chip,
    .board-card__feature-chip {
      position: relative;
      flex-shrink: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px 4px 10px;
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      border-radius: var(--app-radius-xs);
      clip-path: polygon(8px 0%, calc(100% - 8px) 0%, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0% 50%);
    }

    .board-chip__dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .board-card__mode-chip {
      background: linear-gradient(135deg, #3d1008 0%, #58180d 100%);
      color: #f5dfc8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        0 2px 6px rgba(88, 24, 13, 0.45);
    }

    .board-card__mode-chip .board-chip__dot {
      background: #8b5b33;
      box-shadow: 0 0 4px rgba(201, 164, 76, 0.8);
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

    .board-card__feature-chip {
      background: linear-gradient(135deg, #5a3e20 0%, #7a5228 100%);
      color: #e8d8b8;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.1),
        0 2px 6px rgba(60, 30, 10, 0.35);
    }

    .board-card__feature-chip .board-chip__dot {
      background: rgba(201, 164, 76, 0.7);
      box-shadow: 0 0 3px rgba(201, 164, 76, 0.5);
    }

    .board-card__summary-bottom {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(200px, 300px);
      gap: 12px;
      align-items: center;
    }

    .board-card__meta-line {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .board-card__meta-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      max-width: 100%;
      padding: 6px 12px;
      border: 1px solid rgba(122, 66, 32, 0.24);
      border-radius: 999px;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0)),
        color-mix(in srgb, var(--app-surface) 94%, white 6%);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.14),
        0 1px 3px rgba(88, 24, 13, 0.06);
    }

    .board-card__meta-pill--track {
      max-width: min(100%, 420px);
    }

    .board-card__meta-key {
      flex: 0 0 auto;
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--app-text-muted);
      white-space: nowrap;
    }

    .board-card__meta-value {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 700;
      color: var(--app-text);
    }

    .board-card__summary-volume {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      padding: 6px 10px;
      border-radius: var(--app-radius-sm);
      border: 1px solid var(--app-border-color-soft);
      background: var(--app-surface-elevated);
    }

    .board-card__summary-volume-icon {
      font-size: 13px;
      color: var(--app-primary);
    }

    .board-card__summary-volume-slider {
      width: 100%;
      height: 4px;
      accent-color: var(--app-primary);
      cursor: pointer;
    }

    .board-card__summary-volume-value {
      font-size: 12px;
      font-weight: 800;
      color: var(--app-primary);
      min-width: 36px;
      text-align: right;
    }

    .board-card__summary-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .board-card__chevron,
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
      transition: transform 0.18s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .board-card__chevron:hover,
    .board-icon-btn:hover,
    .board-icon-btn--active {
      color: var(--app-primary);
      border-color: rgba(88, 24, 13, 0.3);
      background: var(--app-primary-soft);
    }

    .board-card__chevron--open {
      transform: rotate(180deg);
      color: var(--app-primary);
    }

    .board-icon-btn--danger {
      color: var(--app-danger);
      border-color: rgba(158, 24, 24, 0.2);
    }

    .board-icon-btn--danger:hover {
      background: var(--app-danger-soft);
      color: var(--app-danger);
      border-color: rgba(158, 24, 24, 0.35);
    }

    .board-card__details {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      pointer-events: none;
      transition: max-height 0.22s ease, opacity 0.18s ease, margin-top 0.18s ease;
    }

    .board-card__details--open {
      max-height: 1200px;
      opacity: 1;
      overflow: visible;
      pointer-events: auto;
      margin-top: 12px;
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

    .board-card__menu-wrap {
      position: relative;
    }

    .board-settings-menu {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      z-index: 20;
      min-width: 220px;
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

    .board-settings-item input {
      width: 16px;
      height: 16px;
      accent-color: var(--app-primary);
      cursor: pointer;
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
    }

    .board-field__label {
      font-family: var(--app-font-heading);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--app-heading);
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

    .board-card__player {
      padding-top: 12px;
      border-top: 1px solid var(--app-border-color-soft);
    }

    @media (max-width: 1120px) {
      .board-card__summary-top {
        flex-direction: column;
        align-items: flex-start;
      }

      .board-card__feature-chips {
        justify-content: flex-start;
      }

      .board-card__summary-bottom {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 840px) {
      .board-card__summary {
        grid-template-columns: 1fr;
      }

      .board-card__summary-actions {
        justify-content: flex-end;
      }

      .board-card__summary-left {
        grid-template-columns: 1fr;
      }

      .board-card__header {
        flex-direction: column;
        align-items: stretch;
      }

      .board-card__header-actions {
        justify-content: flex-end;
      }
    }

    @media (max-width: 720px) {
      .board-card {
        padding: 12px;
      }

      .board-card__controls {
        grid-template-columns: 1fr;
      }

      .board-card__meta-line {
        gap: 8px;
      }

      .board-card__meta-pill {
        width: 100%;
      }

      .board-card__meta-pill--track {
        max-width: 100%;
      }

      .board-settings-menu {
        left: 0;
        right: auto;
      }
    }
  `],
})
export class BoardCardComponent implements OnInit {
  readonly board = input.required<Board>();
  readonly availableGroups = input<Group[]>([]);
  readonly status = input<'STOPPED' | 'PLAYING' | 'PAUSED' | 'BUFFERING' | 'ERROR'>('STOPPED');
  readonly streamUrl = input<string | null>(null);
  readonly selectedWindowId = input<number | null>(null);
  readonly masterVolume = input(1);
  readonly volumePercent = input<number>(100);
  readonly playlistMode = input(false);
  readonly playlistOptions = input<PlaylistOptions>({ random: false });

  readonly delete = output<void>();
  readonly groupChange = output<number | null>();
  readonly trackChange = output<number | null>();
  readonly windowChange = output<number | null>();
  readonly toggleRepeat = output<void>();
  readonly toggleOverplay = output<void>();
  readonly play = output<void>();
  readonly stop = output<void>();
  readonly ended = output<void>();
  readonly nearEnd = output<void>();
  readonly audioError = output<void>();
  readonly playlistModeChange = output<boolean>();
  readonly playlistOptionsChange = output<PlaylistOptions>();
  readonly volumePreviewChange = output<number>();
  readonly volumeCommit = output<number>();
  readonly rename = output<string>();

  readonly settingsOpen = signal(false);
  readonly expanded = signal(false);
  readonly renaming = signal(false);
  readonly renameValue = signal('');
  readonly displayedVolumePercent = signal(100);

  private previousPlaylistMode: boolean | undefined;
  private previousSelectedGroupId: number | null | undefined;

  readonly windows = computed(() => this.board().selectedTrack?.trackWindows ?? []);

  readonly selectedWindow = computed(() => {
    const id = this.selectedWindowId();
    if (id == null) return null;
    return this.windows().find(w => (w as any).id === id) ?? null;
  });

  readonly selectedWindowStart = computed(() =>
    (!this.playlistMode() && this.selectedWindow())
      ? (this.selectedWindow() as any).positionFrom
      : null,
  );

  readonly selectedWindowEnd = computed(() =>
    (!this.playlistMode() && this.selectedWindow())
      ? (this.selectedWindow() as any).positionTo
      : null,
  );

  readonly hasSelectedWindow = computed(() =>
    !this.playlistMode() && this.selectedWindow() != null,
  );

  readonly effectiveRepeat = computed(() =>
    !this.playlistMode() && (this.board().repeat ?? false),
  );

  readonly showWindowSelector = computed(() =>
    !this.playlistMode() && this.windows().length > 0,
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
    if (!w) return 'Whole track';
    return `${w.name || 'Window'} (${this.formatTime(w.positionFrom ?? 0)}–${this.formatTime(w.positionTo ?? 0)})`;
  });

  readonly secondaryOptionLabel = computed(() =>
    this.playlistMode() ? 'Random' : 'Loop',
  );

  readonly secondaryOptionChecked = computed(() =>
    this.playlistMode() ? true : !!this.board().repeat,
  );

  readonly groupOptions = computed(() =>
    this.availableGroups().map(g => ({
      label: g.listName || ('Group #' + g.id),
      value: g.id,
    })),
  );

  readonly trackOptions = computed(() =>
    (this.board().availableTracks ?? []).map(t => ({
      label: t.trackName || t.trackOriginalName || ('Track #' + t.id),
      value: t.id,
    })),
  );

  readonly windowOptions = computed(() =>
    this.windows().map(w => ({
      label: `${(w as any).name || 'Window #' + (w as any).id} (${this.formatTime((w as any).positionFrom ?? 0)}–${this.formatTime((w as any).positionTo ?? 0)})`,
      value: (w as any).id,
    })),
  );

  readonly compactFeatureLabels = computed(() => {
    const labels: string[] = [];

    if (this.playlistMode()) {
      labels.push('Random');
    } else if (this.board().repeat ?? false) {
      labels.push('Loop');
    }

    if (this.board().overplay ?? false) {
      labels.push('Overplay');
    }

    return labels;
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      const pct = this.volumePercent();
      this.displayedVolumePercent.set(clampPct(pct));
    });

    effect(() => {
      const isPlaylist = this.playlistMode();
      const selectedGroupId = this.board().selectedGroup?.id ?? null;

      if (this.previousPlaylistMode === undefined) {
        this.previousPlaylistMode = isPlaylist;
        this.previousSelectedGroupId = selectedGroupId;
        return;
      }

      const playlistModeChanged = this.previousPlaylistMode !== isPlaylist;
      const selectedGroupChanged = this.previousSelectedGroupId !== selectedGroupId;

      if (playlistModeChanged) {
        if (isPlaylist) {
          this.windowChange.emit(null);
        } else {
          this.windowChange.emit(null);
          this.stop.emit();
          this.trackChange.emit(null);
        }
      } else if (isPlaylist && selectedGroupChanged) {
        this.windowChange.emit(null);
      }

      this.previousPlaylistMode = isPlaylist;
      this.previousSelectedGroupId = selectedGroupId;
    });

  }

  ngOnInit(): void {
    this.resizeObserver = new ResizeObserver(() => {});
    this.destroyRef.onDestroy(() => this.resizeObserver?.disconnect());
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!(event.target instanceof Node)) return;
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.settingsOpen.set(false);
    }
  }

  toggleExpanded(): void {
    this.expanded.update(v => !v);
    if (!this.expanded()) this.settingsOpen.set(false);
  }

  startRename(): void {
    this.renameValue.set(this.board().name || '');
    this.renaming.set(true);
    setTimeout(() => {
      const input = this.elementRef.nativeElement.querySelector('.board-card__rename-input') as HTMLInputElement | null;
      input?.select();
    }, 0);
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
    this.settingsOpen.update(v => !v);
  }

  setPlaybackMode(isPlaylist: boolean): void {
    if (this.playlistMode() === isPlaylist) return;

    if (isPlaylist && !this.playlistOptions().random) {
      this.playlistOptionsChange.emit({
        ...this.playlistOptions(),
        random: true,
      });
    }

    this.playlistModeChange.emit(isPlaylist);
  }

  boardContextItems() {
    const items = [
      { label: 'Group', value: this.currentGroupLabel() },
      { label: this.playlistMode() ? 'Now playing' : 'Track', value: this.currentTrackLabel() },
    ];

    if (!this.playlistMode()) {
      items.push({ label: 'Window', value: this.currentWindowLabel() });
    }

    return items;
  }

  onSecondaryOptionToggle(_event: Event): void {
    if (this.playlistMode()) {
      this.playlistOptionsChange.emit({
        ...this.playlistOptions(),
        random: true,
      });
      return;
    }

    this.toggleRepeat.emit();
  }

  onVolumeInput(event: Event): void {
    const value = clampPct(Number((event.target as HTMLInputElement).value));
    this.displayedVolumePercent.set(value);
    this.volumePreviewChange.emit(value);
  }

  onVolumeChange(event: Event): void {
    const value = clampPct(Number((event.target as HTMLInputElement).value));
    this.displayedVolumePercent.set(value);
    this.volumeCommit.emit(value);
  }

  onPrimaryAction(): void {
    if (this.status() === 'PLAYING') {
      this.stop.emit();
      return;
    }

    this.play.emit();
  }

  onGroupSelected(groupId: number | null): void {
    this.groupChange.emit(groupId);
  }

  onPlayerNearEnd(): void {
    this.nearEnd.emit();
  }

  onPlayerEnded(): void {
    this.ended.emit();
  }

  formatTime(s: number): string {
    const safe = Math.max(0, Math.floor(s));
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    const sec = safe % 60;

    if (h > 0) {
      return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    }

    return `${m}:${String(sec).padStart(2, '0')}`;
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