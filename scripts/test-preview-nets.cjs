const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const context = { exports: {} };
vm.createContext(context);
vm.runInContext(ts.transpileModule(fs.readFileSync('src/web/kicadPcbEditor.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
}).outputText, context);
const { normalizePreviewNets } = context.exports;
const old = '(kicad_pcb (net 0 "") (net 1 "GND") (footprint "X" (pad "1" smd rect (net 1 "GND"))) (segment (net 1)))';
assert.equal(normalizePreviewNets(old), old);
const modern = '(kicad_pcb (footprint "X" (pad "1" smd rect (net "GND")) (pad "2" smd rect (net "/VIN")) (pad "3" smd rect (net ""))) (segment (net "GND")) (via (net "/VIN")) (zone (net "GND")))';
const adapted = normalizePreviewNets(modern);
assert.ok(adapted.includes('(net 0 "")\n(net 1 "GND")\n(net 2 "/VIN")'));
assert.ok(adapted.includes('(pad "1" smd rect (net 1 "GND"))'));
assert.ok(adapted.includes('(pad "3" smd rect (net 0 ""))'));
assert.ok(adapted.includes('(segment (net 1)) (via (net 2)) (zone (net 1))'));
assert.equal(normalizePreviewNets(adapted), adapted);
const mixed = normalizePreviewNets('(kicad_pcb (net 0 "") (net 7 "GND") (footprint "X" (pad "1" smd rect (net "GND")) (pad "2" smd rect (net "new"))))');
assert.ok(mixed.includes('(pad "1" smd rect (net 7 "GND"))'));
assert.ok(mixed.includes('(net 8 "new")'));
const escaped = normalizePreviewNets('(kicad_pcb (footprint "X" (pad "1" smd rect (net "a\\\"b")) (pad "2" smd rect (net "a\\\"b"))))');
assert.equal((escaped.match(/\(net 1 "a\\"b"\)/g) ?? []).length, 3);
console.log('KiCad 10 net adaptation, legacy, mixed, empty and escaped names passed.');
