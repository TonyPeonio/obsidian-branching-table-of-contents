// Minimal stand-in for the `obsidian` module so modules that import from it can be loaded
// under vitest. Only what the tested code touches is defined. Component is functional so
// that renderers can be loaded and unloaded in the DOM smoke test.
export class Plugin {}
export class ItemView {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class TFile {}
export class Events {}
export class FuzzySuggestModal {}
export class Menu {}
export class MarkdownView {}
export class Keymap {
	static isModEvent(): boolean {
		return false;
	}
}
export function setIcon(el: Element, icon: string): void {
	el.setAttribute("data-icon", icon);
}
export function normalizePath(p: string): string {
	return p.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
}

export class Component {
	private children: Component[] = [];
	private cleanups: (() => void)[] = [];
	loaded = false;

	load(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.onload();
		for (const c of this.children) c.load();
	}

	unload(): void {
		if (!this.loaded) return;
		this.loaded = false;
		for (const c of this.children) c.unload();
		for (const fn of this.cleanups.splice(0)) fn();
		this.onunload();
	}

	onload(): void {}
	onunload(): void {}

	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		if (this.loaded) child.load();
		return child;
	}

	removeChild<T extends Component>(child: T): T {
		const i = this.children.indexOf(child);
		if (i >= 0) this.children.splice(i, 1);
		child.unload();
		return child;
	}

	register(cb: () => void): void {
		this.cleanups.push(cb);
	}

	registerEvent(ref: { off?: () => void } | null | undefined): void {
		this.register(() => ref?.off?.());
	}

	registerDomEvent(el: EventTarget, type: string, cb: EventListener, options?: AddEventListenerOptions): void {
		el.addEventListener(type, cb, options);
		this.register(() => el.removeEventListener(type, cb, options));
	}
}

export class MarkdownRenderChild extends Component {
	constructor(public containerEl: HTMLElement) {
		super();
	}
}
