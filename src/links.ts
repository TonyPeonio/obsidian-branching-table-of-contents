/**
 * Reading links out of frontmatter property values. Pure, so it is unit-tested.
 */

/**
 * Normalises one property value to a link path: strips `[[ ]]`, aliases (`|alias`),
 * subpaths (`#heading`, `#^block`) and markdown-link syntax. Returns "" for nothing usable.
 */
export function cleanLink(raw: string): string {
	let s = raw.trim();
	if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) s = s.slice(1, -1).trim();
	const md = /^\[[^\]]*\]\(([^)]+)\)$/.exec(s);
	if (md) {
		s = md[1].trim();
		if (s.startsWith("<") && s.endsWith(">")) s = s.slice(1, -1);
		try {
			s = decodeURIComponent(s);
		} catch {
			// Leave it as written.
		}
	}
	if (s.startsWith("[[") && s.endsWith("]]")) s = s.slice(2, -2);
	s = s.split("|")[0].split("#")[0].trim();
	if (s.toLowerCase().endsWith(".md")) s = s.slice(0, -3);
	return s;
}

/** Every string nested anywhere inside a property value (strings, arrays of arrays, ...). */
export function flattenStrings(value: unknown): string[] {
	if (typeof value === "string") return [value];
	if (typeof value === "number") return [String(value)];
	if (Array.isArray(value)) return value.flatMap(flattenStrings);
	return [];
}

export interface FrontmatterLink {
	key: string;
	link: string;
}

/**
 * Link paths found under any of `keys` (case-insensitive) in a note's frontmatter,
 * de-duplicated. `frontmatterLinks` is Obsidian's parsed list (quoted `"[[...]]"` values),
 * and the raw values catch unquoted `[[...]]` (which YAML reads as nested arrays) and
 * plain note names.
 */
export function propertyLinks(
	frontmatter: Record<string, unknown> | undefined,
	frontmatterLinks: FrontmatterLink[] | undefined,
	keys: string[],
): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const add = (raw: string) => {
		const link = cleanLink(raw);
		if (!link) return;
		const k = link.toLowerCase();
		if (seen.has(k)) return;
		seen.add(k);
		out.push(link);
	};
	for (const l of frontmatterLinks ?? []) {
		if (keys.includes(l.key.split(".")[0].toLowerCase())) add(l.link);
	}
	if (frontmatter) {
		for (const [key, value] of Object.entries(frontmatter)) {
			if (!keys.includes(key.toLowerCase())) continue;
			for (const s of flattenStrings(value)) add(s);
		}
	}
	return out;
}

/** A numeric property value (number or numeric string), matched case-insensitively. */
export function propertyNumber(frontmatter: Record<string, unknown> | undefined, key: string): number | undefined {
	if (!frontmatter || !key) return undefined;
	const k = key.toLowerCase();
	for (const [name, value] of Object.entries(frontmatter)) {
		if (name.toLowerCase() !== k) continue;
		const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
		return Number.isFinite(n) ? n : undefined;
	}
	return undefined;
}

/** Display name for a link path: the last segment. */
export function linkDisplayName(link: string): string {
	const parts = link.split("/").filter((p) => p.length > 0);
	return parts[parts.length - 1] ?? link;
}
