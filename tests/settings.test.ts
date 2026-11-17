import { describe, expect, it } from "vitest";
import type { SettingDefinitionItem } from "obsidian";
import { settingDefinitions } from "../src/settings-tab";
import { DEFAULT_SETTINGS, USER_SETTING_KEYS, normalizeSetting } from "../src/settings";

function controlKeys(items: SettingDefinitionItem[]): string[] {
	const out: string[] = [];
	for (const item of items) {
		if ("type" in item && (item.type === "group" || item.type === "list")) out.push(...controlKeys((item.items ?? []) as SettingDefinitionItem[]));
		else if ("control" in item && item.control) out.push(item.control.key);
	}
	return out;
}

describe("settingDefinitions", () => {
	const defs = settingDefinitions({ reportProblem: () => undefined, shareFeedback: () => undefined });

	it("declares every user setting exactly once", () => {
		const keys = controlKeys(defs);
		expect([...keys].sort()).toEqual([...USER_SETTING_KEYS].sort());
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("offers dropdown options that match what normalizeSetting accepts", () => {
		for (const group of defs) {
			if (!("items" in group) || !group.items) continue;
			for (const item of group.items) {
				if (!("control" in item) || item.control?.type !== "dropdown") continue;
				const key = item.control.key;
				for (const option of Object.keys(item.control.options)) {
					expect(normalizeSetting(key, option, DEFAULT_SETTINGS)).toBe(option);
				}
			}
		}
	});

	it("has a Report a problem action", () => {
		let called = false;
		const items = settingDefinitions({ reportProblem: () => (called = true), shareFeedback: () => undefined });
		const help = items.find((g) => "heading" in g && g.heading === "Help and feedback");
		const report = help && "items" in help ? help.items?.find((i) => i.name === "Report a problem") : undefined;
		if (!report || !("action" in report) || !report.action) throw new Error("no report action");
		report.action({} as HTMLElement, 0);
		expect(called).toBe(true);
	});
});

describe("normalizeSetting", () => {
	it("clamps numbers and rejects unknown choices", () => {
		expect(normalizeSetting("levelsUp", 99, DEFAULT_SETTINGS)).toBe(10);
		expect(normalizeSetting("levelsDown", "3", DEFAULT_SETTINGS)).toBe(3);
		expect(normalizeSetting("levelsDown", "abc", DEFAULT_SETTINGS)).toBe(DEFAULT_SETTINGS.levelsDown);
		expect(normalizeSetting("tocMaxDepth", 0, DEFAULT_SETTINGS)).toBe(1);
		expect(normalizeSetting("tocMaxDepth", 45, DEFAULT_SETTINGS)).toBe(30);
		expect(normalizeSetting("treeStyle", "spiral", DEFAULT_SETTINGS)).toBe("boxes");
		expect(normalizeSetting("showMissing", "yes", DEFAULT_SETTINGS)).toBe(true);
		expect(normalizeSetting("parentProperties", 5, DEFAULT_SETTINGS)).toBe("parent, parents");
		expect(normalizeSetting("parentProperties", "up", DEFAULT_SETTINGS)).toBe("up");
	});
});
