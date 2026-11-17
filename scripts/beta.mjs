// Prepares a beta release for BRAT users without touching the stable channel.
//
//   npm run beta -- 0.3.1-beta.1
//
// Writes manifest-beta.json (manifest.json with the beta version). manifest.json and versions.json
// keep the stable version, so the Obsidian community store keeps offering the stable release.
// Then commit manifest-beta.json, tag the commit with the same version and push the tag: the
// Release workflow publishes a GitHub pre-release whose manifest.json asset carries the beta
// version, which is what BRAT installs.
import { readFileSync, writeFileSync } from "fs";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/.test(version)) {
	console.error("Usage: npm run beta -- <x.y.z-beta.n>   (a pre-release version, e.g. 0.3.1-beta.1)");
	process.exit(1);
}
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const [major, minor, patch] = manifest.version.split(".").map(Number);
const [bMajor, bMinor, bPatch] = version.split("-")[0].split(".").map(Number);
const newer = bMajor !== major ? bMajor > major : bMinor !== minor ? bMinor > minor : bPatch > patch;
if (!newer) {
	console.error(`A beta must be ahead of the stable version ${manifest.version} (try ${major}.${minor}.${patch + 1}-beta.1).`);
	process.exit(1);
}
writeFileSync("manifest-beta.json", JSON.stringify({ ...manifest, version }, null, "\t") + "\n");
console.log(`manifest-beta.json is now ${version}. Next:
  git add manifest-beta.json && git commit -m "${version}: beta"
  git tag -a ${version} -m ${version} && git push origin main ${version}`);
