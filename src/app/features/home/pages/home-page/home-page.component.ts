import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FooterComponent } from '../../../../shared/components/footer/footer.component';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [RouterLink, FooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-page.component.html',
  styleUrl: './home-page.component.scss',
})
export class HomePageComponent {}