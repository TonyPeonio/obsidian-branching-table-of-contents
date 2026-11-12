import { Component } from "obsidian";
import type { NodeActions } from "./actions";
import type { Layout, LayoutNode } from "./layout";

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const DRAG_THRESHOLD = 4;

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
		svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", "Branching table of contents");
		if (this.lay.style === "phylogenetic") svg.addClass("is-phylo");
		this.svg = svg;
		const viewport = svg.createSvg("g", { cls: "btoc-viewport" });
		this.viewport = viewport;
		const edges = viewport.createSvg("g", { cls: "btoc-edges" });
		const nodes = viewport.createSvg("g", { cls: "btoc-nodes" });

		for (const e of this.lay.edges) {
			if (!e.d) continue;
			const path = edges.createSvg("path", { cls: "btoc-edge" });
			path.setAttribute("d", e.d);
			if (e.irregular) path.addClass("is-irregular");
		}
		for (const n of this.lay.nodes) this.drawNode(nodes, n);

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
		g.setAttribute("tabindex", "0");
		g.setAttribute("role", "link");
		g.setAttribute("aria-label", n.name);

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
		this.on(g, "keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				this.actions.open(n.id, new MouseEvent("click", { ctrlKey: evt.ctrlKey, metaKey: evt.metaKey }));
			}
		});
		this.on(g, "mouseover", (evt) => this.actions.hover(n.id, evt, g));
		this.on(g, "contextmenu", (evt) => {
			evt.preventDefault();
			this.actions.menu(n.id, evt);
		});
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
		this.svg?.setPointerCapture(evt.pointerId);
	}

	private onPointerMove(evt: PointerEvent): void {
		const d = this.dragging;
		if (!d || d.id !== evt.pointerId) return;
		const dx = evt.clientX - d.x;
		const dy = evt.clientY - d.y;
		if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
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

function r(n: number): string {
	return String(Math.round(n * 100) / 100);
}
