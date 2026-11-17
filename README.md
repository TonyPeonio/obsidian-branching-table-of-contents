# Branching Table of Contents

<!-- TODO(demo-gif): record a ~10 s GIF of the sample vault (open Mechanics, the tree follows,
     switch to the phylogenetic tree, click a node, open the outline), save it as docs/demo.gif,
     then replace this comment and the placeholder line below with:
     ![Branching Table of Contents demo](docs/demo.gif) -->
> *Demo GIF coming soon.* Until then, open `sample-vault/` in Obsidian to see the plugin in action.

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
- **Keyboard and screen readers.** Tab into the tree, arrow keys move between notes, Enter opens
  one; the outline is a proper ARIA tree (Right/Left expand and collapse). Every toolbar button
  has a label and a pressed state.
- **Big vaults.** Editing a note only re-reads that note's links, and a whole vault of 20,000
  linked notes lays out in about a tenth of a second (numbers below).
- **Report a problem** in one click, with a report you read and edit before anything leaves
  your machine (see [Privacy](#privacy-and-reporting-problems)).
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

Toolbar, left to right: drawn tree / outline · phylogenetic tree on/off · current note / whole
vault · levels up · levels down · pin · fit to view. Double-click empty canvas to fit. The
phylogenetic button is the same switch as *Settings → Tree style*.

**Keyboard.** The drawn tree is one Tab stop: arrow keys move to the nearest note in that
direction, Enter (or Space) opens it, Ctrl/Cmd+Enter opens it in a new tab, Home goes back to the
current note, the context-menu key or Shift+F10 opens the note menu, and `+` / `-` / `0` zoom in,
zoom out and fit. In the outline, Up/Down move, Right/Left expand, collapse or move to the parent,
and Home/End jump to the first and last note. Breadcrumbs are links you can Tab to.

### Commands

| Command | What it does |
|---|---|
| Open tree view | Opens the sidebar view |
| Reveal current note in tree | Opens the view centred on the current note |
| Create child note of current note | Asks for a title, creates the note in the same folder, writes the link |
| Create parent note of current note | Same, one level up |
| Generate table of contents note | Pick a root; writes `<Root> - Table of Contents.md` next to it as nested wikilinks |
| Report a problem | Opens an editable problem report (see [Privacy](#privacy-and-reporting-problems)) |

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
- **Help and feedback**: *Report a problem*, and *Tell me what you use it for*.

On Obsidian 1.13 and later every setting shows up in Obsidian's settings search.

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

## Large vaults

Measured with `npm run bench` on generated vaults (one or two parents per note, some child
lists, 1% missing links, a few cycles, trees up to ~100 levels deep), Node 24 on a Ryzen 9
7940HS, median of several runs. Drawing times come from jsdom, not Obsidian, so read them as
relative; the graph and layout numbers are the same code that runs in the plugin. The timings
inside Obsidian also include reading the metadata cache, which this does not measure.

| Notes | Full graph build | Edit a note's body | Edit a note's links | Whole-vault layout | Whole-vault tree drawn | Whole-vault outline drawn |
|---|---|---|---|---|---|---|
| 5,000 | 15 ms | < 0.01 ms, no redraw | 8 ms | 15 ms | 46 ms | 4 ms |
| 20,000 | 61 ms | < 0.01 ms, no redraw | 39 ms | 93 ms | 31 ms | 7 ms |

What changed in 0.3.0 to get there (20,000 notes, 0.2.1 code on the same machine first):

- Every metadata change used to rebuild the whole graph and redraw every open tree. Now only the
  edited note's links are re-read, and nothing is redrawn unless they actually changed.
- Sorting used `localeCompare` with options, which builds a new collator on every call. One
  shared collator plus a precomputed sort rank, and a single pass to size the layers, took the
  whole-vault layout from 1.2 s to under 0.1 s.
- Edges are drawn as two SVG paths instead of one element each, and in trees of more than 800
  notes a note's box is only created when it scrolls into view (2.6 s → 31 ms in jsdom).
- Outlines with more than 1,500 rows start with branches below the second level collapsed, and a
  collapsed branch is only built when opened (5.1 s → 7 ms in jsdom).

The focused family tree (the default view) only draws a few dozen notes, so it stays instant
whatever the vault size. To try a big vault in Obsidian, generate one with
`node scripts/make-sample-vault.mjs --large 20000 ../big-vault`.

## Compared with similar plugins

Honest notes as of late 2026; all of these are good plugins and some do far more.

- **[Breadcrumbs](https://github.com/SkepticMystic/breadcrumbs)** is the most complete hierarchy
  plugin: many edge fields, implied relations (siblings, reverse links), hierarchies built from
  folders, tags or Dendron-style names, trail and matrix views. Choose it if you want that power.
  Branching Table of Contents does one thing: `parent` / `child` properties drawn as a real
  branching tree (or phylogenetic tree) of the current note, with almost nothing to configure.
- **[ExcaliBrain](https://github.com/zsviczian/excalibrain)** draws an interactive map of a
  note's parents, children, siblings and friends, inferred from links and fields, and needs the
  Excalidraw plugin. This plugin has no dependencies, draws a strict tree layout instead of a
  neighbourhood map, and adds breadcrumbs, an outline view and generated table-of-contents notes.
- **Folder-note and table-of-contents plugins** (Waypoint, Folder Notes, Automatic Table of
  Contents and the like) follow your folders or a note's headings. Here the hierarchy lives in
  properties, so a note can sit in any folder and have several parents.
- **Obsidian's local graph** shows every link around a note; it does not know which way is up.

## Privacy and reporting problems

The plugin makes no network requests. *Report a problem* (command, settings button, or the
*Report* link on an error notice) builds a report from: plugin, Obsidian and OS versions, the
theme, your settings (excluded folders only as a count), graph counts (notes, links, roots,
notes with several parents, missing notes, cycles, depth), timings, and the last 50 lines of an
in-memory log that is never written to disk. The vault and home folders are replaced by `<vault>`
and `~`, and note contents are never included. You see and can edit the whole text first; *Copy*
puts it on the clipboard and *Open on GitHub* opens a new issue with it filled in (or, when it is
too long for a link, copies it and opens the issue page for you to paste). Nothing is sent unless
you submit that issue yourself.

After a week of use the tree view asks once, in a small box you can dismiss, what you use the
plugin for. *Tell me on GitHub* opens a prefilled issue in your browser; *Don't ask again* means
exactly that.

## Install

From Obsidian's Community plugins list (search for *Branching Table of Contents*), or with
[BRAT](https://github.com/TfTHacker/obsidian42-brat) using this repository's URL, or manually:
copy `main.js`, `manifest.json` and `styles.css` from the latest release into
`<vault>/.obsidian/plugins/branching-table-of-contents/` and enable it in Settings → Community plugins.

A `sample-vault/` folder in this repository has a small linked set of notes to try it on.

### Beta versions

New features can be published as GitHub pre-releases (versions like `0.3.1-beta.1`) before they
reach the community store. To test them, install [BRAT](https://github.com/TfTHacker/obsidian42-brat),
choose *Add beta plugin*, paste `TonyPeonio/obsidian-branching-table-of-contents`, and pick the
latest version. `manifest-beta.json` in this repository always names the newest beta, or the
stable version when there is no newer beta, for BRAT versions that read it. Please report beta
problems with *Report a problem*; it records the exact version.

## Development

```bash
npm install
npm run dev            # rebuilds main.js on change
npm test               # unit and DOM tests (vitest + jsdom)
npm run build          # type-check, lint (0 warnings), production bundle
npm run bench          # graph and layout timings on generated 5k / 20k note vaults
npm run e2e:obsidian   # end-to-end tests in a real, sandboxed Obsidian (see below)
```

`npm run e2e:obsidian` uses [wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service):
the first run downloads Obsidian into `.obsidian-cache/`, then it opens a throwaway copy of
`sample-vault/` with the freshly built plugin and checks the tree view, the family/phylogenetic
switch, opening notes by click and keyboard, the code block and the problem report. Set
`OBSIDIAN_VERSIONS="earliest latest"` to also test the oldest supported Obsidian.

Stable releases are built by GitHub Actions from a version tag: `npm version patch` then
`git push --follow-tags`. Betas: `npm run beta -- 0.3.1-beta.1`, commit `manifest-beta.json`, then
tag and push `0.3.1-beta.1`; the workflow publishes it as a pre-release.
