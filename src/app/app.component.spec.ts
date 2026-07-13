import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { PromptDialogService } from './shared/features/prompt-dialog/prompt-dialog.service';
import { provideTranslocoTesting } from '../testing/transloco-testing';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideTranslocoTesting()],
      // Actually load the @defer block instead of stubbing it, so this exercises
      // the real lazy path.
      deferBlockBehavior: DeferBlockBehavior.Playthrough,
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // The prompt dialog is deferred to keep the ~48 kB obscenity word list (and
  // Reactive Forms) out of the initial bundle. It still has to appear when asked.
  it('renders the deferred prompt dialog once it is opened', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-prompt-dialog')).toBeNull();

    TestBed.inject(PromptDialogService).prompt({ title: 'Rename' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-prompt-dialog')).not.toBeNull();
  });
});
