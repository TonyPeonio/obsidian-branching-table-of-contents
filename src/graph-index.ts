/**
 * Incremental bookkeeping behind {@link VaultGraph}: what each note contributes to the graph
 * (its parent/child edges, the notes it links to, the missing links it makes). When one note
 * changes only its own contribution is recomputed, and the graph is reassembled only if that
 * contribution actually changed, so typing in a note body never redraws the tree. Pure; the
 * Obsidian side passes in what it read from the metadata cache.
 */
import { buildGraph, emptyGraph, type Edge, type Graph, type GraphNode } from "./graph";
import { linkDisplayName } from "./links";

export const MISSING_PREFIX = "missing:";

export interface NoteInfo {
	path: string;
	name: string;
	order?: number;
}

/** What one note says about itself in its frontmatter. */
export interface NoteFacts extends NoteInfo {
	parents: string[];
	children: string[];
}

export interface ContributionOptions {
	showMissing: boolean;
	isExcluded: (path: string) => boolean;
	/** Resolves a link written in `sourcePath` to an existing note, or null. */
	resolve: (link: string, sourcePath: string) => NoteInfo | null;
}

export interface Contribution {
	/** The note itself plus every existing note it links to. */
	nodes: NoteInfo[];
	edges: Edge[];
	/** Missing node id → the link text as written. */
	missing: Map<string, string>;
}

/** The edges and nodes one note adds, or null when it has no parent/child links at all. */
export function contribution(facts: NoteFacts, o: ContributionOptions): Contribution | null {
	if (o.isExcluded(facts.path)) return null;
	if (facts.parents.length === 0 && facts.children.length === 0) return null;
	const nodes: NoteInfo[] = [{ path: facts.path, name: facts.name, order: facts.order }];
	const edges: Edge[] = [];
	const missing = new Map<string, string>();
	const resolve = (link: string): string | null => {
		const target = o.resolve(link, facts.path);
		if (target) {
			if (o.isExcluded(target.path)) return null;
			if (target.path !== facts.path && !nodes.some((n) => n.path === target.path)) nodes.push(target);
			return target.path;
		}
		if (!o.showMissing) return null;
		const id = MISSING_PREFIX + link.toLowerCase();
		if (!missing.has(id)) missing.set(id, link);
		return id;
	};
	for (const l of facts.parents) {
		const id = resolve(l);
		if (id) edges.push({ parent: id, child: facts.path });
	}
	for (const l of facts.children) {
		const id = resolve(l);
		if (id) edges.push({ parent: facts.path, child: id });
	}
	return { nodes, edges, missing };
}

function sameContribution(a: Contribution | null, b: Contribution | null): boolean {
	if (a === null || b === null) return a === b;
	if (a.edges.length !== b.edges.length || a.nodes.length !== b.nodes.length || a.missing.size !== b.missing.size) return false;
	for (let i = 0; i < a.edges.length; i++) {
		if (a.edges[i].parent !== b.edges[i].parent || a.edges[i].child !== b.edges[i].child) return false;
	}
	for (let i = 0; i < a.nodes.length; i++) {
		const x = a.nodes[i];
		const y = b.nodes[i];
		if (x.path !== y.path || x.name !== y.name || x.order !== y.order) return false;
	}
	for (const [k, v] of a.missing) if (b.missing.get(k) !== v) return false;
	return true;
}

export class GraphIndex {
	private contribs = new Map<string, Contribution>();
	/** Latest known name and order of every existing note that appears in some contribution. */
	private info = new Map<string, NoteInfo>();
	graph: Graph = emptyGraph();
	missingLinks = new Map<string, string>();

	/** Replaces everything with these contributions and assembles the graph. */
	reset(entries: Iterable<[string, Contribution]>): void {
		this.contribs.clear();
		this.info.clear();
		for (const [path, c] of entries) {
			this.contribs.set(path, c);
			for (const n of c.nodes) this.info.set(n.path, n);
		}
		this.assemble();
	}

	/**
	 * Records a note's new contribution (null when it no longer has links) and its current name
	 * and order. Returns true, after reassembling the graph, only when the graph changed.
	 */
	update(path: string, next: Contribution | null, self: NoteInfo | null): boolean {
		const prev = this.contribs.get(path) ?? null;
		let changed = !sameContribution(prev, next);
		if (next) this.contribs.set(path, next);
		else this.contribs.delete(path);
		if (next) for (const n of next.nodes) this.info.set(n.path, n);
		// A note others link to may change its name or order without having links of its own.
		if (self && this.graph.nodes.has(path)) {
			const old = this.graph.nodes.get(path);
			if (old && (old.name !== self.name || old.order !== self.order)) changed = true;
			this.info.set(path, self);
		}
		if (changed) this.assemble();
		return changed;
	}

	/** True when a newly created note might resolve one of the current missing links. */
	mayResolveMissing(name: string): boolean {
		const n = name.toLowerCase();
		for (const link of this.missingLinks.values()) if (linkDisplayName(link).toLowerCase() === n) return true;
		return false;
	}

	get size(): number {
		return this.contribs.size;
	}

	private assemble(): void {
		const nodes = new Map<string, GraphNode>();
		const edges: Edge[] = [];
		const missingLinks = new Map<string, string>();
		const addNode = (id: string) => {
			if (nodes.has(id)) return;
			const link = missingLinks.get(id);
			if (link !== undefined) {
				nodes.set(id, { id, name: linkDisplayName(link), missing: true });
				return;
			}
			const i = this.info.get(id);
			nodes.set(id, { id, name: i?.name ?? linkDisplayName(id.replace(/\.md$/i, "")), missing: false, order: i?.order });
		};
		for (const c of this.contribs.values()) {
			for (const [id, link] of c.missing) if (!missingLinks.has(id)) missingLinks.set(id, link);
			for (const e of c.edges) edges.push(e);
		}
		// Only notes that take part in at least one edge belong to the tree.
		for (const e of edges) {
			addNode(e.parent);
			addNode(e.child);
		}
		this.graph = buildGraph([...nodes.values()], edges);
		this.missingLinks = missingLinks;
	}
}
