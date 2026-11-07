/**
 * Pure graph model: notes are nodes, `parent`/`child` properties are directed edges
 * (parent -> child). Nothing in here touches Obsidian, so it is unit-tested directly.
 */

export interface GraphNode {
	/** Vault path for real notes, `missing:<linkpath>` for links that resolve to nothing. */
	id: string;
	/** Display name (file basename, or the link text for a missing note). */
	name: string;
	/** True when the note does not exist in the vault. */
	missing: boolean;
	/** Optional sort key from the order property; lower comes first, undefined comes last. */
	order?: number;
}

export interface Edge {
	parent: string;
	child: string;
}

export interface Graph {
	nodes: Map<string, GraphNode>;
	/** id -> parent ids, sorted. */
	parents: Map<string, string[]>;
	/** id -> child ids, sorted. */
	children: Map<string, string[]>;
}

/** A selection of the graph to draw: which nodes, which layer each sits on, and the edges among them. */
export interface Subgraph {
	/** The note the selection is centred on (layer 0), or null for the whole forest. */
	focus: string | null;
	/** Node ids, sorted by layer then name. */
	ids: string[];
	/** id -> layer. Negative layers are ancestors of the focus, positive are descendants. */
	layer: Map<string, number>;
	/** Every graph edge whose two ends are both in `ids`. */
	edges: Edge[];
	/** Nodes with no parent on a lower layer of the subgraph (where branches start), sorted. */
	roots: string[];
}

export function emptyGraph(): Graph {
	return { nodes: new Map(), parents: new Map(), children: new Map() };
}

export function compareNodes(a: GraphNode, b: GraphNode): number {
	const ao = a.order ?? Number.POSITIVE_INFINITY;
	const bo = b.order ?? Number.POSITIVE_INFINITY;
	if (ao !== bo) return ao < bo ? -1 : 1;
	const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
	if (byName !== 0) return byName;
	return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function compareIds(g: Graph): (a: string, b: string) => number {
	return (a, b) => {
		const na = g.nodes.get(a);
		const nb = g.nodes.get(b);
		if (!na || !nb) return a < b ? -1 : a > b ? 1 : 0;
		return compareNodes(na, nb);
	};
}

/** Builds a graph. Self-loops and duplicate edges are dropped; edges to unknown nodes are dropped. */
export function buildGraph(nodes: GraphNode[], edges: Edge[]): Graph {
	const g = emptyGraph();
	for (const n of nodes) if (!g.nodes.has(n.id)) g.nodes.set(n.id, n);
	const seen = new Set<string>();
	for (const e of edges) {
		if (e.parent === e.child) continue;
		if (!g.nodes.has(e.parent) || !g.nodes.has(e.child)) continue;
		const key = e.parent + "\u0000" + e.child;
		if (seen.has(key)) continue;
		seen.add(key);
		push(g.children, e.parent, e.child);
		push(g.parents, e.child, e.parent);
	}
	const cmp = compareIds(g);
	for (const list of g.children.values()) list.sort(cmp);
	for (const list of g.parents.values()) list.sort(cmp);
	return g;
}

function push(map: Map<string, string[]>, key: string, value: string): void {
	const list = map.get(key);
	if (list) list.push(value);
	else map.set(key, [value]);
}

export function parentsOf(g: Graph, id: string): string[] {
	return g.parents.get(id) ?? [];
}

export function childrenOf(g: Graph, id: string): string[] {
	return g.children.get(id) ?? [];
}

export function nameOf(g: Graph, id: string): string {
	return g.nodes.get(id)?.name ?? id;
}

/** True when the note has at least one parent or child. */
export function isLinked(g: Graph, id: string): boolean {
	return parentsOf(g, id).length > 0 || childrenOf(g, id).length > 0;
}

/**
 * The family tree of one note: everything up to `up` levels above it and `down` levels
 * below it. Layers are the shortest distance from the focus, so a note reachable both as
 * an ancestor and a descendant (a cycle) is placed on whichever side is nearer, descendants
 * winning ties.
 */
export function neighborhood(g: Graph, focus: string, up: number, down: number): Subgraph {
	const upDist = bfs(g, focus, up, parentsOf);
	const downDist = bfs(g, focus, down, childrenOf);
	const layer = new Map<string, number>();
	layer.set(focus, 0);
	for (const [id, d] of upDist) if (id !== focus) layer.set(id, -d);
	for (const [id, d] of downDist) {
		if (id === focus) continue;
		const u = upDist.get(id);
		if (u === undefined || d <= u) layer.set(id, d);
	}
	return finishSubgraph(g, focus, layer);
}

function bfs(g: Graph, start: string, limit: number, next: (g: Graph, id: string) => string[]): Map<string, number> {
	const dist = new Map<string, number>([[start, 0]]);
	const queue: string[] = [start];
	for (let i = 0; i < queue.length; i++) {
		const id = queue[i];
		const d = dist.get(id) ?? 0;
		if (d >= limit) continue;
		for (const n of next(g, id)) {
			if (dist.has(n)) continue;
			dist.set(n, d + 1);
			queue.push(n);
		}
	}
	return dist;
}

/**
 * The whole vault as a forest: every note without a parent is a root on layer 0 and
 * every other note sits on the layer of its shortest path from a root. Notes that are
 * only reachable through a cycle get the alphabetically first of them promoted to a root.
 */
export function forest(g: Graph): Subgraph {
	const cmp = compareIds(g);
	const all = [...g.nodes.keys()].sort(cmp);
	const layer = new Map<string, number>();
	const roots = all.filter((id) => parentsOf(g, id).length === 0);
	const seed = (starts: string[]) => {
		const queue: string[] = [];
		for (const r of starts) {
			if (layer.has(r)) continue;
			layer.set(r, 0);
			queue.push(r);
		}
		for (let i = 0; i < queue.length; i++) {
			const id = queue[i];
			const d = layer.get(id) ?? 0;
			for (const c of childrenOf(g, id)) {
				if (layer.has(c)) continue;
				layer.set(c, d + 1);
				queue.push(c);
			}
		}
	};
	seed(roots);
	for (const id of all) {
		if (layer.has(id)) continue;
		// Part of a cycle that no root reaches: promote this one.
		seed([id]);
	}
	return finishSubgraph(g, null, layer);
}

function finishSubgraph(g: Graph, focus: string | null, layer: Map<string, number>): Subgraph {
	const cmp = compareIds(g);
	const ids = [...layer.keys()].sort((a, b) => {
		const la = layer.get(a) ?? 0;
		const lb = layer.get(b) ?? 0;
		return la !== lb ? la - lb : cmp(a, b);
	});
	const edges: Edge[] = [];
	for (const id of ids) {
		for (const c of childrenOf(g, id)) if (layer.has(c)) edges.push({ parent: id, child: c });
	}
	// A root has no parent on a lower layer; a parent on the same or a higher layer is a
	// back edge of a cycle, so the node still starts its own branch.
	const roots = ids.filter((id) => {
		const l = layer.get(id) ?? 0;
		return !parentsOf(g, id).some((p) => (layer.get(p) ?? Number.POSITIVE_INFINITY) < l);
	});
	return { focus, ids, layer, edges, roots };
}

/**
 * A path from a root down to `id`, following at each step the first parent that is not
 * already on the path (so cycles terminate). Returns [root, ..., id].
 */
export function pathToRoot(g: Graph, id: string): string[] {
	const path = [id];
	const seen = new Set<string>([id]);
	let cur = id;
	for (;;) {
		const next = parentsOf(g, cur).find((p) => !seen.has(p));
		if (!next) break;
		seen.add(next);
		path.push(next);
		cur = next;
	}
	return path.reverse();
}

export interface OutlineItem {
	id: string;
	/** Other parents of this note besides the one it is listed under. */
	alsoUnder: string[];
	/** True when the note is already an ancestor on this path; its children are not repeated. */
	cycle: boolean;
	/**
	 * True when the edge leading here goes to the same or a lower layer (a shortcut or a back
	 * edge): the note is listed but its children are not repeated, since its full branch
	 * already appears where it sits in the layering.
	 */
	cross: boolean;
	children: OutlineItem[];
}

/**
 * Nested outline of a subgraph, starting from its local roots. A note with several
 * parents appears under each of them, labelled with the others in `alsoUnder`.
 */
export function outline(g: Graph, sub: Subgraph): OutlineItem[] {
	const build = (id: string, under: string | null, path: Set<string>): OutlineItem => {
		const alsoUnder = parentsOf(g, id).filter((p) => p !== under);
		if (path.has(id)) return { id, alsoUnder, cycle: true, cross: false, children: [] };
		const layer = sub.layer.get(id) ?? 0;
		if (under !== null && layer <= (sub.layer.get(under) ?? 0)) return { id, alsoUnder, cycle: false, cross: true, children: [] };
		path.add(id);
		const children = childrenOf(g, id)
			.filter((c) => sub.layer.has(c))
			.map((c) => build(c, id, path));
		path.delete(id);
		return { id, alsoUnder, cycle: false, cross: false, children };
	};
	return sub.roots.map((r) => build(r, null, new Set()));
}

/** Depth-first flatten of an outline, for tests and plain lists. */
export function flattenOutline(items: OutlineItem[]): { item: OutlineItem; depth: number }[] {
	const out: { item: OutlineItem; depth: number }[] = [];
	const walk = (list: OutlineItem[], depth: number) => {
		for (const item of list) {
			out.push({ item, depth });
			walk(item.children, depth + 1);
		}
	};
	walk(items, 0);
	return out;
}
