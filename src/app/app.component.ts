import { Component, ViewChild, ViewContainerRef } from '@angular/core';
import { RegisterPageComponent } from './features/auth/pages/register-page/register-page.component';
import { LoginPageComponent } from './features/auth/pages/login-page/login-page.component';

@Component({
  selector: 'app-root',
  template: `
    <h1>Angular Dynamic Component Example</h1>
    <button (click)="addComponent()">Add Dynamic Component</button>
    <ng-container #container></ng-container>
  `
})
export class AppComponent {
  @ViewChild('container', { read: ViewContainerRef, static: true })
  container!: ViewContainerRef;

  addComponent() {
    // Create and insert the component into the container
    this.container.createComponent(RegisterPageComponent);
  }
}
