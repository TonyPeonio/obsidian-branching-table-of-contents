import { describe, expect, it } from "vitest";
import { addLink, sanitizeTitle } from "../src/related-notes";

describe("addLink", () => {
	it("writes a parent link as text first, then as a list", () => {
		const fm: Record<string, unknown> = {};
		addLink(fm, "parent", "[[A]]", false);
		expect(fm).toEqual({ parent: "[[A]]" });
		addLink(fm, "parent", "[[B]]", false);
		expect(fm).toEqual({ parent: ["[[A]]", "[[B]]"] });
	});

	it("always writes child links as a list and skips duplicates", () => {
		const fm: Record<string, unknown> = { child: "[[Existing|alias]]" };
		addLink(fm, "child", "[[New]]", true);
		expect(fm).toEqual({ child: ["[[Existing|alias]]", "[[New]]"] });
		addLink(fm, "child", "[[existing]]", true);
		expect(fm).toEqual({ child: ["[[Existing|alias]]", "[[New]]"] });
	});

	it("drops empty entries", () => {
		const fm: Record<string, unknown> = { child: [null, "", " "] };
		addLink(fm, "child", "[[X]]", true);
		expect(fm).toEqual({ child: ["[[X]]"] });
	});
});

describe("sanitizeTitle", () => {
	it("removes characters Obsidian rejects", () => {
		expect(sanitizeTitle('  What: is "this"? / a #tag [x] ^y  ')).toBe("What is this a tag x y");
		expect(sanitizeTitle("***")).toBe("");
	});
});
