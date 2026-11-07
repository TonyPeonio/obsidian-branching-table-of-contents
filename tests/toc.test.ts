import { describe, expect, it } from "vitest";
import { buildGraph, type GraphNode } from "../src/graph";
import { tocMarkdown } from "../src/toc";

const node = (id: string, name = id, missing = false): GraphNode => ({ id, name, missing });

describe("tocMarkdown", () => {
	it("writes a nested wikilink list with also-under and missing markers", () => {
		const g = buildGraph(
			[node("Root.md", "Root"), node("sub/A.md", "A"), node("B.md", "B"), node("D.md", "D"), node("missing:ghost", "Ghost", true)],
			[
				{ parent: "Root.md", child: "sub/A.md" },
				{ parent: "Root.md", child: "B.md" },
				{ parent: "sub/A.md", child: "D.md" },
				{ parent: "B.md", child: "D.md" },
				{ parent: "B.md", child: "missing:ghost" },
			],
		);
		const md = tocMarkdown(g, "Root.md", {
			maxDepth: 10,
			heading: "Root",
			link: (id) => (id === "sub/A.md" ? "sub/A" : g.nodes.get(id)?.name ?? id),
		});
		expect(md).toBe(
			[
				"# Root",
				"",
				"- [[Root]]",
				"\t- [[sub/A|A]]",
				"\t\t- [[D]] *(also under B)*",
				"\t- [[B]]",
				"\t\t- [[D]] *(also under A)*",
				"\t\t- [[Ghost]] *(missing)*",
				"",
			].join("\n"),
		);
	});

	it("stops at maxDepth and marks cycles", () => {
		const g = buildGraph([node("A"), node("B"), node("C")], [
			{ parent: "A", child: "B" },
			{ parent: "B", child: "C" },
			{ parent: "C", child: "A" },
		]);
		expect(tocMarkdown(g, "A", { maxDepth: 1, link: (id) => id })).toBe("- [[A]] *(also under C)*\n\t- [[B]]\n");
		expect(tocMarkdown(g, "A", { maxDepth: 5, link: (id) => id })).toBe(
			"- [[A]] *(also under C)*\n\t- [[B]]\n\t\t- [[C]]\n\t\t\t- [[A]] *(cycle)*\n",
		);
	});
});
