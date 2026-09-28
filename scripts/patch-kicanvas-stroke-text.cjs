const fs = require('node:fs');
const file = 'media/kicanvas.js';
const marker = '\n// KiLens: expose the bundled Newstroke font for 3D silkscreen.\n';
let source = fs.readFileSync(file, 'utf8').split(marker)[0];
for (const token of ['Q=class s extends Et', 'Jt=class', 'this.points=e;this.width=t;', 'static default(){']) {
    if (!source.includes(token)) throw new Error('KiCanvas font API changed; update the 3D stroke text adapter.');
}
const adapter = `globalThis.KiLensStrokeText = options => {
    const attributes = new Jt();
    attributes.size = new d(options.size[0] * 10000, options.size[1] * 10000);
    attributes.stroke_width = options.width * 10000;
    attributes.h_align = options.horizontal;
    attributes.v_align = options.vertical;
    attributes.angle = W.from_degrees(options.angle);
    attributes.mirrored = options.mirror;
    attributes.italic = options.italic;
    attributes.bold = options.bold;
    attributes.line_spacing = options.lineSpacing;
    const strokes = [];
    Q.default().draw({ state: {}, line: line => strokes.push(line.points.map(p => [p.x, p.y])) },
        options.text, new d(options.position[0] * 10000, options.position[1] * 10000), attributes);
    return strokes;
};
`;
const output = source + marker + adapter;
if (output !== fs.readFileSync(file, 'utf8')) fs.writeFileSync(file, output);
