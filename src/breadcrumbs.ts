import { MarkdownView, Menu, setIcon } from "obsidian";
import { nameOf, parentsOf, pathToRoot } from "./graph";
import type BtocPlugin from "./main";

const HOSTS = [".cm-sizer", ".markdown-preview-sizer"];

/**
 * A clickable "Root › Branch › Note" trail at the top of every markdown view whose note
 * has a parent. Inserted into the editor and reading-view sizers, like the inline title.
 */
export class Breadcrumbs {
	constructor(private plugin: BtocPlugin) {}

	start(): void {
		const ws = this.plugin.app.workspace;
		this.plugin.registerEvent(ws.on("active-leaf-change", () => this.refreshAll()));
		this.plugin.registerEvent(ws.on("file-open", () => this.refreshAll()));
		this.plugin.registerEvent(ws.on("layout-change", () => this.refreshAll()));
		this.plugin.registerEvent(this.plugin.graph.on("changed", () => this.refreshAll()));
		this.plugin.register(() => this.removeAll());
		ws.onLayoutReady(() => this.refreshAll());
	}

	refreshAll(): void {
		if (!this.plugin.settings.showBreadcrumbs) {
			this.removeAll();
			return;
		}
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if (leaf.view instanceof MarkdownView) this.refresh(leaf.view);
		});
	}

	private removeAll(): void {
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			if (!(leaf.view instanceof MarkdownView)) return;
			for (const bar of Array.from(leaf.view.containerEl.querySelectorAll(".btoc-breadcrumbs"))) bar.remove();
		});
	}

	private refresh(view: MarkdownView): void {
		const g = this.plugin.graph.graph;
		const file = view.file;
		const trail = file && g.nodes.has(file.path) && parentsOf(g, file.path).length > 0 ? pathToRoot(g, file.path) : null;
		for (const selector of HOSTS) {
			const host = view.containerEl.querySelector<HTMLElement>(selector);
			if (!host) continue;
			let bar: HTMLElement | null = null;
			for (const child of Array.from(host.children)) {
				if (child.instanceOf(HTMLElement) && child.hasClass("btoc-breadcrumbs")) bar = child;
			}
			if (!trail) {
				bar?.remove();
				continue;
			}
			if (!bar) {
				bar = createDiv({ cls: "btoc-breadcrumbs" });
				host.prepend(bar);
			}
			const signature = trail.join("\u0000");
			if (bar.dataset.trail === signature) continue;
			bar.dataset.trail = signature;
			this.fill(bar, trail, view);
		}
	}

	private fill(bar: HTMLElement, trail: string[], view: MarkdownView): void {
		const g = this.plugin.graph.graph;
		bar.empty();
		const icon = bar.createSpan({ cls: "btoc-crumb-icon" });
		setIcon(icon, "git-fork");
		trail.forEach((id, i) => {
			if (i > 0) bar.createSpan({ cls: "btoc-crumb-sep", text: "›" });
			const current = i === trail.length - 1;
			const crumb = bar.createSpan({ cls: "btoc-crumb", text: nameOf(g, id) });
			if (current) crumb.addClass("is-current");
			else {
				crumb.setAttribute("role", "link");
				crumb.setAttribute("tabindex", "0");
				crumb.addEventListener("click", (evt) => void this.plugin.openNode(id, evt));
				crumb.addEventListener("auxclick", (evt) => {
					if (evt.button === 1) void this.plugin.openNode(id, evt);
				});
				crumb.addEventListener("mouseover", (evt) => this.plugin.hoverNode(id, evt, crumb, view));
				crumb.addEventListener("contextmenu", (evt) => {
					evt.preventDefault();
					this.plugin.nodeMenu(id, evt);
				});
			}
			// Other parents of the next note on the trail, as a "+N" chip.
			const next = trail[i + 1];
			if (next === undefined) return;
			const others = parentsOf(g, next).filter((p) => p !== id);
			if (!others.length) return;
			const more = bar.createSpan({
				cls: "btoc-crumb-more",
				text: `+${others.length}`,
				attr: { "aria-label": `Other parents of ${nameOf(g, next)}`, role: "button", tabindex: "0" },
			});
			more.addEventListener("click", (evt) => {
				const menu = new Menu();
				for (const p of others) {
					menu.addItem((item) =>
						item
							.setTitle(nameOf(g, p))
							.setIcon("file")
							.onClick((e) => void this.plugin.openNode(p, e instanceof MouseEvent ? e : evt)),
					);
				}
				menu.showAtMouseEvent(evt);
			});
		});
	}
}
