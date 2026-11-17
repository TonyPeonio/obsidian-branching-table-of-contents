import { Modal, Notice, Setting, type App } from "obsidian";
import { issueLink } from "./report";

/**
 * Shows a problem report for the user to read and edit. "Copy" puts it on the clipboard; "Open on
 * GitHub" opens a new-issue page with it filled in (or, when it is too long for a link, copies it
 * and opens the page with a "paste it here" body). Nothing is sent by the plugin itself.
 */
export class ReportModal extends Modal {
	private title: string;
	private body: string;

	constructor(app: App, title: string, body: string) {
		super(app);
		this.title = title;
		this.body = body;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("Report a problem");
		this.modalEl.addClass("btoc-report-modal");
		contentEl.createEl("p", {
			cls: "btoc-report-intro",
			text: "This report is only shown here. Read it, describe what happened at the top, and remove anything you would rather not share. Paths are shortened and note contents are never included.",
		});

		new Setting(contentEl).setName("Title").addText((t) => {
			t.setValue(this.title).onChange((v) => (this.title = v));
			t.inputEl.addClass("btoc-report-title");
			t.inputEl.setAttribute("aria-label", "Issue title");
		});

		const area = contentEl.createEl("textarea", {
			cls: "btoc-report-body",
			attr: { "aria-label": "Report text", spellcheck: "false", rows: "18" },
		});
		area.value = this.body;
		area.addEventListener("input", () => (this.body = area.value));

		new Setting(contentEl)
			.addButton((b) =>
				b.setButtonText("Copy").onClick(() => {
					void this.copy().then((ok) => new Notice(ok ? "Report copied to the clipboard." : "Could not copy; select the text and copy it by hand."));
				}),
			)
			.addButton((b) =>
				b
					.setButtonText("Open on GitHub")
					.setCta()
					.onClick(() => void this.openOnGitHub()),
			);
		window.setTimeout(() => area.focus(), 0);
	}

	private async copy(): Promise<boolean> {
		try {
			await navigator.clipboard.writeText(this.body);
			return true;
		} catch {
			return false;
		}
	}

	private async openOnGitHub(): Promise<void> {
		const link = issueLink(this.title.trim() || "Problem report", this.body);
		if (!link.fits) {
			const ok = await this.copy();
			new Notice(
				ok
					? "The report is too long for a link, so it is on your clipboard: paste it into the issue."
					: "The report is too long for a link and could not be copied. Use Copy, or select the text by hand.",
				8000,
			);
		}
		window.open(link.url);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
