import { Events, TFile, type App, type CachedMetadata, type Plugin, type TAbstractFile } from "obsidian";
import { emptyGraph, type Graph } from "./graph";
import { GraphIndex, MISSING_PREFIX, contribution, type Contribution, type ContributionOptions, type NoteInfo } from "./graph-index";
import { propertyLinks, propertyNumber } from "./links";
import { log } from "./log";
import { parseList, type Settings } from "./settings";

/**
 * Keeps a {@link Graph} of the vault in sync with the metadata cache. Node ids are vault
 * paths; links that resolve to no file become `missing:` nodes. Emits "changed" whenever the
 * graph actually changes.
 *
 * Editing a note only recomputes that note's links (see {@link GraphIndex}); creating, renaming
 * or deleting notes, or changing settings, rebuilds everything, since any link in the vault may
 * now resolve differently.
 */
export class VaultGraph extends Events {
	private index = new GraphIndex();
	private fullTimer: number | null = null;
	private pending = new Set<string>();
	private fileTimer: number | null = null;
	private ready = false;
	private resolvedOnce = false;
	private lastFullMs = 0;
	private lastIncrementalMs = 0;
	private fullBuilds = 0;
	private incrementalUpdates = 0;

	constructor(
		private app: App,
		private plugin: Plugin,
		private settings: () => Settings,
	) {
		super();
	}

	get graph(): Graph {
		return this.ready ? this.index.graph : emptyGraph();
	}

	start(): void {
		const mc = this.app.metadataCache;
		const vault = this.app.vault;
		this.plugin.registerEvent(mc.on("changed", (file) => this.fileChanged(file)));
		this.plugin.registerEvent(mc.on("deleted", () => this.scheduleRebuild()));
		// "resolved" fires after every batch of changes; only the first one (indexing done) matters.
		this.plugin.registerEvent(
			mc.on("resolved", () => {
				if (this.resolvedOnce) return;
				this.resolvedOnce = true;
				this.scheduleRebuild();
			}),
		);
		this.plugin.registerEvent(vault.on("rename", () => this.scheduleRebuild()));
		this.plugin.registerEvent(vault.on("delete", () => this.scheduleRebuild()));
		this.plugin.registerEvent(
			vault.on("create", (file: TAbstractFile) => {
				if (this.ready && file instanceof TFile && file.extension === "md" && this.index.mayResolveMissing(file.basename)) {
					this.scheduleRebuild();
				}
			}),
		);
		this.plugin.register(() => {
			if (this.fullTimer !== null) window.clearTimeout(this.fullTimer);
			if (this.fileTimer !== null) window.clearTimeout(this.fileTimer);
		});
		this.app.workspace.onLayoutReady(() => this.rebuild());
	}

	/** Coalesces bursts of events into one full rebuild. */
	scheduleRebuild(): void {
		if (this.fullTimer !== null) window.clearTimeout(this.fullTimer);
		this.fullTimer = window.setTimeout(() => {
			this.fullTimer = null;
			this.rebuild();
		}, 150);
	}

	private fileChanged(file: TFile): void {
		if (!this.ready) return;
		this.pending.add(file.path);
		if (this.fileTimer !== null) window.clearTimeout(this.fileTimer);
		this.fileTimer = window.setTimeout(() => {
			this.fileTimer = null;
			this.flushPending();
		}, 150);
	}

	private flushPending(): void {
		// A full rebuild already on its way covers these files too.
		if (this.fullTimer !== null) {
			this.pending.clear();
			return;
		}
		const t0 = performance.now();
		const opts = this.options();
		let changed = false;
		for (const path of this.pending) {
			const file = this.app.vault.getFileByPath(path);
			if (!file || file.extension !== "md") continue;
			const cache = this.app.metadataCache.getFileCache(file);
			const facts = this.facts(file, cache);
			try {
				if (this.index.update(path, contribution(facts, opts), facts)) changed = true;
			} catch (err) {
				log.error("Incremental graph update failed", err);
				this.scheduleRebuild();
			}
		}
		this.pending.clear();
		this.lastIncrementalMs = performance.now() - t0;
		this.incrementalUpdates++;
		if (changed) this.trigger("changed");
	}

	/** Reads every note's frontmatter again and rebuilds the whole graph. */
	rebuild(): void {
		if (this.fullTimer !== null) {
			window.clearTimeout(this.fullTimer);
			this.fullTimer = null;
		}
		const t0 = performance.now();
		try {
			const opts = this.options();
			const mc = this.app.metadataCache;
			const entries: [string, Contribution][] = [];
			for (const file of this.app.vault.getMarkdownFiles()) {
				const c = contribution(this.facts(file, mc.getFileCache(file)), opts);
				if (c) entries.push([file.path, c]);
			}
			this.index.reset(entries);
		} catch (err) {
			log.error("Building the graph failed", err);
		}
		this.ready = true;
		this.pending.clear();
		this.lastFullMs = performance.now() - t0;
		this.fullBuilds++;
		const g = this.index.graph;
		log.info(`Graph built: ${g.nodes.size} notes, ${this.index.size} with links, in ${this.lastFullMs.toFixed(1)} ms`);
		this.trigger("changed");
	}

	/** Measurements for the problem report. */
	timings(): Record<string, string> {
		return {
			"Last full graph build": `${this.lastFullMs.toFixed(1)} ms (${this.fullBuilds} builds)`,
			"Last incremental update": `${this.lastIncrementalMs.toFixed(1)} ms (${this.incrementalUpdates} updates)`,
			"Markdown files in vault": String(this.app.vault.getMarkdownFiles().length),
		};
	}

	private options(): ContributionOptions {
		const s = this.settings();
		const excluded = parseList(s.excludeFolders)
			.map((f) => f.replace(/^\/+|\/+$/g, "") + "/")
			.filter((f) => f !== "/");
		const mc = this.app.metadataCache;
		const orderKey = s.orderProperty.trim();
		return {
			showMissing: s.showMissing,
			isExcluded: (path) => {
				if (!excluded.length) return false;
				const p = path.toLowerCase();
				return excluded.some((f) => p.startsWith(f));
			},
			resolve: (link, sourcePath): NoteInfo | null => {
				const target = mc.getFirstLinkpathDest(link, sourcePath);
				if (!target) return null;
				return { path: target.path, name: target.basename, order: propertyNumber(mc.getFileCache(target)?.frontmatter, orderKey) };
			},
		};
	}

	private facts(file: TFile, cache: CachedMetadata | null) {
		const s = this.settings();
		const fm = cache?.frontmatter;
		return {
			path: file.path,
			name: file.basename,
			order: propertyNumber(fm, s.orderProperty.trim()),
			parents: propertyLinks(fm, cache?.frontmatterLinks, parseList(s.parentProperties)),
			children: propertyLinks(fm, cache?.frontmatterLinks, parseList(s.childProperties)),
		};
	}

	isMissing(id: string): boolean {
		return id.startsWith(MISSING_PREFIX);
	}

	/** The link text that was written for a missing node, e.g. `Courses/Physics`. */
	missingLink(id: string): string {
		return this.index.missingLinks.get(id) ?? id.slice(MISSING_PREFIX.length);
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
