import { type OnDestroy, inject, Service } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Game } from '../model/game';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../model/languages';
import { Settings } from '../model/settings';
import { LangAuto } from '../model/consts';
import { LocalstorageService } from './localstorage.service';

@Service()
export class AppService implements OnDestroy {
	name: string = 'Mah Jong';
	cache: Record<string, unknown> = {};
	game: Game;
	settings: Settings;
	storage = inject(LocalstorageService);
	translate = inject(TranslateService);

	constructor() {
		this.game = new Game(this.storage);
		this.settings = new Settings(this.storage);
		this.settings.load();
		this.setLang();
		this.game.init();
		this.game.sound.enabled = this.settings.sounds;
		this.game.music.enabled = this.settings.music;
	}

	ngOnDestroy(): void {
		this.game.destroy();
	}

	getCachedValue(name: string): unknown {
		return this.cache[name];
	}

	cacheValue(name: string, value?: unknown): void {
		if (value === undefined) {
			delete this.cache[name];
			return;
		}
		this.cache[name] = value;
	}

	setLang(): void {
		let userLang: string;
		if (!this.settings.lang || this.settings.lang === LangAuto) {
			// Pick the best match from the browser's full language preference list
			const available = Object.keys(LANGUAGES);
			userLang = DEFAULT_LANGUAGE;
			for (const preference of navigator.languages ?? [navigator.language]) {
				const base = preference.split('-', 1)[0].toLowerCase();
				if (base && available.includes(base)) {
					userLang = base;
					break;
				}
			}
		} else {
			userLang = this.settings.lang;
		}
		this.translate.use(Object.keys(LANGUAGES).includes(userLang) ? userLang : DEFAULT_LANGUAGE);
	}

	toggleSound(): void {
		this.settings.sounds = !this.settings.sounds;
		this.game.sound.enabled = this.settings.sounds;
		this.settings.save();
	}

	toggleMusic(): void {
		this.settings.music = !this.settings.music;
		this.game.music.enabled = this.settings.music;
		this.game.music.toggle();
		this.settings.save();
	}
}
