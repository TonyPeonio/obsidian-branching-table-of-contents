// Writes a small vault of linked notes into ./sample-vault (or the folder given as the first
// argument) to try the plugin on. Usage: node scripts/make-sample-vault.mjs [folder]
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const target = process.argv[2] ?? "sample-vault";
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
