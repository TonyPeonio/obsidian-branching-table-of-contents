// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { NodeActions } from "../src/actions";
import { buildGraph, forest, neighborhood, outline, type Edge, type GraphNode } from "../src/graph";
import { layout } from "../src/layout";
import { renderOutline } from "../src/render-outline";
import { TreeCanvas } from "../src/render-tree";
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
		expect(container.querySelectorAll(".btoc-edge")).toHaveLength(sub.edges.length);
		expect(container.querySelectorAll(".btoc-node.is-focus")).toHaveLength(1);
		expect(container.querySelectorAll(".btoc-node.is-missing")).toHaveLength(1);
		expect(container.querySelectorAll(".btoc-node.is-ancestor").length).toBeGreaterThan(0);
		expect(container.querySelector(".btoc-node.is-focus")?.getAttribute("aria-label")).toBe("X");

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
