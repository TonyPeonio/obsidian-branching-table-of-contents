import { ItemView, setIcon, type HoverPopover, type ViewStateResult, type WorkspaceLeaf } from "obsidian";
import type { NodeActions } from "./actions";
import { forest, neighborhood, outline, type Subgraph } from "./graph";
import { layout } from "./layout";
import { log } from "./log";
import type BtocPlugin from "./main";
import { LARGE_OUTLINE, countItems, renderOutline } from "./render-outline";
import { shouldAskForFeedback } from "./report";
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
	private expanded = new Set<string>();
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
		this.toolbarEl = this.contentEl.createDiv({ cls: "btoc-toolbar", attr: { role: "group", "aria-label": "Tree view controls" } });
		this.bodyEl = this.contentEl.createDiv({ cls: "btoc-body" });
		this.buildToolbar(this.toolbarEl);
		this.countOpenAndMaybeAsk();

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

	/** Counts tree-view opens for the one-time feedback prompt, and shows it when it is due. */
	private countOpenAndMaybeAsk(): void {
		const s = this.plugin.settings;
		s.viewOpens++;
		this.plugin.guard("Could not save the plugin state.", this.plugin.saveState());
		if (!shouldAskForFeedback(s, Date.now())) return;
		const banner = this.contentEl.createDiv({ cls: "btoc-feedback", attr: { role: "region", "aria-label": "Feedback" } });
		this.contentEl.insertBefore(banner, this.bodyEl);
		banner.createSpan({ cls: "btoc-feedback-text", text: "What do you use Branching Table of Contents for? A two-line answer on GitHub helps decide what to build next." });
		const buttons = banner.createDiv({ cls: "btoc-feedback-buttons" });
		const answer = (state: "answered" | "snoozed" | "dismissed") => {
			banner.remove();
			if (state === "answered") {
				this.plugin.openFeedback();
				return;
			}
			s.feedbackPrompt = state;
			this.plugin.guard("Could not save the plugin state.", this.plugin.saveState());
		};
		buttons.createEl("button", { cls: "mod-cta", text: "Tell me on GitHub" }).addEventListener("click", () => answer("answered"));
		buttons.createEl("button", { text: "Not now" }).addEventListener("click", () => answer("snoozed"));
		buttons.createEl("button", { text: "Don't ask again" }).addEventListener("click", () => answer("dismissed"));
	}

	private buildToolbar(bar: HTMLElement): void {
		const group = (parent: HTMLElement, label: string) => parent.createDiv({ cls: "btoc-tb-group", attr: { role: "group", "aria-label": label } });
		const button = (parent: HTMLElement, key: string, icon: string, label: string, onClick: () => void) => {
			const el = parent.createEl("button", { cls: "btoc-tb-btn", attr: { "aria-label": label, title: label, type: "button" } });
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

		const modes = group(bar, "View");
		button(modes, "mode:tree", "git-fork", "Drawn tree", () => set("mode", "tree"));
		button(modes, "mode:outline", "list-tree", "Outline", () => set("mode", "outline"));
		// Same switch as Settings → Tree style, one click away: family tree ⇄ phylogenetic tree.
		button(modes, "style", "workflow", "Phylogenetic tree", () => {
			const s = this.plugin.settings;
			s.treeStyle = s.treeStyle === "phylogenetic" ? "boxes" : "phylogenetic";
			if (s.treeStyle === "phylogenetic" && this.state.mode !== "tree") this.state.mode = "tree";
			this.plugin.guard("Could not save the tree style.", this.plugin.saveSettings().then(() => this.render()));
		});

		const scopes = group(bar, "Scope");
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
		const misc = group(bar, "Pin and fit");
		button(misc, "pinned", "pin", "Pin: stop following the active note", () => set("pinned", !this.state.pinned));
		button(misc, "fit", "maximize", "Fit to view", () => this.canvas?.fit());
	}

	private syncToolbar(): void {
		const active = (key: string, on: boolean) => {
			const el = this.buttons.get(key);
			el?.toggleClass("is-active", on);
			el?.setAttribute("aria-pressed", String(on));
		};
		active("mode:tree", this.state.mode === "tree");
		active("mode:outline", this.state.mode === "outline");
		active("scope:focus", this.state.scope === "focus");
		active("scope:all", this.state.scope === "all");
		active("pinned", this.state.pinned);
		const phylo = this.plugin.settings.treeStyle === "phylogenetic";
		active("style", phylo && this.state.mode === "tree");
		const style = this.buttons.get("style");
		if (style) {
			const label = phylo ? "Phylogenetic tree (on): click for the family tree" : "Phylogenetic tree: draw the tree as a cladogram";
			style.setAttribute("aria-label", label);
			style.setAttribute("title", label);
		}
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

		try {
			const label = sub.focus ? `Family tree of ${this.plugin.graph.graph.nodes.get(sub.focus)?.name ?? sub.focus}` : "All trees in the vault";
			if (this.state.mode === "tree") {
				const lay = layout(g, sub, { orientation: s.orientation, style: s.treeStyle });
				this.canvas = new TreeCanvas(body, lay, this.actions, sub.focus);
				this.addChild(this.canvas);
			} else {
				const items = outline(g, sub);
				const large = countItems(items) > LARGE_OUTLINE;
				renderOutline(body, g, items, this.actions, {
					focus: sub.focus,
					collapsed: this.collapsed,
					expanded: this.expanded,
					collapseBelowLevel: large ? 2 : undefined,
					label,
				});
			}
		} catch (err) {
			log.error("Drawing the tree view failed", err);
			body.empty();
			const el = this.message(body, "Something went wrong while drawing this tree.", "The error was recorded. You can send a report with the button below; you review it first.");
			el.createEl("button", { text: "Report a problem" }).addEventListener("click", () => this.plugin.openReportModal("Drawing the tree view failed"));
		}
	}

	private message(body: HTMLElement, text: string, hint: string): HTMLElement {
		const el = body.createDiv({ cls: "btoc-empty" });
		el.createEl("p", { text });
		el.createEl("p", { cls: "btoc-hint", text: hint });
		return el;
	}
}
