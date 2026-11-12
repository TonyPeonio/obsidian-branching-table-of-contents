import { ItemView, setIcon, type HoverPopover, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { NodeActions } from "./actions";
import { forest, neighborhood, outline, type Subgraph } from "./graph";
import { layout } from "./layout";
import type BtocPlugin from "./main";
import { renderOutline } from "./render-outline";
import { TreeCanvas } from "./render-tree";
import { clampLevels, firstProperty, type ViewMode, type ViewScope } from "./settings";

export const VIEW_TYPE = "branching-toc-tree";

interface TreeViewState {
	mode: ViewMode;
	scope: ViewScope;
	up: number;
	down: number;
	/** When pinned the view stays on its note instead of following the active one. */
	pinned: boolean;
	focus: string | null;
}

/** The sidebar view: a toolbar over either the drawn tree or the outline. */
export class TreeView extends ItemView {
	hoverPopover: HoverPopover | null = null;
	private state: TreeViewState;
	private toolbarEl: HTMLElement | null = null;
	private bodyEl: HTMLElement | null = null;
	private canvas: TreeCanvas | null = null;
	private collapsed = new Set<string>();
	private buttons = new Map<string, HTMLElement>();
	private upInput: HTMLInputElement | null = null;
	private downInput: HTMLInputElement | null = null;

	private actions: NodeActions = {
		open: (id, evt) => void this.plugin.openNode(id, evt),
		hover: (id, evt, el) => this.plugin.hoverNode(id, evt, el, this),
		menu: (id, evt) => this.plugin.nodeMenu(id, evt),
	};

	constructor(
		leaf: WorkspaceLeaf,
		private plugin: BtocPlugin,
	) {
		super(leaf);
		const s = plugin.settings;
		this.state = {
			mode: s.defaultMode,
			scope: s.defaultScope,
			up: s.levelsUp,
			down: s.levelsDown,
			pinned: !s.followActiveNote,
			focus: plugin.app.workspace.getActiveFile()?.path ?? null,
		};
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Branching table of contents";
	}

	getIcon(): string {
		return "git-fork";
	}

	onOpen(): Promise<void> {
		this.contentEl.addClass("btoc-view");
		this.toolbarEl = this.contentEl.createDiv({ cls: "btoc-toolbar" });
		this.bodyEl = this.contentEl.createDiv({ cls: "btoc-body" });
		this.buildToolbar(this.toolbarEl);

		this.registerEvent(this.plugin.graph.on("changed", () => this.render()));
		this.registerEvent(this.app.workspace.on("file-open", (file) => this.followActive(file?.path ?? null)));
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.followActive(this.app.workspace.getActiveFile()?.path ?? null)),
		);
		this.render();
		return Promise.resolve();
	}

	onClose(): Promise<void> {
		if (this.canvas) {
			this.removeChild(this.canvas);
			this.canvas = null;
		}
		return Promise.resolve();
	}

	getState(): Record<string, unknown> {
		return { ...this.state };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === "object") {
			const s = state as Partial<Record<keyof TreeViewState, unknown>>;
			if (s.mode === "tree" || s.mode === "outline") this.state.mode = s.mode;
			if (s.scope === "focus" || s.scope === "all") this.state.scope = s.scope;
			if (s.up !== undefined) this.state.up = clampLevels(s.up, this.state.up);
			if (s.down !== undefined) this.state.down = clampLevels(s.down, this.state.down);
			if (typeof s.pinned === "boolean") this.state.pinned = s.pinned;
			if (typeof s.focus === "string") this.state.focus = s.focus;
		}
		if (this.bodyEl) this.render();
		await super.setState(state, result);
	}

	/** Centres the view on a note (used by "Reveal in tree"); keeps the pin as it is. */
	setFocus(id: string): void {
		this.state.scope = "focus";
		this.state.focus = id;
		this.render();
		this.app.workspace.requestSaveLayout();
	}

	private followActive(path: string | null): void {
		if (!path || this.state.pinned || path === this.state.focus) return;
		this.state.focus = path;
		this.render();
		this.app.workspace.requestSaveLayout();
	}

	private buildToolbar(bar: HTMLElement): void {
		const group = (parent: HTMLElement) => parent.createDiv({ cls: "btoc-tb-group" });
		const button = (parent: HTMLElement, key: string, icon: string, label: string, onClick: () => void) => {
			const el = parent.createEl("button", { cls: "btoc-tb-btn", attr: { "aria-label": label, title: label } });
			setIcon(el, icon);
			el.addEventListener("click", onClick);
			this.buttons.set(key, el);
			return el;
		};
		const set = <K extends keyof TreeViewState>(key: K, value: TreeViewState[K]) => {
			this.state[key] = value;
			this.render();
			this.app.workspace.requestSaveLayout();
		};

		const modes = group(bar);
		button(modes, "mode:tree", "git-fork", "Drawn tree", () => set("mode", "tree"));
		button(modes, "mode:outline", "list-tree", "Outline", () => set("mode", "outline"));

		const scopes = group(bar);
		button(scopes, "scope:focus", "crosshair", "Family tree of the current note", () => set("scope", "focus"));
		button(scopes, "scope:all", "network", "Whole vault", () => set("scope", "all"));

		const levels = bar.createDiv({ cls: "btoc-tb-levels" });
		const level = (icon: string, label: string, key: "up" | "down") => {
			const wrap = levels.createSpan({ cls: "btoc-tb-level", attr: { "aria-label": label, title: label } });
			setIcon(wrap.createSpan({ cls: "btoc-tb-level-icon" }), icon);
			const input = wrap.createEl("input", { type: "number", attr: { min: "0", max: "10", "aria-label": label } });
			input.addEventListener("change", () => set(key, clampLevels(input.value, this.state[key])));
			return input;
		};
		this.upInput = level("arrow-up", "Levels up", "up");
		this.downInput = level("arrow-down", "Levels down", "down");

		bar.createDiv({ cls: "btoc-tb-spacer" });
		const misc = group(bar);
		button(misc, "pinned", "pin", "Pin: stop following the active note", () => set("pinned", !this.state.pinned));
		button(misc, "fit", "maximize", "Fit to view", () => this.canvas?.fit());
	}

	private syncToolbar(): void {
		const active = (key: string, on: boolean) => this.buttons.get(key)?.toggleClass("is-active", on);
		active("mode:tree", this.state.mode === "tree");
		active("mode:outline", this.state.mode === "outline");
		active("scope:focus", this.state.scope === "focus");
		active("scope:all", this.state.scope === "all");
		active("pinned", this.state.pinned);
		const pin = this.buttons.get("pinned");
		if (pin) setIcon(pin, this.state.pinned ? "pin-off" : "pin");
		this.buttons.get("fit")?.toggleClass("is-hidden", this.state.mode !== "tree");
		if (this.upInput) this.upInput.value = String(this.state.up);
		if (this.downInput) this.downInput.value = String(this.state.down);
		const levelsVisible = this.state.scope === "focus";
		this.upInput?.parentElement?.parentElement?.toggleClass("is-hidden", !levelsVisible);
	}

	render(): void {
		const body = this.bodyEl;
		if (!body) return;
		this.syncToolbar();
		if (this.canvas) {
			this.removeChild(this.canvas);
			this.canvas = null;
		}
		body.empty();
		body.toggleClass("is-outline", this.state.mode === "outline");

		const g = this.plugin.graph.graph;
		const s = this.plugin.settings;
		const hint = `Add a "${firstProperty(s.parentProperties, "parent")}" or "${firstProperty(s.childProperties, "child")}" property holding a link to another note.`;
		let sub: Subgraph;
		if (this.state.scope === "focus") {
			const focus = this.state.focus;
			if (!focus) {
				this.message(body, "Open a note to see its family tree.", hint);
				return;
			}
			if (!g.nodes.has(focus)) {
				const name = this.plugin.graph.fileOf(focus)?.basename ?? focus;
				const el = this.message(body, `${name} has no parent or child links yet.`, hint);
				const btn = el.createEl("button", { text: "Show the whole vault" });
				btn.addEventListener("click", () => {
					this.state.scope = "all";
					this.render();
				});
				return;
			}
			sub = neighborhood(g, focus, this.state.up, this.state.down);
		} else {
			sub = forest(g);
			if (sub.ids.length === 0) {
				this.message(body, "No notes have parent or child properties yet.", hint);
				return;
			}
		}

		if (this.state.mode === "tree") {
			const lay = layout(g, sub, { orientation: s.orientation, style: s.treeStyle });
			this.canvas = new TreeCanvas(body, lay, this.actions, sub.focus);
			this.addChild(this.canvas);
		} else {
			renderOutline(body, g, outline(g, sub), this.actions, { focus: sub.focus, collapsed: this.collapsed });
		}
	}

	private message(body: HTMLElement, text: string, hint: string): HTMLElement {
		const el = body.createDiv({ cls: "btoc-empty" });
		el.createEl("p", { text });
		el.createEl("p", { cls: "btoc-hint", text: hint });
		return el;
	}
}
