import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { MODE_SOLVABLE, type BUILD_MODE_ID } from '../../model/builder';
import { GAME_MODE_STANDARD, type GAME_MODE_ID } from '../../model/consts';
import type { Layout } from '../../model/types';
import { DurationPipe } from '../../pipes/duration.pipe';
import { TranslateGroupPipe } from '../../pipes/translate-group.pipe';
import { AppService } from '../../service/app.service';
import { LayoutService } from '../../service/layout.service';
import { LocalstorageService } from '../../service/localstorage.service';
import { LayoutPreviewComponent } from '../layout-preview/layout-preview.component';

export interface HomeStartEvent {
	layout: Layout;
	buildMode: BUILD_MODE_ID;
	gameMode: GAME_MODE_ID;
}

interface CategorySummary {
	name: string;
	icon: string;
	total: number;
	completed: number;
}

@Component({
	selector: 'app-home',
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './home.component.html',
	styleUrls: ['./home.component.scss'],
	imports: [DurationPipe, LayoutPreviewComponent, TranslateGroupPipe]
})
export class HomeComponent {
	readonly startEvent = output<HomeStartEvent>();
	readonly openHelpEvent = output<void>();
	readonly openSettingsEvent = output<void>();
	readonly app = inject(AppService);
	readonly layoutService = inject(LayoutService);
	readonly storage = inject(LocalstorageService);
	readonly layouts = computed(() => this.layoutService.layoutItems());
	readonly search = signal('');
	readonly selectedCategory = signal('All Boards');
	readonly currentPage = signal(1);
	readonly viewMode = signal<'grid' | 'list'>('grid');
	readonly pageSize = 30;
	readonly featuredNames = ['Dragon', 'Turtle', 'Kitty', 'Monkey', 'Tiger', 'Rooster', 'Snake', 'Boar', 'Fly', 'OX'];
	readonly heroTiles = ['春', '發', '竹', '萬', '南', '梅', '九', '東', '北', '中', '蘭', '一', '西', '白', '二', '三', '四', '五', '六', '七', '八']
		.map((label, index) => {
			const row = Math.floor(index / 7);
			const column = index % 7;
			return {
				label,
				left: column * 47 + row * 28,
				bottom: row * 52,
				rotate: (index - 8) * 0.9
			};
		});

	categories(): Array<CategorySummary> {
		const groups = new Map<string, CategorySummary>();
		for (const layout of this.layouts()) {
			let group = groups.get(layout.category);
			if (!group) {
				group = { name: layout.category, icon: this.categoryIcon(layout.category), total: 0, completed: 0 };
				groups.set(layout.category, group);
			}
			group.total++;
			if (this.isCompleted(layout)) {
				group.completed++;
			}
		}
		return Array.from(groups.values());
	}

	filteredLayouts(): Array<Layout> {
		const query = this.search().trim().toLowerCase();
		const selectedCategory = this.selectedCategory();
		return this.layouts().filter(layout => {
			const matchesCategory = selectedCategory === 'All Boards' || layout.category === selectedCategory;
			const matchesQuery = !query || layout.name.toLowerCase().includes(query) || layout.category.toLowerCase().includes(query);
			return matchesCategory && matchesQuery;
		});
	}

	paginatedLayouts(): Array<Layout> {
		const startIndex = (this.currentPage() - 1) * this.pageSize;
		return this.filteredLayouts().slice(startIndex, startIndex + this.pageSize);
	}

	totalPages(): number {
		return Math.max(1, Math.ceil(this.filteredLayouts().length / this.pageSize));
	}

	hasPagination(): boolean {
		return this.filteredLayouts().length > this.pageSize;
	}

	dailyLayout(): Layout | undefined {
		return this.findLayout('Dragon') ?? this.layouts()[0];
	}

	featuredLayouts(): Array<Layout> {
		const layouts = this.layouts();
		const featured = this.featuredNames
			.map(name => this.findLayout(name))
			.filter((layout): layout is Layout => !!layout);
		return featured.length > 0 ? featured : layouts.slice(0, 10);
	}

	allCompleted(): number {
		return this.layouts().filter(layout => this.isCompleted(layout)).length;
	}

	allCompletionPercent(): number {
		return this.percent(this.allCompleted(), this.layouts().length);
	}

	categoryPercent(category: CategorySummary): number {
		return this.percent(category.completed, category.total);
	}

	bestTime(layout: Layout): number | undefined {
		return this.storage.getScore(layout.id)?.bestTime;
	}

	difficulty(layout: Layout): 'Easy' | 'Medium' | 'Hard' {
		const count = layout.mapping.length;
		if (count >= 120) {
			return 'Hard';
		}
		if (count >= 90) {
			return 'Medium';
		}
		return 'Easy';
	}

	rating(layout: Layout): Array<number> {
		const count = layout.mapping.length;
		const filled = Math.max(2, Math.min(5, Math.round(count / 28)));
		return Array.from({ length: 5 }, (_, index) => index < filled ? 1 : 0);
	}

	start(layout?: Layout): void {
		if (!layout) {
			return;
		}
		this.storage.storeLastPlayed(layout.id);
		this.startEvent.emit({ layout, buildMode: MODE_SOLVABLE, gameMode: GAME_MODE_STANDARD });
	}

	selectCategory(category: string): void {
		this.selectedCategory.set(category);
		this.currentPage.set(1);
	}

	updateSearch(query: string): void {
		this.search.set(query);
		this.currentPage.set(1);
	}

	setPage(page: number): void {
		const nextPage = Math.min(Math.max(page, 1), this.totalPages());
		this.currentPage.set(nextPage);
	}

	private findLayout(name: string): Layout | undefined {
		return this.layouts().find(layout => layout.name.toLowerCase() === name.toLowerCase());
	}

	isCompleted(layout: Layout): boolean {
		return (this.storage.getScore(layout.id)?.winCount ?? 0) > 0;
	}

	private percent(value: number, total: number): number {
		return total > 0 ? Math.round(value / total * 100) : 0;
	}

	private categoryIcon(category: string): string {
		switch (category) {
			case 'Animals': {
				return 'panda';
			}
			case 'Architecture': {
				return 'temple';
			}
			case 'Symbols': {
				return 'star';
			}
			case 'Plants': {
				return 'leaf';
			}
			case 'Shapes': {
				return 'diamond';
			}
			default: {
				return 'tiles';
			}
		}
	}
}
