import { setIcon } from "obsidian";
import type { NodeActions } from "./actions";
import { nameOf, type Graph, type OutlineItem } from "./graph";

export interface OutlineOptions {
	focus: string | null;
	/** Keys (see {@link outlineKey}) of branches the user has collapsed; mutated on toggle. */
	collapsed: Set<string>;
	/** Accessible name of the whole outline. */
	label?: string;
	/**
	 * Branches deeper than this level start collapsed (used for very large outlines), unless
	 * their key is in `expanded`. Collapsed branches are only built when first opened.
	 */
	collapseBelowLevel?: number;
	/** Keys of branches the user opened that would otherwise start collapsed; mutated on toggle. */
	expanded?: Set<string>;
}

/** Outlines with more items than this start with deep branches collapsed. */
export const LARGE_OUTLINE = 1500;

/** Number of items in an outline, counting repeats. */
export function countItems(items: OutlineItem[]): number {
	let n = 0;
	const stack = [...items];
	while (stack.length) {
		const it = stack.pop();
		if (!it) break;
		n++;
		for (const c of it.children) stack.push(c);
	}
	return n;
}

export function outlineKey(parentKey: string, id: string): string {
	return parentKey ? parentKey + "\u0000" + id : id;
}

/**
 * Renders a nested, collapsible outline that follows the WAI-ARIA tree pattern: one Tab stop,
 * arrow keys to move (Right/Left also expand and collapse), Home/End, Enter to open, the
 * context-menu key (or Shift+F10) for the note menu.
 */
export function renderOutline(
	container: HTMLElement,
	g: Graph,
	items: OutlineItem[],
	actions: NodeActions,
	opts: OutlineOptions,
): void {
	const root = container.createDiv({ cls: "btoc-outline", attr: { role: "tree", "aria-label": opts.label ?? "Outline" } });
	renderItems(root, g, items, actions, opts, "", 1);
	const all = treeItems(root);
	const start = all.find((el) => el.hasClass("is-focus-item")) ?? all[0];
	start?.setAttribute("tabindex", "0");
	root.addEventListener("keydown", (evt) => onKey(root, evt, actions));
	root.addEventListener("focusin", (evt) => {
		const item = (evt.target as HTMLElement | null)?.closest<HTMLElement>("[role=treeitem]");
		if (item) setRoving(root, item);
	});
}

function renderItems(
	parent: HTMLElement,
	g: Graph,
	items: OutlineItem[],
	actions: NodeActions,
	opts: OutlineOptions,
	parentKey: string,
	level: number,
): void {
	for (const item of items) {
		const key = outlineKey(parentKey, item.id);
		const node = g.nodes.get(item.id);
		const name = nameOf(g, item.id);
		const el = parent.createDiv({ cls: "btoc-item", attr: { role: "treeitem", tabindex: "-1", "aria-level": String(level) } });
		el.dataset.id = item.id;
		const row = el.createDiv({ cls: "btoc-row" });
		if (item.id === opts.focus) {
			row.addClass("is-focus");
			el.addClass("is-focus-item");
			el.setAttribute("aria-current", "page");
		}
		if (node?.missing) row.addClass("is-missing");

		const hasChildren = item.children.length > 0;
		const chevron = row.createDiv({ cls: "btoc-chevron", attr: { "aria-hidden": "true" } });
		if (hasChildren) {
			chevron.addClass("is-active");
			setIcon(chevron, "chevron-down");
		}

		const link = row.createSpan({ cls: "btoc-link", text: name });
		const meta: string[] = [];
		if (item.alsoUnder.length) {
			const text = "also under " + item.alsoUnder.map((p) => nameOf(g, p)).join(", ");
			row.createSpan({ cls: "btoc-meta", text });
			meta.push(text);
		} else if (item.cross) {
			row.createSpan({ cls: "btoc-meta", text: "see above" });
			meta.push("listed above");
		}
		if (item.cycle) {
			row.createSpan({ cls: "btoc-meta is-cycle", text: "cycle" });
			meta.push("cycle");
		}
		if (node?.missing) {
			row.createSpan({ cls: "btoc-meta", text: "missing" });
			meta.push("missing note");
		}
		el.setAttribute("aria-label", [name, ...meta].join(", "));

		link.addEventListener("click", (evt) => {
			evt.preventDefault();
			actions.open(item.id, evt);
		});
		link.addEventListener("auxclick", (evt) => {
			if (evt.button !== 1) return;
			evt.preventDefault();
			actions.open(item.id, evt);
		});
		link.addEventListener("mouseover", (evt) => actions.hover(item.id, evt, link));
		row.addEventListener("contextmenu", (evt) => {
			evt.preventDefault();
			evt.stopPropagation();
			actions.menu(item.id, evt);
		});

		if (hasChildren) {
			const children = el.createDiv({ cls: "btoc-children", attr: { role: "group" } });
			let built = false;
			const build = () => {
				if (built) return;
				built = true;
				renderItems(children, g, item.children, actions, opts, key, level + 1);
			};
			const setCollapsed = (collapsed: boolean) => {
				el.toggleClass("is-collapsed", collapsed);
				el.setAttribute("aria-expanded", String(!collapsed));
				if (collapsed) {
					opts.collapsed.add(key);
					opts.expanded?.delete(key);
				} else {
					opts.collapsed.delete(key);
					opts.expanded?.add(key);
					build();
				}
			};
			const startCollapsed =
				opts.collapsed.has(key) || (opts.collapseBelowLevel !== undefined && level >= opts.collapseBelowLevel && !opts.expanded?.has(key));
			el.toggleClass("is-collapsed", startCollapsed);
			el.setAttribute("aria-expanded", String(!startCollapsed));
			if (!startCollapsed) build();
			chevron.addEventListener("click", (evt) => {
				evt.preventDefault();
				setCollapsed(!el.hasClass("is-collapsed"));
			});
			// For the keyboard handler, which works on elements only.
			(el as ToggleableItem).btocSetCollapsed = setCollapsed;
		}
	}
}

type ToggleableItem = HTMLElement & { btocSetCollapsed?: (collapsed: boolean) => void };

function treeItems(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>("[role=treeitem]"));
}

/** Tree items not hidden inside a collapsed branch, in document order. */
export function visibleItems(root: HTMLElement): HTMLElement[] {
	return treeItems(root).filter((el) => {
		for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
			if (p.getAttribute("role") === "treeitem" && p.hasClass("is-collapsed")) return false;
		}
		return true;
	});
}

function setRoving(root: HTMLElement, item: HTMLElement): void {
	for (const el of Array.from(root.querySelectorAll<HTMLElement>("[role=treeitem][tabindex='0']"))) {
		if (el !== item) el.setAttribute("tabindex", "-1");
	}
	item.setAttribute("tabindex", "0");
}

function moveTo(root: HTMLElement, item: HTMLElement | undefined): void {
	if (!item) return;
	setRoving(root, item);
	item.focus();
}

function onKey(root: HTMLElement, evt: KeyboardEvent, actions: NodeActions): void {
	const item = (evt.target as HTMLElement | null)?.closest<HTMLElement>("[role=treeitem]");
	if (!item) return;
	const id = item.dataset.id ?? "";
	const visible = visibleItems(root);
	const i = visible.indexOf(item);
	const expandable = item.hasAttribute("aria-expanded");
	const expanded = item.getAttribute("aria-expanded") === "true";
	const toggle = (item as ToggleableItem).btocSetCollapsed;
	switch (evt.key) {
		case "ArrowDown":
			moveTo(root, visible[i + 1]);
			break;
		case "ArrowUp":
			moveTo(root, visible[i - 1]);
			break;
		case "Home":
			moveTo(root, visible[0]);
			break;
		case "End":
			moveTo(root, visible[visible.length - 1]);
			break;
		case "ArrowRight":
			if (expandable && !expanded) toggle?.(false);
			else if (expandable) moveTo(root, visible[i + 1]);
			break;
		case "ArrowLeft":
			if (expandable && expanded) toggle?.(true);
			else moveTo(root, item.parentElement?.closest<HTMLElement>("[role=treeitem]") ?? undefined);
			break;
		case "Enter":
		case " ":
			actions.open(id, new MouseEvent("click", { ctrlKey: evt.ctrlKey, metaKey: evt.metaKey, shiftKey: evt.shiftKey, altKey: evt.altKey }));
			break;
		case "ContextMenu":
		case "F10": {
			if (evt.key === "F10" && !evt.shiftKey) return;
			const box = item.getBoundingClientRect();
			actions.menu(id, new MouseEvent("contextmenu", { clientX: box.left + 24, clientY: box.top + 12 }));
			break;
		}
		default:
			return;
	}
	evt.preventDefault();
	evt.stopPropagation();
}
