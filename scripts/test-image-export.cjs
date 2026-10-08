const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { URI, Utils } = require('vscode-uri');
const { chromium } = require('playwright');

function load(filename, vscode) {
    const context = { exports: {}, atob, Uint8Array, require: name => name === 'vscode' ? vscode
        : load(path.join(path.dirname(filename), name + '.ts'), vscode) };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText, context);
    return context.exports;
}
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function hostTests() {
    let dialog, destination, writes = [], failure;
    const vscode = { Uri: { joinPath: Utils.joinPath }, window: { showSaveDialog: async options => { dialog = options; return destination; } },
        workspace: { fs: { writeFile: async (uri, bytes) => { if (failure) throw failure; writes.push({ uri, bytes }); } } } };
    const { exportPreviewImage } = load('src/web/exportImage.ts', vscode);
    const source = URI.parse('file:///project/board.kicad_pcb');
    assert.equal((await exportPreviewImage(source, { mode: '2d', dataUrl: png })).cancelled, true);
    assert.equal(writes.length, 0, 'Cancelling does not write a file');
    assert.equal(dialog.defaultUri.path, '/project/board.png');
    destination = URI.parse('file:///chosen/custom.png');
    assert.equal((await exportPreviewImage(source, { mode: '3d', dataUrl: png })).cancelled, false);
    assert.equal(dialog.defaultUri.path, '/project/board.png');
    assert.equal(writes[0].uri, destination, 'Only the user-selected destination is written');
    assert.deepEqual(Buffer.from(writes[0].bytes), Buffer.from(png.split(',')[1], 'base64'));
    for (const dataUrl of ['data:text/plain;base64,AAAA', 'data:image/png;base64,AAAA', 'data:image/png;base64,%%%']) {
        await assert.rejects(() => exportPreviewImage(source, { mode: '2d', dataUrl }));
    }
    assert.equal(writes.length, 1);
    destination = undefined;
    await exportPreviewImage(URI.file('F:/Boost-Zero/data/train/lm2735_msop8_sepic/expert.kicad_pcb'), { mode: '3d', dataUrl: png });
    assert.ok(dialog.defaultUri.path.endsWith('/Boost-Zero/data/train/lm2735_msop8_sepic/expert.png'));
    const remote = URI.parse('vscode-remote://ssh-remote+lab/home/designs/power.rev2.kicad_sch');
    await exportPreviewImage(remote, { mode: '2d', dataUrl: png });
    assert.equal(dialog.defaultUri.scheme, remote.scheme);
    assert.equal(dialog.defaultUri.authority, remote.authority);
    assert.equal(dialog.defaultUri.path, '/home/designs/power.rev2.png');
    destination = URI.parse('file:///chosen/custom.png');
    failure = new Error('Read-only destination');
    await assert.rejects(() => exportPreviewImage(source, { mode: '2d', dataUrl: png }), /Read-only/);
}

async function browserTests() {
    const browser = await chromium.launch({ headless: true, args: ['--disable-logging'] });
    try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
        const errors = [];
        page.on('pageerror', e => errors.push(e.stack));
        await page.addInitScript(() => {
            window.exports = [];
            window.acquireVsCodeApi = () => ({ getState: () => ({}), setState() {}, postMessage(message) {
                if (message.type === 'exportPreviewImage') window.exports.push(message);
            } });
        });
        const pcb = fs.readFileSync('scripts/test-ratsnest-browser.cjs', 'utf8').match(/const board = `([\s\S]*?)`;/)[1];
        const schematic = `(kicad_sch (version 20250114) (generator "eeschema")
            (uuid "579a8384-f4c5-4531-89a0-fcfc5cc04b41") (paper "A4") (lib_symbols)
            (wire (pts (xy 50 50) (xy 100 50)) (stroke (width 0) (type default)) (uuid "30a83884-f4c5-4531-89a0-fcfc5cc04b41"))
            (text "PNG export" (at 80 55 0) (effects (font (size 1.27 1.27))) (uuid "41a83884-f4c5-4531-89a0-fcfc5cc04b41")))`;
        const vscode = { Uri: { joinPath: Utils.joinPath } };
        const { getWebviewContent } = load('src/web/previewContent.ts', vscode);
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname !== 'kilens.test') return route.abort();
            if (url.pathname.startsWith('/media/')) return route.fulfill({ path: '.' + url.pathname,
                contentType: url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.wasm') ? 'application/wasm' : 'text/javascript' });
            const sch = url.pathname.endsWith('.kicad_sch');
            return route.fulfill({ contentType: 'text/html; charset=utf-8', body: getWebviewContent(URI.parse('https://kilens.test'),
                { uri: URI.parse('file:///project' + url.pathname), getText: () => sch ? schematic : pcb },
                { webview: { asWebviewUri: uri => uri } }) });
        });
        fs.mkdirSync('dist/test-output', { recursive: true });
        async function capture(label, mode = '2d') {
            await page.getByRole('button', { name: 'Export image', exact: true }).click();
            await page.waitForFunction(() => window.exports.length > 0);
            const output = await page.evaluate(() => window.exports.at(-1));
            assert.equal(output.mode, mode);
            assert.equal(await page.getByRole('button', { name: 'Export image', exact: true }).isDisabled(), true);
            const stats = await page.evaluate(async () => {
                const img = new Image(); img.src = window.exports.at(-1).dataUrl; await img.decode();
                const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
                const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
                const data = ctx.getImageData(0, 0, c.width, c.height).data;
                const colors = new Set(); let transparent = 0, opaque = 0, partial = 0;
                for (let i = 0; i < data.length; i += 4) {
                    colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
                    if (data[i + 3] === 0) transparent++;
                    else if (data[i + 3] === 255) opaque++;
                    else partial++;
                }
                const source = document.body.classList.contains('three-active') ? document.querySelector('.three-viewport canvas') : getViewer().canvas;
                let expected = [source.width, source.height];
                if (!document.body.classList.contains('three-active') && getViewer().board) {
                    const b = getViewer().layers.by_name('Edge.Cuts').bbox;
                    const scale = Math.min(20, 4096 / Math.max(b.w, b.h));
                    expected = [Math.round(b.w * scale), Math.round(b.h * scale)];
                }
                return { width: c.width, height: c.height, expected, colors: colors.size, transparent, opaque, partial, cornerAlpha: data[3] };
            });
            assert.deepEqual([stats.width, stats.height], stats.expected, 'Uses board dimensions for PCB, canvas resolution for other views');
            assert.ok(stats.colors > 10, `${label}: export is not a blank WebGL buffer`);
            if (mode === '3d') {
                assert.equal(stats.cornerAlpha, 0, `${label}: background is fully transparent`);
                assert.ok(stats.transparent > 0 && stats.opaque > 0, `${label}: transparent background and solid board are present`);
                assert.ok(stats.partial > 0, `${label}: antialiased edges retain partial alpha`);
            } else assert.equal(stats.transparent + stats.partial, 0, `${label}: export retains its visible background`);
            fs.writeFileSync(`dist/test-output/export-${label}.png`, Buffer.from(output.dataUrl.split(',')[1], 'base64'));
            await page.evaluate(() => window.postMessage({ type: 'exportPreviewImageResult', requestId: window.exports.at(-1).requestId, cancelled: true }, '*'));
            await page.waitForFunction(() => !document.querySelector('.export-image-button').disabled);
            assert.equal(await page.locator('.export-image-status').isVisible(), false);
            return output;
        }
        await page.goto('https://kilens.test/board.kicad_pcb');
        await page.waitForFunction(() => getViewer()?.board && document.querySelector('input[name="visible-net"]'));
        await page.evaluate(() => getViewer().zoom_to_board());
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const first = await capture('2d');
        await page.evaluate(() => { const v = getViewer(); v.viewport.camera.zoom *= 1.5; v.draw(); });
        const cameraState = () => page.evaluate(() => { const c = getViewer().viewport.camera; return [c.zoom, c.center.x, c.center.y, c.rotation.radians, c.viewport_size.x, c.viewport_size.y]; });
        const beforeExport = await cameraState();
        const zoomed = await capture('2d-zoomed');
        assert.equal(first.dataUrl, zoomed.dataUrl, 'Board export is independent of preview zoom');
        assert.deepEqual(await cameraState(), beforeExport, 'Export restores the preview camera');
        await page.setViewportSize({ width: 730, height: 510 });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.equal((await capture('2d-resized')).dataUrl, first.dataUrl, 'Board export is independent of editor size');
        await page.evaluate(() => { getViewer().canvas.parentNode.querySelector('[data-kilens-ratsnest]').style.display = 'none'; });
        const noAirwires = await capture('2d-no-airwires');
        assert.notEqual(zoomed.dataUrl, noAirwires.dataUrl, 'Visible airwires are composited in exported images');
        await page.getByRole('button', { name: 'Export image', exact: true }).click();
        await page.evaluate(() => window.postMessage({ type: 'exportPreviewImageResult', requestId: window.exports.at(-1).requestId, error: 'Read-only destination' }, '*'));
        await page.waitForFunction(() => !document.querySelector('.export-image-button').disabled);
        assert.match(await page.locator('.export-image-status').textContent(), /Read-only destination/);
        await page.getByRole('button', { name: '3D Preview', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.three-status').textContent.includes('Models: 0/0'));
        await capture('3d', '3d');
        await page.getByRole('checkbox', { name: 'Enhanced rendering', exact: true }).check();
        await capture('3d-enhanced', '3d');
        await page.evaluate(() => window.postMessage({ type: 'exportPreviewImageResult', requestId: window.exports.at(-1).requestId, error: 'Old response' }, '*'));
        assert.equal(await page.locator('.export-image-status').isVisible(), false, 'Ignores stale replies');
        await page.goto('https://kilens.test/design.kicad_sch');
        await page.waitForFunction(() => getViewer()?.layers && getViewer()?.document);
        await page.evaluate(() => new Promise(requestAnimationFrame));
        await capture('schematic');
        assert.equal(errors.length, 0, errors.join('\n'));
    } finally { await browser.close(); }
}
(async () => { await hostTests(); await browserTests(); console.log('Image export: save/cancel/error, board bounds, camera restoration, resize, schematic, 3D and HiDPI passed.'); })()
    .catch(error => { console.error(error); process.exitCode = 1; });
