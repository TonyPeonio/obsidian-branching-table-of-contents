import { describe, expect, it } from "vitest";
import { buildGraph, forest, neighborhood, type Edge, type GraphNode } from "../src/graph";
import { layout, truncateLabel, type LayoutNode } from "../src/layout";

const node = (id: string, missing = false): GraphNode => ({ id, name: id, missing });
const chain = (...ids: string[]): Edge[] => ids.slice(1).map((c, i) => ({ parent: ids[i], child: c }));

function overlaps(a: LayoutNode, b: LayoutNode): boolean {
	return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

function assertNoOverlap(nodes: LayoutNode[]): void {
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			expect(overlaps(nodes[i], nodes[j]), `${nodes[i].id} overlaps ${nodes[j].id}`).toBe(false);
		}
	}
}

describe("layout", () => {
	it("centres a parent over its children and keeps layers in rows", () => {
		const g = buildGraph(["P", "a", "b", "c"].map((id) => node(id)), [
			{ parent: "P", child: "a" },
			{ parent: "P", child: "b" },
			{ parent: "P", child: "c" },
		]);
		const l = layout(g, neighborhood(g, "P", 0, 1));
		const byId = new Map(l.nodes.map((n) => [n.id, n]));
		const p = byId.get("P");
		const a = byId.get("a");
		const b = byId.get("b");
		const c = byId.get("c");
		if (!p || !a || !b || !c) throw new Error("missing node");
		expect(p.x).toBeCloseTo(b.x, 5);
		expect(a.x).toBeLessThan(b.x);
		expect(b.x).toBeLessThan(c.x);
		expect(a.y).toBe(b.y);
		expect(p.y).toBeLessThan(a.y);
		assertNoOverlap(l.nodes);
		expect(l.edges).toHaveLength(3);
		expect(l.edges.every((e) => e.d.startsWith("M ") && !e.irregular)).toBe(true);
	});

	it("lays ancestors above and descendants below the focus with no overlaps", () => {
		const g = buildGraph(["A", "B", "X", "C", "D", "E"].map((id) => node(id)), [
			{ parent: "A", child: "X" },
			{ parent: "B", child: "X" },
			{ parent: "X", child: "C" },
			{ parent: "X", child: "D" },
			{ parent: "D", child: "E" },
		]);
		const l = layout(g, neighborhood(g, "X", 2, 2));
		const byId = new Map(l.nodes.map((n) => [n.id, n]));
		const x = byId.get("X");
		const a = byId.get("A");
		const e = byId.get("E");
		if (!x || !a || !e) throw new Error("missing node");
		expect(a.y).toBeLessThan(x.y);
		expect(e.y).toBeGreaterThan(x.y);
		assertNoOverlap(l.nodes);
		expect(l.width).toBeGreaterThan(0);
		expect(l.height).toBeGreaterThan(0);
		for (const n of l.nodes) {
			expect(n.x - n.w / 2).toBeGreaterThanOrEqual(0);
			expect(n.y - n.h / 2).toBeGreaterThanOrEqual(0);
			expect(n.x + n.w / 2).toBeLessThanOrEqual(l.width);
			expect(n.y + n.h / 2).toBeLessThanOrEqual(l.height);
		}
	});

	it("draws every edge, including skip-level ones, and flags them", () => {
		const g = buildGraph(["A", "B", "C"].map((id) => node(id)), [...chain("A", "B", "C"), { parent: "A", child: "C" }]);
		const l = layout(g, neighborhood(g, "A", 0, 3));
		expect(l.edges).toHaveLength(3);
		const skip = l.edges.find((e) => e.parent === "B" && e.child === "C");
		expect(skip?.irregular).toBe(true);
		expect(skip?.d).toContain("C ");
	});

	it("reports hidden parents and children at the boundary", () => {
		const g = buildGraph("ABCDE".split("").map((id) => node(id)), chain("A", "B", "C", "D", "E"));
		const l = layout(g, neighborhood(g, "C", 1, 1));
		const byId = new Map(l.nodes.map((n) => [n.id, n]));
		expect(byId.get("B")?.hiddenParents).toEqual(["A"]);
		expect(byId.get("D")?.hiddenChildren).toEqual(["E"]);
		expect(byId.get("C")?.hiddenParents).toEqual([]);
	});

	it("lays a forest out side by side", () => {
		const g = buildGraph(["R1", "R2", "a", "b"].map((id) => node(id)), [
			{ parent: "R1", child: "a" },
			{ parent: "R2", child: "b" },
		]);
		const l = layout(g, forest(g));
		const byId = new Map(l.nodes.map((n) => [n.id, n]));
		expect(byId.get("R1")?.y).toBe(byId.get("R2")?.y);
		expect((byId.get("R1")?.x ?? 0) < (byId.get("R2")?.x ?? 0)).toBe(true);
		assertNoOverlap(l.nodes);
	});

	it("swaps axes for left-to-right", () => {
		const g = buildGraph(["P", "a", "b"].map((id) => node(id)), [
			{ parent: "P", child: "a" },
			{ parent: "P", child: "b" },
		]);
		const l = layout(g, neighborhood(g, "P", 0, 1), { orientation: "left-right" });
		const byId = new Map(l.nodes.map((n) => [n.id, n]));
		expect((byId.get("P")?.x ?? 0) < (byId.get("a")?.x ?? 0)).toBe(true);
		expect(byId.get("a")?.x).toBe(byId.get("b")?.x);
		expect((byId.get("a")?.y ?? 0) < (byId.get("b")?.y ?? 0)).toBe(true);
		assertNoOverlap(l.nodes);
	});

	it("survives a cycle and a missing note", () => {
		const g = buildGraph([node("A"), node("B"), node("missing:x", true)], [
			...chain("A", "B"),
			{ parent: "B", child: "A" },
			{ parent: "A", child: "missing:x" },
		]);
		const l = layout(g, neighborhood(g, "A", 2, 2));
		expect(l.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "missing:x"]);
		expect(l.nodes.find((n) => n.id === "missing:x")?.missing).toBe(true);
		assertNoOverlap(l.nodes);
	});

	it("keeps a big random DAG free of overlaps", () => {
		const nodes: GraphNode[] = [];
		const edges: Edge[] = [];
		let seed = 7;
		const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
		for (let i = 0; i < 120; i++) {
			nodes.push({ id: `n${i}`, name: `Note number ${i} with a longish title`, missing: false });
			if (i > 0) {
				edges.push({ parent: `n${Math.floor(rand() * i)}`, child: `n${i}` });
				if (rand() < 0.3) edges.push({ parent: `n${Math.floor(rand() * i)}`, child: `n${i}` });
			}
		}
		const g = buildGraph(nodes, edges);
		assertNoOverlap(layout(g, forest(g)).nodes);
		assertNoOverlap(layout(g, neighborhood(g, "n40", 3, 3)).nodes);
		assertNoOverlap(layout(g, neighborhood(g, "n40", 3, 3), { orientation: "left-right" }).nodes);
	});
});

describe("truncateLabel", () => {
	it("shortens long names with an ellipsis", () => {
		expect(truncateLabel("short", 10)).toBe("short");
		expect(truncateLabel("a very long note title indeed", 10)).toBe("a very lo…");
	});
});
