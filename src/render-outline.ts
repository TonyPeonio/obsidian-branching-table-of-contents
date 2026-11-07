import { setIcon } from "obsidian";
import type { NodeActions } from "./actions";
import { nameOf, type Graph, type OutlineItem } from "./graph";

export interface OutlineOptions {
	focus: string | null;
	/** Keys (see {@link outlineKey}) of branches the user has collapsed; mutated on toggle. */
	collapsed: Set<string>;
}

export function outlineKey(parentKey: string, id: string): string {
	return parentKey ? parentKey + "\u0000" + id : id;
}

/** Renders a nested, collapsible outline. Returns nothing; everything is plain DOM. */
export function renderOutline(
	container: HTMLElement,
	g: Graph,
	items: OutlineItem[],
	actions: NodeActions,
	opts: OutlineOptions,
): void {
	const root = container.createDiv({ cls: "btoc-outline" });
	renderItems(root, g, items, actions, opts, "");
}

function renderItems(
	parent: HTMLElement,
	g: Graph,
	items: OutlineItem[],
	actions: NodeActions,
	opts: OutlineOptions,
	parentKey: string,
): void {
	for (const item of items) {
		const key = outlineKey(parentKey, item.id);
		const node = g.nodes.get(item.id);
		const el = parent.createDiv({ cls: "btoc-item" });
		const row = el.createDiv({ cls: "btoc-row" });
		if (item.id === opts.focus) row.addClass("is-focus");
		if (node?.missing) row.addClass("is-missing");

		const hasChildren = item.children.length > 0;
		const chevron = row.createDiv({ cls: "btoc-chevron" });
		if (hasChildren) {
			chevron.addClass("is-active");
			chevron.setAttribute("role", "button");
			chevron.setAttribute("aria-label", "Collapse or expand");
			setIcon(chevron, "chevron-down");
		}

		const link = row.createSpan({ cls: "btoc-link", text: nameOf(g, item.id) });
		link.setAttribute("role", "link");
		link.setAttribute("tabindex", "0");
		if (item.alsoUnder.length) {
			row.createSpan({ cls: "btoc-meta", text: "also under " + item.alsoUnder.map((p) => nameOf(g, p)).join(", ") });
		} else if (item.cross) {
			row.createSpan({ cls: "btoc-meta", text: "see above" });
		}
		if (item.cycle) row.createSpan({ cls: "btoc-meta is-cycle", text: "cycle" });
		if (node?.missing) row.createSpan({ cls: "btoc-meta", text: "missing" });

		link.addEventListener("click", (evt) => {
			evt.preventDefault();
			actions.open(item.id, evt);
		});
		link.addEventListener("auxclick", (evt) => {
			if (evt.button !== 1) return;
			evt.preventDefault();
			actions.open(item.id, evt);
		});
		link.addEventListener("keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				actions.open(item.id, new MouseEvent("click", { ctrlKey: evt.ctrlKey, metaKey: evt.metaKey }));
			}
		});
		link.addEventListener("mouseover", (evt) => actions.hover(item.id, evt, link));
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			actions.menu(item.id, evt);
		});

		if (hasChildren) {
			const children = el.createDiv({ cls: "btoc-children" });
			const setCollapsed = (collapsed: boolean) => {
				el.toggleClass("is-collapsed", collapsed);
				if (collapsed) opts.collapsed.add(key);
				else opts.collapsed.delete(key);
			};
			setCollapsed(opts.collapsed.has(key));
			chevron.addEventListener("click", (evt) => {
				evt.preventDefault();
				setCollapsed(!el.hasClass("is-collapsed"));
			});
			renderItems(children, g, item.children, actions, opts, key);
		}
	}
}
