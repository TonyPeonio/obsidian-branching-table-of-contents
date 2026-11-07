import { describe, expect, it } from "vitest";
import {
	buildGraph,
	childrenOf,
	flattenOutline,
	forest,
	neighborhood,
	outline,
	parentsOf,
	pathToRoot,
	type Edge,
	type GraphNode,
} from "../src/graph";

const node = (id: string, order?: number): GraphNode => ({ id, name: id, missing: false, order });
const chain = (...ids: string[]): Edge[] => ids.slice(1).map((c, i) => ({ parent: ids[i], child: c }));

describe("buildGraph", () => {
	it("records both directions, sorted, without duplicates or self-loops", () => {
		const g = buildGraph([node("A"), node("B"), node("C")], [
			{ parent: "A", child: "C" },
			{ parent: "A", child: "B" },
			{ parent: "A", child: "B" },
			{ parent: "B", child: "B" },
			{ parent: "A", child: "Nope" },
		]);
		expect(childrenOf(g, "A")).toEqual(["B", "C"]);
		expect(parentsOf(g, "B")).toEqual(["A"]);
		expect(parentsOf(g, "C")).toEqual(["A"]);
		expect(childrenOf(g, "B")).toEqual([]);
	});

	it("sorts by the order property first, then by name, numerically", () => {
		const g = buildGraph(
			[node("P"), node("item10"), node("item2"), node("zeta", 1), node("alpha", 2)],
			[
				{ parent: "P", child: "item10" },
				{ parent: "P", child: "item2" },
				{ parent: "P", child: "alpha" },
				{ parent: "P", child: "zeta" },
			],
		);
		expect(childrenOf(g, "P")).toEqual(["zeta", "alpha", "item2", "item10"]);
	});
});

describe("neighborhood", () => {
	// A -> B -> C -> D -> E -> F
	const g = buildGraph("ABCDEF".split("").map((id) => node(id)), chain("A", "B", "C", "D", "E", "F"));

	it("shows two levels up and two down from E", () => {
		const sub = neighborhood(g, "E", 2, 2);
		expect(sub.ids).toEqual(["C", "D", "E", "F"]);
		expect(sub.ids.map((id) => [id, sub.layer.get(id)])).toEqual([
			["C", -2],
			["D", -1],
			["E", 0],
			["F", 1],
		]);
		expect(sub.roots).toEqual(["C"]);
		expect(sub.edges).toEqual([
			{ parent: "C", child: "D" },
			{ parent: "D", child: "E" },
			{ parent: "E", child: "F" },
		]);
	});

	it("shows A through E from C", () => {
		const sub = neighborhood(g, "C", 2, 2);
		expect(sub.ids).toEqual(["A", "B", "C", "D", "E"]);
		expect(sub.layer.get("A")).toBe(-2);
		expect(sub.layer.get("E")).toBe(2);
	});

	it("handles multiple parents and children", () => {
		const g2 = buildGraph(["A", "B", "X", "C", "D"].map((id) => node(id)), [
			{ parent: "A", child: "X" },
			{ parent: "B", child: "X" },
			{ parent: "X", child: "C" },
			{ parent: "X", child: "D" },
		]);
		const sub = neighborhood(g2, "X", 1, 1);
		expect(sub.ids).toEqual(["A", "B", "X", "C", "D"]);
		expect(sub.roots).toEqual(["A", "B"]);
	});

	it("uses the shortest distance when a note is reachable two ways", () => {
		// A -> B -> C and A -> C: from A, C is on layer 1.
		const g2 = buildGraph(["A", "B", "C"].map((id) => node(id)), [...chain("A", "B", "C"), { parent: "A", child: "C" }]);
		const sub = neighborhood(g2, "A", 0, 3);
		expect(sub.layer.get("C")).toBe(1);
		expect(sub.edges).toContainEqual({ parent: "B", child: "C" });
	});

	it("survives cycles, placing a note on the nearer side", () => {
		// A -> B -> A
		const g2 = buildGraph([node("A"), node("B")], [...chain("A", "B"), { parent: "B", child: "A" }]);
		const sub = neighborhood(g2, "A", 2, 2);
		expect(sub.ids).toEqual(["A", "B"]);
		expect(sub.layer.get("B")).toBe(1);
		expect(sub.edges).toHaveLength(2);
	});

	it("is just the focus when it has no links", () => {
		const sub = neighborhood(buildGraph([node("A")], []), "A", 2, 2);
		expect(sub.ids).toEqual(["A"]);
		expect(sub.roots).toEqual(["A"]);
	});
});

describe("forest", () => {
	it("starts from every parentless note and layers by depth", () => {
		const g = buildGraph(["R1", "R2", "a", "b", "c"].map((id) => node(id)), [
			{ parent: "R1", child: "a" },
			{ parent: "R2", child: "a" },
			{ parent: "a", child: "b" },
			{ parent: "R1", child: "c" },
			{ parent: "b", child: "c" },
		]);
		const sub = forest(g);
		expect(sub.focus).toBeNull();
		expect(sub.roots).toEqual(["R1", "R2"]);
		expect(sub.layer.get("a")).toBe(1);
		expect(sub.layer.get("b")).toBe(2);
		expect(sub.layer.get("c")).toBe(1);
	});

	it("promotes a member of an unreachable cycle to a root", () => {
		const g = buildGraph([node("y"), node("x"), node("z")], [...chain("x", "y", "z"), { parent: "z", child: "x" }]);
		const sub = forest(g);
		expect(sub.roots).toEqual(["x"]);
		expect(sub.ids).toEqual(["x", "y", "z"]);
	});
});

describe("pathToRoot", () => {
	it("walks up the first parent at each step", () => {
		const g = buildGraph(["A", "B", "C", "D"].map((id) => node(id)), [
			...chain("A", "B", "D"),
			{ parent: "C", child: "D" },
		]);
		expect(pathToRoot(g, "D")).toEqual(["A", "B", "D"]);
		expect(pathToRoot(g, "A")).toEqual(["A"]);
	});

	it("terminates on a cycle", () => {
		const g = buildGraph([node("A"), node("B")], [...chain("A", "B"), { parent: "B", child: "A" }]);
		expect(pathToRoot(g, "A")).toEqual(["B", "A"]);
	});
});

describe("outline", () => {
	it("lists a note under each parent with an also-under marker", () => {
		const g = buildGraph(["R", "A", "B", "D"].map((id) => node(id)), [
			{ parent: "R", child: "A" },
			{ parent: "R", child: "B" },
			{ parent: "A", child: "D" },
			{ parent: "B", child: "D" },
		]);
		const rows = flattenOutline(outline(g, forest(g))).map((r) => [r.depth, r.item.id, r.item.alsoUnder.join(",")]);
		expect(rows).toEqual([
			[0, "R", ""],
			[1, "A", ""],
			[2, "D", "B"],
			[1, "B", ""],
			[2, "D", "A"],
		]);
	});

	it("marks cycles instead of recursing forever", () => {
		const g = buildGraph([node("A"), node("B")], [...chain("A", "B"), { parent: "B", child: "A" }]);
		const rows = flattenOutline(outline(g, forest(g))).map((r) => [r.depth, r.item.id, r.item.cycle]);
		expect(rows).toEqual([
			[0, "A", false],
			[1, "B", false],
			[2, "A", true],
		]);
	});

	it("lists a shortcut target without repeating its branch", () => {
		// A -> B -> C -> D and A -> C: C sits on layer 1, so under B (also layer 1) it is a cross-reference.
		const g = buildGraph("ABCD".split("").map((id) => node(id)), [...chain("A", "B", "C", "D"), { parent: "A", child: "C" }]);
		const rows = flattenOutline(outline(g, forest(g))).map((r) => [r.depth, r.item.id, r.item.cross, r.item.alsoUnder.join(",")]);
		expect(rows).toEqual([
			[0, "A", false, ""],
			[1, "B", false, ""],
			[2, "C", true, "A"],
			[1, "C", false, "B"],
			[2, "D", false, ""],
		]);
	});

	it("does not re-expand an ancestor reached through a back edge", () => {
		// A -> X, B -> X, X -> E, E -> A. Focus X: A is an ancestor; under B the chain reaches A again.
		const g = buildGraph("ABXE".split("").map((id) => node(id)), [
			{ parent: "A", child: "X" },
			{ parent: "B", child: "X" },
			{ parent: "X", child: "E" },
			{ parent: "E", child: "A" },
		]);
		const rows = flattenOutline(outline(g, neighborhood(g, "X", 1, 2))).map((r) => [r.depth, r.item.id, r.item.cycle, r.item.cross]);
		expect(rows).toEqual([
			[0, "A", false, false],
			[1, "X", false, false],
			[2, "E", false, false],
			[3, "A", true, false],
			[0, "B", false, false],
			[1, "X", false, false],
			[2, "E", false, false],
			[3, "A", false, true],
		]);
	});

	it("only follows children inside the subgraph", () => {
		const g = buildGraph("ABCD".split("").map((id) => node(id)), chain("A", "B", "C", "D"));
		const rows = flattenOutline(outline(g, neighborhood(g, "A", 0, 2))).map((r) => r.item.id);
		expect(rows).toEqual(["A", "B", "C"]);
	});
});
