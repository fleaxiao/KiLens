/* Copper connectivity for the KiCanvas board model. Units are millimetres.
 * Filled zone contours are used, never zone outlines. This is a display aid,
 * not KiCad's DRC engine; unsupported pad shapes are treated conservatively.
 */
(function (root) {
    const EPS = 1e-6;
    const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    const distance2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    function transform(p, origin, degrees) {
        const angle = degrees * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
        return { x: origin.x + c * p.x + s * p.y, y: origin.y - s * p.x + c * p.y };
    }
    function netNumber(item, names) {
        const net = item.net;
        const number = typeof net === 'object' ? net?.number : net;
        if (typeof number === 'number' && Number.isFinite(number)) return number > 0 ? number : null;
        const name = net?.name ?? (typeof number === 'string' ? number : null);
        return name ? names.get(name) ?? 'name:' + name : null;
    }
    function arcPoints(start, mid, end, width) {
        const determinant = 2 * (start.x * (mid.y - end.y) + mid.x * (end.y - start.y) + end.x * (start.y - mid.y));
        if (Math.abs(determinant) < 1e-12) return [start, mid, end];
        const a = start.x ** 2 + start.y ** 2, b = mid.x ** 2 + mid.y ** 2, c = end.x ** 2 + end.y ** 2;
        const center = {
            x: (a * (mid.y - end.y) + b * (end.y - start.y) + c * (start.y - mid.y)) / determinant,
            y: (a * (end.x - mid.x) + b * (start.x - end.x) + c * (mid.x - start.x)) / determinant
        };
        const radius = Math.sqrt(distance2(start, center));
        const angle = p => Math.atan2(p.y - center.y, p.x - center.x);
        const positive = a => (a + 2 * Math.PI) % (2 * Math.PI);
        const from = angle(start), sweep = positive(angle(end) - from);
        const delta = positive(angle(mid) - from) <= sweep ? sweep : sweep - 2 * Math.PI;
        // Bound chord error well below track width; exact endpoints are preserved.
        const tolerance = Math.min(0.0001, Math.max(width / 1000, 1e-7));
        const step = 2 * Math.acos(Math.max(-1, 1 - tolerance / radius));
        const count = Math.max(2, Math.ceil(Math.abs(delta) / Math.max(step, 0.0001)));
        return Array.from({ length: count + 1 }, (_, i) => i === 0 ? start : i === count ? end : ({
            x: center.x + radius * Math.cos(from + delta * i / count),
            y: center.y + radius * Math.sin(from + delta * i / count)
        }));
    }
    function pointSegment2(p, a, b) {
        const length = distance2(a, b);
        const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / length)) : 0;
        return distance2(p, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
    const cross = (a, b, p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    function segmentDistance2(a, b, c, d) {
        if (((cross(a, b, c) > 0 && cross(a, b, d) < 0) || (cross(a, b, c) < 0 && cross(a, b, d) > 0)) &&
            ((cross(c, d, a) > 0 && cross(c, d, b) < 0) || (cross(c, d, a) < 0 && cross(c, d, b) > 0))) return 0;
        return Math.min(pointSegment2(a, c, d), pointSegment2(b, c, d), pointSegment2(c, a, b), pointSegment2(d, a, b));
    }
    function inside(p, points) {
        let result = false;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
            const a = points[i], b = points[j];
            if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
        }
        return result;
    }
    function touches(a, b) {
        if (a.maxY + EPS < b.minY || b.maxY + EPS < a.minY || !a.layers.some(layer => b.layers.includes(layer))) return false;
        if (a.closed && b.points.some(p => inside(p, a.points))) return true;
        if (b.closed && a.points.some(p => inside(p, b.points))) return true;
        const threshold = (a.radius + b.radius + EPS) ** 2;
        for (const [p, q] of a.edges) for (const [r, s] of b.edges) {
            if (Math.max(p.x, q.x) + a.radius + b.radius + EPS < Math.min(r.x, s.x) ||
                Math.max(r.x, s.x) + a.radius + b.radius + EPS < Math.min(p.x, q.x)) continue;
            if (segmentDistance2(p, q, r, s) <= threshold) return true;
        }
        return false;
    }

    function analyze(board) {
        const nets = new Map(), warnings = new Set();
        const names = new Map((board.nets ?? []).filter(n => n.number > 0 && n.name).map(n => [n.name, n.number]));
        // KiCad 10 layer IDs put B.Cu before inner layers; IDs are not stack order.
        const layerRank = name => name === 'F.Cu' ? 0 : name === 'B.Cu' ? Infinity : Number(name.match(/^In(\d+)\.Cu$/)?.[1] ?? 0);
        const copper = (board.layers ?? []).map(l => l.canonical_name).filter(name => name?.endsWith('.Cu')).sort((a, b) => layerRank(a) - layerRank(b));
        if (!copper.length) copper.push('F.Cu', 'B.Cu');
        const expand = layers => [...new Set((layers ?? []).flatMap(l => l === '*.Cu' ? copper : l === 'F&B.Cu' ? ['F.Cu', 'B.Cu'] : l.endsWith('.Cu') ? [l] : []))];
        function add(net, points, radius, layers, closed = false, anchor = null) {
            if (net === null || !points.length || !points.every(valid) || !layers.length) return;
            const edges = points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((p, i) => [points[i], p]);
            if (closed) edges.push([points.at(-1), points[0]]);
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
            const body = { points, radius, layers, closed, anchor, edges, minX: minX - radius, maxX: maxX + radius, minY: minY - radius, maxY: maxY + radius };
            if (!nets.has(net)) nets.set(net, []);
            nets.get(net).push(body);
        }
        let padCount = 0;
        for (const footprint of board.footprints ?? []) {
            if (!valid(footprint.at?.position)) continue;
            for (const pad of footprint.pads ?? []) {
                const net = netNumber(pad, names);
                if (net === null || !valid(pad.at?.position) || pad.type === 'np_thru_hole') continue;
                const anchor = transform(pad.at.position, footprint.at.position, footprint.at.rotation ?? 0);
                const layers = expand(pad.layers);
                if (!layers.length) continue;
                padCount++;
                // Pad orientation is board-absolute in KiCad, its position is footprint-local.
                const rotation = pad.at.rotation ?? 0;
                const center = transform(pad.drill?.offset ?? { x: 0, y: 0 }, anchor, rotation);
                const halfX = (pad.size?.x ?? 0) / 2, halfY = (pad.size?.y ?? 0) / 2;
                let points, radius = 0;
                if (pad.shape === 'circle') { points = [{ x: 0, y: 0 }]; radius = halfX; }
                else if (pad.shape === 'oval') {
                    radius = Math.min(halfX, halfY);
                    points = [{ x: -halfX + radius, y: -halfY + radius }, { x: halfX - radius, y: halfY - radius }];
                } else if (['rect', 'roundrect', 'trapezoid'].includes(pad.shape) && !pad.chamfer) {
                    radius = pad.shape === 'roundrect' ? Math.min(halfX, halfY) * 2 * Math.min(0.5, Math.max(0, pad.roundrect_rratio ?? 0)) : 0;
                    const x = halfX - radius, y = halfY - radius;
                    const dx = (pad.rect_delta?.x ?? 0) / 2, dy = (pad.rect_delta?.y ?? 0) / 2;
                    points = [{ x: -x - dy, y: y + dx }, { x: x + dy, y: y - dx }, { x: x - dy, y: -y + dx }, { x: -x + dy, y: -y - dx }];
                } else {
                    warnings.add('Special pads use center-point connectivity and may retain extra airwires');
                    points = [{ x: 0, y: 0 }];
                }
                add(net, points.map(p => transform(p, center, rotation)), radius, layers, points.length > 2, anchor);
            }
        }
        for (const track of board.segments ?? []) {
            if (!valid(track.start) || !valid(track.end)) continue;
            const points = valid(track.mid) ? arcPoints(track.start, track.mid, track.end, track.width ?? 0) : [track.start, track.end];
            // Each short arc section is a body, joined naturally at its endpoint.
            for (let i = 1; i < points.length; i++) add(netNumber(track, names), [points[i - 1], points[i]], Math.max(0, track.width ?? 0) / 2, expand([track.layer ?? '']));
        }
        for (const via of board.vias ?? []) {
            let layers = expand(via.layers);
            const from = copper.indexOf(layers[0]), to = copper.indexOf(layers.at(-1));
            if (from >= 0 && to >= 0) layers = copper.slice(Math.min(from, to), Math.max(from, to) + 1);
            if (valid(via.at?.position)) add(netNumber(via, names), [via.at.position], Math.max(0, via.size ?? 0) / 2, layers);
        }
        function zones(items, footprint) {
            for (const zone of items ?? []) {
                if (zone.keepout) continue;
                if (!zone.filled_polygons?.length && netNumber(zone, names) !== null) warnings.add('Unfilled zones are excluded from connectivity');
                for (const polygon of zone.filled_polygons ?? []) {
                    let points = polygon.polyline ?? polygon.pts ?? [];
                    if (footprint) points = points.map(p => transform(p, footprint.at.position, footprint.at.rotation ?? 0));
                    // Each filled contour is a separate island, even within one zone.
                    add(netNumber(zone, names), points, 0, expand([polygon.layer ?? zone.layer ?? '']), true);
                }
            }
        }
        zones(board.zones);
        for (const footprint of board.footprints ?? []) zones(footprint.zones, footprint);
        const result = [];
        for (const [net, bodies] of nets) {
            const parent = bodies.map((_, i) => i);
            const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
            const sorted = bodies.map((body, i) => ({ body, i })).sort((a, b) => a.body.minX - b.body.minX);
            for (let i = 0; i < sorted.length; i++) {
                const a = sorted[i];
                for (let j = i + 1; j < sorted.length && sorted[j].body.minX <= a.body.maxX + EPS; j++) {
                    const b = sorted[j];
                    if (find(a.i) !== find(b.i) && touches(a.body, b.body)) parent[find(b.i)] = find(a.i);
                }
            }
            const groups = new Map();
            bodies.forEach((body, i) => {
                if (!body.anchor) return;
                const group = find(i);
                if (!groups.has(group)) groups.set(group, []);
                groups.get(group).push(body.anchor);
            });
            // Minimum spanning tree between disconnected copper components.
            const components = [...groups.values()];
            const used = new Set(), best = components.map(() => ({ distance: Infinity }));
            if (components.length) best[0].distance = 0;
            for (let step = 0; step < components.length; step++) {
                let next = -1;
                for (let i = 0; i < components.length; i++) if (!used.has(i) && (next < 0 || best[i].distance < best[next].distance)) next = i;
                used.add(next);
                if (best[next].start) result.push({ net, start: best[next].start, end: best[next].end });
                for (let i = 0; i < components.length; i++) {
                    if (used.has(i)) continue;
                    for (const start of components[next]) for (const end of components[i]) {
                        const distance = distance2(start, end);
                        if (distance < best[i].distance) best[i] = { distance, start, end };
                    }
                }
            }
        }
        return { edges: result, padCount, netCount: nets.size, warnings: [...warnings] };
    }
    root.KiLensConnectivity = { analyze };
    if (typeof module !== 'undefined') module.exports = root.KiLensConnectivity;
})(globalThis);
