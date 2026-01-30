import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { AppComponent } from './app.component';
import { RegisterPageComponent } from './features/auth/pages/register-page/register-page.component';

@NgModule({
  declarations: [
    AppComponent,
    RegisterPageComponent
  ],
  imports: [BrowserModule],
  bootstrap: [AppComponent]
})
export class AppModule {}