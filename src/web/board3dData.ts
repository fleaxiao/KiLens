import { List, parseDocument, head, childList } from './kicadPcbEditor';

export type Point = [number, number];
export const children = (list: List, name?: string): List[] => list.items.filter(
    (item): item is List => item.kind === 'list' && (!name || head(item) === name));
export const atom = (list: List | undefined, index = 1): string => {
    const item = list?.items[index];
    return item?.kind === 'atom' ? item.value : '';
};
const number = (list: List | undefined, index = 1, fallback = 0): number => {
    const value = atom(list, index);
    return value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback;
};
const point = (list: List | undefined): Point => [number(list), number(list, 2)];
const vector = (list: List | undefined, fallback = 0): [number, number, number] => {
    const xyz = list && childList(list, 'xyz');
    return [number(xyz, 1, fallback), number(xyz, 2, fallback), number(xyz, 3, fallback)];
};
export interface ModelReference {
    path: string; position: Point; angle: number; back: boolean;
    offset: [number, number, number]; scale: [number, number, number]; rotation: [number, number, number];
    placeholder?: { footprint: number; center: Point; size: [number, number, number]; color: number };
}
export function boardRoot(text: string): List {
    const board = children(parseDocument(text), 'kicad_pcb')[0];
    if (!board) throw new Error('3D preview requires a KiCad PCB document.');
    return board;
}
export function modelReferences(text: string): ModelReference[] {
    return referencesFromBoard(boardRoot(text), false);
}
function referencesFromBoard(board: List, placeholders: boolean): ModelReference[] {
    return children(board).filter(f => ['footprint', 'module'].includes(head(f) ?? '')).flatMap((f, footprint) => {
        const models = children(f, 'model').filter(m => !m.items.some(i => i.kind === 'atom' && i.value === 'hide')
            && atom(childList(m, 'hide')) !== 'yes');
        if (!models.length) return [];
        const placeholder = placeholders ? { footprint, ...estimateComponent(f) } : undefined;
        return models.map(m => {
            const legacyOffset = childList(m, 'at');
            const offset = vector(childList(m, 'offset') ?? legacyOffset);
            if (legacyOffset && !childList(m, 'offset')) offset.forEach((v, i) => offset[i] = v * 25.4);
            return { path: atom(m), position: point(childList(f, 'at')), angle: number(childList(f, 'at'), 3),
                back: atom(childList(f, 'layer')) === 'B.Cu', offset,
                scale: vector(childList(m, 'scale'), 1), rotation: vector(childList(m, 'rotate')),
                ...(placeholder ? { placeholder } : {}) };
        });
    });
}

export function arcPoints(a: Point, b: Point, c: Point): Point[] {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-9) return [a, c];
    const sq = (p: Point) => p[0] ** 2 + p[1] ** 2;
    const x = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
    const y = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
    const angle = (p: Point) => Math.atan2(p[1] - y, p[0] - x);
    const positive = (v: number) => (v + 2 * Math.PI) % (2 * Math.PI);
    let sweep = positive(angle(c) - angle(a));
    if (positive(angle(b) - angle(a)) > sweep) sweep -= 2 * Math.PI;
    const r = Math.hypot(a[0] - x, a[1] - y);
    const steps = Math.max(8, Math.ceil(Math.abs(sweep) * 24));
    return Array.from({ length: steps + 1 }, (_, i) =>
        [x + r * Math.cos(angle(a) + sweep * i / steps), y + r * Math.sin(angle(a) + sweep * i / steps)]);
}
function graphicPoints(item: List): Point[] {
    const type = head(item)?.replace(/^(gr|fp)_/, '');
    const a = point(childList(item, 'start')), b = point(childList(item, 'end'));
    if (type === 'line' || type === 'segment') return [a, b];
    if (type === 'rect') return [a, [b[0], a[1]], b, [a[0], b[1]], a];
    if (type === 'arc') {
        const mid = childList(item, 'mid');
        if (mid) return arcPoints(a, point(mid), b);
        const sweep = number(childList(item, 'angle')) * Math.PI / 180;
        const start = Math.atan2(b[1] - a[1], b[0] - a[0]), r = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(8, Math.ceil(Math.abs(sweep) * 24));
        return Array.from({ length: steps + 1 }, (_, i) => [a[0] + r * Math.cos(start + sweep * i / steps), a[1] + r * Math.sin(start + sweep * i / steps)]);
    }
    if (type === 'circle') {
        const c = point(childList(item, 'center')), r = Math.hypot(b[0] - c[0], b[1] - c[1]);
        return Array.from({ length: 97 }, (_, i) => [c[0] + r * Math.cos(i * Math.PI / 48), c[1] + r * Math.sin(i * Math.PI / 48)]);
    }
    if (type === 'poly') {
        const pts = childList(item, 'pts');
        const points = pts ? children(pts, 'xy').map(point) : [];
        return points.length ? [...points, points[0]] : [];
    }
    return [];
}

/** Footprint dimensions are physical millimetres, independent of model units/scale. */
function estimateComponent(footprint: List): Omit<NonNullable<ModelReference['placeholder']>, 'footprint'> {
    const fields = children(footprint, 'property').map(p => atom(p, 2));
    const labels = [atom(footprint), ...fields, ...children(footprint, 'fp_text').map(p => atom(p, 2)),
        ...children(footprint, 'model').map(m => atom(m))].join(' ');
    const reference = children(footprint, 'property').find(p => atom(p).toLowerCase() === 'reference');
    const ref = atom(reference, 2) || atom(children(footprint, 'fp_text').find(p => atom(p) === 'reference'), 2);
    const electrolytic = /electrolytic|CP_|capacitor_(?:THT|SMD).*radial/i.test(labels);
    const capacitor = electrolytic || /capacitor|\bC_\d/i.test(labels) || /^C\d/i.test(ref);
    const resistor = /resistor|\bR_\d/i.test(labels) || /^R\d/i.test(ref);
    const connector = /connector|terminal|pinheader|pinsocket|USB|RJ45/i.test(labels) || /^[JP]\d/i.test(ref);
    const inductor = /inductor|transformer/i.test(labels) || /^[LT]\d/i.test(ref);
    const diode = /diode|\bLED/i.test(labels) || /^D\d/i.test(ref);
    const chip = /(?:QFN|QFP|SOIC|SOT|BGA|TSSOP|DIP)[-_\d]/i.test(labels) || /^[UQ]\d/i.test(ref);
    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
    function bounds(points: Point[]) {
        const valid = points.filter(p => p.every(Number.isFinite));
        if (!valid.length) return;
        const xs = valid.map(p => p[0]), ys = valid.map(p => p[1]);
        const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
        if (right - left < 0.05 || bottom - top < 0.05) return;
        return { center: [(left + right) / 2, (top + bottom) / 2] as Point, width: right - left, depth: bottom - top };
    }
    const graphics = children(footprint).filter(p => head(p)?.startsWith('fp_'));
    const outline = (layer: string) => bounds(graphics.filter(p => atom(childList(p, 'layer')).endsWith(layer)).flatMap(graphicPoints));
    let body = outline('.Fab');
    // Explicit package dimensions are preferable to a clearance courtyard or pad span.
    const dimensions = labels.match(/(?:^|[_\s-])(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(?:x(\d+(?:\.\d+)?))?mm/i);
    const metric = labels.match(/(?:R|C)_\d{4}_(\d{4})Metric/i);
    if (!body && dimensions) body = { center: [0, 0], width: +dimensions[1], depth: +dimensions[2] };
    if (!body && metric) {
        const code = metric[1];
        body = { center: [0, 0], width: +code.slice(0, 2) / 10, depth: +code.slice(2) / 10 };
    }
    if (!body) {
        body = outline('.CrtYd');
        if (body) { body.width *= 0.85; body.depth *= 0.85; }
    }
    if (!body) {
        const angle = number(childList(footprint, 'at'), 3);
        body = bounds(children(footprint, 'pad').filter(p => atom(p, 2) !== 'np_thru_hole').flatMap(p => {
            const at = point(childList(p, 'at')), size = point(childList(p, 'size'));
            const a = (number(childList(p, 'at'), 3) - angle) * Math.PI / 180;
            const w = (Math.abs(size[0] * Math.cos(a)) + Math.abs(size[1] * Math.sin(a))) / 2;
            const h = (Math.abs(size[0] * Math.sin(a)) + Math.abs(size[1] * Math.cos(a))) / 2;
            return [[at[0] - w, at[1] - h], [at[0] + w, at[1] + h]] as Point[];
        }));
        if (body) { body.width *= 0.85; body.depth *= 0.85; }
    }
    body ??= { center: [0, 0], width: connector ? 5 : 2, depth: connector ? 4 : 2 };
    const small = Math.min(body.width, body.depth);
    const explicitHeight = labels.match(/(?:^|[_\s-])H(\d+(?:\.\d+)?)mm/i)?.[1] ?? dimensions?.[3];
    const height = explicitHeight ? +explicitHeight : electrolytic ? clamp(small * 1.6, 3, 30)
        : connector ? clamp(small * 0.9, 2.5, 15) : inductor ? clamp(small * 0.7, 1.5, 15)
            : resistor ? clamp(small * 0.4, 0.3, 2) : capacitor ? clamp(small * 0.65, 0.4, 4)
                : chip ? clamp(small * 0.25, 0.8, 3) : clamp(small * 0.55, 0.6, 6);
    const color = electrolytic ? 0x697580 : capacitor ? 0xb99563 : resistor ? 0x454850
        : connector ? 0x547a8c : inductor ? 0x60584f : diode || chip ? 0x343842 : 0x7c8793;
    return { center: body.center, size: [clamp(body.width, 0.2, 200), clamp(body.depth, 0.2, 200), clamp(height, 0.2, 80)], color };
}
export interface Pad3d { position: Point; size: Point; drill: Point; drillOffset: Point; angle: number; shape: string; ratio: number; front: boolean; back: boolean; }
export interface SilkText3d {
    text: string; position: Point; angle: number; size: Point; width: number; back: boolean;
    horizontal: string; vertical: string; mirror: boolean; italic: boolean; bold: boolean; lineSpacing: number;
}
export function parseBoard3d(text: string) {
    const board = boardRoot(text), outlines: Point[][] = [], pads: Pad3d[] = [];
    const traces: { points: Point[]; width: number; back: boolean; silk: boolean }[] = [];
    const warnings = new Set<string>();
    const silkTexts: SilkText3d[] = [], silkPolygons: { points: Point[]; back: boolean }[] = [];
    const copperPolygons: { points: Point[]; back: boolean }[] = [];
    const flag = (list: List | undefined, name: string) => !!list && (list.items.some(i => i.kind === 'atom' && i.value === name)
        || ['yes', 'true'].includes(atom(childList(list, name))));
    const transform = (p: Point, at: Point, rotation: number): Point => {
        const a = -rotation * Math.PI / 180;
        return [at[0] + p[0] * Math.cos(a) - p[1] * Math.sin(a), at[1] + p[0] * Math.sin(a) + p[1] * Math.cos(a)];
    };
    function zone(item: List, at: Point = [0, 0], angle = 0) {
        if (childList(item, 'keepout')) return;
        const layer = atom(childList(item, 'layer'));
        const layerList = childList(item, 'layers');
        const layers = layer ? [layer] : layerList?.items.slice(1).flatMap(i => i.kind === 'atom' ? [i.value] : []) ?? [];
        const fills = children(item, 'filled_polygon');
        if (!fills.length && layers.some(l => ['F.Cu', 'B.Cu', '*.Cu', 'F&B.Cu'].includes(l))) {
            warnings.add('Unfilled copper zones omitted. Fill zones in KiCad (B) and save the board.');
        }
        for (const fill of fills) {
            const fillLayer = atom(childList(fill, 'layer'));
            const sides = fillLayer ? [fillLayer] : layers;
            const pts = childList(fill, 'pts');
            if (!pts) continue;
            // Saved contours include clearance holes as zero-width bridges. Keep
            // their repeated vertices intact for triangulation; never fill the zone outline.
            const points = children(pts, 'xy').map(p => transform(point(p), at, angle));
            if (points.length < 3) continue;
            for (const side of ['F.Cu', 'B.Cu']) {
                if (sides.includes(side) || sides.includes('*.Cu') || sides.includes('F&B.Cu'))
                    copperPolygons.push({ points, back: side === 'B.Cu' });
            }
        }
    }
    function graphic(item: List, at: Point = [0, 0], angle = 0) {
        const layer = atom(childList(item, 'layer'));
        if (!['Edge.Cuts', 'F.Cu', 'B.Cu', 'F.SilkS', 'B.SilkS'].includes(layer)) return;
        const points = graphicPoints(item).map(p => transform(p, at, angle));
        if (layer.endsWith('SilkS') && ['solid', 'yes'].includes(atom(childList(item, 'fill'))) && points.length >= 3)
            silkPolygons.push({ points, back: layer === 'B.SilkS' });
        if (layer === 'Edge.Cuts') {
            if (points.length) outlines.push(points);
            else warnings.add('Unsupported Edge.Cuts geometry was omitted.');
        } else if (points.length) traces.push({ points, width: number(childList(item, 'width'), 1,
            number(childList(childList(item, 'stroke') ?? item, 'width'), 1, 0.15)), back: layer.startsWith('B.'), silk: layer.endsWith('SilkS') });
    }
    const boardVariables = Object.fromEntries(children(board, 'property').map(p => [atom(p).toUpperCase(), atom(p, 2)]));
    const title = childList(board, 'title_block');
    if (title) for (const item of children(title)) boardVariables[(head(item) ?? '').toUpperCase()] = atom(item);
    function silkText(item: List, at: Point = [0, 0], parentAngle = 0, variables = boardVariables, footprint = false) {
        const layer = atom(childList(item, 'layer'));
        if (!['F.SilkS', 'B.SilkS'].includes(layer)) return;
        const effects = childList(item, 'effects');
        if (flag(item, 'hide') || flag(effects, 'hide')) return;
        const font = effects && childList(effects, 'font'), size = font && childList(font, 'size');
        const justify = effects && childList(effects, 'justify');
        const raw = atom(item, head(item) === 'gr_text' ? 1 : 2);
        const value = raw.replace(/\$\{([^}]+)\}/g, (all, name: string) => variables[name.toUpperCase()] ?? all);
        if (!value.trim()) return;
        const cache = childList(item, 'render_cache');
        if (cache && atom(cache) === value) {
            const polygons = children(cache, 'polygon').flatMap(p => {
                const pts = childList(p, 'pts');
                const points = pts ? children(pts, 'xy').map(point) : [];
                return points.length >= 3 ? [{ points, back: layer === 'B.SilkS' }] : [];
            });
            if (polygons.length) { silkPolygons.push(...polygons); return; }
        }
        if (atom(font && childList(font, 'face'))) warnings.add('Silkscreen without a saved outline uses the bundled KiCad stroke font.');
        const position = childList(item, 'at');
        let angle = number(position, 3);
        if (footprint && !flag(position, 'unlocked') && !flag(item, 'unlocked')) {
            angle = ((angle % 360) + 360) % 360;
            if (angle > 180) angle -= 360;
            if (angle > 90) angle -= 180;
            if (angle < -90) angle += 180;
        }
        const sx = Math.max(0.01, number(size, 2, 1)), sy = Math.max(0.01, number(size, 1, 1));
        const bold = flag(font, 'bold');
        silkTexts.push({ text: value, position: transform(point(position), at, parentAngle), angle,
            size: [sx, sy], width: Math.min(sx / 4, number(font && childList(font, 'thickness'), 1, sx / (bold ? 5 : 8)) || sx / 8),
            back: layer === 'B.SilkS', mirror: flag(justify, 'mirror'), italic: flag(font, 'italic'), bold,
            horizontal: flag(justify, 'left') ? 'left' : flag(justify, 'right') ? 'right' : 'center',
            vertical: flag(justify, 'top') ? 'top' : flag(justify, 'bottom') ? 'bottom' : 'center',
            lineSpacing: number(font && childList(font, 'line_spacing'), 1, 1) });
    }
    for (const item of children(board)) {
        if (['footprint', 'module'].includes(head(item) ?? '')) {
            const at = point(childList(item, 'at')), angle = number(childList(item, 'at'), 3);
            const variables = { ...boardVariables, ...Object.fromEntries(children(item, 'property').map(p => [atom(p).toUpperCase(), atom(p, 2)])) };
            for (const field of children(item, 'fp_text')) if (['reference', 'value'].includes(atom(field))) variables[atom(field).toUpperCase()] = atom(field, 2);
            for (const sub of children(item)) {
                if (head(sub) === 'zone') { zone(sub, at, angle); continue; }
                if (['fp_text', 'property'].includes(head(sub) ?? '')) { silkText(sub, at, angle, variables, true); continue; }
                if (head(sub) !== 'pad') { if (head(sub)?.startsWith('fp_')) graphic(sub, at, angle); continue; }
                const drill = childList(sub, 'drill'), oval = atom(drill) === 'oval';
                const layers = childList(sub, 'layers')?.items.filter(i => i.kind === 'atom').map(i => i.kind === 'atom' ? i.value : '') ?? [];
                const shape = atom(sub, 3);
                const plated = atom(sub, 2) !== 'np_thru_hole';
                if (['custom', 'trapezoid'].includes(shape)) warnings.add('Custom and trapezoid pads are approximated as rectangles.');
                pads.push({ position: transform(point(childList(sub, 'at')), at, angle), size: point(childList(sub, 'size')),
                    drill: [number(drill, oval ? 2 : 1), number(drill, oval ? 3 : 1)], drillOffset: point(drill && childList(drill, 'offset')),
                    // KiCad pad angles are absolute; pad positions are footprint-local.
                    angle: number(childList(sub, 'at'), 3), shape, ratio: number(childList(sub, 'roundrect_rratio'), 1, 0.25),
                    front: plated && (layers.includes('F.Cu') || layers.includes('*.Cu')), back: plated && (layers.includes('B.Cu') || layers.includes('*.Cu')) });
            }
        } else if (head(item) === 'zone') { zone(item);
        } else if (head(item) === 'gr_text') { silkText(item);
        } else if (head(item) === 'via') {
            const size = number(childList(item, 'size')), drill = number(childList(item, 'drill'));
            const layers = childList(item, 'layers');
            const layerNames = layers?.items.map(i => i.kind === 'atom' ? i.value : '') ?? [];
            // Blind/buried vias do not drill all the way through the substrate.
            if (layerNames.includes('F.Cu') && layerNames.includes('B.Cu')) pads.push({ position: point(childList(item, 'at')),
                size: [size, size], drill: [drill, drill], drillOffset: [0, 0], angle: 0, shape: 'circle', ratio: 0,
                front: true, back: true });
        } else if (head(item)?.startsWith('gr_') || ['segment', 'arc'].includes(head(item) ?? '')) graphic(item);
    }
    const loops: Point[][] = [];
    const near = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01;
    while (outlines.length) {
        const loop = outlines.shift()!;
        while (!near(loop[0], loop[loop.length - 1])) {
            const index = outlines.findIndex(p => near(loop[loop.length - 1], p[0]) || near(loop[loop.length - 1], p[p.length - 1]));
            if (index < 0) break;
            const next = outlines.splice(index, 1)[0];
            if (!near(loop[loop.length - 1], next[0])) next.reverse();
            loop.push(...next.slice(1));
        }
        if (loop.length >= 4 && near(loop[0], loop[loop.length - 1])) loops.push(loop.slice(0, -1));
        else warnings.add('Open Edge.Cuts contour omitted; close the outline in KiCad.');
    }
    if (!loops.length) warnings.add('No closed board outline: only pads, tracks and component models are shown.');
    return { thickness: Math.max(0.1, number(childList(childList(board, 'general') ?? board, 'thickness'), 1, 1.6)), loops, pads, traces, silkTexts, silkPolygons, copperPolygons,
        models: referencesFromBoard(board, true), warnings: [...warnings] };
}
