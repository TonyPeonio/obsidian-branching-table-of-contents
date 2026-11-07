/** What a rendered node can do; implemented by the plugin, used by every renderer. */
export interface NodeActions {
	open(id: string, evt: MouseEvent): void;
	hover(id: string, evt: MouseEvent, target: HTMLElement | SVGElement): void;
	menu(id: string, evt: MouseEvent): void;
}
