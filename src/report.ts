/**
 * "Report a problem": builds the text of a GitHub issue from facts the plugin already has.
 * Pure, so the redaction and the URL limits are unit-tested. Nothing here sends anything; the
 * modal shows the text for the user to read and edit, then copies it or opens the issue page.
 */
import { findCycles, forest, parentsOf, type Graph } from "./graph";
import type { Settings } from "./settings";

export const REPO = "TonyPeonio/obsidian-branching-table-of-contents";
/** Browsers and GitHub start failing somewhere above 8 KB of URL; stay well under it. */
export const MAX_ISSUE_URL = 7000;
export const LOG_LINES_IN_REPORT = 50;

export interface GraphStats {
	/** Notes taking part in the tree (real notes with at least one parent or child link). */
	notes: number;
	/** Links to notes that do not exist yet. */
	missing: number;
	/** Parent → child links. */
	links: number;
	/** Notes without a parent. */
	roots: number;
	/** Notes with more than one parent. */
	multiParent: number;
	/** Groups of notes that are their own ancestors. */
	cycles: number;
	/** Notes inside those groups. */
	notesInCycles: number;
	/** Longest root-to-note distance in the whole-vault forest. */
	maxDepth: number;
}

export function graphStats(g: Graph): GraphStats {
	let missing = 0;
	let links = 0;
	let roots = 0;
	let multiParent = 0;
	for (const n of g.nodes.values()) {
		if (n.missing) missing++;
		const parents = parentsOf(g, n.id).length;
		if (parents === 0) roots++;
		if (parents > 1) multiParent++;
	}
	for (const list of g.children.values()) links += list.length;
	const cycles = findCycles(g);
	let maxDepth = 0;
	for (const l of forest(g).layer.values()) maxDepth = Math.max(maxDepth, l);
	return {
		notes: g.nodes.size - missing,
		missing,
		links,
		roots,
		multiParent,
		cycles: cycles.length,
		notesInCycles: cycles.reduce((s, c) => s + c.length, 0),
		maxDepth,
	};
}

export interface ReportInput {
	pluginVersion: string;
	obsidianVersion: string;
	platform: string;
	theme?: string;
	settings: Record<string, unknown>;
	stats: GraphStats;
	/** Extra measurements, e.g. how long the last graph build took. */
	timings?: Record<string, string | number>;
	/** Already formatted log lines, oldest first. */
	log: string[];
}

export interface RedactPaths {
	/** Absolute path of the vault folder, replaced by `<vault>`. */
	vaultPath?: string | null;
	/** Absolute path of the home folder, replaced by `~`. */
	homePath?: string | null;
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Both slash styles of a path, without a trailing separator. */
function pathVariants(p: string): string[] {
	const trimmed = p.replace(/[\\/]+$/, "");
	if (!trimmed) return [];
	return [...new Set([trimmed, trimmed.replace(/\\/g, "/"), trimmed.replace(/\//g, "\\")])];
}

/**
 * Replaces the vault folder with `<vault>` and the home folder with `~`, in either slash style
 * and in any letter case (Windows paths are case-insensitive). Any other user folder that looks
 * like `C:\Users\name`, `/Users/name` or `/home/name` also becomes `~`, so a path from a stack
 * trace or another machine does not leak a user name either.
 */
export function redactPaths(text: string, paths: RedactPaths = {}): string {
	let out = text;
	const replace = (p: string | null | undefined, token: string) => {
		if (!p) return;
		// Longest variant first so `C:\Users\me\vault` wins over `C:\Users\me`.
		for (const v of pathVariants(p).sort((a, b) => b.length - a.length)) {
			out = out.replace(new RegExp(escapeRegExp(v), "gi"), token);
		}
	};
	replace(paths.vaultPath, "<vault>");
	replace(paths.homePath, "~");
	out = out
		.replace(/\b[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"'<>|:]+/gi, "~")
		.replace(/(^|[\s"'(=:])\/(?:Users|home)\/[^/\s"'<>|:]+/g, "$1~")
		.replace(/(^|[\s"'(=:])\/(?:var\/mobile|private\/var\/mobile)\/Containers\/[^\s"'<>|]+?\/Documents/g, "$1~");
	return out;
}

/**
 * The settings worth putting in a report. Property names and numbers are kept (they explain most
 * "my tree is empty" reports); the list of excluded folders is reduced to a count because folder
 * names can be personal. Internal state (install date, prompt answers) is left out.
 */
export function reportSettings(s: Settings): Record<string, string | number | boolean> {
	return {
		parentProperties: s.parentProperties,
		childProperties: s.childProperties,
		orderProperty: s.orderProperty,
		excludedFolders: s.excludeFolders.split(/[,\n]/).filter((f) => f.trim().length > 0).length,
		showMissing: s.showMissing,
		levelsUp: s.levelsUp,
		levelsDown: s.levelsDown,
		defaultMode: s.defaultMode,
		defaultScope: s.defaultScope,
		treeStyle: s.treeStyle,
		orientation: s.orientation,
		followActiveNote: s.followActiveNote,
		showBreadcrumbs: s.showBreadcrumbs,
		newNoteLink: s.newNoteLink,
		tocNoteSuffix: s.tocNoteSuffix,
		tocMaxDepth: s.tocMaxDepth,
	};
}

export function reportTitle(firstError?: string): string {
	const base = "Problem report";
	if (!firstError) return base;
	const short = firstError.replace(/\s+/g, " ").trim().slice(0, 80);
	return `${base}: ${short}`;
}

/** The issue body, as Markdown. Every absolute path in it is redacted. */
export function buildReport(input: ReportInput, paths: RedactPaths = {}): string {
	const lines: string[] = [];
	lines.push("### What happened?", "", "<!-- What did you do, what did you expect, and what happened instead? Screenshots help. -->", "", "");
	lines.push("### Environment", "");
	lines.push(`- Plugin: Branching Table of Contents ${input.pluginVersion}`);
	lines.push(`- Obsidian: ${input.obsidianVersion}`);
	lines.push(`- Platform: ${input.platform}`);
	if (input.theme) lines.push(`- Theme: ${input.theme}`);
	lines.push("");
	const st = input.stats;
	lines.push("### Graph", "");
	lines.push(`- Notes in the tree: ${st.notes}`);
	lines.push(`- Parent/child links: ${st.links}`);
	lines.push(`- Roots: ${st.roots}`);
	lines.push(`- Notes with several parents: ${st.multiParent}`);
	lines.push(`- Missing notes: ${st.missing}`);
	lines.push(`- Cycles: ${st.cycles} (${st.notesInCycles} notes)`);
	lines.push(`- Deepest level: ${st.maxDepth}`);
	for (const [k, v] of Object.entries(input.timings ?? {})) lines.push(`- ${k}: ${v}`);
	lines.push("");
	lines.push("### Settings", "", "```json", JSON.stringify(input.settings, null, 2), "```", "");
	const logLines = input.log.slice(-LOG_LINES_IN_REPORT);
	lines.push(`### Recent log (last ${logLines.length} lines)`, "", "```", ...(logLines.length ? logLines : ["(empty)"]), "```", "");
	lines.push("<sub>Made by the plugin's Report a problem command. Paths are shortened to ~ and &lt;vault&gt;; note contents are never included.</sub>", "");
	return redactPaths(lines.join("\n"), paths);
}

export interface IssueLink {
	url: string;
	/** False when the report was too long for a URL: the user must paste it from the clipboard. */
	fits: boolean;
}

export const PASTE_BODY =
	"The full report is on your clipboard. Paste it here (Ctrl+V or Cmd+V), then describe what happened.\n";

function newIssueUrl(repo: string, title: string, body: string): string {
	return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/**
 * The "new issue" link with the report prefilled, or, when that would be longer than
 * `maxLength`, a link with a short body asking the user to paste the report.
 */
export function issueLink(title: string, body: string, maxLength = MAX_ISSUE_URL, repo = REPO): IssueLink {
	const full = newIssueUrl(repo, title, body);
	if (full.length <= maxLength) return { url: full, fits: true };
	return { url: newIssueUrl(repo, title, PASTE_BODY), fits: false };
}

/** The one-time feedback prompt's link: a prefilled issue the user can edit or abandon. */
export function feedbackLink(pluginVersion: string, repo = REPO): string {
	const body = [
		"<!-- Thanks for taking a minute. Edit or delete anything below; nothing was sent automatically. -->",
		"",
		"**What do you use Branching Table of Contents for?** (courses, research, a wiki, fiction, ...)",
		"",
		"",
		"**What would make it more useful to you?**",
		"",
		"",
		`<sub>Plugin ${pluginVersion}</sub>`,
		"",
	].join("\n");
	return newIssueUrl(repo, "What I use Branching TOC for", body);
}

export interface FeedbackState {
	installedAt: number;
	viewOpens: number;
	feedbackPrompt: Settings["feedbackPrompt"];
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether to show the one-time "what do you use it for?" prompt: only after a week of use and a
 * handful of tree-view opens, never again once answered or dismissed. "Not now" snoozes it until
 * twice as many opens have happened.
 */
export function shouldAskForFeedback(state: FeedbackState, now: number): boolean {
	if (state.feedbackPrompt === "dismissed" || state.feedbackPrompt === "answered") return false;
	if (!state.installedAt || now - state.installedAt < 7 * DAY) return false;
	const needed = state.feedbackPrompt === "snoozed" ? 20 : 10;
	return state.viewOpens >= needed;
}
