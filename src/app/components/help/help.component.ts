import { Component, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { clickExternalHref } from '../../model/external-links';

@Component({
	selector: 'app-help',
	changeDetection: ChangeDetectionStrategy.OnPush,
	templateUrl: './help.component.html',
	styleUrls: ['./help.component.scss'],
	imports: [TranslatePipe]
})
export class HelpComponent {
	readonly showTutorial = output();

	protected readonly clickExternalHref = clickExternalHref;
}
