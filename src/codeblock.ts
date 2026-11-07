import { MarkdownRenderChild, type HoverPopover } from "obsidian";
import type { NodeActions } from "./actions";
import { neighborhood, outline } from "./graph";
import { layout, type Orientation } from "./layout";
import { cleanLink } from "./links";
import type BtocPlugin from "./main";
import { renderOutline } from "./render-outline";
import { TreeCanvas } from "./render-tree";
import { clampLevels, type ViewMode } from "./settings";

export const CODE_BLOCK = "branching-toc";

export interface BlockOptions {
	/** Note to start from; defaults to the note containing the block. */
	root: string | null;
	up: number;
	down: number;
	mode: ViewMode;
	orientation: Orientation | null;
	/** Height in pixels of a drawn tree. */
	height: number;
}

/** Parses `key: value` lines. Unknown keys are ignored; bad values fall back to defaults. */
export function parseBlockOptions(source: string): BlockOptions {
	const opts: BlockOptions = { root: null, up: 0, down: 2, mode: "outline", orientation: null, height: 320 };
	for (const line of source.split("\n")) {
		const m = /^\s*([A-Za-z_-]+)\s*:\s*(.*?)\s*$/.exec(line);
		if (!m) continue;
		const key = m[1].toLowerCase();
		const value = m[2];
		switch (key) {
			case "root":
				opts.root = cleanLink(value.replace(/^["']|["']$/g, "")) || null;
				break;
			case "up":
				opts.up = clampLevels(value, opts.up);
				break;
			case "down":
			case "depth":
				opts.down = clampLevels(value, opts.down);
				break;
			case "mode":
				if (value === "tree" || value === "outline") opts.mode = value;
				break;
			case "orientation":
			case "direction":
				if (value === "top-down" || value === "left-right") opts.orientation = value;
				break;
			case "height": {
				const h = parseInt(value, 10);
				if (Number.isFinite(h)) opts.height = Math.max(120, Math.min(2000, h));
				break;
			}
		}
	}
	return opts;
}

export function registerTocCodeBlock(plugin: BtocPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor(CODE_BLOCK, (source, el, ctx) => {
		ctx.addChild(new TocBlock(el, parseBlockOptions(source), ctx.sourcePath, plugin));
	});
}

class TocBlock extends MarkdownRenderChild {
	hoverPopover: HoverPopover | null = null;
	private canvas: TreeCanvas | null = null;
	private collapsed = new Set<string>();
	private actions: NodeActions;

	constructor(
		containerEl: HTMLElement,
		private opts: BlockOptions,
		private sourcePath: string,
		private plugin: BtocPlugin,
	) {
		super(containerEl);
		this.actions = {
			open: (id, evt) => void plugin.openNode(id, evt),
			hover: (id, evt, target) => plugin.hoverNode(id, evt, target, this),
			menu: (id, evt) => plugin.nodeMenu(id, evt),
		};
	}

	onload(): void {
		this.registerEvent(this.plugin.graph.on("changed", () => this.render()));
		this.render();
	}

	private render(): void {
		if (this.canvas) {
			this.removeChild(this.canvas);
			this.canvas = null;
		}
		const el = this.containerEl;
		el.empty();
		el.addClass("btoc-block");

		const g = this.plugin.graph.graph;
		const root = this.opts.root
			? (this.plugin.app.metadataCache.getFirstLinkpathDest(this.opts.root, this.sourcePath)?.path ?? null)
			: this.sourcePath;
		if (!root) {
			el.createDiv({ cls: "btoc-empty", text: `Cannot find the note "${this.opts.root ?? ""}".` });
			return;
		}
		if (!g.nodes.has(root)) {
			const name = this.plugin.graph.fileOf(root)?.basename ?? root;
			el.createDiv({ cls: "btoc-empty", text: `${name} has no parent or child links.` });
			return;
		}
		const sub = neighborhood(g, root, this.opts.up, this.opts.down);
		if (this.opts.mode === "tree") {
			const host = el.createDiv({ cls: "btoc-block-tree" });
			host.setCssProps({ height: `${this.opts.height}px` });
			const lay = layout(g, sub, { orientation: this.opts.orientation ?? this.plugin.settings.orientation });
			this.canvas = new TreeCanvas(host, lay, this.actions, root);
			this.addChild(this.canvas);
		} else {
			renderOutline(el, g, outline(g, sub), this.actions, { focus: root, collapsed: this.collapsed });
		}
	}
}
