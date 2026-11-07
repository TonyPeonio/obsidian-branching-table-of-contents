import { describe, expect, it } from "vitest";
import { cleanLink, flattenStrings, linkDisplayName, propertyLinks, propertyNumber } from "../src/links";

describe("cleanLink", () => {
	it("strips wikilink syntax, aliases and subpaths", () => {
		expect(cleanLink("[[Physics]]")).toBe("Physics");
		expect(cleanLink("  [[Physics|Phys]]  ")).toBe("Physics");
		expect(cleanLink("[[Physics#Heading]]")).toBe("Physics");
		expect(cleanLink("[[Physics#^block]]")).toBe("Physics");
		expect(cleanLink("Courses/Physics.md")).toBe("Courses/Physics");
		expect(cleanLink("Physics")).toBe("Physics");
		expect(cleanLink("   ")).toBe("");
	});

	it("reads markdown links", () => {
		expect(cleanLink("[Phys](Courses/Quantum%20Physics.md)")).toBe("Courses/Quantum Physics");
		expect(cleanLink("[x](<Some Note.md>)")).toBe("Some Note");
	});
});

describe("flattenStrings", () => {
	it("handles strings, numbers and nested arrays", () => {
		expect(flattenStrings("a")).toEqual(["a"]);
		expect(flattenStrings(["a", ["b", ["c"]]])).toEqual(["a", "b", "c"]);
		expect(flattenStrings(42)).toEqual(["42"]);
		expect(flattenStrings(null)).toEqual([]);
		expect(flattenStrings({ a: 1 })).toEqual([]);
	});
});

describe("propertyLinks", () => {
	it("merges parsed links with raw values and de-duplicates", () => {
		const fm = { Parent: '"[[A]]"', children: [["B"], "[[C|see C]]", "c"], other: "[[Z]]" };
		const links = [
			{ key: "Parent", link: "A" },
			{ key: "children.1", link: "C" },
		];
		expect(propertyLinks(fm, links, ["parent"])).toEqual(["A"]);
		expect(propertyLinks(fm, links, ["children", "child"])).toEqual(["C", "B"]);
		expect(propertyLinks(fm, links, ["nothing"])).toEqual([]);
		expect(propertyLinks(undefined, undefined, ["parent"])).toEqual([]);
	});
});

describe("propertyNumber", () => {
	it("reads numbers and numeric strings, case-insensitively", () => {
		expect(propertyNumber({ "TOC-Order": 3 }, "toc-order")).toBe(3);
		expect(propertyNumber({ "toc-order": "2.5" }, "toc-order")).toBe(2.5);
		expect(propertyNumber({ "toc-order": "abc" }, "toc-order")).toBeUndefined();
		expect(propertyNumber({}, "toc-order")).toBeUndefined();
		expect(propertyNumber({ "toc-order": 1 }, "")).toBeUndefined();
	});
});

describe("linkDisplayName", () => {
	it("uses the last path segment", () => {
		expect(linkDisplayName("Courses/Physics")).toBe("Physics");
		expect(linkDisplayName("Physics")).toBe("Physics");
	});
});
