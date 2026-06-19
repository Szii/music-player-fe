import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'ui-search-box',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ui-search-box.component.html',
  styleUrl: './ui-search-box.component.scss',
})
export class UiSearchBoxComponent {
  @Input() value = '';
  @Input() placeholder = 'Search';

  @Output() valueChange = new EventEmitter<string>();

  clear(): void {
    this.valueChange.emit('');
  }
}