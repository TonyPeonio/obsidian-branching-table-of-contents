import { type Graph, type OutlineItem, nameOf, neighborhood, outline } from "./graph";

export interface TocOptions {
	/** How many levels below the root to include. */
	maxDepth: number;
	/** Produces the text inside `[[...]]` for a node. */
	link: (id: string) => string;
	/** Optional heading written above the list. */
	heading?: string;
}

/**
 * A markdown table of contents for everything below `root`: a nested bullet list of
 * wikilinks. Notes with several parents are listed under each, marked "also under".
 */
export function tocMarkdown(g: Graph, root: string, opts: TocOptions): string {
	const sub = neighborhood(g, root, 0, opts.maxDepth);
	const items = outline(g, sub);
	const lines: string[] = [];
	if (opts.heading) lines.push(`# ${opts.heading}`, "");
	const walk = (list: OutlineItem[], depth: number) => {
		for (const item of list) {
			lines.push("\t".repeat(depth) + "- " + lineFor(g, item, opts));
			walk(item.children, depth + 1);
		}
	};
	walk(items, 0);
	return lines.join("\n") + "\n";
}

function lineFor(g: Graph, item: OutlineItem, opts: TocOptions): string {
	const node = g.nodes.get(item.id);
	const name = nameOf(g, item.id);
	const target = opts.link(item.id);
	let text = target === name ? `[[${target}]]` : `[[${target}|${name}]]`;
	const notes: string[] = [];
	if (node?.missing) notes.push("missing");
	if (item.alsoUnder.length) notes.push("also under " + item.alsoUnder.map((p) => nameOf(g, p)).join(", "));
	else if (item.cross) notes.push("see above");
	if (item.cycle) notes.push("cycle");
	if (notes.length) text += ` *(${notes.join("; ")})*`;
	return text;
}
