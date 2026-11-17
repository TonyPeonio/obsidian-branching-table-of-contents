/**
 * A small in-memory log: the last few hundred lines of what the plugin did and what went wrong,
 * kept only so that "Report a problem" can include them. Never written to disk, never sent.
 */

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
	time: number;
	level: LogLevel;
	message: string;
}

export class RingLog {
	private entries: LogEntry[] = [];
	private start = 0;

	constructor(
		readonly capacity = 200,
		private now: () => number = () => Date.now(),
	) {}

	add(level: LogLevel, message: string): void {
		const entry = { time: this.now(), level, message };
		if (this.entries.length < this.capacity) this.entries.push(entry);
		else {
			this.entries[this.start] = entry;
			this.start = (this.start + 1) % this.capacity;
		}
	}

	info(message: string): void {
		this.add("info", message);
	}

	warn(message: string): void {
		this.add("warn", message);
	}

	error(message: string, err?: unknown): void {
		this.add("error", err === undefined ? message : `${message}: ${describeError(err)}`);
	}

	/** The newest `n` entries, oldest first. */
	last(n: number): LogEntry[] {
		const ordered = this.entries.slice(this.start).concat(this.entries.slice(0, this.start));
		return n >= ordered.length ? ordered : ordered.slice(ordered.length - n);
	}

	get size(): number {
		return this.entries.length;
	}

	clear(): void {
		this.entries = [];
		this.start = 0;
	}
}

/** One line for an error: its name and message, plus the first stack frames. */
export function describeError(err: unknown): string {
	if (err instanceof Error) {
		const frames = (err.stack ?? "")
			.split("\n")
			.slice(1, 4)
			.map((l) => l.trim())
			.filter((l) => l.length > 0);
		return [`${err.name}: ${err.message}`, ...frames].join(" | ");
	}
	if (typeof err === "string") return err;
	try {
		return JSON.stringify(err);
	} catch {
		return String(err);
	}
}

export function formatEntry(e: LogEntry): string {
	return `${new Date(e.time).toISOString()} ${e.level.toUpperCase().padEnd(5)} ${e.message}`;
}

/** The plugin-wide log. */
export const log = new RingLog();
