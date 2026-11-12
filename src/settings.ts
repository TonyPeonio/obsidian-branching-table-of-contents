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
}

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
};

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
