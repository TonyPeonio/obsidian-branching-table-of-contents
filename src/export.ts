import { FuzzySuggestModal, Notice, normalizePath, type App, type TFile } from "obsidian";
import { childrenOf, compareNodes, type GraphNode } from "./graph";
import type BtocPlugin from "./main";
import { ConfirmModal } from "./related-notes";
import { tocMarkdown } from "./toc";

/** Lets the user pick a root, then writes a table-of-contents note for everything below it. */
export function pickRootAndGenerate(plugin: BtocPlugin): void {
	const g = plugin.graph.graph;
	const candidates = [...g.nodes.values()].filter((n) => !n.missing && childrenOf(g, n.id).length > 0).sort(compareNodes);
	if (candidates.length === 0) {
		new Notice("No note has children yet.");
		return;
	}
	new RootPickerModal(plugin.app, candidates, (n) => void generateTocNote(plugin, n.id)).open();
}

export async function generateTocNote(plugin: BtocPlugin, rootId: string): Promise<void> {
	const app = plugin.app;
	const file = plugin.graph.fileOf(rootId);
	if (!file) return;
	const s = plugin.settings;
	const folder = file.parent && file.parent.path !== "/" ? file.parent.path + "/" : "";
	const path = normalizePath(`${folder}${file.basename}${s.tocNoteSuffix}.md`);
	if (path === file.path) {
		new Notice("The table of contents note would overwrite the root note; change the suffix in settings.");
		return;
	}
	const markdown = tocMarkdown(plugin.graph.graph, rootId, {
		maxDepth: Math.max(1, s.tocMaxDepth),
		heading: file.basename,
		link: (id) => plugin.graph.linkText(id, path),
	});
	const existing = app.vault.getFileByPath(path);
	const write = async () => {
		let out: TFile;
		if (existing) {
			await app.vault.modify(existing, markdown);
			out = existing;
		} else {
			out = await app.vault.create(path, markdown);
		}
		await app.workspace.getLeaf(false).openFile(out);
		new Notice(`Wrote ${out.basename}`);
	};
	if (existing) {
		new ConfirmModal(
			app,
			"Replace existing note?",
			`"${path}" already exists. Replace its contents with the new table of contents?`,
			"Replace",
			() => void write(),
		).open();
	} else {
		await write();
	}
}

class RootPickerModal extends FuzzySuggestModal<GraphNode> {
	constructor(
		app: App,
		private items: GraphNode[],
		private onPick: (node: GraphNode) => void,
	) {
		super(app);
		this.setPlaceholder("Root note of the table of contents");
	}

	getItems(): GraphNode[] {
		return this.items;
	}

	getItemText(node: GraphNode): string {
		return `${node.name}  (${node.id})`;
	}

	onChooseItem(node: GraphNode): void {
		this.onPick(node);
	}
}
