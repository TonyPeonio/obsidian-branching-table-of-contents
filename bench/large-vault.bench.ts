// @vitest-environment jsdom
/**
 * Times graph building and layout on generated 5k and 20k note vaults. Run with `npm run bench`;
 * the numbers in the README come from here. Not part of `npm test`.
 */
import { describe, it } from "vitest";
import { forest, neighborhood, outline } from "../src/graph";
import { GraphIndex, contribution, type Contribution } from "../src/graph-index";
import { layout } from "../src/layout";
import { LARGE_OUTLINE, countItems, renderOutline } from "../src/render-outline";
import { TreeCanvas } from "../src/render-tree";
import { graphStats } from "../src/report";
import { installObsidianDom } from "../tests/dom";
import { syntheticVault } from "./synthetic";

installObsidianDom();
const noop = { open: () => undefined, hover: () => undefined, menu: () => undefined };

function time<T>(fn: () => T, runs = 5): { ms: number; value: T } {
	let value = fn(); // warm-up
	const samples: number[] = [];
	for (let i = 0; i < runs; i++) {
		const t0 = performance.now();
		value = fn();
		samples.push(performance.now() - t0);
	}
	samples.sort((a, b) => a - b);
	return { ms: samples[Math.floor(samples.length / 2)], value };
}

const rows: string[][] = [];
const fmt = (ms: number) => (ms < 10 ? ms.toFixed(2) : ms.toFixed(0)) + " ms";

for (const n of [5000, 20000]) {
	describe(`${n} notes`, () => {
		it("builds, updates and lays out", () => {
			const { facts, opts } = syntheticVault(n);
			const full = time(() => {
				const idx = new GraphIndex();
				const entries: [string, Contribution][] = [];
				for (const f of facts) {
					const c = contribution(f, opts);
					if (c) entries.push([f.path, c]);
				}
				idx.reset(entries);
				return idx;
			});
			const idx = full.value;
			const g = idx.graph;
			const target = facts[Math.floor(n / 2)];
			const bodyEdit = time(() => idx.update(target.path, contribution(target, opts), target), 50);
			let flip = false;
			const linkEdit = time(() => {
				flip = !flip;
				const f = { ...target, parents: flip ? [...target.parents, facts[3].name] : target.parents };
				return idx.update(target.path, contribution(f, opts), f);
			}, 20);
			// The busiest note: the largest family tree two levels up and down.
			let focus = target.path;
			let best = 0;
			for (const id of g.nodes.keys()) {
				const k = (g.children.get(id)?.length ?? 0) + (g.parents.get(id)?.length ?? 0);
				if (k > best) {
					best = k;
					focus = id;
				}
			}
			const focusSub = neighborhood(g, focus, 2, 2);
			const focusLayout = time(() => layout(g, neighborhood(g, focus, 2, 2)), 50);
			const sub = forest(g);
			const forestLayout = time(() => layout(g, forest(g)), 3);
			const lay = forestLayout.value;
			const outlineBuild = time(() => outline(g, sub), 3);
			const stats = time(() => graphStats(g), 3);
			const draw = time(() => {
				const host = document.body.createDiv();
				Object.defineProperty(host, "clientWidth", { value: 1200 });
				Object.defineProperty(host, "clientHeight", { value: 800 });
				const canvas = new TreeCanvas(host, lay, noop, null);
				canvas.load();
				canvas.unload();
				host.remove();
			}, 1);
			const drawOutline = time(() => {
				const host = document.body.createDiv();
				const items = outlineBuild.value;
				const large = countItems(items) > LARGE_OUTLINE;
				renderOutline(host, g, items, noop, { focus: null, collapsed: new Set(), expanded: new Set(), collapseBelowLevel: large ? 2 : undefined });
				host.remove();
			}, 1);
			const s = stats.value;
			rows.push([
				`${n}`,
				`${g.nodes.size} nodes, ${s.links} links, ${s.cycles} cycles, depth ${s.maxDepth}`,
				fmt(full.ms),
				fmt(bodyEdit.ms),
				fmt(linkEdit.ms),
				`${fmt(focusLayout.ms)} (${focusSub.ids.length} notes)`,
				fmt(forestLayout.ms),
				fmt(outlineBuild.ms),
				fmt(draw.ms),
				fmt(drawOutline.ms),
			]);
		});
	});
}

describe("summary", () => {
	it("prints", () => {
		const head = ["notes", "graph", "full build", "edit body", "edit links", "focus layout", "whole-vault layout", "whole-vault outline", "draw whole vault, 1200×800 view (jsdom)", "draw whole-vault outline (jsdom)"];
		console.log(["| " + head.join(" | ") + " |", "|" + head.map(() => "---").join("|") + "|", ...rows.map((r) => "| " + r.join(" | ") + " |")].join("\n"));
	});
});
