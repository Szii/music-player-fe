import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'ui-search-box',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ui-search-box">
      <input
        class="app-input ui-search-box__input"
        type="text"
        [placeholder]="placeholder"
        [ngModel]="value"
        (ngModelChange)="valueChange.emit($event)"
      />

      <button
        *ngIf="value"
        type="button"
        class="ui-search-box__clear"
        (click)="clear()"
        aria-label="Clear search"
        title="Clear"
      >
        ✕
      </button>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .ui-search-box {
      position: relative;
    }

    .ui-search-box__input {
      padding-right: 2.6rem;
    }

    .ui-search-box__clear {
      position: absolute;
      top: 50%;
      right: 0.55rem;
      transform: translateY(-50%);
      width: 1.75rem;
      height: 1.75rem;
      border: 1px solid transparent;
      border-radius: var(--app-radius-xs);
      background: transparent;
      color: var(--app-text-soft);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.78rem;
      transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
    }

    .ui-search-box__clear:hover {
      background: rgba(88, 24, 13, 0.08);
      color: var(--app-primary);
      border-color: rgba(88, 24, 13, 0.18);
    }
  `],
})
export class UiSearchBoxComponent {
  @Input() value = '';
  @Input() placeholder = 'Search';

  @Output() valueChange = new EventEmitter<string>();

  clear(): void {
    this.valueChange.emit('');
  }
}