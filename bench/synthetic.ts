/**
 * A deterministic synthetic vault for benchmarks: a forest of notes where most notes name one
 * parent, some name a second parent, some parents list their children instead, a few links point
 * at notes that do not exist, and a few back links make cycles. The same shape as
 * `node scripts/make-sample-vault.mjs --large N` writes to disk.
 */
import type { ContributionOptions, NoteFacts, NoteInfo } from "../src/graph-index";

function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 2 ** 32;
	};
}

export function syntheticVault(n: number, seed = 42): { facts: NoteFacts[]; opts: ContributionOptions } {
	const rand = rng(seed);
	const names = Array.from({ length: n }, (_, i) => `Note ${i}`);
	const facts: NoteFacts[] = names.map((name, i) => ({ path: `Folder ${i % 50}/${name}.md`, name, parents: [], children: [], order: i % 7 === 0 ? i % 5 : undefined }));
	const roots = Math.max(1, Math.round(n / 500));
	for (let i = roots; i < n; i++) {
		// Parent among earlier notes, biased towards recent ones so the trees get deep (~10-15 levels).
		const p = Math.max(0, i - 1 - Math.floor(rand() * Math.min(i, 40)));
		if (rand() < 0.2) facts[p].children.push(names[i]);
		else facts[i].parents.push(names[p]);
		if (rand() < 0.08) facts[i].parents.push(names[Math.floor(rand() * i)]);
		if (rand() < 0.01) facts[i].children.push(`Missing ${i}`);
		if (rand() < 0.002) facts[i].children.push(names[Math.floor(rand() * i)]); // back link: a cycle
	}
	const byName = new Map<string, NoteInfo>(facts.map((f) => [f.name.toLowerCase(), { path: f.path, name: f.name, order: f.order }]));
	return {
		facts,
		opts: { showMissing: true, isExcluded: () => false, resolve: (link) => byName.get(link.toLowerCase()) ?? null },
	};
}
