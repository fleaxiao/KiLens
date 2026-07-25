export interface FootprintPlacement {
	readonly id: string;
	readonly x: number;
	readonly y: number;
	readonly rotation: number;
}

export interface TextReplacement {
	readonly start: number;
	readonly end: number;
	readonly text: string;
}

interface Atom {
	readonly kind: 'atom';
	readonly value: string;
	readonly start: number;
	readonly end: number;
}

interface List {
	readonly kind: 'list';
	readonly start: number;
	end: number;
	readonly items: Array<Atom | List>;
}

function parseString(text: string, start: number): Atom {
	let value = '';
	let index = start + 1;

	while (index < text.length) {
		const character = text[index];
		if (character === '"') {
			return { kind: 'atom', value, start, end: index + 1 };
		}
		if (character === '\\' && index + 1 < text.length) {
			value += text[index + 1];
			index += 2;
			continue;
		}
		value += character;
		index++;
	}

	throw new Error('Unterminated string in KiCad document.');
}

function parseDocument(text: string): List {
	const root: List = { kind: 'list', start: 0, end: text.length, items: [] };
	const stack = [root];
	let index = 0;

	while (index < text.length) {
		const character = text[index];
		if (/\s/.test(character)) {
			index++;
			continue;
		}
		if (character === '(') {
			const list: List = { kind: 'list', start: index, end: -1, items: [] };
			stack[stack.length - 1].items.push(list);
			stack.push(list);
			index++;
			continue;
		}
		if (character === ')') {
			if (stack.length === 1) {
				throw new Error('Unexpected closing parenthesis in KiCad document.');
			}
			stack.pop()!.end = index + 1;
			index++;
			continue;
		}

		let atom: Atom;
		if (character === '"') {
			atom = parseString(text, index);
		} else {
			let end = index + 1;
			while (end < text.length && !/[\s()]/.test(text[end])) {
				end++;
			}
			atom = {
				kind: 'atom',
				value: text.slice(index, end),
				start: index,
				end
			};
		}
		stack[stack.length - 1].items.push(atom);
		index = atom.end;
	}

	if (stack.length !== 1) {
		throw new Error('Unterminated list in KiCad document.');
	}
	return root;
}

function head(list: List): string | undefined {
	const first = list.items[0];
	return first?.kind === 'atom' ? first.value : undefined;
}

function childList(list: List, name: string): List | undefined {
	return list.items.find(
		(item): item is List => item.kind === 'list' && head(item) === name
	);
}

function secondAtom(list: List): Atom | undefined {
	const item = list.items[1];
	return item?.kind === 'atom' ? item : undefined;
}

function findFootprint(root: List, id: string): List | undefined {
	const pending: List[] = [root];
	while (pending.length > 0) {
		const current = pending.pop()!;
		if (head(current) === 'footprint') {
			for (const idName of ['uuid', 'tstamp']) {
				const idList = childList(current, idName);
				if (idList && secondAtom(idList)?.value === id) {
					return current;
				}
			}
		}
		for (const item of current.items) {
			if (item.kind === 'list') {
				pending.push(item);
			}
		}
	}
	return undefined;
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) {
		throw new Error('Footprint coordinates and rotation must be finite numbers.');
	}
	const rounded = Math.round(value * 1_000_000) / 1_000_000;
	return Object.is(rounded, -0) ? '0' : String(rounded);
}

export function createFootprintPlacementReplacement(
	text: string,
	placement: FootprintPlacement
): TextReplacement {
	if (!placement.id) {
		throw new Error('The selected footprint has no UUID or timestamp.');
	}

	const root = parseDocument(text);
	const footprint = findFootprint(root, placement.id);
	if (!footprint) {
		throw new Error(`Could not find footprint ${placement.id} in the current document.`);
	}

	const locked = footprint.items.some(
		item => item.kind === 'atom' && item.value === 'locked'
	);
	if (locked) {
		throw new Error('The selected footprint is locked.');
	}

	const at = childList(footprint, 'at');
	if (!at || at.end < 0) {
		throw new Error(`Footprint ${placement.id} has no placement.`);
	}

	return {
		start: at.start,
		end: at.end,
		text: `(at ${formatNumber(placement.x)} ${formatNumber(placement.y)} ${formatNumber(placement.rotation)})`
	};
}
