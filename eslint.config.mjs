import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	globalIgnores(["node_modules", "main.js", "esbuild.config.mjs", "version-bump.mjs", "vitest.config.mts", "tests", "scripts", "sample-vault", "bench", "e2e", "wdio.conf.mts", "vitest.bench.config.mts", ".obsidian-cache"]),
	...obsidianmd.configs.recommended,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ["eslint.config.*", "vitest.config.*"] },
			},
		},
	},
]);
