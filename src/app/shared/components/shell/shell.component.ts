import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from '../navbar/navbar.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  template: `
    <div class="app-shell">
      <app-navbar></app-navbar>

      <main class="app-shell__main">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent {}