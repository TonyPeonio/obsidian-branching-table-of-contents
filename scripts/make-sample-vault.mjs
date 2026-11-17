// Writes a small vault of linked notes into ./sample-vault (or the folder given as the first
// argument) to try the plugin on. Usage: node scripts/make-sample-vault.mjs [folder]
//
// With --large N it instead writes N generated notes (same shape as bench/synthetic.ts: one or two
// parents each, some child lists, a few missing links and cycles) for trying big vaults in
// Obsidian: node scripts/make-sample-vault.mjs --large 20000 ../big-vault
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const largeAt = args.indexOf("--large");
if (largeAt >= 0) {
	const n = parseInt(args[largeAt + 1] ?? "", 10);
	if (!Number.isFinite(n) || n < 1) throw new Error("--large needs a number of notes");
	const rest = args.filter((_, i) => i !== largeAt && i !== largeAt + 1);
	writeLarge(n, rest[0] ?? `large-vault-${n}`);
	process.exit(0);
}

function writeLarge(n, target) {
	let seed = 42;
	const rand = () => {
		seed = (seed * 1664525 + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
	const names = Array.from({ length: n }, (_, i) => `Note ${i}`);
	const notes = names.map((name, i) => ({ name, folder: `Folder ${i % 50}`, parents: [], children: [], order: i % 7 === 0 ? i % 5 : undefined }));
	const roots = Math.max(1, Math.round(n / 500));
	for (let i = roots; i < n; i++) {
		const p = Math.max(0, i - 1 - Math.floor(rand() * Math.min(i, 40)));
		if (rand() < 0.2) notes[p].children.push(names[i]);
		else notes[i].parents.push(names[p]);
		if (rand() < 0.08) notes[i].parents.push(names[Math.floor(rand() * i)]);
		if (rand() < 0.01) notes[i].children.push(`Missing ${i}`);
		if (rand() < 0.002) notes[i].children.push(names[Math.floor(rand() * i)]);
	}
	for (const note of notes) {
		const dir = join(target, note.folder);
		mkdirSync(dir, { recursive: true });
		const lines = ["---"];
		if (note.parents.length) lines.push("parent:", ...note.parents.map((p) => `  - "[[${p}]]"`));
		if (note.children.length) lines.push("child:", ...note.children.map((c) => `  - "[[${c}]]"`));
		if (note.order !== undefined) lines.push(`toc-order: ${note.order}`);
		lines.push("---", "", `Generated note ${note.name}.`, "");
		writeFileSync(join(dir, `${note.name}.md`), lines.join("\n"));
	}
	console.log(`Wrote ${n} generated notes to ${target}`);
}

const target = args[0] ?? "sample-vault";
const folder = join(target, "Physics tree");
mkdirSync(folder, { recursive: true });

const fm = (props) => {
	const lines = ["---"];
	for (const [k, v] of Object.entries(props)) {
		if (Array.isArray(v)) {
			lines.push(`${k}:`);
			for (const item of v) lines.push(`  - "${item}"`);
		} else if (typeof v === "number") lines.push(`${k}: ${v}`);
		else lines.push(`${k}: "${v}"`);
	}
	lines.push("---", "");
	return lines.join("\n");
};

const notes = {
	Physics: {
		props: { child: ["[[Mechanics]]", "[[Thermodynamics]]", "[[Quantum Mechanics]]"] },
		body: "The root of this tree. Open the Branching Table of Contents view to see everything below it.",
	},
	Mechanics: {
		props: { parent: "[[Physics]]", child: ["[[Kinematics]]", "[[Dynamics]]"], "toc-order": 1 },
		body: "Motion and the forces that cause it. `toc-order: 1` puts this first among its siblings.",
	},
	Kinematics: { props: { parent: "[[Mechanics]]" }, body: "Describing motion without regard to its causes." },
	Dynamics: {
		props: { parent: "[[Mechanics]]", child: ["[[Newton's Laws]]", "[[Lagrangian Mechanics]]"] },
		body: "Why things move.",
	},
	"Newton's Laws": { props: { parent: "[[Dynamics]]" }, body: "F = ma and friends." },
	"Lagrangian Mechanics": {
		props: { parent: "[[Dynamics]]", child: ["[[Path Integrals]]"] },
		body: "Reformulating mechanics around the action.",
	},
	Thermodynamics: {
		props: { parent: "[[Physics]]", child: ["[[Entropy]]", "[[Statistical Mechanics]]"], "toc-order": 2 },
		body: "Heat, work and the arrow of time.",
	},
	Entropy: { props: { parent: "[[Thermodynamics]]" }, body: "Disorder, information, and why your room gets messy." },
	"Statistical Mechanics": {
		props: { parent: "[[Thermodynamics]]", child: ["[[Partition Function]]"] },
		body: "Thermodynamics from the statistics of many particles.",
	},
	"Partition Function": { props: { parent: "[[Statistical Mechanics]]" }, body: "Z, from which everything follows." },
	"Quantum Mechanics": {
		props: { parent: "[[Physics]]", child: ["[[Hilbert Spaces]]", "[[Path Integrals]]", "[[Quantum Field Theory]]"] },
		body: "Note that [[Quantum Field Theory]] does not exist yet: it shows as a dashed, missing node. Click it to create the note.",
	},
	"Hilbert Spaces": { props: { parent: "[[Quantum Mechanics]]", "toc-order": 1 }, body: "Where quantum states live." },
	"Path Integrals": {
		props: { parent: ["[[Quantum Mechanics]]", "[[Lagrangian Mechanics]]"] },
		body: "This note has two parents, so it appears under both with an *also under* marker, and its breadcrumbs show a +1 chip.",
	},
	Cooking: { props: { child: ["[[Baking]]"] }, body: "A second, separate tree. Switch the view to *Whole vault* to see both roots side by side." },
	Baking: { props: { parent: "[[Cooking]]", child: ["[[Sourdough]]"] }, body: "" },
	Sourdough: { props: { parent: "[[Baking]]" }, body: "Flour, water, salt, time." },
};

for (const [name, { props, body }] of Object.entries(notes)) {
	writeFileSync(join(folder, `${name}.md`), fm(props) + "\n" + body + "\n");
}

writeFileSync(
	join(target, "Branching TOC demo.md"),
	[
		"# Branching table of contents demo",
		"",
		"Open any note in the **Physics tree** folder and click the fork icon in the ribbon. The view shows the note's family tree: two levels up and two levels down by default.",
		"",
		"Below, the same tree rendered inside a note with a code block:",
		"",
		"```branching-toc",
		"root: [[Physics]]",
		"mode: tree",
		"down: 3",
		"height: 420",
		"```",
		"",
		"And as an outline:",
		"",
		"```branching-toc",
		"root: [[Physics]]",
		"down: 4",
		"```",
		"",
		"Things to try:",
		"",
		"- Open [[Dynamics]]: its breadcrumbs read Physics › Mechanics › Dynamics.",
		"- Open [[Path Integrals]]: two parents, so a +1 chip in the breadcrumbs and *also under* in the outline.",
		"- Open [[Quantum Mechanics]]: one child does not exist yet and is drawn dashed.",
		"- Run **Create child note of current note** on any note.",
		"- Run **Generate table of contents note** and pick Physics.",
		"",
	].join("\n"),
);

console.log(`Wrote ${Object.keys(notes).length + 1} notes to ${target}`);
