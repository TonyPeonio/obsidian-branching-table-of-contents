# Branching table of contents demo

Open any note in the **Physics tree** folder and click the fork icon in the ribbon. The view shows the note's family tree: two levels up and two levels down by default.

Below, the same tree rendered inside a note with a code block:

```branching-toc
root: [[Physics]]
mode: tree
down: 3
height: 420
```

And as an outline:

```branching-toc
root: [[Physics]]
down: 4
```

Things to try:

- Open [[Dynamics]]: its breadcrumbs read Physics › Mechanics › Dynamics.
- Open [[Path Integrals]]: two parents, so a +1 chip in the breadcrumbs and *also under* in the outline.
- Open [[Quantum Mechanics]]: one child does not exist yet and is drawn dashed.
- Run **Create child note of current note** on any note.
- Run **Generate table of contents note** and pick Physics.
