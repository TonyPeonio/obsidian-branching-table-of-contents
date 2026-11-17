import { describe, expect, it } from "vitest";
import { buildGraph, findCycles, type Edge, type GraphNode } from "../src/graph";
import { RingLog, describeError, formatEntry } from "../src/log";
import {
	MAX_ISSUE_URL,
	PASTE_BODY,
	buildReport,
	feedbackLink,
	graphStats,
	issueLink,
	redactPaths,
	reportSettings,
	reportTitle,
	shouldAskForFeedback,
	type ReportInput,
} from "../src/report";
import { DEFAULT_SETTINGS } from "../src/settings";

const node = (id: string, missing = false): GraphNode => ({ id, name: id, missing });

describe("redactPaths", () => {
	it("replaces the vault and home folders in both slash styles and any case", () => {
		const paths = { vaultPath: "C:\\Users\\tony\\Documents\\Vault", homePath: "C:\\Users\\tony" };
		const text = [
			"at C:\\Users\\tony\\Documents\\Vault\\Notes\\a.md",
			"at c:/users/tony/documents/vault/Notes/b.md",
			"config in C:\\Users\\tony\\AppData\\Roaming\\obsidian",
		].join("\n");
		const out = redactPaths(text, paths);
		expect(out).toContain("<vault>\\Notes\\a.md");
		expect(out).toContain("<vault>/Notes/b.md");
		expect(out).toContain("~\\AppData\\Roaming\\obsidian");
		expect(out.toLowerCase()).not.toContain("tony");
	});

	it("hides other user folders on every platform even without known paths", () => {
		const out = redactPaths(
			"D:\\Users\\alice\\x.md /Users/bob/vault/y.md (/home/carol/z.md) file=/var/mobile/Containers/Data/Application/ABC-123/Documents/v",
		);
		expect(out).not.toMatch(/alice|bob|carol|ABC-123/);
		expect(out).toContain("~\\x.md");
		expect(out).toContain("~/vault/y.md");
		expect(out).toContain("(~/z.md)");
		expect(out).toContain("file=~/v");
	});

	it("handles a macOS vault path with a trailing slash", () => {
		expect(redactPaths("/Users/me/My Vault/a.md", { vaultPath: "/Users/me/My Vault/" })).toBe("<vault>/a.md");
	});

	it("leaves vault-relative paths and plain text alone", () => {
		expect(redactPaths("Physics/Mechanics.md has 3 children")).toBe("Physics/Mechanics.md has 3 children");
	});
});

describe("reportSettings", () => {
	it("keeps property names and choices but only counts excluded folders", () => {
		const r = reportSettings({ ...DEFAULT_SETTINGS, excludeFolders: "Private/Diary\nTemplates, Secret", installedAt: 123 });
		expect(r.excludedFolders).toBe(3);
		expect(JSON.stringify(r)).not.toContain("Diary");
		expect(r).not.toHaveProperty("installedAt");
		expect(r).not.toHaveProperty("feedbackPrompt");
		expect(r.parentProperties).toBe("parent, parents");
	});
});

function input(over: Partial<ReportInput> = {}): ReportInput {
	return {
		pluginVersion: "0.3.0",
		obsidianVersion: "1.9.0",
		platform: "desktop, Windows",
		theme: "dark",
		settings: reportSettings(DEFAULT_SETTINGS),
		stats: { notes: 10, missing: 1, links: 12, roots: 2, multiParent: 1, cycles: 0, notesInCycles: 0, maxDepth: 3 },
		timings: { "Last full graph build": "3.2 ms" },
		log: [],
		...over,
	};
}

describe("buildReport", () => {
	it("has the sections a maintainer needs and redacts paths in the log", () => {
		const body = buildReport(
			input({ log: ["ERROR Could not open C:\\Users\\tony\\Vault\\Secret.md"] }),
			{ vaultPath: "C:\\Users\\tony\\Vault" },
		);
		for (const h of ["### What happened?", "### Environment", "### Graph", "### Settings", "### Recent log"]) expect(body).toContain(h);
		expect(body).toContain("Plugin: Branching Table of Contents 0.3.0");
		expect(body).toContain("Missing notes: 1");
		expect(body).toContain("Last full graph build: 3.2 ms");
		expect(body).toContain("<vault>\\Secret.md");
		expect(body).not.toContain("tony");
	});

	it("keeps only the last 50 log lines and says when the log is empty", () => {
		const many = Array.from({ length: 80 }, (_, i) => `line ${i}`);
		const body = buildReport(input({ log: many }));
		expect(body).toContain("last 50 lines");
		expect(body).not.toContain("line 29\n");
		expect(body).toContain("line 30");
		expect(body).toContain("line 79");
		expect(buildReport(input())).toContain("(empty)");
	});
});

describe("issueLink", () => {
	it("prefills short reports into the URL", () => {
		const link = issueLink("Problem report", "hello & bye");
		expect(link.fits).toBe(true);
		expect(link.url).toBe(
			"https://github.com/TonyPeonio/obsidian-branching-table-of-contents/issues/new?title=Problem%20report&body=hello%20%26%20bye",
		);
	});

	it("falls back to a paste-it-here body when the URL would be too long", () => {
		const link = issueLink("Problem report", "x".repeat(MAX_ISSUE_URL));
		expect(link.fits).toBe(false);
		expect(link.url.length).toBeLessThan(MAX_ISSUE_URL);
		expect(decodeURIComponent(link.url)).toContain(PASTE_BODY.trim());
	});

	it("counts the encoded length, not the raw one", () => {
		// 2000 characters that each encode to 9 bytes (%E2%80%A6) exceed the limit.
		expect(issueLink("t", "…".repeat(2000)).fits).toBe(false);
	});
});

describe("reportTitle", () => {
	it("adds a shortened first error", () => {
		expect(reportTitle()).toBe("Problem report");
		expect(reportTitle("Could not open\nthe note.")).toBe("Problem report: Could not open the note.");
		expect(reportTitle("x".repeat(200)).length).toBe("Problem report: ".length + 80);
	});
});

describe("graphStats and findCycles", () => {
	it("counts notes, missing links, roots, multi-parent notes, cycles and depth", () => {
		const edges: Edge[] = [
			{ parent: "R", child: "A" },
			{ parent: "R", child: "B" },
			{ parent: "A", child: "C" },
			{ parent: "B", child: "C" },
			{ parent: "C", child: "missing:x" },
			// A separate loop: P -> Q -> S -> P
			{ parent: "P", child: "Q" },
			{ parent: "Q", child: "S" },
			{ parent: "S", child: "P" },
		];
		const g = buildGraph([..."RABCPQS"].map((id) => node(id)).concat(node("missing:x", true)), edges);
		expect(findCycles(g)).toEqual([["P", "Q", "S"]]);
		expect(graphStats(g)).toEqual({ notes: 7, missing: 1, links: 8, roots: 1, multiParent: 1, cycles: 1, notesInCycles: 3, maxDepth: 3 });
	});

	it("does not overflow the stack on a 20,000-note chain", () => {
		const n = 20000;
		const nodes = Array.from({ length: n }, (_, i) => node(`n${i}`));
		const edges = Array.from({ length: n - 1 }, (_, i) => ({ parent: `n${i}`, child: `n${i + 1}` }));
		edges.push({ parent: `n${n - 1}`, child: "n0" });
		const cycles = findCycles(buildGraph(nodes, edges));
		expect(cycles).toHaveLength(1);
		expect(cycles[0]).toHaveLength(n);
	});
});

describe("feedback prompt", () => {
	const DAY = 86400000;
	const base = { installedAt: 1_000_000, viewOpens: 10, feedbackPrompt: "pending" as const };
	it("waits a week and ten opens, then asks once", () => {
		expect(shouldAskForFeedback(base, base.installedAt + 6 * DAY)).toBe(false);
		expect(shouldAskForFeedback({ ...base, viewOpens: 9 }, base.installedAt + 8 * DAY)).toBe(false);
		expect(shouldAskForFeedback(base, base.installedAt + 8 * DAY)).toBe(true);
		expect(shouldAskForFeedback({ ...base, installedAt: 0 }, 99 * DAY)).toBe(false);
	});
	it("never asks again once answered or dismissed; a snooze waits for more opens", () => {
		const later = base.installedAt + 30 * DAY;
		expect(shouldAskForFeedback({ ...base, feedbackPrompt: "dismissed", viewOpens: 999 }, later)).toBe(false);
		expect(shouldAskForFeedback({ ...base, feedbackPrompt: "answered", viewOpens: 999 }, later)).toBe(false);
		expect(shouldAskForFeedback({ ...base, feedbackPrompt: "snoozed", viewOpens: 19 }, later)).toBe(false);
		expect(shouldAskForFeedback({ ...base, feedbackPrompt: "snoozed", viewOpens: 20 }, later)).toBe(true);
	});
	it("links to a prefilled issue and nothing else", () => {
		const url = feedbackLink("0.3.0");
		expect(url.startsWith("https://github.com/TonyPeonio/obsidian-branching-table-of-contents/issues/new?")).toBe(true);
		expect(decodeURIComponent(url)).toContain("Plugin 0.3.0");
	});
});

describe("RingLog", () => {
	it("keeps the newest entries in order once full", () => {
		let t = 0;
		const log = new RingLog(3, () => t++);
		for (const m of ["a", "b", "c", "d", "e"]) log.info(m);
		expect(log.size).toBe(3);
		expect(log.last(10).map((e) => e.message)).toEqual(["c", "d", "e"]);
		expect(log.last(2).map((e) => e.message)).toEqual(["d", "e"]);
		log.clear();
		expect(log.last(5)).toEqual([]);
	});

	it("formats errors with their first stack frames", () => {
		const log = new RingLog(5, () => 0);
		const err = new TypeError("boom");
		log.error("Failed", err);
		const [entry] = log.last(1);
		expect(entry.level).toBe("error");
		expect(entry.message).toMatch(/^Failed: TypeError: boom/);
		expect(formatEntry(entry)).toMatch(/^1970-01-01T00:00:00.000Z ERROR Failed/);
		expect(describeError("plain")).toBe("plain");
		expect(describeError({ a: 1 })).toBe('{"a":1}');
	});
});
