import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';
import { AppService } from '../../service/app.service';
import { HelpComponent } from './help.component';
import { By } from '@angular/platform-browser';
import { describe, beforeEach, it, expect, vi } from 'vitest';

describe('HelpComponent', () => {
	let component: HelpComponent;
	let fixture: ComponentFixture<HelpComponent>;
	let translateService: TranslateService;

	beforeEach(async () =>
		TestBed.configureTestingModule({
			imports: [HelpComponent],
			providers: [provideTranslateService(), AppService]
		})
			.compileComponents());

	beforeEach(() => {
		fixture = TestBed.createComponent(HelpComponent);
		component = fixture.componentInstance;
		translateService = TestBed.inject(TranslateService);
		fixture.detectChanges();
	});

	it('should create', async () => {
		expect(component).toBeTruthy();
	});

	it('should render the how to play section', () => {
		const howToPlaySection = fixture.debugElement.query(By.css('.help'));
		expect(howToPlaySection).toBeTruthy();

		const heading = howToPlaySection.query(By.css('legend'));
		expect(heading).toBeTruthy();
	});

	it('should emit showTutorial when the tutorial button is clicked', () => {
		const emitSpy = vi.spyOn(component.showTutorial, 'emit');
		const buttons = fixture.debugElement.queryAll(By.css('button.action-btn'));
		const tutorialButton = buttons[0].nativeElement as HTMLButtonElement;
		tutorialButton.click();
		expect(emitSpy).toHaveBeenCalled();
	});

	it('should use translation service for the heading', () => {
		translateService.setTranslation('en', { HOW_TO_PLAY: 'How to Play' });
		translateService.use('en');
		fixture.detectChanges();

		const heading = fixture.debugElement.query(By.css('.help legend')).nativeElement;
		expect(heading.textContent).toBe('How to Play');
	});
});
