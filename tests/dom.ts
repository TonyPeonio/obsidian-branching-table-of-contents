/* eslint-disable */
// Installs the subset of Obsidian's DOM helpers (createEl, createSvg, addClass, ...) that the
// renderers use onto a jsdom window, so they can run under vitest with `@vitest-environment jsdom`.

type Info = string | { cls?: string | string[]; text?: string; attr?: Record<string, string>; type?: string } | undefined;

function applyInfo(el: Element, o: Info): void {
	if (!o) return;
	if (typeof o === "string") {
		el.classList.add(...o.split(" ").filter(Boolean));
		return;
	}
	if (o.cls) el.classList.add(...(Array.isArray(o.cls) ? o.cls : o.cls.split(" ")).filter(Boolean));
	if (o.text !== undefined) el.textContent = o.text;
	if (o.type) el.setAttribute("type", o.type);
	if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, v);
}

export function installObsidianDom(): void {
	const doc = globalThis.document;
	const proto = globalThis.Element.prototype as any;
	proto.createEl = function (tag: string, o?: Info, cb?: (el: Element) => void) {
		const el = doc.createElement(tag);
		applyInfo(el, o);
		this.appendChild(el);
		cb?.(el);
		return el;
	};
	proto.createDiv = function (o?: Info, cb?: (el: Element) => void) {
		return this.createEl("div", o, cb);
	};
	proto.createSpan = function (o?: Info, cb?: (el: Element) => void) {
		return this.createEl("span", o, cb);
	};
	proto.createSvg = function (tag: string, o?: Info, cb?: (el: Element) => void) {
		const el = doc.createElementNS("http://www.w3.org/2000/svg", tag);
		applyInfo(el, o);
		this.appendChild(el);
		cb?.(el);
		return el;
	};
	proto.addClass = function (...cls: string[]) {
		this.classList.add(...cls);
	};
	proto.removeClass = function (...cls: string[]) {
		this.classList.remove(...cls);
	};
	proto.toggleClass = function (cls: string, on: boolean) {
		this.classList.toggle(cls, on);
	};
	proto.hasClass = function (cls: string) {
		return this.classList.contains(cls);
	};
	proto.empty = function () {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
	proto.setCssProps = function (props: Record<string, string>) {
		for (const [k, v] of Object.entries(props)) (this as HTMLElement).style.setProperty(k, v);
	};
	(globalThis.Node.prototype as any).instanceOf = function (type: any) {
		return this instanceof type;
	};
	(globalThis as any).createDiv = (o?: Info, cb?: (el: Element) => void) => {
		const el = doc.createElement("div");
		applyInfo(el, o);
		cb?.(el);
		return el;
	};
}
