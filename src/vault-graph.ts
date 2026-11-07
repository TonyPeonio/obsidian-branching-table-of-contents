import { Events, type App, type Plugin, type TFile } from "obsidian";
import { buildGraph, emptyGraph, type Edge, type Graph, type GraphNode } from "./graph";
import { linkDisplayName, propertyLinks, propertyNumber } from "./links";
import { parseList, type Settings } from "./settings";

const MISSING_PREFIX = "missing:";

/**
 * Keeps a {@link Graph} of the vault in sync with the metadata cache. Node ids are vault
 * paths; links that resolve to no file become `missing:` nodes. Emits "changed" after
 * every rebuild.
 */
export class VaultGraph extends Events {
	graph: Graph = emptyGraph();
	/** Original link text for each missing node, for creating the note on click. */
	private missingLinks = new Map<string, string>();
	private timer: number | null = null;

	constructor(
		private app: App,
		private plugin: Plugin,
		private settings: () => Settings,
	) {
		super();
	}

	start(): void {
		const mc = this.app.metadataCache;
		this.plugin.registerEvent(mc.on("changed", () => this.schedule()));
		this.plugin.registerEvent(mc.on("deleted", () => this.schedule()));
		this.plugin.registerEvent(mc.on("resolved", () => this.schedule()));
		this.plugin.registerEvent(this.app.vault.on("rename", () => this.schedule()));
		this.plugin.registerEvent(this.app.vault.on("delete", () => this.schedule()));
		this.plugin.register(() => {
			if (this.timer !== null) window.clearTimeout(this.timer);
		});
		this.app.workspace.onLayoutReady(() => this.rebuild());
	}

	/** Coalesces bursts of cache events into one rebuild. */
	schedule(): void {
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			this.rebuild();
		}, 150);
	}

	rebuild(): void {
		const s = this.settings();
		const parentKeys = parseList(s.parentProperties);
		const childKeys = parseList(s.childProperties);
		const orderKey = s.orderProperty.trim();
		const excluded = parseList(s.excludeFolders).map((f) => f.replace(/^\/+|\/+$/g, "") + "/");
		const isExcluded = (path: string) => {
			const p = path.toLowerCase();
			return excluded.some((f) => f !== "/" && p.startsWith(f));
		};
		const mc = this.app.metadataCache;
		const nodes = new Map<string, GraphNode>();
		const edges: Edge[] = [];
		const missingLinks = new Map<string, string>();

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (isExcluded(file.path)) continue;
			const cache = mc.getFileCache(file);
			const fm = cache?.frontmatter;
			const parents = propertyLinks(fm, cache?.frontmatterLinks, parentKeys);
			const children = propertyLinks(fm, cache?.frontmatterLinks, childKeys);
			if (parents.length === 0 && children.length === 0) continue;
			nodes.set(file.path, { id: file.path, name: file.basename, missing: false, order: propertyNumber(fm, orderKey) });

			const resolve = (link: string): string | null => {
				const target = mc.getFirstLinkpathDest(link, file.path);
				if (target) {
					if (isExcluded(target.path)) return null;
					if (!nodes.has(target.path)) {
						const tc = mc.getFileCache(target);
						nodes.set(target.path, {
							id: target.path,
							name: target.basename,
							missing: false,
							order: propertyNumber(tc?.frontmatter, orderKey),
						});
					}
					return target.path;
				}
				if (!s.showMissing) return null;
				const id = MISSING_PREFIX + link.toLowerCase();
				if (!nodes.has(id)) {
					nodes.set(id, { id, name: linkDisplayName(link), missing: true });
					missingLinks.set(id, link);
				}
				return id;
			};
			for (const l of parents) {
				const id = resolve(l);
				if (id) edges.push({ parent: id, child: file.path });
			}
			for (const l of children) {
				const id = resolve(l);
				if (id) edges.push({ parent: file.path, child: id });
			}
		}

		// Only notes that take part in at least one edge belong to the tree.
		const linked = new Set<string>();
		for (const e of edges) {
			linked.add(e.parent);
			linked.add(e.child);
		}
		this.graph = buildGraph([...nodes.values()].filter((n) => linked.has(n.id)), edges);
		this.missingLinks = missingLinks;
		this.trigger("changed");
	}

	isMissing(id: string): boolean {
		return id.startsWith(MISSING_PREFIX);
	}

	/** The link text that was written for a missing node, e.g. `Courses/Physics`. */
	missingLink(id: string): string {
		return this.missingLinks.get(id) ?? id.slice(MISSING_PREFIX.length);
	}

	fileOf(id: string): TFile | null {
		if (this.isMissing(id)) return null;
		return this.app.vault.getFileByPath(id);
	}

	/** Text to put inside `[[...]]` when linking to a node from `sourcePath`. */
	linkText(id: string, sourcePath: string): string {
		const file = this.fileOf(id);
		if (file) return this.app.metadataCache.fileToLinktext(file, sourcePath);
		return this.missingLink(id);
	}
}
