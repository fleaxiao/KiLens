const assert = require('node:assert/strict');
const { buildRatsnest, install } = require('../media/ratsnest.js');
const pad = (x, y, number, layer = 'F.Cu') => ({ at: { position: { x, y } }, net: { number }, layers: [layer], shape: 'rect', size: { x: 0.2, y: 0.2 } });
const footprint = (x, y, rotation, pads) => ({ at: { position: { x, y }, rotation }, pads });
const board = { footprints: [footprint(10, 20, 90, [pad(2, 0, 1), pad(0, 0, 1), pad(0, 3, 1), pad(5, 5, 0), pad(9, 9, 2)])] };
const edges = buildRatsnest(board);
assert.equal(edges.length, 2);
assert.deepEqual(edges[0], { net: 1, start: { x: 10, y: 18 }, end: { x: 10, y: 20 } });
assert.equal(edges.reduce((sum, edge) => sum + Math.hypot(edge.end.x - edge.start.x, edge.end.y - edge.start.y), 0), 5);
assert.deepEqual(buildRatsnest({ footprints: [] }), []);
assert.equal(buildRatsnest({ footprints: [footprint(0, 0, 0, [pad(0, 0, 1), pad(0, 0, 1), pad(1, 0, 1)])] }).length, 1);
const line = (x1, y1, x2, y2, layer = 'F.Cu', net = 1) => ({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, layer, net, width: 0.1 });
const simple = { footprints: [footprint(0, 0, 0, [pad(0, 0, 1), pad(10, 0, 1)])] };
assert.equal(buildRatsnest(simple).length, 1);
assert.equal(buildRatsnest({ ...simple, segments: [line(0, 0, 5, 0), line(5, 0, 10, 0)] }).length, 0);
assert.equal(buildRatsnest({ ...simple, segments: [line(0, 0, 4, 0), line(6, 0, 10, 0)] }).length, 1);
assert.equal(buildRatsnest({ ...simple, segments: [line(0, 0, 10, 0, 'B.Cu')] }).length, 1);
assert.equal(buildRatsnest({ ...simple, segments: [line(0, 0, 10, 0, 'F.Cu', 2)] }).length, 1);
// Mid-track intersections connect, but crossings on different layers do not.
const tee = { footprints: [footprint(0, 0, 0, [pad(0, 0, 1), pad(5, 5, 1)])] };
assert.equal(buildRatsnest({ ...tee, segments: [line(0, 0, 10, 0), line(5, 5, 5, -5)] }).length, 0);
const via = { net: 1, at: { position: { x: 5, y: 0 } }, layers: ['F.Cu', 'B.Cu'], size: 0.6 };
const multilayer = { footprints: [footprint(0, 0, 0, [pad(0, 0, 1), pad(10, 0, 1, 'B.Cu')])], segments: [line(0, 0, 5, 0), line(5, 0, 10, 0, 'B.Cu')] };
assert.equal(buildRatsnest(multilayer).length, 1);
assert.equal(buildRatsnest({ ...multilayer, vias: [via] }).length, 0);
const inner = { footprints: [footprint(0, 0, 0, [pad(0, 0, 1), pad(10, 0, 1, 'In1.Cu')])],
    layers: [{ canonical_name: 'F.Cu', ordinal: 0 }, { canonical_name: 'B.Cu', ordinal: 2 }, { canonical_name: 'In1.Cu', ordinal: 4 }],
    segments: [line(0, 0, 5, 0), line(5, 0, 10, 0, 'In1.Cu')], vias: [via] };
assert.equal(buildRatsnest(inner).length, 0, 'Through via reaches KiCad 10 inner layers');
assert.equal(buildRatsnest({ ...multilayer, layers: inner.layers, vias: [{ ...via, layers: ['F.Cu', 'In1.Cu'] }] }).length, 1, 'Blind via must not reach B.Cu');
// Route ending at a pad edge, not its center.
assert.equal(buildRatsnest({ ...simple, segments: [line(0.14, 0, 9.86, 0)] }).length, 0);
const polygon = (x1, x2, layer = 'F.Cu') => ({ layer, polyline: [{ x: x1, y: -1 }, { x: x2, y: -1 }, { x: x2, y: 1 }, { x: x1, y: 1 }] });
assert.equal(buildRatsnest({ ...simple, zones: [{ net: 1, filled_polygons: [polygon(-1, 11)] }] }).length, 0);
assert.equal(buildRatsnest({ ...simple, zones: [{ net: 1, polygons: [polygon(-1, 11)] }] }).length, 1);
assert.equal(buildRatsnest({ ...simple, zones: [{ net: 1, filled_polygons: [polygon(-1, 4), polygon(6, 11)] }] }).length, 1);
assert.equal(buildRatsnest({ ...simple, zones: [{ net: 1, filled_polygons: [polygon(-1, 11, 'B.Cu')] }] }).length, 1);
// A bridged hole contour in a fill must not connect a pad in its void.
const hole = [{ x: -2, y: -2 }, { x: 12, y: -2 }, { x: 12, y: 2 }, { x: -2, y: 2 }, { x: -2, y: -2 }, { x: -1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: -1 }, { x: -2, y: -2 }];
assert.equal(buildRatsnest({ ...simple, zones: [{ net: 1, filled_polygons: [{ layer: 'F.Cu', polyline: hole }] }] }).length, 1);
assert.equal(buildRatsnest({ ...simple, segments: [{ ...line(0, 0, 10, 0), mid: { x: 5, y: 5 } }] }).length, 0);
// A third pad at the arc midpoint must also be connected.
assert.equal(buildRatsnest({ footprints: [footprint(0, 0, 0, [pad(0, 0, 1), pad(5, 5, 1), pad(10, 0, 1)])], segments: [{ ...line(0, 0, 10, 0), mid: { x: 5, y: 5 } }] }).length, 0);
const nodes = [];
let strokes = 0, persisted;
const context = { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes++; } };
global.window = { devicePixelRatio: 2, addEventListener() {} };
global.requestAnimationFrame = () => {};
global.document = {
    createElement() { const node = { style: {}, dataset: {}, setAttribute() {}, append() {}, appendChild() {}, addEventListener(event, callback) { this[event] = callback; }, getContext() { return context; } }; nodes.push(node); return node; },
    body: { appendChild() {} }
};
const viewer = { board, canvas: { clientWidth: 300, clientHeight: 200, parentNode: { appendChild() {} } }, viewport: { camera: { world_to_screen: p => p } }, on_draw() {}, draw() { this.on_draw(); } };
install(viewer, true, value => { persisted = value; });
assert.equal(strokes, 1);
assert.equal(nodes[0].width, 600);
nodes[2].checked = false;
nodes[2].change();
assert.equal(persisted, false);
assert.equal(strokes, 1);
console.log('Ratsnest geometry and overlay checks passed.');
