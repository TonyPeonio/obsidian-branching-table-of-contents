import type { Orientation, TreeStyle } from "./layout";

export type ViewMode = "tree" | "outline";
export type ViewScope = "focus" | "all";
export type NewNoteLink = "new" | "existing" | "both";

export interface Settings {
	/** Comma-separated property names that hold links to a note's parents. */
	parentProperties: string;
	/** Comma-separated property names that hold links to a note's children. */
	childProperties: string;
	/** Numeric property used to order siblings; lower comes first. */
	orderProperty: string;
	levelsUp: number;
	levelsDown: number;
	defaultMode: ViewMode;
	defaultScope: ViewScope;
	orientation: Orientation;
	/** How the drawn tree looks: boxes joined by curves, or a phylogenetic tree (cladogram). */
	treeStyle: TreeStyle;
	followActiveNote: boolean;
	showBreadcrumbs: boolean;
	showMissing: boolean;
	/** Comma- or newline-separated folder paths to ignore. */
	excludeFolders: string;
	/** When creating a child/parent note, which side gets the link written. */
	newNoteLink: NewNoteLink;
	tocNoteSuffix: string;
	tocMaxDepth: number;
	/** Not shown in settings: when the plugin first ran (ms since epoch), for the one-time feedback prompt. */
	installedAt: number;
	/** Not shown in settings: how many times the tree view has been opened. */
	viewOpens: number;
	/** Not shown in settings: the one-time "what do you use it for?" prompt. */
	feedbackPrompt: FeedbackPromptState;
}

export type FeedbackPromptState = "pending" | "snoozed" | "dismissed" | "answered";

export const DEFAULT_SETTINGS: Settings = {
	parentProperties: "parent, parents",
	childProperties: "child, children",
	orderProperty: "toc-order",
	levelsUp: 2,
	levelsDown: 2,
	defaultMode: "tree",
	defaultScope: "focus",
	orientation: "top-down",
	treeStyle: "boxes",
	followActiveNote: true,
	showBreadcrumbs: true,
	showMissing: true,
	excludeFolders: "",
	newNoteLink: "new",
	tocNoteSuffix: " - Table of Contents",
	tocMaxDepth: 12,
	installedAt: 0,
	viewOpens: 0,
	feedbackPrompt: "pending",
};

/** Settings keys the user edits in the settings tab (the rest is internal state). */
export const USER_SETTING_KEYS = [
	"parentProperties",
	"childProperties",
	"orderProperty",
	"levelsUp",
	"levelsDown",
	"defaultMode",
	"defaultScope",
	"orientation",
	"treeStyle",
	"followActiveNote",
	"showBreadcrumbs",
	"showMissing",
	"excludeFolders",
	"newNoteLink",
	"tocNoteSuffix",
	"tocMaxDepth",
] as const satisfies readonly (keyof Settings)[];

export type UserSettingKey = (typeof USER_SETTING_KEYS)[number];

/**
 * Turns a value coming from a settings control into what is stored: numbers are clamped to their
 * range, dropdowns fall back to the current value when the input is not one of their options.
 * Returns the current value unchanged for anything unusable.
 */
export function normalizeSetting<K extends UserSettingKey>(key: K, value: unknown, current: Settings): Settings[K] {
	const cur = current[key];
	const oneOf = (options: readonly string[]) => (typeof value === "string" && options.includes(value) ? value : cur);
	switch (key) {
		case "levelsUp":
		case "levelsDown":
			return clampLevels(value, cur as number) as Settings[K];
		case "tocMaxDepth": {
			const n = typeof value === "number" ? value : typeof value === "string" ? parseInt(value, 10) : NaN;
			return (Number.isFinite(n) ? Math.max(1, Math.min(30, Math.round(n))) : cur) as Settings[K];
		}
		case "defaultMode":
			return oneOf(["tree", "outline"]) as Settings[K];
		case "defaultScope":
			return oneOf(["focus", "all"]) as Settings[K];
		case "orientation":
			return oneOf(["top-down", "left-right"]) as Settings[K];
		case "treeStyle":
			return oneOf(["boxes", "phylogenetic"]) as Settings[K];
		case "newNoteLink":
			return oneOf(["new", "existing", "both"]) as Settings[K];
		case "followActiveNote":
		case "showBreadcrumbs":
		case "showMissing":
			return (typeof value === "boolean" ? value : cur) as Settings[K];
		default:
			return (typeof value === "string" ? value : cur) as Settings[K];
	}
}

/** Splits a comma/newline separated setting into trimmed, lower-cased, de-duplicated entries. */
export function parseList(value: string): string[] {
	const out: string[] = [];
	for (const raw of value.split(/[,\n]/)) {
		const v = raw.trim().toLowerCase();
		if (v && !out.includes(v)) out.push(v);
	}
	return out;
}

/** The property name written when creating links: the first configured one, or a fallback. */
export function firstProperty(value: string, fallback: string): string {
	const first = value.split(/[,\n]/).map((s) => s.trim()).find((s) => s.length > 0);
	return first ?? fallback;
}

export function clampLevels(n: unknown, fallback: number): number {
	const v = typeof n === "number" ? n : typeof n === "string" ? parseInt(n, 10) : NaN;
	if (!Number.isFinite(v)) return fallback;
	return Math.max(0, Math.min(10, Math.round(v)));
}
