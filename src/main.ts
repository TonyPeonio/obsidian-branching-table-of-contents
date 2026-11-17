import {
	FileSystemAdapter,
	Keymap,
	Menu,
	Notice,
	Platform,
	Plugin,
	apiVersion,
	type HoverParent,
	type PaneType,
	type WorkspaceLeaf,
} from "obsidian";
import { Breadcrumbs } from "./breadcrumbs";
import { registerTocCodeBlock } from "./codeblock";
import { pickRootAndGenerate } from "./export";
import { formatEntry, log } from "./log";
import { promptRelatedNote } from "./related-notes";
import { buildReport, feedbackLink, graphStats, reportSettings, reportTitle } from "./report";
import { ReportModal } from "./report-modal";
import { DEFAULT_SETTINGS, USER_SETTING_KEYS, normalizeSetting, type Settings } from "./settings";
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
		log.info(`Loaded ${this.manifest.version} on Obsidian ${apiVersion} (${platformName()})`);
		if (!this.settings.installedAt) {
			this.settings.installedAt = Date.now();
			await this.saveState();
		}

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

		this.addCommand({
			id: "report-problem",
			name: "Report a problem",
			callback: () => this.openReportModal(),
		});

		registerTocCodeBlock(this);
		this.breadcrumbs.start();
		this.addSettingTab(new BtocSettingTab(this.app, this));
		this.graph.start();
	}

	async loadSettings(): Promise<void> {
		const stored = (await this.loadData()) as Partial<Settings> | null;
		const merged: Settings = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
		// A hand-edited or older data.json must not break the view: repair out-of-range values.
		for (const key of USER_SETTING_KEYS) {
			(merged as unknown as Record<string, unknown>)[key] = normalizeSetting(key, merged[key], DEFAULT_SETTINGS);
		}
		this.settings = merged;
	}

	/** Saves settings the user changed and redraws everything that depends on them. */
	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.graph.rebuild();
		this.breadcrumbs.refreshAll();
	}

	/** Saves internal state (counters, prompt answers) without rebuilding anything. */
	async saveState(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Builds the problem report from what the plugin knows and shows it for review. */
	openReportModal(firstError?: string): void {
		const adapter = this.app.vault.adapter;
		const vaultPath = adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
		const g = this.graph.graph;
		const body = buildReport(
			{
				pluginVersion: this.manifest.version,
				obsidianVersion: apiVersion,
				platform: platformName(),
				theme: activeDocument.body.hasClass("theme-dark") ? "dark" : "light",
				settings: reportSettings(this.settings),
				stats: graphStats(g),
				timings: this.graph.timings(),
				log: log.last(50).map(formatEntry),
			},
			{ vaultPath },
		);
		new ReportModal(this.app, reportTitle(firstError), body).open();
	}

	/** Opens the prefilled "what do you use it for?" issue in the browser. */
	openFeedback(): void {
		window.open(feedbackLink(this.manifest.version));
		this.settings.feedbackPrompt = "answered";
		void this.saveState();
	}

	/** Logs an error and shows a notice with a link that opens the problem report. */
	notifyError(message: string, err?: unknown): void {
		log.error(message, err);
		console.error(`[Branching TOC] ${message}`, err);
		const fragment = createFragment((f) => {
			f.appendText(message + " ");
			const link = f.createEl("a", { text: "Report", href: "#", cls: "btoc-notice-report" });
			link.addEventListener("click", (evt) => {
				evt.preventDefault();
				this.openReportModal(message);
			});
		});
		new Notice(fragment, 10000);
	}

	/** Runs an async action and turns a failure into a reportable notice instead of a silent rejection. */
	guard(label: string, task: Promise<unknown>): void {
		task.catch((err: unknown) => this.notifyError(label, err));
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

	/**
	 * Opens a node's note in the main editor so it becomes the current note; a missing node's
	 * note is created. Modifier keys (or middle click) open a new tab or split instead.
	 */
	async openNode(id: string, evt: MouseEvent): Promise<void> {
		try {
			await this.openNodeUnguarded(id, evt);
		} catch (err) {
			this.notifyError("Could not open the note.", err);
		}
	}

	private async openNodeUnguarded(id: string, evt: MouseEvent): Promise<void> {
		const ws = this.app.workspace;
		const leaf = this.editorLeaf(Keymap.isModEvent(evt));
		const file = this.graph.fileOf(id);
		if (file) {
			await leaf.openFile(file, { active: true });
			return;
		}
		if (this.graph.isMissing(id)) {
			// openLinkText targets the active leaf, so make the editor leaf active first; otherwise
			// a click from the sidebar would replace the tree view with the new note.
			ws.setActiveLeaf(leaf, { focus: false });
			await ws.openLinkText(this.graph.missingLink(id), "", false);
		}
	}

	/**
	 * The leaf to open notes in. A plain click goes to the most recently used tab in the main
	 * area (never a sidebar leaf, which is where the click came from), or a new tab if there is
	 * none or it is pinned. With a modifier, Obsidian's own new-tab/split behaviour applies.
	 */
	private editorLeaf(newLeaf: PaneType | boolean): WorkspaceLeaf {
		const ws = this.app.workspace;
		if (newLeaf) return ws.getLeaf(newLeaf);
		const recent = ws.getMostRecentLeaf(ws.rootSplit);
		if (recent && !recent.getViewState().pinned) return recent;
		return ws.getLeaf("tab");
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

function platformName(): string {
	const os = Platform.isIosApp
		? "iOS"
		: Platform.isAndroidApp
			? "Android"
			: Platform.isMacOS
				? "macOS"
				: Platform.isWin
					? "Windows"
					: Platform.isLinux
						? "Linux"
						: "unknown OS";
	return `${Platform.isMobile ? "mobile" : "desktop"}, ${os}`;
}
