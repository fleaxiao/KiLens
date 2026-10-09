const fs = require('node:fs');
fs.mkdirSync('media/3d', { recursive: true });
fs.copyFileSync('node_modules/occt-import-js/dist/occt-import-js.wasm', 'media/3d/occt-import-js.wasm');
fs.writeFileSync('media/3d/step-worker.js', fs.readFileSync('node_modules/occt-import-js/dist/occt-import-js.js', 'utf8') + '\n' + fs.readFileSync('scripts/step-worker.js', 'utf8'));
fs.copyFileSync('node_modules/occt-import-js/LICENSE.md', 'media/3d/LICENSE.occt-import-js');
fs.copyFileSync('node_modules/three/LICENSE', 'media/3d/LICENSE.three');
for (const name of ['LICENSE.chevrotain', 'OCCT_LGPL_EXCEPTION.txt', 'LICENSE.newstroke', 'LICENSE.kicanvas']) {
    fs.copyFileSync(`licenses/${name}`, `media/3d/${name}`);
}
