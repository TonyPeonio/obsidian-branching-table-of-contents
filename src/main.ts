import { Keymap, Menu, Plugin, type HoverParent, type WorkspaceLeaf } from "obsidian";
import { Breadcrumbs } from "./breadcrumbs";
import { registerTocCodeBlock } from "./codeblock";
import { pickRootAndGenerate } from "./export";
import { promptRelatedNote } from "./related-notes";
import { DEFAULT_SETTINGS, type Settings } from "./settings";
import { BtocSettingTab } from "./settings-tab";
import { TreeView, VIEW_TYPE } from "./tree-view";
import { VaultGraph } from "./vault-graph";

const HOVER_SOURCE = "branching-table-of-contents";

export default class BtocPlugin extends Plugin {
	settings: Settings = { ...DEFAULT_SETTINGS };
	graph: VaultGraph = new VaultGraph(this.app, this, () => this.settings);
	private breadcrumbs: Breadcrumbs = new Breadcrumbs(this);

	async onload(): Promise<void> {
		await this.loadSettings();

		this.registerView(VIEW_TYPE, (leaf) => new TreeView(leaf, this));
		this.registerHoverLinkSource(HOVER_SOURCE, { display: "Branching table of contents", defaultMod: true });
		this.addRibbonIcon("git-fork", "Open branching table of contents", () => void this.activateView());

		this.addCommand({
			id: "open-tree-view",
			name: "Open tree view",
			callback: () => void this.activateView(),
		});
		this.addCommand({
			id: "reveal-current-note",
			name: "Reveal current note in tree",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void this.revealInTree(file.path);
				return true;
			},
		});
		this.addCommand({
			id: "create-child-note",
			name: "Create child note of current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) promptRelatedNote(this, file, "child");
				return true;
			},
		});
		this.addCommand({
			id: "create-parent-note",
			name: "Create parent note of current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) promptRelatedNote(this, file, "parent");
				return true;
			},
		});
		this.addCommand({
			id: "generate-toc-note",
			name: "Generate table of contents note",
			callback: () => pickRootAndGenerate(this),
		});

		registerTocCodeBlock(this);
		this.breadcrumbs.start();
		this.addSettingTab(new BtocSettingTab(this.app, this));
		this.graph.start();
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<Settings> | null;
		this.settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.graph.rebuild();
		this.breadcrumbs.refreshAll();
	}

	/** Opens (or reveals) the tree view in the right sidebar. */
	async activateView(): Promise<TreeView | null> {
		const ws = this.app.workspace;
		let leaf: WorkspaceLeaf | null = ws.getLeavesOfType(VIEW_TYPE)[0] ?? null;
		if (!leaf) {
			leaf = ws.getRightLeaf(false);
			if (!leaf) return null;
			await leaf.setViewState({ type: VIEW_TYPE, active: true });
		}
		await ws.revealLeaf(leaf);
		return leaf.view instanceof TreeView ? leaf.view : null;
	}

	async revealInTree(id: string): Promise<void> {
		const view = await this.activateView();
		view?.setFocus(id);
	}

	/** Opens a node's note; a missing node's note is created. Modifier keys open in a new tab/split. */
	async openNode(id: string, evt: MouseEvent): Promise<void> {
		const newLeaf = Keymap.isModEvent(evt);
		const file = this.graph.fileOf(id);
		if (file) {
			await this.app.workspace.getLeaf(newLeaf).openFile(file);
			return;
		}
		if (this.graph.isMissing(id)) {
			await this.app.workspace.openLinkText(this.graph.missingLink(id), "", newLeaf);
		}
	}

	hoverNode(id: string, evt: MouseEvent, target: HTMLElement | SVGElement, parent: HoverParent): void {
		const file = this.graph.fileOf(id);
		if (!file) return;
		this.app.workspace.trigger("hover-link", {
			event: evt,
			source: HOVER_SOURCE,
			hoverParent: parent,
			targetEl: target,
			linktext: file.path,
			sourcePath: "",
		});
	}

	nodeMenu(id: string, evt: MouseEvent): void {
		const menu = new Menu();
		const file = this.graph.fileOf(id);
		if (file) {
			menu.addItem((i) =>
				i
					.setTitle("Open in new tab")
					.setIcon("file-plus")
					.onClick(() => void this.app.workspace.getLeaf("tab").openFile(file)),
			);
			menu.addItem((i) =>
				i
					.setTitle("Open to the right")
					.setIcon("separator-vertical")
					.onClick(() => void this.app.workspace.getLeaf("split").openFile(file)),
			);
			menu.addSeparator();
			menu.addItem((i) =>
				i
					.setTitle("Show in tree")
					.setIcon("git-fork")
					.onClick(() => void this.revealInTree(id)),
			);
			menu.addItem((i) =>
				i
					.setTitle("Create child note")
					.setIcon("file-plus-2")
					.onClick(() => promptRelatedNote(this, file, "child")),
			);
			menu.addItem((i) =>
				i
					.setTitle("Create parent note")
					.setIcon("file-up")
					.onClick(() => promptRelatedNote(this, file, "parent")),
			);
			menu.addSeparator();
			this.app.workspace.trigger("file-menu", menu, file, HOVER_SOURCE);
		} else {
			menu.addItem((i) =>
				i
					.setTitle("Create this note")
					.setIcon("file-plus")
					.onClick(() => void this.openNode(id, evt)),
			);
		}
		menu.showAtMouseEvent(evt);
	}
}
