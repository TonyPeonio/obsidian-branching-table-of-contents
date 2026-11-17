import { forest } from "../src/graph";
import { GraphIndex, contribution, type Contribution } from "../src/graph-index";
import { layout } from "../src/layout";
import { syntheticVault } from "./synthetic";
const { facts, opts } = syntheticVault(20000);
const idx = new GraphIndex();
const e: [string, Contribution][] = [];
for (const f of facts) { const c = contribution(f, opts); if (c) e.push([f.path, c]); }
idx.reset(e);
const g = idx.graph;
const sub = forest(g);
for (let k = 0; k < 10; k++) layout(g, sub);
