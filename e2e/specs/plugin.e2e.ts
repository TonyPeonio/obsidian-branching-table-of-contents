import { $, $$, browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";

const PLUGIN = "branching-table-of-contents";
const STYLE_BUTTON = ".btoc-view .btoc-tb-btn[aria-label^='Phylogenetic tree']";

async function openNote(path: string): Promise<void> {
	await obsidianPage.openFile(path);
	// The graph updates 150 ms after metadata events; let it settle.
	await browser.pause(500);
}

async function activeName(): Promise<string | undefined> {
	return browser.executeObsidian(({ app }) => app.workspace.getActiveFile()?.basename);
}

async function treeStyle(): Promise<string> {
	return browser.executeObsidian(({ app }) => {
		const plugins = (app as unknown as { plugins: { plugins: Record<string, { settings?: { treeStyle?: string } }> } }).plugins;
		return plugins.plugins["branching-table-of-contents"]?.settings?.treeStyle ?? "";
	});
}

describe("Branching Table of Contents in Obsidian", function () {
	before(async function () {
		await browser.waitUntil(async () => (await treeStyle()) !== "", { timeout: 30000, timeoutMsg: "the plugin did not load" });
	});

	it("opens the tree view on the current note", async function () {
		await openNote("Physics tree/Mechanics.md");
		await browser.executeObsidianCommand(`${PLUGIN}:open-tree-view`);
		const focus = $(".btoc-view .btoc-node.is-focus");
		await expect(focus).toExist();
		await expect(focus).toHaveAttribute("aria-label", expect.stringContaining("Mechanics, current note"));
		await expect($('.btoc-view .btoc-node[aria-label^="Physics, parent"]')).toExist();
		await expect($('.btoc-view .btoc-node[aria-label^="Kinematics, child"]')).toExist();
	});

	it("switches between the family tree and the phylogenetic tree", async function () {
		await openNote("Physics tree/Physics.md");
		await browser.executeObsidianCommand(`${PLUGIN}:open-tree-view`);
		const before = await treeStyle();
		await $(STYLE_BUTTON).click();
		await browser.waitUntil(async () => (await treeStyle()) !== before, { timeout: 5000, timeoutMsg: "style did not change" });
		const phylo = (await treeStyle()) === "phylogenetic";
		const svgClass = (await $(".btoc-view svg.btoc-svg").getAttribute("class")) ?? "";
		expect(svgClass.includes("is-phylo")).toBe(phylo);
		expect(await $(STYLE_BUTTON).getAttribute("aria-pressed")).toBe(String(phylo));
		await $(STYLE_BUTTON).click();
		await browser.waitUntil(async () => (await treeStyle()) === before, { timeout: 5000, timeoutMsg: "style did not switch back" });
	});

	it("opens a note when its node is clicked, and from the keyboard", async function () {
		await openNote("Physics tree/Physics.md");
		await browser.executeObsidianCommand(`${PLUGIN}:open-tree-view`);
		await $('.btoc-view .btoc-node[aria-label^="Thermodynamics,"]').click();
		await browser.waitUntil(async () => (await activeName()) === "Thermodynamics", {
			timeout: 5000,
			timeoutMsg: "clicking the node did not open Thermodynamics",
		});
		// The view follows the active note; focus it, move up to its parent and press Enter.
		await $('.btoc-view .btoc-node.is-focus[aria-label^="Thermodynamics,"]').waitForExist({ timeout: 5000 });
		await browser.execute(() => {
			const el = document.querySelector(".btoc-view .btoc-node.is-focus");
			if (el instanceof SVGElement) el.focus();
		});
		await browser.keys("ArrowUp");
		await browser.keys("Enter");
		await browser.waitUntil(async () => (await activeName()) === "Physics", { timeout: 5000, timeoutMsg: "the keyboard did not open Physics" });
	});

	it("renders the branching-toc code blocks", async function () {
		await openNote("Branching TOC demo.md");
		await browser.executeObsidian(async ({ app, obsidian }) => {
			const view = app.workspace.getActiveViewOfType(obsidian.MarkdownView);
			if (view) await view.setState({ ...view.getState(), mode: "preview" }, { history: false });
		});
		await expect($(".markdown-reading-view .btoc-block .btoc-svg")).toExist();
		await expect($(".markdown-reading-view .btoc-block [role=tree]")).toExist();
		const items = await $$(".markdown-reading-view .btoc-block [role=treeitem]");
		expect(items.length).toBeGreaterThan(3);
	});

	it("opens the problem report with versions and no absolute paths", async function () {
		await browser.executeObsidianCommand(`${PLUGIN}:report-problem`);
		await $(".btoc-report-body").waitForExist({ timeout: 10000 });
		const body = $(".btoc-report-body");
		await expect(body).toExist();
		const text = await body.getValue();
		expect(text).toContain("Plugin: Branching Table of Contents");
		expect(text).toContain("### Graph");
		expect(text).not.toMatch(/[A-Za-z]:\\Users\\|\/Users\/|\/home\//);
		await browser.keys("Escape");
	});

	it("shows its settings, including Report a problem", async function () {
		await browser.executeObsidianCommand("app:open-settings");
		await browser.pause(500);
		await browser.executeObsidian(({ app }) => {
			(app as unknown as { setting: { openTabById(id: string): void } }).setting.openTabById("branching-table-of-contents");
		});
		const named = (text: string) => $(`//*[contains(@class,'setting-item-name') and normalize-space(.)='${text}']`);
		await named("Parent properties").waitForExist({ timeout: 10000 });
		await expect(named("Tree style")).toExist();
		await expect(named("Report a problem")).toExist();
		await browser.executeObsidian(({ app }) => (app as unknown as { setting: { close(): void } }).setting.close());
	});
});
