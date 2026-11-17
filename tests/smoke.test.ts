// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { NodeActions } from "../src/actions";
import { buildGraph, forest, neighborhood, outline, type Edge, type GraphNode } from "../src/graph";
import { layout } from "../src/layout";
import { countItems, renderOutline } from "../src/render-outline";
import { LAZY_NODES, TreeCanvas } from "../src/render-tree";
import { installObsidianDom } from "./dom";

const node = (id: string, missing = false): GraphNode => ({ id, name: id, missing });
const chain = (...ids: string[]): Edge[] => ids.slice(1).map((c, i) => ({ parent: ids[i], child: c }));

function actions(): NodeActions & { open: ReturnType<typeof vi.fn>; hover: ReturnType<typeof vi.fn>; menu: ReturnType<typeof vi.fn> } {
	return { open: vi.fn(), hover: vi.fn(), menu: vi.fn() };
}

const g = buildGraph([...["A", "B", "X", "C", "D", "E"].map((id) => node(id)), node("missing:ghost", true)], [
	{ parent: "A", child: "X" },
	{ parent: "B", child: "X" },
	{ parent: "X", child: "C" },
	{ parent: "X", child: "D" },
	{ parent: "D", child: "E" },
	{ parent: "C", child: "E" },
	{ parent: "X", child: "missing:ghost" },
	...chain("E", "A"),
]);

beforeAll(() => installObsidianDom());

describe("TreeCanvas", () => {
	it("draws nodes and edges, routes clicks and menus, pans, and cleans up", () => {
		const container = document.body.createDiv();
		const sub = neighborhood(g, "X", 2, 2);
		const lay = layout(g, sub);
		const act = actions();
		const canvas = new TreeCanvas(container, lay, act, "X");
		canvas.load();

		const svg = container.querySelector("svg.btoc-svg");
		expect(svg).not.toBeNull();
		expect(container.querySelectorAll(".btoc-node")).toHaveLength(sub.ids.length);
		const segments = Array.from(container.querySelectorAll(".btoc-edge")).reduce((n, p) => n + (p.getAttribute("d")?.match(/M /g)?.length ?? 0), 0);
		expect(segments).toBe(sub.edges.length);
		expect(container.querySelectorAll(".btoc-node.is-focus")).toHaveLength(1);
		expect(container.querySelectorAll(".btoc-node.is-missing")).toHaveLength(1);
		expect(container.querySelectorAll(".btoc-node.is-ancestor").length).toBeGreaterThan(0);
		expect(container.querySelector(".btoc-node.is-focus")?.getAttribute("aria-label")).toBe("X, current note");

		const focusEl = container.querySelector<SVGGElement>(".btoc-node.is-focus");
		if (!focusEl || !svg) throw new Error("missing elements");
		focusEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(act.open).toHaveBeenCalledWith("X", expect.any(MouseEvent));
		focusEl.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
		expect(act.menu).toHaveBeenCalledWith("X", expect.any(MouseEvent));
		focusEl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
		expect(act.hover).toHaveBeenCalledWith("X", expect.any(MouseEvent), focusEl);

		const viewport = container.querySelector(".btoc-viewport");
		const before = viewport?.getAttribute("transform");
		svg.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
		expect(viewport?.getAttribute("transform")).not.toBe(before);

		// Drag: pointer events are not in jsdom, so build generic events with the fields read.
		const pointer = (type: string, x: number, y: number) => {
			const evt = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }) as MouseEvent & { pointerId: number; pointerType: string };
			Object.defineProperty(evt, "pointerId", { value: 1 });
			Object.defineProperty(evt, "pointerType", { value: "mouse" });
			return evt;
		};
		(svg as unknown as { setPointerCapture: () => void }).setPointerCapture = () => undefined;
		(svg as unknown as { hasPointerCapture: () => boolean }).hasPointerCapture = () => false;
		const mid = viewport?.getAttribute("transform");
		svg.dispatchEvent(pointer("pointerdown", 0, 0));
		svg.dispatchEvent(pointer("pointermove", 40, 30));
		expect(viewport?.getAttribute("transform")).not.toBe(mid);
		expect(svg.classList.contains("is-panning")).toBe(true);
		svg.dispatchEvent(pointer("pointerup", 40, 30));
		expect(svg.classList.contains("is-panning")).toBe(false);
		act.open.mockClear();
		focusEl.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(act.open).not.toHaveBeenCalled();

		canvas.unload();
		expect(container.querySelector("svg")).toBeNull();
	});

	it("renders the whole forest and a left-to-right layout", () => {
		const container = document.body.createDiv();
		const sub = forest(g);
		const canvas = new TreeCanvas(container, layout(g, sub, { orientation: "left-right" }), actions(), null);
		canvas.load();
		expect(container.querySelectorAll(".btoc-node")).toHaveLength(g.nodes.size);
		expect(container.querySelectorAll(".btoc-node.is-focus")).toHaveLength(0);
		canvas.unload();
	});

	it("shows badges for links beyond the drawn levels", () => {
		const container = document.body.createDiv();
		const canvas = new TreeCanvas(container, layout(g, neighborhood(g, "X", 0, 1)), actions(), "X");
		canvas.load();
		// D and C both have E below them, outside the single drawn level.
		expect(container.querySelectorAll(".btoc-badge.is-bottom").length).toBe(2);
		// A and B are hidden parents of X.
		expect(container.querySelectorAll(".btoc-badge.is-top").length).toBe(1);
		canvas.unload();
	});
});

describe("renderOutline", () => {
	it("nests items, marks also-under and cycles, collapses, and opens notes", () => {
		const container = document.body.createDiv();
		const act = actions();
		const collapsed = new Set<string>();
		const sub = neighborhood(g, "X", 1, 2);
		renderOutline(container, g, outline(g, sub), act, { focus: "X", collapsed });

		const rows = Array.from(container.querySelectorAll(".btoc-row"));
		expect(rows.length).toBeGreaterThan(0);
		expect(container.querySelectorAll(".btoc-row.is-focus").length).toBe(2); // X under A and under B
		const metas = Array.from(container.querySelectorAll(".btoc-meta")).map((m) => m.textContent);
		expect(metas).toContain("also under B");
		expect(metas).toContain("also under A");
		expect(metas).toContain("missing");
		expect(metas.some((m) => m?.startsWith("also under"))).toBe(true);

		const first = container.querySelector(".btoc-item");
		const chevron = first?.querySelector(".btoc-chevron.is-active");
		if (!first || !chevron) throw new Error("missing elements");
		chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(first.classList.contains("is-collapsed")).toBe(true);
		expect(collapsed.size).toBe(1);
		chevron.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(first.classList.contains("is-collapsed")).toBe(false);
		expect(collapsed.size).toBe(0);

		const link = first.querySelector(".btoc-link");
		link?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		expect(act.open).toHaveBeenCalledWith("A", expect.any(MouseEvent));
		link?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(act.open).toHaveBeenCalledTimes(2);
	});

	it("marks a cycle instead of looping", () => {
		const container = document.body.createDiv();
		const sub = forest(g);
		renderOutline(container, g, outline(g, sub), actions(), { focus: null, collapsed: new Set() });
		expect(container.querySelectorAll(".btoc-meta.is-cycle").length).toBeGreaterThan(0);
	});
});

describe("keyboard navigation", () => {
	it("moves between drawn nodes with arrow keys using one Tab stop", () => {
		const container = document.body.createDiv();
		const sub = neighborhood(g, "X", 1, 1);
		const lay = layout(g, sub);
		const act = actions();
		const canvas = new TreeCanvas(container, lay, act, "X");
		canvas.load();
		const tabStops = container.querySelectorAll(".btoc-node[tabindex='0']");
		expect(tabStops).toHaveLength(1);
		const focusEl = tabStops[0] as SVGGElement;
		expect(focusEl.dataset.id).toBe("X");
		expect(focusEl.getAttribute("aria-current")).toBe("page");
		expect(container.querySelector("svg")?.getAttribute("role")).toBe("group");

		focusEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
		const up = container.querySelector<SVGGElement>(".btoc-node[tabindex='0']");
		expect(up?.dataset.id).toBe("A");
		expect(document.activeElement).toBe(up);
		expect(up?.getAttribute("aria-label")).toBe("A, parent, 1 more parent not shown");

		up?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		expect(container.querySelector<SVGGElement>(".btoc-node[tabindex='0']")?.dataset.id).toBe("B");

		const b = container.querySelector<SVGGElement>(".btoc-node[tabindex='0']");
		b?.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
		expect(container.querySelector<SVGGElement>(".btoc-node[tabindex='0']")?.dataset.id).toBe("X");

		focusEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		expect(act.open).toHaveBeenCalledWith("X", expect.any(MouseEvent));
		focusEl.dispatchEvent(new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
		expect(act.menu).toHaveBeenCalledWith("X", expect.any(MouseEvent));
		canvas.unload();
	});

	it("follows the ARIA tree pattern in the outline", () => {
		const container = document.body.createDiv();
		const act = actions();
		const sub = neighborhood(g, "X", 0, 2);
		renderOutline(container, g, outline(g, sub), act, { focus: "X", collapsed: new Set(), label: "Family tree of X" });
		const tree = container.querySelector("[role=tree]");
		expect(tree?.getAttribute("aria-label")).toBe("Family tree of X");
		const items = () => Array.from(container.querySelectorAll<HTMLElement>("[role=treeitem]"));
		const stops = () => items().filter((el) => el.getAttribute("tabindex") === "0");
		expect(stops()).toHaveLength(1);
		const root = stops()[0];
		expect(root.dataset.id).toBe("X");
		expect(root.getAttribute("aria-expanded")).toBe("true");
		expect(root.getAttribute("aria-level")).toBe("1");

		const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
		key(root, "ArrowDown");
		expect(document.activeElement?.getAttribute("data-id")).toBe("C");
		expect(document.activeElement?.getAttribute("aria-level")).toBe("2");
		expect(stops()).toHaveLength(1);
		key(document.activeElement!, "ArrowLeft"); // C is expanded (has E): collapse it
		expect(document.activeElement?.getAttribute("aria-expanded")).toBe("false");
		key(document.activeElement!, "ArrowLeft"); // now go to the parent
		expect(document.activeElement).toBe(root);
		key(root, "ArrowLeft");
		expect(root.getAttribute("aria-expanded")).toBe("false");
		key(root, "ArrowDown"); // nothing visible below a collapsed root
		expect(document.activeElement).toBe(root);
		key(root, "ArrowRight");
		expect(root.getAttribute("aria-expanded")).toBe("true");
		key(root, "End");
		expect(document.activeElement).not.toBe(root);
		key(document.activeElement!, "Home");
		expect(document.activeElement).toBe(root);
		key(root, "Enter");
		expect(act.open).toHaveBeenCalledWith("X", expect.any(MouseEvent));
	});
});

describe("large trees", () => {
	it("creates nodes lazily as they come into view, and on keyboard focus", () => {
		const n = LAZY_NODES + 200;
		const ids = Array.from({ length: n }, (_, i) => `n${String(i).padStart(4, "0")}`);
		const big = buildGraph(
			ids.map((id) => node(id)),
			ids.slice(1).map((id, i) => ({ parent: ids[Math.floor(i / 3)], child: id })),
		);
		const lay = layout(big, forest(big));
		const container = document.body.createDiv();
		Object.defineProperty(container, "clientWidth", { value: 400 });
		Object.defineProperty(container, "clientHeight", { value: 300 });
		const canvas = new TreeCanvas(container, lay, actions(), null);
		canvas.load();
		expect(canvas.drawnCount).toBeGreaterThan(0);
		expect(canvas.drawnCount).toBeLessThan(n / 2);
		const far = lay.nodes.reduce((a, b) => (b.x > a.x ? b : a));
		canvas.focusNode(far.id);
		expect(container.querySelector(`.btoc-node[data-id="${far.id}"]`)).not.toBeNull();
		expect(document.activeElement?.getAttribute("data-id")).toBe(far.id);
		canvas.unload();
	});
});

describe("large outlines", () => {
	it("starts deep branches collapsed and builds them only when opened", () => {
		const container = document.body.createDiv();
		const expanded = new Set<string>();
		const collapsed = new Set<string>();
		const items = outline(g, neighborhood(g, "X", 0, 3));
		expect(countItems(items)).toBeGreaterThan(3);
		renderOutline(container, g, items, actions(), { focus: "X", collapsed, expanded, collapseBelowLevel: 1 });
		const all = () => container.querySelectorAll("[role=treeitem]");
		expect(all()).toHaveLength(1);
		const root = all()[0] as HTMLElement;
		expect(root.getAttribute("aria-expanded")).toBe("false");
		root.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
		expect(all().length).toBeGreaterThan(1);
		expect(expanded.has("X")).toBe(true);
	});
});
