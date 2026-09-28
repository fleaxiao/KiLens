const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { URI, Utils } = require('vscode-uri');
const { chromium } = require('playwright');

function load(name, mocks = {}, cache = new Map()) {
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const context = { exports, console, URL, process, setTimeout, clearTimeout, require: module => {
        if (mocks[module]) return mocks[module];
        return module.startsWith('.') ? load(path.posix.join(path.posix.dirname(name), module + '.ts'), mocks, cache) : require(module);
    } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText, context, { filename: name });
    return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const parsed = load('src/web/board3dData.ts');
const board = `(kicad_pcb (version 20240108) (generator pcbnew)
 (general (thickness 1.6)) (paper "A4")
 (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user) (37 "F.SilkS" user) (44 "Edge.Cuts" user))
 (setup (pad_to_mask_clearance 0)) (net 0 "")
 (gr_rect (start 0 0) (end 60 40) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))
 (gr_circle (center 50 30) (end 53 30) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))
 (segment (start 10 10) (end 30 10) (width 0.6) (layer "F.Cu") (net 0))
 (footprint "WRL" (layer "F.Cu") (at 10 10 90) (uuid "first")
  (pad "1" thru_hole circle (at 0 0 90) (size 4 4) (drill 2) (layers "*.Cu" "*.Mask"))
  (pad "2" smd roundrect (at 4 0 90) (size 2 3) (layers "F.Cu") (roundrect_rratio 0.25))
  (model "model.wrl" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0))))
 (footprint "STEP" (layer "F.Cu") (at 30 20) (uuid "second")
  (model "model.step" (offset (xyz 0 0 1)) (scale (xyz 0.02 0.02 0.02)) (rotate (xyz 0 0 30))))
 (footprint "Missing" (layer "F.Cu") (at 45 10) (uuid "missing") (model "missing.step"))
 (footprint "Back" (layer "B.Cu") (at 20 30 90) (uuid "back") (model "model.wrl"))
)`;
const wrl = '#VRML V2.0 utf8\nTransform { translation 0 0 0.5 children [ Shape { appearance Appearance { material Material { diffuseColor 0.2 0.3 0.8 } } geometry Box { size 2 1 1 } } ] }';
const stepBytes = fs.readFileSync('node_modules/occt-import-js/test/testfiles/simple-basic-cube/cube.stp');
function html(source = board, suffix = 'kicad_pcb') {
    const vscode = { Uri: { joinPath: Utils.joinPath } };
    return load('src/web/previewContent.ts', { vscode }).getWebviewContent(
        URI.parse('https://kilens.test'), { uri: URI.parse(`file:///project/board.${suffix}`), getText: () => source },
        { webview: { asWebviewUri: uri => uri } });
}
async function unitTests() {
    const { createNativeDiscovery } = load('src/node/modelDiscovery.ts');
    const nativeFiles = new Map([
        ['/config/9.0/kicad_common.json', JSON.stringify({ environment: { vars: { CUSTOM: '/models/old', KICAD9_3DMODEL_DIR: '/models/k9' } } })],
        ['/config/10.0/kicad_common.json', JSON.stringify({ environment: { vars: { CUSTOM: '${HOME}/custom', KICAD10_3DMODEL_DIR: '/models/k10' } } })]
    ]);
    let registryCalls = 0;
    const nativeHost = { platform: 'linux', home: '/home/test', env: { KICAD_CONFIG_HOME: '/config', HOME: '/home/test', KICAD10_3DMODEL_DIR: '/env/k10', SPECIAL: '/env/special' },
        readText: async p => { const value = nativeFiles.get(p.replace(/\\/g, '/')); if (!value) throw Error('ENOENT'); return value; },
        directories: async p => p === '/config' ? ['10.0', '9.0', 'not-a-version'] : [],
        registryInstallations: async () => { registryCalls++; return ['Q:/Engineering/KiCad/10.0']; } };
    const discover = createNativeDiscovery(nativeHost);
    const found = await discover('${KICAD10_3DMODEL_DIR}/x.step ${SPECIAL}/x.wrl');
    assert.equal(found.variables.KICAD10_3DMODEL_DIR, '/env/k10', 'Environment overrides KiCad settings');
    assert.equal(found.variables.CUSTOM, '/home/test/custom', 'Nested variables expand');
    assert.equal(found.variables.SPECIAL, '/env/special');
    assert.ok(found.roots.includes('/usr/share/kicad/3dmodels'));
    assert.equal((await discover('${KICAD9_3DMODEL_DIR}/x.step')).variables.CUSTOM, '/models/old', 'Matching config version wins');
    const winDiscovery = createNativeDiscovery({ ...nativeHost, platform: 'win32' });
    assert.ok((await winDiscovery('${KICAD10_3DMODEL_DIR}/x.step')).roots.some(p => p.replace(/\\/g, '/') === 'Q:/Engineering/KiCad/10.0/share/kicad/3dmodels'));
    await winDiscovery('${KICAD10_3DMODEL_DIR}/another.step');
    assert.equal(registryCalls, 1, 'Registry results are cached');
    const mac = await createNativeDiscovery({ ...nativeHost, platform: 'darwin' })('model.wrl');
    assert.ok(mac.roots.includes('/home/test/Library/Application Support/kicad/3dmodels'));
    const empty = await createNativeDiscovery({ ...nativeHost, env: {}, readText: async () => '{invalid', directories: async () => [] })('model.step');
    assert.deepEqual(plain(empty.variables), {}, 'Missing or malformed config leaves fallback discovery usable');
    const data = parsed.parseBoard3d(board);
    const silkData = parsed.parseBoard3d(`(kicad_pcb
      (gr_text "BOARD" (at 1 2 30) (layer "F.SilkS") (effects (font (size 2 3) (thickness 0.2)) (justify left top)))
      (gr_text "BACK" (at 3 4) (layer "B.SilkS") (effects (font (size 1 1)) (justify mirror)))
      (gr_text "hidden" (at 0 0) (layer "F.SilkS") (effects (font (size 1 1)) hide))
      (footprint "Test" (at 10 20 90) (layer "F.Cu")
        (property "Reference" "R42" (at 2 0 90) (layer "F.SilkS") (effects (font (size 1 1))))
        (property "Value" "10k" (at 0 0) (layer "F.Fab"))
        (property "Hidden" "hidden" (at 0 0) (layer "F.SilkS") (hide yes))
        (fp_text user "\${REFERENCE}=\${VALUE}" (at 0 2 180) (layer "F.SilkS") (effects (font (size 1 1))))
        (fp_text value "10k" (at 0 0) (layer "F.SilkS") hide)
        (fp_text user "outline" (at 0 0) (layer "F.SilkS")
          (render_cache "outline" 0 (polygon (pts (xy 100 100) (xy 101 100) (xy 100 101))))))
      (gr_rect (start 5 5) (end 8 8) (fill solid) (layer "F.SilkS")))`);
    assert.deepEqual(plain(silkData.silkTexts.map(t => t.text)), ['BOARD', 'BACK', 'R42', 'R42=10k']);
    assert.deepEqual(plain(silkData.silkTexts[0].size), [3, 2]);
    assert.equal(silkData.silkTexts[0].horizontal, 'left');
    assert.equal(silkData.silkTexts[1].mirror, true);
    assert.equal(silkData.silkTexts[1].back, true);
    assert.deepEqual(plain(silkData.silkTexts[2].position), [10, 18]);
    assert.equal(silkData.silkTexts[2].angle, 90, 'Footprint text angle is absolute');
    assert.equal(silkData.silkTexts[3].angle, 0, 'Footprint text stays upright');
    assert.equal(silkData.silkPolygons.length, 2);
    assert.deepEqual(plain(silkData.silkPolygons[0].points[0]), [100, 100], 'Saved glyph outlines are already in board coordinates');
    assert.equal(data.loops.length, 2);
    assert.equal(data.thickness, 1.6);
    assert.equal(data.models.length, 4);
    assert.deepEqual(plain(data.pads[1].position).map(v => Math.round(v)), [10, 6]);
    assert.deepEqual(plain(data.models[1].offset), [0, 0, 1]);
    assert.equal(data.models[3].back, true);
    assert.equal(parsed.modelReferences('(kicad_pcb (footprint "x" (model "hidden.wrl" hide)))').length, 0);
    const open = parsed.parseBoard3d('(kicad_pcb (gr_line (start 0 0) (end 10 10) (layer "Edge.Cuts")))');
    assert.equal(open.loops.length, 0);
    assert.ok(open.warnings.some(w => w.includes('Open Edge.Cuts')));
    const arc = parsed.arcPoints([1, 0], [0, 1], [-1, 0]);
    assert.ok(Math.abs(arc[Math.floor(arc.length / 2)][1] - 1) < 0.005);
    const THREE = require('three');
    const { placeModel, strokeGeometry, updateCameraDepth } = load('src/web/preview3d.ts');
    const stroke = strokeGeometry(10, 2);
    stroke.computeBoundingBox();
    assert.ok(stroke.boundingBox.min.distanceTo(new THREE.Vector3(-6, -1, 0)) < 1e-6);
    assert.ok(stroke.boundingBox.max.distanceTo(new THREE.Vector3(6, 1, 0)) < 1e-6);
    const strokeMesh = new THREE.Mesh(stroke, new THREE.MeshBasicMaterial());
    const hit = new THREE.Raycaster(new THREE.Vector3(5.6, 0.7, 1), new THREE.Vector3(0, 0, -1)).intersectObject(strokeMesh);
    assert.ok(hit.length, 'Round end fills the previously missing outside corner at a join');
    const depthCamera = new THREE.PerspectiveCamera(40, 1, 0.01, 100000);
    const depthBounds = new THREE.Sphere(new THREE.Vector3(), 120);
    for (const distance of [20, 400, 2000]) {
        depthCamera.position.set(0, 0, distance); updateCameraDepth(depthCamera, depthBounds);
        assert.ok(depthCamera.near > 0 && depthCamera.far > distance + 120);
        if (distance > 144) assert.ok(depthCamera.far / depthCamera.near < 3, 'Distant views retain surface depth precision');
    }
    stroke.dispose(); strokeMesh.material.dispose();
    const ref = { position: [10, 20], angle: 90, back: false, offset: [1, 2, 3], rotation: [0, 0, 90], scale: [2, 1, 1] };
    const model = new THREE.Group();
    const placed = placeModel(model, ref, 1.6);
    placed.updateMatrixWorld(true);
    let p = model.localToWorld(new THREE.Vector3(1, 0, 0));
    assert.ok(p.distanceTo(new THREE.Vector3(10, -19, 3.8)) < 1e-9, 'Scale, negative model rotation, offset, footprint rotation');
    const backModel = new THREE.Group();
    const back = placeModel(backModel, { ...ref, back: true, angle: 0, offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, 1.6);
    back.updateMatrixWorld(true);
    p = backModel.localToWorld(new THREE.Vector3(1, 2, 3));
    assert.ok(p.distanceTo(new THREE.Vector3(11, -22, -3.8)) < 1e-9, 'Back-side model flips Y and Z per KiCad');
    assert.ok(!html('', 'kicad_sch').includes('class="three-panel"'));

    const config = { modelSearchPaths: ['/library'], modelPathVariables: { CUSTOM: '/custom' } };
    const files = new Map([['/project/model.wrl', Buffer.from(wrl)], ['/library/Package.3dshapes/x.step', stepBytes], ['/custom/a.step', stepBytes]]);
    const reads = [];
    const vscode = { Uri: { file: URI.file, parse: URI.parse, joinPath: Utils.joinPath }, FileType: { File: 1 },
        workspace: { isTrusted: true, getWorkspaceFolder: () => ({ uri: URI.file('/project') }),
            getConfiguration: () => ({ get: (name, fallback) => config[name] ?? fallback }), fs: {
                stat: async uri => { if (!files.has(uri.path)) throw Error('ENOENT'); return { type: 1, size: files.get(uri.path).length }; },
                readFile: async uri => { reads.push(uri.path); return files.get(uri.path); }
            } } };
    const resolver = load('src/web/modelResolver.ts', { vscode });
    const doc = model => ({ uri: URI.file('/project/board.kicad_pcb'), getText: () => `(kicad_pcb (footprint "x" (model "${model}")))` });
    assert.equal((await resolver.readModel(doc('model.wrl'), 0)).format, 'wrl');
    assert.equal((await resolver.readModel(doc('${KICAD9_3DMODEL_DIR}/Package.3dshapes/x.step'), 0)).format, 'step');
    assert.equal((await resolver.readModel(doc('${CUSTOM}/a.step'), 0)).format, 'step');
    assert.equal((await resolver.readModel(doc('${KIPRJMOD}/model.wrl'), 0)).format, 'wrl');
    await assert.rejects(resolver.readModel(doc('../secret/model.step'), 0), /outside/);
    await assert.rejects(resolver.readModel(doc('https://example.com/a.step'), 0), /outside/);
    await assert.rejects(resolver.readModel(doc('${UNKNOWN}/x.step'), 0), /Unresolved/);
    await assert.rejects(resolver.readModel(doc('model.wrl'), 9), /no longer exists/);
    vscode.workspace.isTrusted = false;
    await assert.rejects(resolver.readModel(doc('${CUSTOM}/a.step'), 0), /outside/);
    assert.equal(reads.length, 4);
    let nativeCalls = 0;
    resolver.setNativeModelDiscovery(async () => { nativeCalls++; return { variables: { KICAD10_3DMODEL_DIR: '/old-install/models' }, roots: [] }; });
    vscode.workspace.isTrusted = true;
    assert.equal((await resolver.readModel(doc('${KICAD10_3DMODEL_DIR}/Package.3dshapes/x.step'), 0)).format, 'step', 'Chosen model folder overrides stale automatic paths');
    vscode.workspace.isTrusted = false;
    await assert.rejects(resolver.readModel(doc('${KICAD10_3DMODEL_DIR}/Package.3dshapes/x.step'), 0), /outside/);
    assert.equal(nativeCalls, 1, 'Untrusted documents do not read native settings');
    resolver.setNativeModelDiscovery(async () => ({ variables: {}, roots: [] }));
    // Detect a non-default drive and prefer the version referenced by the board.
    vscode.FileType.Directory = 2;
    vscode.workspace.isTrusted = true;
    const winDirs = new Map([
        ['/d:/', []],
        ['/d:/kicad', [['9.0', 2], ['10.0', 2], ['notes', 2]]],
        ['/d:/kicad/9.0/share/kicad/3dmodels', []],
        ['/d:/kicad/10.0/share/kicad/3dmodels', []]
    ]);
    const winRoot = '/d:/kicad/10.0/share/kicad/3dmodels';
    const winModel = 'Diode_SMD.3dshapes/D_1206_3216Metric.step';
    let directoryReads = 0;
    const actualFiles = vscode.workspace.fs;
    vscode.workspace.fs = {
        stat: async uri => {
            const p = uri.path.toLowerCase();
            if (winDirs.has(p)) return { type: 2, size: 0 };
            if (p.endsWith(winModel.toLowerCase()) && /\/kicad\/(9|10)\.0\//.test(p)) return { type: 1, size: stepBytes.length };
            throw Error('ENOENT');
        },
        readDirectory: async uri => { directoryReads++; const entries = winDirs.get(uri.path.toLowerCase()); if (!entries) throw Error('ENOENT'); return entries; },
        readFile: async uri => { assert.equal(uri.path.toLowerCase(), (winRoot + '/' + winModel).toLowerCase()); return stepBytes; }
    };
    const winDoc = { uri: URI.file('F:/project/board.kicad_pcb'), version: 1,
        getText: () => '(kicad_pcb (footprint "x" (model "${KICAD10_3DMODEL_DIR}/' + winModel + '")))' };
    assert.equal((await resolver.readModel(winDoc, 0)).format, 'step');
    const discoveryReads = directoryReads;
    await resolver.readModel(winDoc, 0);
    assert.equal(directoryReads, discoveryReads, 'Discovery is shared across model requests');
    vscode.workspace.isTrusted = false;
    await assert.rejects(resolver.readModel(winDoc, 0), /outside/);
    assert.equal(directoryReads, discoveryReads, 'Untrusted documents do not probe external drives');
    vscode.workspace.fs = actualFiles;
    if (process.env.KILENS_TEST_LOCAL_LIBRARY) {
        vscode.workspace.isTrusted = true;
        vscode.workspace.fs = {
            stat: async uri => { const s = await fs.promises.stat(uri.fsPath); return { type: s.isDirectory() ? 2 : 1, size: s.size }; },
            readDirectory: async uri => (await fs.promises.readdir(uri.fsPath, { withFileTypes: true })).map(d => [d.name, d.isDirectory() ? 2 : 1]),
            readFile: uri => fs.promises.readFile(uri.fsPath)
        };
        const realResolver = load('src/web/modelResolver.ts', { vscode });
        realResolver.setNativeModelDiscovery(createNativeDiscovery());
        const paths = [winModel, 'Package_TO_SOT_THT.3dshapes/TO-220-7_P2.54x5.08mm_StaggerOdd_Lead3.08mm_Vertical.step',
            'Capacitor_THT.3dshapes/CP_Radial_D6.3mm_P2.50mm.step', 'TerminalBlock_Wuerth.3dshapes/Wuerth_REDCUBE-THR_WP-THRBU_74650074_THR.step',
            'Capacitor_SMD.3dshapes/C_0805_2012Metric.step', 'Capacitor_SMD.3dshapes/C_1210_3225Metric.step',
            'Transformer_SMD_Wurth.3dshapes/T_Wurth_WE-FLYTI-EP7_5801.wrl', 'Resistor_SMD.3dshapes/R_0805_2012Metric.step'];
        const realDoc = { ...winDoc, getText: () => '(kicad_pcb ' + paths.map(p => '(footprint "x" (model "${KICAD10_3DMODEL_DIR}/' + p + '"))').join(' ') + ')' };
        for (let i = 0; i < paths.length; i++) {
            const result = await realResolver.readModel(realDoc, i);
            assert.ok(result.bytes.length > 0);
            assert.equal(result.format, paths[i].endsWith('.wrl') ? 'wrl' : 'step');
        }
        console.log('All 8 reported model paths resolved and read from the installed KiCad library');
    }
    console.log('3D parsing, transforms and model path tests passed');
}
async function browserTests() {
    const browser = await chromium.launch({ headless: true, args: ['--disable-logging', '--enable-unsafe-swiftshader'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1100, height: 740 } });
        const errors = [], requests = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', request => requests.push(request.url()));
        await page.exposeFunction('modelBytes', index => index === 0 || index === 3 ? { bytes: Array.from(Buffer.from(wrl)), format: 'wrl' }
            : index === 1 ? { bytes: Array.from(stepBytes), format: 'step' } : { error: 'Model not found: missing.step' });
        await page.addInitScript(() => {
            window.modelRequests = [];
            window.acquireVsCodeApi = () => ({
                getState: () => JSON.parse(sessionStorage.getItem('state') || '{}'),
                setState: value => { window.savedPreviewState = value; sessionStorage.setItem('state', JSON.stringify(value)); },
                postMessage: async message => {
                    if (message.type === 'load3dModel') {
                        window.modelRequests.push(message.index);
                        window.postMessage({ type: 'model3dResult', requestId: message.requestId, ...await window.modelBytes(message.index) }, '*');
                    }
                    if (message.type === 'refresh') location.reload();
                    if (message.type === 'editFootprintPlacement') window.unexpectedEdit = true;
                }
            });
        });
        let source = board;
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname !== 'kilens.test') return route.abort();
            if (url.pathname === '/media/3d/preview3d.js' && process.env.KILENS_TEST_3D_BUNDLE)
                return route.fulfill({ path: process.env.KILENS_TEST_3D_BUNDLE, contentType: 'text/javascript' });
            if (url.pathname.startsWith('/media/')) return route.fulfill({ path: '.' + url.pathname,
                contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
            return route.fulfill({ body: html(source), contentType: 'text/html; charset=utf-8' });
        });
        await page.goto('https://kilens.test/');
        assert.ok(!requests.some(url => url.includes('/3d/')), '3D engine must be lazy-loaded');
        await page.getByRole('button', { name: '3D Preview', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.three-status').textContent.includes('Models: 3/4'), null, { timeout: 45000 }).catch(async error => {
            console.log('3D diagnostics:', await page.locator('.three-message').textContent(), errors);
            throw error;
        });
        assert.ok((await page.locator('.three-details').textContent()).includes('missing.step'));
        assert.deepEqual(await page.evaluate(() => modelRequests), [0, 1, 2], 'Repeated WRL paths share a parsed model');
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
        const first = await page.evaluate(() => savedPreviewState.camera3d);
        await page.mouse.move(550, 330); await page.mouse.down(); await page.mouse.move(650, 380, { steps: 8 }); await page.mouse.up();
        assert.notDeepEqual(await page.evaluate(() => savedPreviewState.camera3d.position), first.position);
        await page.keyboard.press('r'); await page.keyboard.press('Space');
        assert.equal(await page.evaluate(() => !!window.unexpectedEdit), false);
        await page.getByRole('button', { name: 'Bottom', exact: true }).click();
        assert.ok(await page.evaluate(() => savedPreviewState.camera3d.position[2] < savedPreviewState.camera3d.target[2]));
        await page.getByRole('button', { name: 'Top', exact: true }).click();
        assert.ok(await page.evaluate(() => savedPreviewState.camera3d.position[2] > savedPreviewState.camera3d.target[2]));
        await page.getByRole('button', { name: 'Fit', exact: true }).click();
        fs.mkdirSync('dist/test-output', { recursive: true });
        await page.screenshot({ path: 'dist/test-output/preview3d.png' });
        const saved = await page.evaluate(() => savedPreviewState.camera3d);
        await page.reload();
        await page.waitForFunction(() => document.querySelector('.three-status').textContent.includes('Models: 3/4'), null, { timeout: 45000 });
        assert.deepEqual(await page.evaluate(() => savedPreviewState.camera3d), saved, 'Refresh retains camera and 3D mode');
        assert.equal(await page.getByRole('button', { name: 'Model folder…', exact: true }).count(), 0);
        await page.keyboard.press('Alt+2');
        assert.equal(await page.locator('.three-panel').isVisible(), true, 'Alt+2 no longer exits 3D');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.three-panel').isVisible(), false);
        await page.keyboard.press('Alt+3');
        assert.equal(await page.locator('.three-panel').isVisible(), true);
        await page.keyboard.press('Alt+3');
        assert.equal(await page.locator('.three-panel').isVisible(), true, 'Alt+3 selects 3D without toggling back');
        for (const fields of [{ key: '3' }, { keyCode: 51 }, { code: 'Numpad3' }, { keyCode: 99 }]) {
            await page.keyboard.press('Escape');
            await page.evaluate(fields => window.dispatchEvent(new KeyboardEvent('keydown', { ...fields, altKey: true, bubbles: true, cancelable: true })), fields);
            assert.equal(await page.locator('.three-panel').isVisible(), true, 'Alt+3 supports forwarded events and the number pad');
        }
        await page.evaluate(() => window.postMessage({ type: 'setPreviewMode', mode: '2d' }, '*'));
        await page.waitForFunction(() => document.querySelector('.three-panel').hidden);
        await page.evaluate(() => window.postMessage({ type: 'setPreviewMode', mode: '3d' }, '*'));
        await page.waitForFunction(() => !document.querySelector('.three-panel').hidden);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.three-panel').isVisible(), false);
        await page.getByRole('button', { name: '3D Preview', exact: true }).click();
        assert.equal(await page.locator('.three-viewport canvas').count(), 1, 'Toggling does not allocate another renderer');
        await page.setViewportSize({ width: 430, height: 700 });
        await page.screenshot({ path: 'dist/test-output/preview3d-narrow.png' });
        await page.getByRole('button', { name: '2D', exact: true }).click();
        // Test actual rendered pixels where copper, pads, silkscreen and holes overlap.
        source = `(kicad_pcb (version 20240108) (generator pcbnew)
          (general (thickness 1.6)) (paper "A4")
          (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user) (37 "F.SilkS" user) (44 "Edge.Cuts" user))
          (setup (pad_to_mask_clearance 0)) (net 0 "")
          (gr_rect (start 0 0) (end 200 80) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))
          ${['F', 'B'].map(side => `
            (segment (start 20 40) (end 160 40) (width 2) (layer "${side}.Cu") (net 0))
            (segment (start 160 40) (end 170 30) (width 2) (layer "${side}.Cu") (net 0))
            (gr_line (start 100 30) (end 100 50) (stroke (width 2) (type default)) (layer "${side}.SilkS"))
          `).join('')}
          (via (at 110 40) (size 12) (drill 8) (layers "F.Cu" "B.Cu") (net 0))
          (footprint "Overlap" (layer "F.Cu") (at 80 40) (uuid "overlap")
            (pad "1" thru_hole rect (at 0 0) (size 12 8) (drill 1) (layers "*.Cu" "*.Mask")))
        )`;
        await page.setViewportSize({ width: 1500, height: 850 });
        await page.evaluate(() => sessionStorage.clear()); await page.reload();
        await page.getByRole('button', { name: '3D Preview', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.three-status').textContent.includes('Models: 0/0'));
        const THREE = require('three');
        for (const view of ['Top', 'Bottom', 'Fit', 'Zoom']) {
            await page.getByRole('button', { name: view === 'Zoom' ? 'Top' : view, exact: true }).click();
            if (view === 'Zoom') {
                const before = await page.evaluate(() => JSON.stringify(savedPreviewState.camera3d));
                await page.mouse.move(750, 425); await page.mouse.wheel(0, -2400);
                await page.waitForFunction(previous => JSON.stringify(savedPreviewState.camera3d) !== previous, before);
            }
            const state = await page.evaluate(() => savedPreviewState.camera3d);
            const camera = new THREE.PerspectiveCamera(40, 1500 / 850, 0.1, 10000);
            camera.up.set(0, 0, 1); camera.position.fromArray(state.position); camera.lookAt(new THREE.Vector3().fromArray(state.target)); camera.updateMatrixWorld();
            const sign = view === 'Bottom' ? -1 : 1;
            const samples = [
                { name: 'pad covers trace', p: [83, -40, sign * 0.825], kind: 'pad' },
                { name: 'silkscreen covers trace', p: [100, -40, sign * 0.845], kind: 'silk' },
                { name: 'trace does not cover drill', p: [110, -40, sign * 0.812], kind: 'hole' },
                { name: 'trace visible', p: [60, -40, sign * 0.812], kind: 'trace' }
            ].map(sample => {
                const point = new THREE.Vector3(...sample.p).project(camera);
                return { ...sample, x: Math.round((point.x + 1) * 750), y: Math.round((1 - point.y) * 425) };
            });
            const screenshot = await page.screenshot({ path: `dist/test-output/traces-${view.toLowerCase()}.png` });
            const pixels = await page.evaluate(async ({ base64, samples }) => {
                const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
                const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
                const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
                return samples.map(s => ({ ...s, rgb: Array.from(ctx.getImageData(s.x - 1, s.y - 1, 3, 3).data) }));
            }, { base64: screenshot.toString('base64'), samples });
            for (const sample of pixels) {
                let matches = 0;
                for (let i = 0; i < sample.rgb.length; i += 4) {
                    const [r, g, b] = sample.rgb.slice(i, i + 3);
                    if (sample.kind === 'pad' ? r > b * 1.2 && g > b * 1.2 && r >= g * 0.95
                        : sample.kind === 'silk' ? Math.min(r, g, b) > 180
                        : sample.kind === 'hole' ? r < 40 && g < 55 && b < 65
                        : g > r * 1.2 && g > b * 1.1) matches++;
                }
                assert.ok(matches >= 7, `${view}: ${sample.name} (${matches}/9 pixels matched: ${sample.rgb.slice(16, 19)})`);
            }
        }
        source = `(kicad_pcb (version 20240108) (generator pcbnew)
          (general (thickness 1.6)) (paper "A4")
          (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (36 "B.SilkS" user) (37 "F.SilkS" user) (44 "Edge.Cuts" user))
          (setup (pad_to_mask_clearance 0)) (net 0 "")
          (gr_rect (start 0 0) (end 80 50) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))
          (gr_text "FRONT R42" (at 40 15) (layer "F.SilkS") (effects (font (size 4 4) (thickness 0.6))))
          (gr_text "BACK R42" (at 40 15) (layer "B.SilkS") (effects (font (size 4 4) (thickness 0.6)) (justify mirror)))
          (footprint "Test" (layer "F.Cu") (at 40 35 90) (uuid "silk")
            (property "Reference" "R42" (at 0 0 90) (layer "F.SilkS") (effects (font (size 3 3) (thickness 0.4)))))
        )`;
        await page.evaluate(() => sessionStorage.clear()); await page.reload();
        await page.getByRole('button', { name: '3D Preview', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.three-status').textContent.includes('Models: 0/0'));
        const glyphCheck = await page.evaluate(() => {
            const base = { text: 'R42', position: [0, 0], size: [2, 2], width: 0.3, horizontal: 'center', vertical: 'center',
                angle: 0, mirror: false, italic: false, bold: false, lineSpacing: 1 };
            return { plain: KiLensStrokeText(base), mirror: KiLensStrokeText({ ...base, mirror: true }), rotate: KiLensStrokeText({ ...base, angle: 90 }),
                markup: KiLensStrokeText({ ...base, text: '~{EN} V_{IN}' }) };
        });
        assert.ok(glyphCheck.plain.length > 4 && glyphCheck.markup.length > 4);
        glyphCheck.plain.forEach((stroke, i) => stroke.forEach(([x, y], j) => {
            assert.ok(Math.abs(x + glyphCheck.mirror[i][j][0]) < 1e-7);
            assert.ok(Math.abs(y - glyphCheck.mirror[i][j][1]) < 1e-7);
            assert.ok(Math.abs(y - glyphCheck.rotate[i][j][0]) < 1e-7);
            assert.ok(Math.abs(x + glyphCheck.rotate[i][j][1]) < 1e-7);
        }));
        for (const view of ['Top', 'Bottom']) {
            await page.getByRole('button', { name: view, exact: true }).click();
            const whitePixels = async suffix => {
                const screenshot = await page.screenshot({ path: `dist/test-output/silkscreen-${view.toLowerCase()}-${suffix}.png` });
                return page.evaluate(async base64 => {
                    const image = new Image(); image.src = 'data:image/png;base64,' + base64; await image.decode();
                    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
                    const pixels = ctx.getImageData(10, 100, canvas.width - 20, canvas.height - 250).data;
                    let white = 0; for (let i = 0; i < pixels.length; i += 4) if (Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 180) white++;
                    return white;
                }, screenshot.toString('base64'));
            };
            assert.ok(await whitePixels('visible') > 300, `${view}: actual glyph strokes are rendered`);
            await page.getByRole('checkbox', { name: 'Silkscreen', exact: true }).uncheck();
            assert.equal(await whitePixels('hidden'), 0, `${view}: silkscreen toggle removes glyphs`);
            await page.getByRole('checkbox', { name: 'Silkscreen', exact: true }).check();
        }
        assert.deepEqual(errors, []);
        console.log('3D browser test passed: STEP/WRL, interaction, trace overlap, Newstroke text, mirrored back silkscreen and visibility');
    } finally { await browser.close(); }
}
(async () => { await unitTests(); await browserTests(); })().catch(error => { console.error(error); process.exitCode = 1; });
