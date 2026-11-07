import { PluginSettingTab, Setting, type App } from "obsidian";
import type BtocPlugin from "./main";
import { clampLevels, type NewNoteLink, type ViewMode, type ViewScope } from "./settings";
import type { Orientation } from "./layout";

export class BtocSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private plugin: BtocPlugin,
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;
		const save = () => void this.plugin.saveSettings();

		new Setting(containerEl).setName("Properties").setHeading();

		new Setting(containerEl)
			.setName("Parent properties")
			.setDesc("Frontmatter properties that hold links to a note's parents. Comma-separated; the first one is written when you create a child note.")
			.addText((t) =>
				t.setValue(s.parentProperties).onChange((v) => {
					s.parentProperties = v;
					save();
				}),
			);

		new Setting(containerEl)
			.setName("Child properties")
			.setDesc("Frontmatter properties that hold links to a note's children. Comma-separated; the first one is written when you create a parent note.")
			.addText((t) =>
				t.setValue(s.childProperties).onChange((v) => {
					s.childProperties = v;
					save();
				}),
			);

		new Setting(containerEl)
			.setName("Order property")
			.setDesc("Optional numeric property used to sort siblings. Lower comes first; notes without it follow alphabetically.")
			.addText((t) =>
				t.setValue(s.orderProperty).onChange((v) => {
					s.orderProperty = v;
					save();
				}),
			);

		new Setting(containerEl)
			.setName("Exclude folders")
			.setDesc("Folders to ignore, one per line or comma-separated (for example Templates).")
			.addTextArea((t) =>
				t.setValue(s.excludeFolders).onChange((v) => {
					s.excludeFolders = v;
					save();
				}),
			);

		new Setting(containerEl)
			.setName("Show missing notes")
			.setDesc("Draw links to notes that do not exist yet as dashed boxes. Clicking one creates the note.")
			.addToggle((t) =>
				t.setValue(s.showMissing).onChange((v) => {
					s.showMissing = v;
					save();
				}),
			);

		new Setting(containerEl).setName("Tree view").setHeading();

		new Setting(containerEl)
			.setName("Levels up")
			.setDesc("How many generations above the current note to show (0 to 10).")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "0";
				t.inputEl.max = "10";
				t.setValue(String(s.levelsUp)).onChange((v) => {
					s.levelsUp = clampLevels(v, s.levelsUp);
					save();
				});
			});

		new Setting(containerEl)
			.setName("Levels down")
			.setDesc("How many generations below the current note to show (0 to 10).")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "0";
				t.inputEl.max = "10";
				t.setValue(String(s.levelsDown)).onChange((v) => {
					s.levelsDown = clampLevels(v, s.levelsDown);
					save();
				});
			});

		new Setting(containerEl)
			.setName("Default view")
			.addDropdown((d) =>
				d
					.addOptions({ tree: "Drawn tree", outline: "Outline" })
					.setValue(s.defaultMode)
					.onChange((v) => {
						s.defaultMode = v as ViewMode;
						save();
					}),
			);

		new Setting(containerEl)
			.setName("Default scope")
			.setDesc("Family tree of the current note, or every tree in the vault.")
			.addDropdown((d) =>
				d
					.addOptions({ focus: "Current note", all: "Whole vault" })
					.setValue(s.defaultScope)
					.onChange((v) => {
						s.defaultScope = v as ViewScope;
						save();
					}),
			);

		new Setting(containerEl)
			.setName("Layout direction")
			.addDropdown((d) =>
				d
					.addOptions({ "top-down": "Top to bottom", "left-right": "Left to right" })
					.setValue(s.orientation)
					.onChange((v) => {
						s.orientation = v as Orientation;
						save();
					}),
			);

		new Setting(containerEl)
			.setName("Follow the active note")
			.setDesc("Newly opened tree views re-centre on whichever note you open. You can pin a view from its toolbar.")
			.addToggle((t) =>
				t.setValue(s.followActiveNote).onChange((v) => {
					s.followActiveNote = v;
					save();
				}),
			);

		new Setting(containerEl).setName("Breadcrumbs").setHeading();

		new Setting(containerEl)
			.setName("Show breadcrumbs")
			.setDesc("Show the path from the root at the top of every note that has a parent.")
			.addToggle((t) =>
				t.setValue(s.showBreadcrumbs).onChange((v) => {
					s.showBreadcrumbs = v;
					save();
				}),
			);

		new Setting(containerEl).setName("New notes").setHeading();

		new Setting(containerEl)
			.setName("Where to write the link")
			.setDesc("When creating a child or parent note, which note gets the property that links the two.")
			.addDropdown((d) =>
				d
					.addOptions({ new: "The new note", existing: "The existing note", both: "Both" })
					.setValue(s.newNoteLink)
					.onChange((v) => {
						s.newNoteLink = v as NewNoteLink;
						save();
					}),
			);

		new Setting(containerEl).setName("Table of contents note").setHeading();

		new Setting(containerEl)
			.setName("Note name suffix")
			.setDesc("Appended to the root note's name. The note is created in the root note's folder.")
			.addText((t) =>
				t.setValue(s.tocNoteSuffix).onChange((v) => {
					s.tocNoteSuffix = v;
					save();
				}),
			);

		new Setting(containerEl)
			.setName("Maximum depth")
			.setDesc("How many levels below the root to list (1 to 30).")
			.addText((t) => {
				t.inputEl.type = "number";
				t.inputEl.min = "1";
				t.inputEl.max = "30";
				t.setValue(String(s.tocMaxDepth)).onChange((v) => {
					const n = parseInt(v, 10);
					if (Number.isFinite(n)) s.tocMaxDepth = Math.max(1, Math.min(30, n));
					save();
				});
			});
	}
}
