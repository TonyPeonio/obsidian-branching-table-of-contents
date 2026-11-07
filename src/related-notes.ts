import { Modal, Notice, Setting, normalizePath, type App, type TFile } from "obsidian";
import { cleanLink, flattenStrings } from "./links";
import type BtocPlugin from "./main";
import { firstProperty } from "./settings";

export type Relation = "child" | "parent";

/** Asks for a title, then creates the note linked to `current`. */
export function promptRelatedNote(plugin: BtocPlugin, current: TFile, relation: Relation): void {
	const heading = relation === "child" ? `New child of ${current.basename}` : `New parent of ${current.basename}`;
	new TitleModal(plugin.app, heading, (title) => void createRelatedNote(plugin, current, title, relation)).open();
}

/** Characters Obsidian does not allow in file names. */
export function sanitizeTitle(title: string): string {
	return title
		.replace(/[\\/:*?"<>|#^[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

/**
 * Creates `title.md` next to `current` and writes the link on the side(s) the settings ask
 * for. Returns the new file, or null when nothing was created.
 */
export async function createRelatedNote(plugin: BtocPlugin, current: TFile, title: string, relation: Relation): Promise<TFile | null> {
	const app = plugin.app;
	const name = sanitizeTitle(title);
	if (!name) {
		new Notice("That is not a valid note name.");
		return null;
	}
	const folder = current.parent && current.parent.path !== "/" ? current.parent.path + "/" : "";
	const path = normalizePath(`${folder}${name}.md`);
	if (app.vault.getAbstractFileByPath(path)) {
		new Notice(`A note named "${name}" already exists here.`);
		return null;
	}
	const file = await app.vault.create(path, "");
	const s = plugin.settings;
	const parentKey = firstProperty(s.parentProperties, "parent");
	const childKey = firstProperty(s.childProperties, "child");
	const linkToCurrent = `[[${app.metadataCache.fileToLinktext(current, file.path)}]]`;
	const linkToNew = `[[${app.metadataCache.fileToLinktext(file, current.path)}]]`;
	const onNew = s.newNoteLink !== "existing";
	const onCurrent = s.newNoteLink !== "new";
	if (relation === "child") {
		if (onNew) await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => addLink(fm, parentKey, linkToCurrent, false));
		if (onCurrent) await app.fileManager.processFrontMatter(current, (fm: Record<string, unknown>) => addLink(fm, childKey, linkToNew, true));
	} else {
		if (onNew) await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => addLink(fm, childKey, linkToCurrent, true));
		if (onCurrent) await app.fileManager.processFrontMatter(current, (fm: Record<string, unknown>) => addLink(fm, parentKey, linkToNew, false));
	}
	await app.workspace.getLeaf(false).openFile(file);
	return file;
}

/**
 * Adds a wikilink to a frontmatter property without duplicating it. Parent properties
 * start as a single text value and become a list on the second link; child properties
 * are always a list.
 */
export function addLink(fm: Record<string, unknown>, key: string, link: string, asList: boolean): void {
	const existing = flattenStrings(fm[key]).map((s) => s.trim()).filter((s) => s.length > 0);
	const target = cleanLink(link).toLowerCase();
	if (existing.some((s) => cleanLink(s).toLowerCase() === target)) return;
	if (asList || existing.length > 0) fm[key] = [...existing, link];
	else fm[key] = link;
}

class TitleModal extends Modal {
	constructor(
		app: App,
		private heading: string,
		private onSubmit: (title: string) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.heading);
		let value = "";
		const submit = () => {
			if (!value.trim()) return;
			this.close();
			this.onSubmit(value);
		};
		new Setting(this.contentEl).setName("Title").addText((t) => {
			t.setPlaceholder("Note title");
			t.onChange((v) => (value = v));
			t.inputEl.addEventListener("keydown", (evt) => {
				if (evt.key === "Enter") {
					evt.preventDefault();
					submit();
				}
			});
			window.setTimeout(() => t.inputEl.focus(), 0);
		});
		new Setting(this.contentEl).addButton((b) => b.setButtonText("Create").setCta().onClick(submit));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class ConfirmModal extends Modal {
	constructor(
		app: App,
		private heading: string,
		private body: string,
		private confirmText: string,
		private onConfirm: () => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(this.heading);
		this.contentEl.createEl("p", { text: this.body });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText(this.confirmText)
					.setCta()
					.onClick(() => {
						this.close();
						this.onConfirm();
					}),
			);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
