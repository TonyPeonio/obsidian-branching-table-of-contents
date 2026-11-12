/**
 * Tidy-tree layout of a subgraph. Pure geometry, no DOM.
 *
 * Every node on layer k > 0 has at least one parent on layer k-1 (layers are BFS
 * distances), so a spanning tree exists: each node hangs under its first such parent.
 * Ancestors (layers < 0) hang the same way off their first child on the layer below.
 * Subtrees are laid out as non-overlapping boxes with the parent centred over its
 * children, which gives the clean, branching look. The remaining (non-tree) edges are
 * simply drawn between wherever the two nodes ended up.
 */
import { type Graph, type Subgraph, childrenOf, compareIds, nameOf, parentsOf } from "./graph";

export type Orientation = "top-down" | "left-right";

/**
 * How the tree is drawn. "boxes" is the family tree: curved links, every note on the row of its
 * level. "phylogenetic" is the cladogram biologists draw: right-angled branches that split at a
 * shared bar, and every tip (a note with nothing drawn below it) pushed out to the same line,
 * so the notes at the ends of the branches can be read down one column whatever their depth.
 */
export type TreeStyle = "boxes" | "phylogenetic";

export interface LayoutOptions {
	orientation: Orientation;
	style: TreeStyle;
	nodeHeight: number;
	charWidth: number;
	paddingX: number;
	minWidth: number;
	maxWidth: number;
	maxChars: number;
	/** Space between sibling boxes along the cross axis. */
	gap: number;
	/** Space between layers. */
	layerGap: number;
	/** Outer margin. */
	margin: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
	orientation: "top-down",
	style: "boxes",
	nodeHeight: 32,
	charWidth: 7.4,
	paddingX: 14,
	minWidth: 64,
	maxWidth: 240,
	maxChars: 30,
	gap: 16,
	layerGap: 56,
	margin: 24,
};

export interface LayoutNode {
	id: string;
	label: string;
	name: string;
	missing: boolean;
	layer: number;
	/** Centre. */
	x: number;
	y: number;
	w: number;
	h: number;
	/** Parents of the note that are outside the subgraph. */
	hiddenParents: string[];
	/** Children of the note that are outside the subgraph. */
	hiddenChildren: string[];
}

export interface LayoutEdge {
	parent: string;
	child: string;
	/** SVG path data. */
	d: string;
	/** True for an edge that does not go from one layer to the next one below it. */
	irregular: boolean;
}

export interface Layout {
	nodes: LayoutNode[];
	edges: LayoutEdge[];
	width: number;
	height: number;
	style: TreeStyle;
}

export function truncateLabel(name: string, maxChars: number): string {
	if (name.length <= maxChars) return name;
	return name.slice(0, Math.max(1, maxChars - 1)).trimEnd() + "…";
}

interface Box {
	id: string;
	/** Extent along the cross axis. */
	ext: number;
	/** Position of the centre along the cross axis, relative to the subtree's left edge until placed. */
	cross: number;
	kids: Box[];
	width: number;
}

export function layout(g: Graph, sub: Subgraph, options: Partial<LayoutOptions> = {}): Layout {
	const o = { ...DEFAULT_LAYOUT, ...options };
	const lr = o.orientation === "left-right";
	const phylo = o.style === "phylogenetic";
	const cmp = compareIds(g);

	const widthOf = new Map<string, number>();
	const labelOf = new Map<string, string>();
	for (const id of sub.ids) {
		const label = truncateLabel(nameOf(g, id), o.maxChars);
		labelOf.set(id, label);
		widthOf.set(id, Math.min(o.maxWidth, Math.max(o.minWidth, label.length * o.charWidth + 2 * o.paddingX)));
	}
	const ext = (id: string) => (lr ? o.nodeHeight : (widthOf.get(id) ?? o.minWidth));

	// Spanning tree below (and, in focus mode, above) the roots.
	const primaryParent = new Map<string, string>();
	const primaryChild = new Map<string, string>();
	for (const id of sub.ids) {
		const l = sub.layer.get(id) ?? 0;
		if (l > 0) {
			const p = parentsOf(g, id).find((x) => sub.layer.get(x) === l - 1);
			if (p) primaryParent.set(id, p);
		} else if (l < 0) {
			const c = childrenOf(g, id).find((x) => sub.layer.get(x) === l + 1);
			if (c) primaryChild.set(id, c);
		}
	}
	const treeKidsDown = new Map<string, string[]>();
	const treeKidsUp = new Map<string, string[]>();
	for (const [child, parent] of primaryParent) pushTo(treeKidsDown, parent, child);
	for (const [parent, child] of primaryChild) pushTo(treeKidsUp, child, parent);
	for (const list of treeKidsDown.values()) list.sort(cmp);
	for (const list of treeKidsUp.values()) list.sort(cmp);

	const cross = new Map<string, number>();
	const buildBox = (id: string, kidsOf: Map<string, string[]>): Box => {
		const kids = (kidsOf.get(id) ?? []).map((k) => buildBox(k, kidsOf));
		const span = kids.length ? kids.reduce((s, k) => s + k.width, 0) + o.gap * (kids.length - 1) : 0;
		return { id, ext: ext(id), cross: 0, kids, width: Math.max(ext(id), span) };
	};
	const place = (box: Box, left: number) => {
		cross.set(box.id, left + box.width / 2);
		if (!box.kids.length) return;
		const span = box.kids.reduce((s, k) => s + k.width, 0) + o.gap * (box.kids.length - 1);
		let x = left + (box.width - span) / 2;
		for (const kid of box.kids) {
			place(kid, x);
			x += kid.width + o.gap;
		}
	};

	if (sub.focus !== null) {
		const down = buildBox(sub.focus, treeKidsDown);
		const up = buildBox(sub.focus, treeKidsUp);
		// Both halves share the focus; centre each on it.
		place(down, -down.width / 2);
		const focusX = cross.get(sub.focus) ?? 0;
		place(up, -up.width / 2);
		const shift = focusX - (cross.get(sub.focus) ?? 0);
		for (const id of sub.ids) {
			if ((sub.layer.get(id) ?? 0) < 0) cross.set(id, (cross.get(id) ?? 0) + shift);
		}
		cross.set(sub.focus, focusX);
	} else {
		// Virtual root over all roots, laid side by side.
		let x = 0;
		for (const r of sub.roots) {
			const box = buildBox(r, treeKidsDown);
			place(box, x);
			x += box.width + o.gap;
		}
	}
	// Anything the spanning tree missed (should not happen) goes at the end of its layer.
	let fallback = Math.max(0, ...[...cross.values()]) + o.gap;
	for (const id of sub.ids) {
		if (cross.has(id)) continue;
		cross.set(id, fallback + ext(id) / 2);
		fallback += ext(id) + o.gap;
	}

	// Layer axis.
	const layers = [...new Set(sub.ids.map((id) => sub.layer.get(id) ?? 0))].sort((a, b) => a - b);
	const layerExtent = new Map<number, number>();
	for (const l of layers) {
		const members = sub.ids.filter((id) => sub.layer.get(id) === l);
		layerExtent.set(l, lr ? Math.max(...members.map((id) => widthOf.get(id) ?? o.minWidth)) : o.nodeHeight);
	}
	const layerPos = new Map<number, number>();
	let pos = 0;
	for (const l of layers) {
		const e = layerExtent.get(l) ?? o.nodeHeight;
		layerPos.set(l, pos + e / 2);
		pos += e + o.layerGap;
	}

	// Phylogenetic style: tips line up at the deepest level. A tip keeps the cross-axis slot the
	// tidy tree gave it, which no other subtree enters, so moving it outward cannot collide.
	const deepest = layers.length ? layers[layers.length - 1] : 0;
	const tipStart = (layerPos.get(deepest) ?? 0) - (layerExtent.get(deepest) ?? o.nodeHeight) / 2;
	const isTip = (id: string) => phylo && deepest > 0 && (sub.layer.get(id) ?? 0) > 0 && !(treeKidsDown.get(id)?.length ?? 0);
	const alongOf = (id: string): number => {
		if (!isTip(id)) return layerPos.get(sub.layer.get(id) ?? 0) ?? 0;
		// Left to right the tips start on one line (their names then read as a list); top-down they share a row.
		return lr ? tipStart + (widthOf.get(id) ?? o.minWidth) / 2 : (layerPos.get(deepest) ?? 0);
	};

	let minCross = Number.POSITIVE_INFINITY;
	let maxCross = Number.NEGATIVE_INFINITY;
	for (const id of sub.ids) {
		const c = cross.get(id) ?? 0;
		minCross = Math.min(minCross, c - ext(id) / 2);
		maxCross = Math.max(maxCross, c + ext(id) / 2);
	}
	if (!Number.isFinite(minCross)) {
		minCross = 0;
		maxCross = 0;
	}

	const nodes: LayoutNode[] = sub.ids.map((id) => {
		const l = sub.layer.get(id) ?? 0;
		const c = (cross.get(id) ?? 0) - minCross + o.margin;
		const lp = alongOf(id) + o.margin;
		const w = widthOf.get(id) ?? o.minWidth;
		const node = g.nodes.get(id);
		return {
			id,
			label: labelOf.get(id) ?? id,
			name: nameOf(g, id),
			missing: node?.missing ?? false,
			layer: l,
			x: lr ? lp : c,
			y: lr ? c : lp,
			w,
			h: o.nodeHeight,
			hiddenParents: parentsOf(g, id).filter((p) => !sub.layer.has(p)),
			hiddenChildren: childrenOf(g, id).filter((p) => !sub.layer.has(p)),
		};
	});
	const byId = new Map(nodes.map((n) => [n.id, n]));

	const edges: LayoutEdge[] = sub.edges.map((e) => {
		const p = byId.get(e.parent);
		const c = byId.get(e.child);
		if (!p || !c) return { ...e, d: "", irregular: true };
		const irregular = c.layer !== p.layer + 1;
		// A branch only bends at right angles where it runs forward; a link back up the tree stays a curve.
		const forward = lr ? c.x - c.w / 2 > p.x + p.w / 2 : c.y - c.h / 2 > p.y + p.h / 2;
		return { ...e, d: phylo && forward ? elbowPath(p, c, lr, o.layerGap) : edgePath(p, c, lr, o.layerGap), irregular };
	});

	const crossSize = maxCross - minCross + 2 * o.margin;
	const layerSize = pos - o.layerGap + 2 * o.margin;
	return { nodes, edges, width: lr ? layerSize : crossSize, height: lr ? crossSize : layerSize, style: o.style };
}

/**
 * A cladogram branch: out of the parent to a bar half a layer gap away, along the bar to the
 * child's line, then straight to the child. All children of a note share the bar, which is what
 * makes the split read as one branching point.
 */
function elbowPath(p: LayoutNode, c: LayoutNode, lr: boolean, layerGap: number): string {
	const f = (n: number) => Math.round(n * 100) / 100;
	if (lr) {
		const sx = p.x + p.w / 2;
		const ex = c.x - c.w / 2;
		const bar = Math.min(sx + layerGap / 2, ex);
		return `M ${f(sx)} ${f(p.y)} H ${f(bar)} V ${f(c.y)} H ${f(ex)}`;
	}
	const sy = p.y + p.h / 2;
	const ey = c.y - c.h / 2;
	const bar = Math.min(sy + layerGap / 2, ey);
	return `M ${f(p.x)} ${f(sy)} V ${f(bar)} H ${f(c.x)} V ${f(ey)}`;
}

function edgePath(p: LayoutNode, c: LayoutNode, lr: boolean, layerGap: number): string {
	const f = (n: number) => Math.round(n * 100) / 100;
	if (lr) {
		const sx = p.x + p.w / 2;
		const sy = p.y;
		const ex = c.x - c.w / 2;
		const ey = c.y;
		const bend = ex > sx ? (ex - sx) / 2 : layerGap;
		return `M ${f(sx)} ${f(sy)} C ${f(sx + bend)} ${f(sy)}, ${f(ex - bend)} ${f(ey)}, ${f(ex)} ${f(ey)}`;
	}
	const sx = p.x;
	const sy = p.y + p.h / 2;
	const ex = c.x;
	const ey = c.y - c.h / 2;
	const bend = ey > sy ? (ey - sy) / 2 : layerGap;
	return `M ${f(sx)} ${f(sy)} C ${f(sx)} ${f(sy + bend)}, ${f(ex)} ${f(ey - bend)}, ${f(ex)} ${f(ey)}`;
}

function pushTo(map: Map<string, string[]>, key: string, value: string): void {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}
