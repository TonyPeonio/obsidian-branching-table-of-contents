# Branching Table of Contents

An [Obsidian](https://obsidian.md) plugin that turns `parent` / `child` note properties into a
clean, rooted **family tree of the note you are reading**: two levels up, two levels down (or
however many you like), drawn as a real branching tree instead of the tangled graph view.

Branching Table of Contents is part of the Companion suite of local-first Obsidian plugins by Tony
Peonio for students and researchers (your machine does the work, every change is a diff you approve,
numbers are published), though it is the odd one out: no model and no companion name, only
properties and a tree. The others are Local Vault Agent (local Ollama agent that searches, compiles,
edits notes), Lecture Companion (live local lecture transcription, Canvas slides, Ollama summaries),
Canvas Companion (Canvas LMS assignments, grades and announcements as notes), Exam Companion
(day-by-day study plan, daily quizzes and flashcards), Paper Companion (Zotero search by meaning,
page-cited reading notes), Research Log Companion (append-only lab notebook with git, parameters,
data hashes), Job Hunt Companion (job applications as notes, resume tailoring, interview questions),
Fellowship Companion (grants and fellowships: deadlines, materials, letters, eligibility), Code
Companion (commits in the daily note, weekly report, TODOs) and Teaching Companion (local-model
rubric grading with verbatim evidence). All at
[github.com/TonyPeonio](https://github.com/TonyPeonio).

- **Properties, not tags.** A note declares its parents with a `parent` property and/or its
  children with a `child` property, each holding links. Either side is enough; the plugin merges
  both directions. A note can have several parents and several children.
- **Family tree view.** A sidebar pane that follows the active note and shows its ancestors
  above, descendants below. Pan with the mouse, zoom with the wheel, click a node to open it,
  Ctrl-click for a new tab, right-click for a menu. Switch to an **outline** (collapsible
  nested list), or to the **whole vault** as a forest of every root.
- **Breadcrumbs.** `Root › Branch › Note` at the top of every note that has a parent. Notes with
  several parents get a `+N` chip listing the others.
- **Inline trees.** A ` ```branching-toc ``` ` code block renders a subtree inside any note.
- **Commands.** Create a child or parent of the current note (the link property is written for
  you), reveal the current note in the tree, and generate a markdown table-of-contents note
  for any root so the hierarchy also reads on mobile or without the plugin.
- Multi-parent notes are shown under each parent with an *also under …* marker. Cycles are
  detected and marked rather than crashing. Links to notes that do not exist yet appear as
  dashed "missing" nodes; clicking one creates the note.
- Free and open source, MIT licensed. No accounts, no telemetry, works on mobile.

## Linking notes

Add properties to a note's frontmatter. Quote links inside YAML:

```yaml
---
parent: "[[Physics]]"
child:
  - "[[Kinematics]]"
  - "[[Dynamics]]"
toc-order: 2
---
```

- `parent` (or `parents`): link(s) to the notes above this one.
- `child` (or `children`): link(s) to the notes below this one.
- `toc-order` (optional): a number; siblings with it come first, lowest first, then the rest
  alphabetically.

All three property names are configurable. Plain note names (`parent: Physics`) and unquoted
`[[Physics]]` are also understood. Only notes with at least one parent or child link take part
in the tree, so the rest of your vault is untouched.

## Usage

Click the fork icon in the ribbon or run **Open tree view**. The view follows whichever note you
open; use the pin button in its toolbar to stay put.

Toolbar, left to right: drawn tree / outline · current note / whole vault · levels up · levels
down · pin · fit to view. Double-click empty canvas to fit.

### Commands

| Command | What it does |
|---|---|
| Open tree view | Opens the sidebar view |
| Reveal current note in tree | Opens the view centred on the current note |
| Create child note of current note | Asks for a title, creates the note in the same folder, writes the link |
| Create parent note of current note | Same, one level up |
| Generate table of contents note | Pick a root; writes `<Root> - Table of Contents.md` next to it as nested wikilinks |

### Inline code block

````markdown
```branching-toc
root: [[Physics]]
mode: tree
down: 3
height: 400
```
````

| Key | Values | Default |
|---|---|---|
| `root` | A note link or name | the note containing the block |
| `up` / `down` | 0 to 10 levels | `0` / `2` |
| `mode` | `outline` or `tree` | `outline` |
| `orientation` | `top-down` or `left-right` | the setting |
| `style` | `boxes` or `phylogenetic` | the setting |
| `height` | pixels, for `tree` | `320` |

### Settings

- **Properties**: parent / child / order property names, folders to exclude, whether to show
  missing notes.
- **Tree view**: levels up and down, default view (tree or outline), default scope (current
  note or whole vault), tree style (family tree or phylogenetic tree), layout direction (top to
  bottom or left to right), follow the active note.
- **Breadcrumbs**: on or off.
- **New notes**: when creating a child or parent, write the link on the new note, the existing
  note, or both.
- **Table of contents note**: name suffix and maximum depth.

**Tree style.** *Family tree* (the default) draws each note as a box on the row of its level,
joined by curves. *Phylogenetic tree* draws the same tree the way a cladogram is drawn:
right-angled branches that split at a shared bar, with every note at the end of a branch pushed
out to one line, so the leaves read as a list whatever their depth. It reads best with *Layout
direction* set to left to right. The setting applies to the tree view; a code block can choose
its own with `style: phylogenetic`.

## How the tree is built

Layers are the shortest distance from the focused note: a note reachable as both an ancestor and a
descendant (a cycle) is placed on the nearer side. Each note hangs under its first parent on the
layer above, which gives a proper tree to lay out; every other edge is drawn between wherever the
two notes landed (dashed when it skips a layer). Nodes at the edge of the shown levels carry a
small `+N` badge when more parents or children lie beyond.

## Install

From the community plugin list once it is accepted, or with
[BRAT](https://github.com/TfTHacker/obsidian42-brat) using this repository's URL, or manually:
copy `main.js`, `manifest.json` and `styles.css` from the latest release into
`<vault>/.obsidian/plugins/branching-table-of-contents/` and enable it in Settings → Community plugins.

A `sample-vault/` folder in this repository has a small linked set of notes to try it on.

## Development

```bash
npm install
npm run dev     # rebuilds main.js on change
npm test        # unit tests (vitest)
npm run build   # type-check, lint, production bundle
```

Releases are built by GitHub Actions from a version tag: `npm version patch` then `git push --follow-tags`.
