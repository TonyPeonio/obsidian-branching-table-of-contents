import { describe, expect, it } from "vitest";
import { parseBlockOptions } from "../src/codeblock";

describe("parseBlockOptions", () => {
	it("reads the tree style, with the spellings people use", () => {
		expect(parseBlockOptions("style: phylogenetic").style).toBe("phylogenetic");
		expect(parseBlockOptions("style: phylogenic").style).toBe("phylogenetic");
		expect(parseBlockOptions("style: Cladogram").style).toBe("phylogenetic");
		expect(parseBlockOptions("style: boxes").style).toBe("boxes");
		expect(parseBlockOptions("style: spiral").style).toBeNull();
	});

	it("has sensible defaults", () => {
		expect(parseBlockOptions("")).toEqual({ root: null, up: 0, down: 2, mode: "outline", orientation: null, style: null, height: 320 });
	});

	it("reads every key and cleans the root link", () => {
		const opts = parseBlockOptions(["root: [[Courses/Physics|Phys]]", "up: 1", "depth: 4", "mode: tree", "direction: left-right", "height: 500"].join("\n"));
		expect(opts).toEqual({ root: "Courses/Physics", up: 1, down: 4, mode: "tree", orientation: "left-right", style: null, height: 500 });
	});

	it("ignores junk and clamps values", () => {
		const opts = parseBlockOptions("mode: banana\nup: 99\ndown: -3\nheight: 5\nnonsense\nroot: \"Quoted\"");
		expect(opts.mode).toBe("outline");
		expect(opts.up).toBe(10);
		expect(opts.down).toBe(0);
		expect(opts.height).toBe(120);
		expect(opts.root).toBe("Quoted");
	});
});
