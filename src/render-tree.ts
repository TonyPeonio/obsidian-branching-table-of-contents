import { Component } from "obsidian";
import type { NodeActions } from "./actions";
import { neighborInDirection, type Direction, type Layout, type LayoutNode } from "./layout";

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;
/** Above this many notes, nodes are only created once they come into view (big whole-vault trees). */
export const LAZY_NODES = 800;

/**
 * Draws a {@link Layout} as an SVG with pan (drag) and zoom (wheel), and wires node
 * clicks, hovers and context menus to {@link NodeActions}. A Component so that every
 * listener goes away with it.
 */
export class TreeCanvas extends Component {
	private svg: SVGSVGElement | null = null;
	private viewport: SVGGElement | null = null;
	private scale = 1;
	private tx = 0;
	private ty = 0;
	private dragging: { id: number; x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;
	private suppressClick = false;
	private observer: ResizeObserver | null = null;
	private nodeEls = new Map<string, SVGGElement>();
	/** The node that takes Tab focus (roving tabindex): the focused note, or the first node. */
	private current: string | null = null;
	private nodesEl: SVGGElement | null = null;
	/** Nodes not created yet (lazy mode only). */
	private undrawn: LayoutNode[] = [];

	constructor(
		private container: HTMLElement,
		private lay: Layout,
		private actions: NodeActions,
		private focus: string | null,
	) {
		super();
	}

	onload(): void {
		const svg = this.container.createSvg("svg", { cls: "btoc-svg" });
		// Not role="img": that would hide the focusable nodes from screen readers.
		svg.setAttribute("role", "group");
		svg.setAttribute("aria-roledescription", "tree diagram");
		const focusName = this.lay.nodes.find((n) => n.id === this.focus)?.name;
		svg.setAttribute(
			"aria-label",
			(focusName ? `Family tree of ${focusName}` : "All trees in the vault") + ". Arrow keys move between notes, Enter opens one, plus and minus zoom, 0 fits.",
		);
		if (this.lay.style === "phylogenetic") svg.addClass("is-phylo");
		this.svg = svg;
		const viewport = svg.createSvg("g", { cls: "btoc-viewport" });
		this.viewport = viewport;
		const edges = viewport.createSvg("g", { cls: "btoc-edges" });
		const nodes = viewport.createSvg("g", { cls: "btoc-nodes" });

		// Two paths for all the edges instead of one element per edge: edges take no events, and
		// tens of thousands of <path> elements are what made big trees slow to draw.
		const regular: string[] = [];
		const irregular: string[] = [];
		for (const e of this.lay.edges) if (e.d) (e.irregular ? irregular : regular).push(e.d);
		if (regular.length) edges.createSvg("path", { cls: "btoc-edge" }).setAttribute("d", regular.join(" "));
		if (irregular.length) edges.createSvg("path", { cls: ["btoc-edge", "is-irregular"] }).setAttribute("d", irregular.join(" "));
		this.nodesEl = nodes;
		this.current = this.lay.nodes.some((n) => n.id === this.focus) ? this.focus : (this.lay.nodes[0]?.id ?? null);
		if (this.lay.nodes.length > LAZY_NODES) {
			this.undrawn = this.lay.nodes.filter((n) => n.id !== this.current);
			const first = this.lay.nodes.find((n) => n.id === this.current);
			if (first) this.drawNode(nodes, first);
		} else {
			for (const n of this.lay.nodes) this.drawNode(nodes, n);
		}
		this.on(svg, "keydown", (evt) => this.onCanvasKey(evt));

		this.on(svg, "wheel", (evt) => this.onWheel(evt), { passive: false });
		this.on(svg, "pointerdown", (evt) => this.onPointerDown(evt));
		this.on(svg, "pointermove", (evt) => this.onPointerMove(evt));
		this.on(svg, "pointerup", (evt) => this.onPointerUp(evt));
		this.on(svg, "pointercancel", (evt) => this.onPointerUp(evt));
		this.on(svg, "dblclick", (evt) => {
			const target = evt.target as Element | null;
			if (!target?.closest(".btoc-node")) this.fit();
		});

		if (typeof ResizeObserver !== "undefined") {
			let first = true;
			this.observer = new ResizeObserver(() => {
				// Fit once the container has a size; afterwards keep the user's pan/zoom.
				if (first && this.container.clientWidth > 0) {
					first = false;
					this.fit();
				}
			});
			this.observer.observe(this.container);
		}
		this.fit();
	}

	onunload(): void {
		this.nodeEls.clear();
		this.undrawn = [];
		this.nodesEl = null;
		this.observer?.disconnect();
		this.observer = null;
		this.svg?.remove();
		this.svg = null;
		this.viewport = null;
	}

	private drawNode(parent: SVGGElement, n: LayoutNode): void {
		const g = parent.createSvg("g", { cls: "btoc-node" });
		if (n.id === this.focus) g.addClass("is-focus");
		else if (n.layer < 0) g.addClass("is-ancestor");
		else g.addClass("is-descendant");
		if (n.missing) g.addClass("is-missing");
		g.setAttribute("transform", `translate(${r(n.x - n.w / 2)}, ${r(n.y - n.h / 2)})`);
		g.setAttribute("tabindex", n.id === this.current ? "0" : "-1");
		g.setAttribute("role", "link");
		g.setAttribute("aria-label", nodeLabel(n, this.focus));
		if (n.id === this.focus) g.setAttribute("aria-current", "page");
		g.dataset.id = n.id;
		this.nodeEls.set(n.id, g);

		const rect = g.createSvg("rect", { cls: "btoc-node-box" });
		rect.setAttribute("width", r(n.w));
		rect.setAttribute("height", r(n.h));
		rect.setAttribute("rx", "7");
		rect.setAttribute("ry", "7");

		const text = g.createSvg("text", { cls: "btoc-node-label" });
		text.setAttribute("x", r(n.w / 2));
		text.setAttribute("y", r(n.h / 2));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.textContent = n.label;
		if (n.label !== n.name) {
			const title = g.createSvg("title");
			title.textContent = n.name;
		}

		if (n.hiddenParents.length) this.drawBadge(g, n, n.hiddenParents, "top");
		if (n.hiddenChildren.length) this.drawBadge(g, n, n.hiddenChildren, "bottom");

		this.on(g, "click", (evt) => {
			if (this.suppressClick) return;
			evt.preventDefault();
			this.actions.open(n.id, evt);
		});
		this.on(g, "auxclick", (evt) => {
			if (evt.button !== 1 || this.suppressClick) return;
			evt.preventDefault();
			this.actions.open(n.id, evt);
		});
		this.on(g, "keydown", (evt) => this.onNodeKey(evt, n, g));
		this.on(g, "focus", () => this.setCurrent(n.id));
		this.on(g, "mouseover", (evt) => this.actions.hover(n.id, evt, g));
		this.on(g, "contextmenu", (evt) => {
			evt.preventDefault();
			this.actions.menu(n.id, evt);
		});
	}

	private onNodeKey(evt: KeyboardEvent, n: LayoutNode, g: SVGGElement): void {
		const dirs: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
		const dir = dirs[evt.key];
		if (dir) {
			evt.preventDefault();
			evt.stopPropagation();
			const next = neighborInDirection(this.lay.nodes, n.id, dir);
			if (next) this.focusNode(next);
			return;
		}
		if (evt.key === "Enter" || evt.key === " ") {
			evt.preventDefault();
			this.actions.open(n.id, new MouseEvent("click", { ctrlKey: evt.ctrlKey, metaKey: evt.metaKey, shiftKey: evt.shiftKey, altKey: evt.altKey }));
		} else if (evt.key === "ContextMenu" || (evt.key === "F10" && evt.shiftKey)) {
			evt.preventDefault();
			const box = g.getBoundingClientRect();
			this.actions.menu(n.id, new MouseEvent("contextmenu", { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 }));
		} else if (evt.key === "Home" && this.focus && this.nodeEls.has(this.focus)) {
			evt.preventDefault();
			this.focusNode(this.focus);
		}
	}

	/** Zoom and fit from the keyboard, anywhere on the canvas. */
	private onCanvasKey(evt: KeyboardEvent): void {
		if (evt.ctrlKey || evt.metaKey || evt.altKey) return;
		if (evt.key === "+" || evt.key === "=") this.zoomBy(1.2);
		else if (evt.key === "-" || evt.key === "_") this.zoomBy(1 / 1.2);
		else if (evt.key === "0") this.fit();
		else return;
		evt.preventDefault();
	}

	private zoomBy(factor: number): void {
		const cx = this.container.clientWidth / 2;
		const cy = this.container.clientHeight / 2;
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
		const k = next / this.scale;
		this.tx = cx - (cx - this.tx) * k;
		this.ty = cy - (cy - this.ty) * k;
		this.scale = next;
		this.apply();
	}

	private setCurrent(id: string): void {
		if (this.current === id) return;
		if (this.current) this.nodeEls.get(this.current)?.setAttribute("tabindex", "-1");
		this.current = id;
		this.nodeEls.get(id)?.setAttribute("tabindex", "0");
	}

	/** Moves keyboard focus to a node and pans it into view if it is off screen. */
	focusNode(id: string): void {
		this.ensureDrawn(id);
		const el = this.nodeEls.get(id);
		if (!el) return;
		this.setCurrent(id);
		this.scrollIntoView(id);
		el.focus({ preventScroll: true });
	}

	private scrollIntoView(id: string): void {
		const n = this.lay.nodes.find((x) => x.id === id);
		const w = this.container.clientWidth;
		const h = this.container.clientHeight;
		if (!n || w <= 0 || h <= 0) return;
		const left = this.tx + (n.x - n.w / 2) * this.scale;
		const right = this.tx + (n.x + n.w / 2) * this.scale;
		const top = this.ty + (n.y - n.h / 2) * this.scale;
		const bottom = this.ty + (n.y + n.h / 2) * this.scale;
		const margin = 16;
		if (left >= margin && right <= w - margin && top >= margin && bottom <= h - margin) return;
		this.tx = w / 2 - n.x * this.scale;
		this.ty = h / 2 - n.y * this.scale;
		this.apply();
	}

	/** Like registerDomEvent, but for SVG elements (which Obsidian's typing does not accept). */
	private on<K extends keyof SVGElementEventMap>(
		el: SVGElement,
		type: K,
		handler: (evt: SVGElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void {
		el.addEventListener(type, handler, options);
		this.register(() => el.removeEventListener(type, handler, options));
	}

	/** A small "+N" pill on the edge of a node for links that lie outside the drawn levels. */
	private drawBadge(g: SVGGElement, n: LayoutNode, hidden: string[], side: "top" | "bottom"): void {
		const badge = g.createSvg("g", { cls: ["btoc-badge", side === "top" ? "is-top" : "is-bottom"] });
		const label = `+${hidden.length}`;
		const w = 10 + label.length * 6;
		const h = 14;
		const x = n.w - w - 4;
		const y = side === "top" ? -h / 2 : n.h - h / 2;
		badge.setAttribute("transform", `translate(${r(x)}, ${r(y)})`);
		const rect = badge.createSvg("rect");
		rect.setAttribute("width", r(w));
		rect.setAttribute("height", r(h));
		rect.setAttribute("rx", r(h / 2));
		const text = badge.createSvg("text");
		text.setAttribute("x", r(w / 2));
		text.setAttribute("y", r(h / 2));
		text.setAttribute("text-anchor", "middle");
		text.setAttribute("dominant-baseline", "central");
		text.textContent = label;
		const title = badge.createSvg("title");
		title.textContent = (side === "top" ? "More parents: " : "More children: ") + hidden.length;
	}

	fit(): void {
		if (!this.svg) return;
		const w = this.container.clientWidth;
		const h = this.container.clientHeight;
		if (w <= 0 || h <= 0 || this.lay.width <= 0 || this.lay.height <= 0) return;
		const scale = Math.min(w / this.lay.width, h / this.lay.height, 1.25);
		this.scale = Math.max(MIN_SCALE, scale);
		this.tx = (w - this.lay.width * this.scale) / 2;
		this.ty = (h - this.lay.height * this.scale) / 2;
		this.apply();
	}

	private apply(): void {
		this.viewport?.setAttribute("transform", `translate(${r(this.tx)}, ${r(this.ty)}) scale(${r(this.scale)})`);
		this.drawVisible();
	}

	/** Lazy mode: creates the nodes that are now in (or near) the visible area. */
	private drawVisible(): void {
		if (!this.undrawn.length || !this.nodesEl) return;
		const w = this.container.clientWidth;
		const h = this.container.clientHeight;
		if (w <= 0 || h <= 0) return;
		const pad = 200 / this.scale;
		const x0 = -this.tx / this.scale - pad;
		const x1 = (w - this.tx) / this.scale + pad;
		const y0 = -this.ty / this.scale - pad;
		const y1 = (h - this.ty) / this.scale + pad;
		const rest: LayoutNode[] = [];
		for (const n of this.undrawn) {
			if (n.x + n.w / 2 >= x0 && n.x - n.w / 2 <= x1 && n.y + n.h / 2 >= y0 && n.y - n.h / 2 <= y1) this.drawNode(this.nodesEl, n);
			else rest.push(n);
		}
		this.undrawn = rest;
	}

	private ensureDrawn(id: string): void {
		if (this.nodeEls.has(id) || !this.nodesEl) return;
		const i = this.undrawn.findIndex((n) => n.id === id);
		if (i < 0) return;
		const [n] = this.undrawn.splice(i, 1);
		this.drawNode(this.nodesEl, n);
	}

	/** How many nodes exist in the DOM; for tests. */
	get drawnCount(): number {
		return this.nodeEls.size;
	}

	private onWheel(evt: WheelEvent): void {
		evt.preventDefault();
		const rect = this.container.getBoundingClientRect();
		const cx = evt.clientX - rect.left;
		const cy = evt.clientY - rect.top;
		const factor = Math.exp(-evt.deltaY * (evt.deltaMode === 1 ? 0.05 : 0.0015));
		const next = Math.max(MIN_SCALE, Math.min(MAX_SCALE, this.scale * factor));
		const k = next / this.scale;
		this.tx = cx - (cx - this.tx) * k;
		this.ty = cy - (cy - this.ty) * k;
		this.scale = next;
		this.apply();
	}

	private onPointerDown(evt: PointerEvent): void {
		if (evt.button !== 0 && evt.pointerType === "mouse") return;
		this.dragging = { id: evt.pointerId, x: evt.clientX, y: evt.clientY, tx: this.tx, ty: this.ty, moved: false };
		// No pointer capture yet: capturing here retargets the click that follows to the svg, so a
		// plain click on a node would never reach the node. Capture once it is really a drag.
	}

	private onPointerMove(evt: PointerEvent): void {
		const d = this.dragging;
		if (!d || d.id !== evt.pointerId) return;
		const dx = evt.clientX - d.x;
		const dy = evt.clientY - d.y;
		if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
		if (!d.moved) this.svg?.setPointerCapture(evt.pointerId);
		d.moved = true;
		this.svg?.addClass("is-panning");
		this.tx = d.tx + dx;
		this.ty = d.ty + dy;
		this.apply();
	}

	private onPointerUp(evt: PointerEvent): void {
		const d = this.dragging;
		if (!d || d.id !== evt.pointerId) return;
		this.dragging = null;
		this.svg?.removeClass("is-panning");
		if (this.svg?.hasPointerCapture(evt.pointerId)) this.svg.releasePointerCapture(evt.pointerId);
		if (d.moved) {
			// The click that follows a drag must not open a note.
			this.suppressClick = true;
			window.setTimeout(() => (this.suppressClick = false), 0);
		}
	}
}

/** What a screen reader announces for a node: its name and where it sits relative to the focus. */
export function nodeLabel(n: LayoutNode, focus: string | null): string {
	const parts = [n.name];
	if (n.id === focus) parts.push("current note");
	else if (focus !== null && n.layer < 0) parts.push(n.layer === -1 ? "parent" : `ancestor, ${-n.layer} levels up`);
	else if (focus !== null && n.layer > 0) parts.push(n.layer === 1 ? "child" : `descendant, ${n.layer} levels down`);
	else if (focus === null) parts.push(`level ${n.layer + 1}`);
	if (n.missing) parts.push("missing note, opens to create it");
	const more = (count: number, one: string, many: string) => `${count} more ${count === 1 ? one : many} not shown`;
	if (n.hiddenParents.length) parts.push(more(n.hiddenParents.length, "parent", "parents"));
	if (n.hiddenChildren.length) parts.push(more(n.hiddenChildren.length, "child", "children"));
	return parts.join(", ");
}

function r(n: number): string {
	return String(Math.round(n * 100) / 100);
}
