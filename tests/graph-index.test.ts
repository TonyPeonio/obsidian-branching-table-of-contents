import { describe, expect, it } from "vitest";
import { GraphIndex, contribution, type ContributionOptions, type NoteFacts, type NoteInfo } from "../src/graph-index";
import { childrenOf, parentsOf } from "../src/graph";

/** A tiny fake vault: note name → path, resolved by name like Obsidian's shortest-path links. */
function vault(names: string[], orders: Record<string, number> = {}): ContributionOptions {
	const byName = new Map(names.map((n) => [n.toLowerCase(), n]));
	return {
		showMissing: true,
		isExcluded: (p) => p.startsWith("templates/"),
		resolve: (link): NoteInfo | null => {
			const name = byName.get(link.toLowerCase());
			return name ? { path: `${name}.md`, name, order: orders[name] } : null;
		},
	};
}

const facts = (name: string, parents: string[] = [], children: string[] = [], order?: number): NoteFacts => ({
	path: `${name}.md`,
	name,
	order,
	parents,
	children,
});

describe("contribution", () => {
	it("turns parent and child links into edges, with missing notes for unresolved links", () => {
		const c = contribution(facts("B", ["A"], ["C", "Ghost"]), vault(["A", "B", "C"]));
		expect(c?.edges).toEqual([
			{ parent: "A.md", child: "B.md" },
			{ parent: "B.md", child: "C.md" },
			{ parent: "B.md", child: "missing:ghost" },
		]);
		expect([...(c?.missing ?? [])]).toEqual([["missing:ghost", "Ghost"]]);
		expect(c?.nodes.map((n) => n.path)).toEqual(["B.md", "A.md", "C.md"]);
	});

	it("is null for notes without links and for excluded notes", () => {
		expect(contribution(facts("A"), vault(["A"]))).toBeNull();
		expect(contribution({ ...facts("T", ["A"]), path: "templates/T.md" }, vault(["A"]))).toBeNull();
	});

	it("drops missing links when they are hidden", () => {
		const c = contribution(facts("B", ["Ghost"]), { ...vault(["B"]), showMissing: false });
		expect(c?.edges).toEqual([]);
	});
});

describe("GraphIndex", () => {
	const names = ["A", "B", "C"];
	const opts = vault(names);
	const build = () => {
		const idx = new GraphIndex();
		idx.reset([
			["B.md", contribution(facts("B", ["A"]), opts)!],
			["C.md", contribution(facts("C", ["B"]), opts)!],
		]);
		return idx;
	};

	it("assembles the graph from contributions", () => {
		const idx = build();
		expect([...idx.graph.nodes.keys()].sort()).toEqual(["A.md", "B.md", "C.md"]);
		expect(childrenOf(idx.graph, "A.md")).toEqual(["B.md"]);
		expect(idx.size).toBe(2);
	});

	it("reports no change when a note is edited without touching its links", () => {
		const idx = build();
		const before = idx.graph;
		const f = facts("B", ["A"]);
		expect(idx.update("B.md", contribution(f, opts), f)).toBe(false);
		expect(idx.graph).toBe(before);
	});

	it("rebuilds when links change, and when a linked-to note changes its order", () => {
		const idx = build();
		const f = facts("C", ["A"]);
		expect(idx.update("C.md", contribution(f, opts), f)).toBe(true);
		expect(parentsOf(idx.graph, "C.md")).toEqual(["A.md"]);
		expect(childrenOf(idx.graph, "B.md")).toEqual([]);

		// A has no links of its own, but others link to it: a new order must still show.
		const a = facts("A", [], [], 5);
		expect(idx.update("A.md", contribution(a, opts), a)).toBe(true);
		expect(idx.graph.nodes.get("A.md")?.order).toBe(5);
	});

	it("removes a note's edges when its links are deleted", () => {
		const idx = build();
		const f = facts("C");
		expect(idx.update("C.md", contribution(f, opts), f)).toBe(true);
		expect(idx.graph.nodes.has("C.md")).toBe(false);
	});

	it("knows when a new note could resolve a missing link", () => {
		const idx = new GraphIndex();
		idx.reset([["B.md", contribution(facts("B", ["Folder/Ghost"]), opts)!]]);
		expect(idx.graph.nodes.get("missing:folder/ghost")?.name).toBe("Ghost");
		expect(idx.mayResolveMissing("ghost")).toBe(true);
		expect(idx.mayResolveMissing("Other")).toBe(false);
	});
});
