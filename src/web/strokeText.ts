import type { Point, SilkText3d } from './board3dData';
import { encodedGlyphs, sharedGlyphs } from './fonts/newstrokeData';

/** Standalone Newstroke decoder and layout, adapted from KiCanvas's MIT-licensed
 * font implementation. No viewer, DOM, graphics engine or bundle globals needed.
 * Copyright (c) 2022 Alethea Katherine Flowers. See licenses/LICENSE.kicanvas.
 */
interface Glyph { strokes: Point[][]; advance: number; bottom: number; }
interface Style { italic: boolean; script?: '_' | '^'; overbar?: boolean; }
interface Markup { text?: string; control?: string; children: Markup[]; }
interface Token { text?: string; open?: string; close?: boolean; }
const glyphCache = new Map<number, Glyph>();
const units = 10000;

function glyph(character: string): Glyph {
    const code = character.codePointAt(0)! - 32;
    const entry = encodedGlyphs[code];
    if (entry === undefined) return glyph('?');
    const cached = glyphCache.get(code);
    if (cached) return cached;
    const data = typeof entry === 'number' ? sharedGlyphs[entry] : entry;
    const coordinate = (index: number) => data.charCodeAt(index) - 82;
    const left = coordinate(0) / 21;
    const result: Glyph = { advance: coordinate(1) / 21 - left, bottom: 0, strokes: [] };
    let stroke: Point[] | undefined;
    for (let index = 2; index < data.length; index += 2) {
        if (data.slice(index, index + 2) === ' R') { stroke = undefined; continue; }
        const point: Point = [coordinate(index) / 21 - left, (coordinate(index + 1) - 10) / 21];
        if (!stroke) { stroke = []; result.strokes.push(stroke); }
        stroke.push(point);
        result.bottom = Math.max(result.bottom, point[1]);
    }
    glyphCache.set(code, result);
    return result;
}

function* tokens(text: string): Generator<Token> {
    let start = 0, control: string | undefined, depth = 0;
    for (let index = 0; index <= text.length; index++) {
        const character = text[index];
        if (character === '_' || character === '^' || character === '~') control = character;
        else if (character === '{') {
            if (control) {
                depth++;
                yield { text: text.slice(start, index - 1) };
                yield { open: control };
                control = undefined; start = index + 1;
            }
        } else if (character === '}') {
            if (depth) {
                yield { text: text.slice(start, index) };
                yield { close: true };
                start = index + 1; depth--;
            }
        } else if (character === undefined) yield { text: text.slice(start, index) };
        else control = undefined;
    }
}

function markup(input: Generator<Token>): Markup {
    const node: Markup = { children: [] };
    for (let next = input.next(); !next.done; next = input.next()) {
        const token = next.value;
        if (token.text) node.children.push({ text: token.text, children: [] });
        else if (token.open) node.children.push({ ...markup(input), control: token.open });
        else if (token.close) break;
    }
    return node;
}

/** Return board-space polylines in millimetres. Stroke thickness (including bold)
 * is supplied by the board parser and applied to the mesh by the 3D renderer.
 * Layout rounds advances in 1/10000 mm to preserve the existing font spacing.
 */
export function textStrokes(options: SilkText3d): Point[][] {
    if (!options.text) return [];
    const origin: Point = [options.position[0] * units, options.position[1] * units];
    const size: Point = [options.size[0] * units, options.size[1] * units];
    const angle = options.angle * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
    const result: Point[][] = [];
    function transform(point: Point): Point {
        const x = (point[0] - origin[0]) * (options.mirror ? -1 : 1), y = point[1] - origin[1];
        return [(origin[0] + x * cosine + y * sine) / units,
            (origin[1] - x * sine + y * cosine) / units];
    }
    function layout(node: Markup, start: Point, inherited: Style, output?: Point[][]): number {
        // Script groups reset the font style, matching the existing markup rules.
        const style: Style = node.control === '_' || node.control === '^'
            ? { italic: false, script: node.control } : { ...inherited };
        style.overbar ||= node.control === '~';
        let cursor = start[0];
        if (node.text) {
            const scale = style.script ? 0.7 : 1, sx = size[0] * scale, sy = size[1] * scale;
            const y = start[1] + (style.script === '_' ? sy * 0.3 : style.script === '^' ? -sy * 0.5 : 0);
            const tilt = style.italic ? 1 / 8 : 0;
            for (const character of node.text) {
                if (character === '\t') {
                    const tab = Math.round(sx * 3.28);
                    if (tab) cursor += tab - (cursor - (output ? origin[0] : 0)) % tab;
                } else if (character === ' ') cursor += Math.round(sx * 0.6);
                else {
                    const shape = glyph(character);
                    if (output) for (const stroke of shape.strokes) output.push(stroke.map(([gx, gy]) =>
                        transform([cursor + gx * sx - gy * sy * tilt, y + gy * sy])));
                    cursor += Math.round(shape.advance * sx - shape.bottom * sy * tilt);
                }
            }
            if (style.overbar && output) {
                const height = sy * 1.4, offset = height * tilt, margin = sx * 0.1;
                output.push([transform([start[0] + offset + margin, y - height]),
                    transform([cursor + offset - margin, y - height])]);
            }
        }
        for (const child of node.children) cursor = layout(child, [cursor, start[1]], style, output);
        return cursor;
    }
    const lines = options.text.split('\n');
    const pitch = size[1] * options.lineSpacing * 1.62;
    const height = size[1] * 1.17 + (lines.length - 1) * pitch;
    const offsetY = size[1] - (options.vertical === 'bottom' ? height : options.vertical === 'center' ? height / 2 : 0);
    lines.forEach((line, index) => {
        const tree = markup(tokens(line)), style = { italic: options.italic };
        const width = layout(tree, [origin[0], origin[1] + index * pitch], style) - origin[0];
        const offsetX = options.horizontal === 'right' ? -width : options.horizontal === 'center' ? -width / 2 : 0;
        layout(tree, [origin[0] + offsetX, origin[1] + offsetY + index * pitch], style, result);
    });
    return result;
}
