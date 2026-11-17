import { defineConfig } from "vitest/config";
import path from "path";

// `npm run bench`: timings on generated large vaults (see bench/). Kept out of `npm test`.
export default defineConfig({
	test: {
		include: ["bench/**/*.bench.ts"],
		environment: "node",
		testTimeout: 600_000,
		fileParallelism: false,
	},
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, "tests/obsidian-mock.ts"),
		},
	},
});
