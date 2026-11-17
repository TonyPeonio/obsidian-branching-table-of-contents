import {
	PluginSettingTab,
	Setting,
	type App,
	type SettingDefinition,
	type SettingDefinitionGroup,
	type SettingDefinitionItem,
} from "obsidian";
import type BtocPlugin from "./main";
import { USER_SETTING_KEYS, normalizeSetting, type UserSettingKey } from "./settings";

export interface SettingsTabActions {
	reportProblem(): void;
	shareFeedback(): void;
}

/**
 * Every setting, declared once. Obsidian 1.13+ renders these itself and indexes them for the
 * settings search; older versions get the same list drawn by {@link renderDefinitions}.
 */
export function settingDefinitions(actions: SettingsTabActions): SettingDefinitionItem<UserSettingKey>[] {
	return [
		{
			type: "group",
			heading: "Properties",
			items: [
				{
					name: "Parent properties",
					desc: "Frontmatter properties that hold links to a note's parents. Comma-separated; the first one is written when you create a child note.",
					aliases: ["parent", "up", "hierarchy"],
					control: { type: "text", key: "parentProperties" },
				},
				{
					name: "Child properties",
					desc: "Frontmatter properties that hold links to a note's children. Comma-separated; the first one is written when you create a parent note.",
					aliases: ["child", "down", "hierarchy"],
					control: { type: "text", key: "childProperties" },
				},
				{
					name: "Order property",
					desc: "Optional numeric property used to sort siblings. Lower comes first; notes without it follow alphabetically.",
					aliases: ["sort", "order"],
					control: { type: "text", key: "orderProperty" },
				},
				{
					name: "Exclude folders",
					desc: "Folders to ignore, one per line or comma-separated (for example Templates).",
					aliases: ["ignore", "skip"],
					control: { type: "textarea", key: "excludeFolders" },
				},
				{
					name: "Show missing notes",
					desc: "Draw links to notes that do not exist yet as dashed boxes. Clicking one creates the note.",
					aliases: ["unresolved", "dangling"],
					control: { type: "toggle", key: "showMissing" },
				},
			],
		},
		{
			type: "group",
			heading: "Tree view",
			items: [
				{
					name: "Levels up",
					desc: "How many generations above the current note to show (0 to 10).",
					aliases: ["ancestors", "depth"],
					control: { type: "number", key: "levelsUp", min: 0, max: 10, step: 1 },
				},
				{
					name: "Levels down",
					desc: "How many generations below the current note to show (0 to 10).",
					aliases: ["descendants", "depth"],
					control: { type: "number", key: "levelsDown", min: 0, max: 10, step: 1 },
				},
				{
					name: "Default view",
					aliases: ["outline", "mode"],
					control: { type: "dropdown", key: "defaultMode", options: { tree: "Drawn tree", outline: "Outline" } },
				},
				{
					name: "Default scope",
					desc: "Family tree of the current note, or every tree in the vault.",
					aliases: ["whole vault", "forest"],
					control: { type: "dropdown", key: "defaultScope", options: { focus: "Current note", all: "Whole vault" } },
				},
				{
					name: "Tree style",
					desc: "Family tree draws each note as a box on the row of its level, joined by curves. Phylogenetic tree draws right-angled branches and lines up the notes at the ends of the branches, like a cladogram; it reads best left to right.",
					aliases: ["phylogenetic", "cladogram", "family tree"],
					control: { type: "dropdown", key: "treeStyle", options: { boxes: "Family tree", phylogenetic: "Phylogenetic tree" } },
				},
				{
					name: "Layout direction",
					aliases: ["orientation", "horizontal", "vertical"],
					control: { type: "dropdown", key: "orientation", options: { "top-down": "Top to bottom", "left-right": "Left to right" } },
				},
				{
					name: "Follow the active note",
					desc: "Newly opened tree views re-centre on whichever note you open. You can pin a view from its toolbar.",
					aliases: ["pin", "follow"],
					control: { type: "toggle", key: "followActiveNote" },
				},
			],
		},
		{
			type: "group",
			heading: "Breadcrumbs",
			items: [
				{
					name: "Show breadcrumbs",
					desc: "Show the path from the root at the top of every note that has a parent.",
					aliases: ["trail", "path"],
					control: { type: "toggle", key: "showBreadcrumbs" },
				},
			],
		},
		{
			type: "group",
			heading: "New notes",
			items: [
				{
					name: "Where to write the link",
					desc: "When creating a child or parent note, which note gets the property that links the two.",
					aliases: ["create child", "create parent"],
					control: { type: "dropdown", key: "newNoteLink", options: { new: "The new note", existing: "The existing note", both: "Both" } },
				},
			],
		},
		{
			type: "group",
			heading: "Table of contents note",
			items: [
				{
					name: "Note name suffix",
					desc: "Appended to the root note's name. The note is created in the root note's folder.",
					control: { type: "text", key: "tocNoteSuffix" },
				},
				{
					name: "Maximum depth",
					desc: "How many levels below the root to list (1 to 30).",
					control: { type: "number", key: "tocMaxDepth", min: 1, max: 30, step: 1 },
				},
			],
		},
		{
			type: "group",
			heading: "Help and feedback",
			items: [
				{
					name: "Report a problem",
					desc: "Opens a report you can read and edit first: versions, settings, graph counts and recent log lines, with paths hidden and no note contents. Nothing is sent until you choose to open it on GitHub.",
					aliases: ["bug", "issue", "support", "error"],
					action: () => actions.reportProblem(),
				},
				{
					name: "Tell me what you use it for",
					desc: "Opens a short, prefilled GitHub issue in your browser that you can edit or close. Optional; the plugin never sends anything by itself.",
					aliases: ["feedback", "idea", "feature request"],
					action: () => actions.shareFeedback(),
				},
			],
		},
	];
}

export class BtocSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: BtocPlugin,
	) {
		super(app, plugin);
	}

	getSettingDefinitions(): SettingDefinitionItem<UserSettingKey>[] {
		return settingDefinitions({
			reportProblem: () => this.plugin.openReportModal(),
			shareFeedback: () => this.plugin.openFeedback(),
		});
	}

	getControlValue(key: string): unknown {
		return isUserKey(key) ? this.plugin.settings[key] : undefined;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (!isUserKey(key)) return;
		const s = this.plugin.settings;
		(s as Record<UserSettingKey, unknown>)[key] = normalizeSetting(key, value, s);
		await this.plugin.saveSettings();
	}

	/** Obsidian before 1.13 has no declarative settings: draw the same definitions by hand. */
	display(): void {
		this.containerEl.empty();
		renderDefinitions(this.containerEl, this.getSettingDefinitions(), {
			get: (key) => this.getControlValue(key),
			set: (key, value) => void this.setControlValue(key, value),
		});
	}
}

function str(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function isUserKey(key: string): key is UserSettingKey {
	return (USER_SETTING_KEYS as readonly string[]).includes(key);
}

interface ValueStore {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
}

/** Imperative fallback renderer for the subset of definitions this plugin uses. */
export function renderDefinitions(container: HTMLElement, items: SettingDefinitionItem[], store: ValueStore): void {
	for (const item of items) {
		if ("type" in item && (item.type === "group" || item.type === "list")) {
			const group = item as SettingDefinitionGroup;
			if (group.heading) new Setting(container).setName(group.heading).setHeading();
			renderDefinitions(container, group.items ?? [], store);
			continue;
		}
		if ("type" in item) continue; // Pages are not used here.
		renderDefinition(container, item, store);
	}
}

function renderDefinition(container: HTMLElement, def: SettingDefinition, store: ValueStore): void {
	const setting = new Setting(container).setName(def.name);
	if (def.desc) setting.setDesc(def.desc);
	if ("action" in def && def.action) {
		const action = def.action;
		setting.addButton((b) => b.setButtonText("Open").onClick(() => action(setting.settingEl, 0)));
		return;
	}
	if (!("control" in def) || !def.control) return;
	const c = def.control;
	const value = store.get(c.key);
	switch (c.type) {
		case "text":
			setting.addText((t) => t.setValue(str(value)).onChange((v) => store.set(c.key, v)));
			break;
		case "textarea":
			setting.addTextArea((t) => t.setValue(str(value)).onChange((v) => store.set(c.key, v)));
			break;
		case "toggle":
			setting.addToggle((t) => t.setValue(value === true).onChange((v) => store.set(c.key, v)));
			break;
		case "dropdown":
			setting.addDropdown((d) =>
				d
					.addOptions(c.options)
					.setValue(str(value))
					.onChange((v) => store.set(c.key, v)),
			);
			break;
		case "number":
			setting.addText((t) => {
				t.inputEl.type = "number";
				if (c.min !== undefined) t.inputEl.min = String(c.min);
				if (c.max !== undefined) t.inputEl.max = String(c.max);
				t.setValue(str(value)).onChange((v) => {
					const n = parseFloat(v);
					if (Number.isFinite(n)) store.set(c.key, n);
				});
			});
			break;
		default:
			break;
	}
}
