// End-to-end tests in a real Obsidian, driven by WebdriverIO and wdio-obsidian-service.
// `npm run e2e:obsidian` builds the plugin, downloads Obsidian into .obsidian-cache on the first
// run, opens a sandboxed copy of sample-vault with the plugin installed, and runs
// e2e/specs/*.e2e.ts. OBSIDIAN_VERSIONS="earliest latest" (default "latest") picks app versions.
import * as path from "path";

const versions = (process.env.OBSIDIAN_VERSIONS ?? "latest").split(/\s+/).filter(Boolean);

export const config: WebdriverIO.Config = {
	runner: "local",
	framework: "mocha",
	specs: ["./e2e/specs/**/*.e2e.ts"],
	maxInstances: 1,
	// Absolute: tsx is injected into child processes (e.g. the installer extractor) that run elsewhere.
	tsConfigPath: path.resolve("e2e/tsconfig.json"),
	capabilities: versions.map((v) => ({
		browserName: "obsidian",
		browserVersion: v,
		"wdio:obsidianOptions": {
			installerVersion: "earliest",
			plugins: ["."],
			vault: "sample-vault",
		},
	})),
	services: ["obsidian"],
	reporters: ["obsidian"],
	cacheDir: path.resolve(".obsidian-cache"),
	mochaOpts: { ui: "bdd", timeout: 120000 },
	logLevel: "warn",
};
