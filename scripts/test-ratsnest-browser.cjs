const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const { chromium } = require('playwright');

const board = `(kicad_pcb (version 20240108) (generator pcbnew)
  (general (thickness 1.6)) (paper "A4")
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))
  (setup (pad_to_mask_clearance 0)) (net 0 "") (net 1 "SIGNAL") (net 2 "UNUSED")
  (gr_rect (start 5 5) (end 45 35) (stroke (width 0.05) (type default)) (fill none) (layer "Edge.Cuts"))
  (segment (start 20 12) (end 25 12) (width 0.25) (layer "F.Cu") (net 1))
  (via (at 30 15) (size 1) (drill 0.5) (layers "F.Cu" "B.Cu") (net 1))
  (gr_text "Location" (at 25 25) (layer "F.Cu") (effects (font (size 1 1) (thickness 0.15))))
  (footprint "Test" (layer "F.Cu") (at 10 10) (uuid "pad-a")
    (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (net 1 "SIGNAL")))
  (footprint "Test" (layer "F.Cu") (at 40 30) (uuid "pad-b")
    (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (net 1 "SIGNAL")))
)`;

function html(source) {
    const uri = path => ({ path, fsPath: path, with() { return this; }, toString() { return this.path; } });
    const vscode = { Uri: { joinPath: (base, ...parts) => uri(base.path + '/' + parts.join('/')) } };
    const editor = { exports: {} };
    vm.createContext(editor);
    vm.runInContext(ts.transpileModule(fs.readFileSync('src/web/kicadPcbEditor.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText, editor);
    const context = { exports: {}, require: name => name === 'vscode' ? vscode : editor.exports, URL };
    vm.createContext(context);
    vm.runInContext(ts.transpileModule(fs.readFileSync('src/web/previewContent.ts', 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText, context);
    return context.exports.getWebviewContent(
        uri('https://kilens.test'),
        { uri: uri('/fixture.kicad_pcb'), getText: () => source },
        { webview: { asWebviewUri: value => value } }
    );
}

(async () => {
    const browser = await chromium.launch({ headless: true, args: ['--disable-logging'] });
    try {
        const page = await browser.newPage({ viewport: {
            width: Number(process.env.KILENS_VIEWPORT_WIDTH ?? 1000),
            height: Number(process.env.KILENS_VIEWPORT_HEIGHT ?? 700)
        } });
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
        await page.addInitScript(() => { window.acquireVsCodeApi = () => ({ getState: () => ({}), setState(value) { window.savedPreviewState = value; }, postMessage() {} }); });
        await page.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ body: '', contentType: 'text/css' });
            if (url.hostname !== 'kilens.test') return route.abort();
            if (url.pathname === '/media/kicanvas.js') {
                const bundle = fs.readFileSync('media/kicanvas.js', 'utf8');
                const hook = 'on_draw(){if(this.renderer.clear_canvas()';
                assert.equal(bundle.split(hook).length, 2);
                return route.fulfill({ contentType: 'text/javascript', body: bundle.replace(hook,
                    'on_draw(){if(this.board&&this.layers){(window.copperFrames??=[]).push(["F.Cu","B.Cu",":F.Cu:Zones",":B.Cu:Zones"].map(n=>this.layers.by_name(n)?.opacity))}if(this.renderer.clear_canvas()') });
            }
            if (url.pathname.startsWith('/media/')) return route.fulfill({ path: '.' + url.pathname, contentType: url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript' });
            return route.fulfill({ body: html(process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : board), contentType: 'text/html; charset=utf-8' });
        });
        await page.goto('https://kilens.test/');
        await page.waitForFunction(() => document.querySelector('input[type=checkbox]'));
        console.log('Initial:', JSON.stringify(await page.evaluate(() => ({
            errors: null,
            embed: !!document.querySelector('kicanvas-embed')?.shadowRoot,
            app: !!getViewerApp(),
            loaded: getViewer()?.loaded?.isOpen,
            board: !!getViewer()?.board,
            nets: getViewer()?.board?.footprints?.slice(0, 1).map(f => f.pads.map(p => p.net)),
            edges: KiLensRatsnest.buildRatsnest(getViewer().board).length,
            checkboxes: document.querySelectorAll('input[type=checkbox]').length
        }))), 'errors:', errors);
        const netButton = page.getByRole('button', { name: 'Net', exact: true });
        await netButton.waitFor();
        assert.equal(await netButton.locator('svg').count(), 1, 'Net uses a toolbar icon');
        assert.equal(await page.locator('kc-ui-button[name="flip_view"]').count(), 0, 'Flip button is removed');
        assert.equal(await page.locator('kc-ui-button[name="download"]').count(), 0, 'Download button is removed');
        assert.ok(await page.evaluate(() => {
            const refresh = document.querySelector('.refresh-button:not(.net-toolbar-button)').getBoundingClientRect();
            return refresh.top === 8 && innerWidth - refresh.right === 8;
        }), 'Remaining toolbar buttons align to the right edge');
        assert.equal(await page.locator('.pcb-display-controls').isVisible(), false, 'Net panel starts collapsed');
        await netButton.click();
        assert.equal(await netButton.getAttribute('aria-expanded'), 'true');
        assert.ok(await page.evaluate(() => {
            const net = document.querySelector('.net-toolbar-button').getBoundingClientRect();
            const refresh = document.querySelector('.refresh-button:not(.net-toolbar-button)').getBoundingClientRect();
            return net.top === refresh.top && net.height === refresh.height && net.right + 4 === refresh.left;
        }), 'Net sits alongside the existing toolbar buttons');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.pcb-display-controls').isVisible(), false);
        await netButton.click();
        await page.locator('.pcb-display-controls').waitFor({ state: 'visible' });
        assert.ok(await page.evaluate(() => document.querySelector('.pcb-display-controls').getBoundingClientRect().top > document.querySelector('.refresh-button').getBoundingClientRect().bottom), 'Panel sits below toolbar');
        const netCount = await page.locator('input[name=visible-net]').count();
        const listMetrics = await page.locator('.net-list').evaluate(list => {
            const panel = list.closest('.pcb-display-controls');
            const controls = list.closest('.net-display-controls');
            return {
                viewportHeight: innerHeight,
                panelHeight: panel.getBoundingClientRect().height,
                panelTop: panel.getBoundingClientRect().top,
                controlsHeight: controls.getBoundingClientRect().height,
                clientHeight: list.clientHeight,
                scrollHeight: list.scrollHeight,
                rowHeights: [...list.children].map(row => row.getBoundingClientRect().height),
                listGap: getComputedStyle(list).gap,
                fontSize: getComputedStyle(panel).fontSize
            };
        });
        console.log('List metrics:', listMetrics);
        if (netCount <= 8) {
            await page.evaluate(() => new Promise(requestAnimationFrame));
            assert.equal(await page.locator('.net-list').evaluate(list => list.classList.contains('needs-scroll')), false,
                'A one-pixel layout rounding difference must not show a scrollbar');
        }
        assert.equal(await page.locator('input[name$="copper-opacity"]').count(), 0);
        const frames = await page.evaluate(() => window.copperFrames);
        assert.ok(frames.length > 0);
        assert.ok(frames.every(frame => frame.every(opacity => opacity == null || opacity === 0.75)), 'Copper starts at 75% on the very first frame');
        assert.ok(netCount > 0, 'Actual board nets are listed');
        for (const input of await page.locator('input[name=visible-net]').all()) await input.uncheck();
        await page.waitForFunction(() => getViewer().canvas.parentNode.querySelector('[data-kilens-ratsnest]').dataset.visibleEdgeCount === '0');
        assert.equal(await page.evaluate(() => window.savedPreviewState.hiddenNets.length), netCount);
        await page.locator('input[name=visible-net]').first().check();
        if (netCount > 1) assert.equal(await page.locator('input[name=ratsnest-visible]').evaluate(input => input.indeterminate), true,
            'All nets shows a mixed state when only some nets are visible');
        await page.evaluate(() => new Promise(requestAnimationFrame));
        const filtered = await page.evaluate(() => {
            const name = document.querySelector('input[name=visible-net]').value;
            const board = getViewer().board;
            const net = board.nets.find(n => n.name === name).number;
            return { expected: KiLensRatsnest.buildRatsnest(board).filter(edge => edge.net === net).length,
                actual: Number(getViewer().canvas.parentNode.querySelector('[data-kilens-ratsnest]').dataset.visibleEdgeCount) };
        });
        assert.equal(filtered.actual, filtered.expected, 'Only the checked net is visible');
        if (process.env.KILENS_SCREENSHOT) await page.screenshot({ path: process.env.KILENS_SCREENSHOT });
        for (const input of await page.locator('input[name=visible-net]').all()) await input.check();
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.equal(await page.locator('.pcb-display-controls input[type=checkbox]').count(), netCount + 1);
        const pixels = () => page.evaluate(() => {
            const canvas = getViewer().canvas.parentNode.querySelector('[data-kilens-ratsnest]');
            const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
            let count = 0;
            for (let i = 3; i < data.length; i += 4) if (data[i]) count++;
            return count;
        });
        assert.ok(await pixels() > 0, 'Airwires must produce visible pixels');
        await page.locator('input[name=ratsnest-visible]').click();
        assert.equal(await page.locator('input[name=ratsnest-visible]').isChecked(), false);
        assert.equal(await page.locator('input[name=visible-net]:checked').count(), 0);
        assert.equal(await page.evaluate(() => window.savedPreviewState.hiddenNets.length), netCount);
        await page.waitForFunction(() => {
            const c = getViewer().canvas.parentNode.querySelector('[data-kilens-ratsnest]');
            return !c.getContext('2d').getImageData(0, 0, c.width, c.height).data.some((value, i) => i % 4 === 3 && value);
        });
        assert.equal(await pixels(), 0);
        const netWithAirwires = await page.evaluate(() => {
            const edge = KiLensRatsnest.buildRatsnest(getViewer().board)[0];
            return getViewer().board.nets.find(net => net.number === edge.net).name;
        });
        const selectedNet = page.locator('input[name=visible-net]').filter({ visible: true });
        const netIndex = await selectedNet.evaluateAll((inputs, name) => inputs.findIndex(input => input.value === name), netWithAirwires);
        await selectedNet.nth(netIndex).check();
        await page.evaluate(() => new Promise(requestAnimationFrame));
        assert.ok(await pixels() > 0, 'Selecting a net after deselect all immediately restores its airwires');
        assert.equal(await page.locator('input[name=visible-net]:checked').count(), 1);
        await selectedNet.nth(netIndex).uncheck();
        await page.locator('input[name=ratsnest-visible]').click();
        assert.equal(await page.locator('input[name=ratsnest-visible]').isChecked(), true);
        assert.equal(await page.locator('input[name=visible-net]:checked').count(), netCount);
        assert.equal(await page.evaluate(() => window.savedPreviewState.hiddenNets.length), 0);
        assert.equal(await page.locator('.net-display-controls button').count(), 0);
        await netButton.click();
        assert.equal(await page.locator('.pcb-display-controls').isVisible(), false);
        assert.equal(await page.locator('input[name=visible-net]:checked').count(), netCount, 'Closing the panel preserves visibility');
        await netButton.click();
        await page.mouse.click(400, 400);
        assert.equal(await page.locator('.pcb-display-controls').isVisible(), false, 'Clicking outside closes the panel');
        await page.evaluate(async () => {
            const viewer = getViewer();
            viewer.viewport.camera.zoom *= 1.4;
            viewer.viewport.camera.center.x += 2;
            viewer.flip_view();
            await new Promise(requestAnimationFrame);
        });
        await page.setViewportSize({ width: 1100, height: 750 });
        await page.waitForFunction(() => {
            const v = getViewer(), c = v.canvas.parentNode.querySelector('[data-kilens-ratsnest]');
            return c.width === v.canvas.clientWidth * devicePixelRatio;
        });
        assert.ok(await pixels() > 0, 'Airwires survive pan, zoom, flip and resize');
        // Inject synthetic routes into the in-memory model only; the user's file is untouched.
        const remaining = await page.evaluate(async () => {
            const viewer = getViewer(), board = viewer.board;
            const { edges } = KiLensConnectivity.analyze(board);
            const oldTracks = [...board.segments];
            for (const edge of edges) board.segments.push({ net: edge.net, start: edge.start, end: edge.end, layer: 'F.Cu', width: 0.2 });
            viewer.paint();
            viewer.draw();
            await new Promise(requestAnimationFrame);
            const count = Number(viewer.canvas.parentNode.querySelector('[data-kilens-ratsnest]').dataset.edgeCount);
            board.segments = oldTracks;
            viewer.paint();
            viewer.draw();
            await new Promise(requestAnimationFrame);
            return { count, restored: Number(viewer.canvas.parentNode.querySelector('[data-kilens-ratsnest]').dataset.edgeCount) };
        });
        assert.equal(remaining.count, 0, 'Routing all airwires clears the overlay');
        assert.ok(remaining.restored > 0, 'Removing routes restores airwires');
        const selection = await page.evaluate(async () => {
            const viewer = getViewer();
            const pad = viewer.board.footprints[0].pads[0];
            let bounds;
            for (const layer of viewer.layers.in_order()) if (layer.selectionBoxes?.has(pad)) bounds = layer.selectionBoxes.get(pad);
            viewer.select(bounds);
            await new Promise(requestAnimationFrame);
            const padPainter = viewer.painter.painter_for(pad), paint = padPainter.paint;
            const painted = [];
            padPainter.paint = function (layer, item, ...args) { painted.push(item); return paint.call(this, layer, item, ...args); };
            viewer.paint_selected();
            padPainter.paint = paint;
            const mode = viewer.layers.overlay.graphics.composite_operation;
            const layer = [...viewer.layers.in_order()].find(layer => layer.graphics && layer.visible && layer.opacity !== 0);
            const render = layer.graphics.render, opacities = [];
            layer.graphics.render = function (matrix, depth, opacity) { opacities.push(opacity ?? 1); return render.call(this, matrix, depth, opacity); };
            viewer.on_draw();
            viewer.select(null);
            await new Promise(requestAnimationFrame);
            viewer.on_draw();
            layer.graphics.render = render;
            return { onlySelectedPad: painted.length > 0 && painted.every(item => item === pad), mode,
                dimmed: opacities[0], restored: opacities.at(-1), cleared: viewer.selected === null };
        });
        assert.equal(selection.onlySelectedPad, true, 'Highlight redraws the selected pad only');
        assert.equal(selection.mode, 'source-over');
        assert.ok(Math.abs(selection.dimmed / selection.restored - .2) < 1e-6, 'Other geometry dims to 20% and restores after deselection');
        assert.equal(selection.cleared, true);
        const filterButton = page.getByRole('button', { name: 'Selection filters', exact: true });
        assert.equal(await page.locator('.selection-filter').isVisible(), false);
        assert.ok(await page.evaluate(() => {
            const filter = document.querySelector('.filter-toolbar-button').getBoundingClientRect();
            const net = document.querySelector('.net-toolbar-button').getBoundingClientRect();
            return filter.top === net.top && filter.right + 4 === net.left;
        }), 'Filter icon sits alongside Net in the top-right toolbar');
        async function setFilter(name, checked) {
            if (!await page.locator('.selection-filter').isVisible()) await filterButton.click();
            await page.locator('input[name=select-' + name + ']').setChecked(checked);
        }
        await setFilter('all', false);
        await setFilter('pad', true);
        const pickedPad = await page.evaluate(() => {
            const viewer = getViewer(), footprint = viewer.board.footprints[0], pad = footprint.pads[0];
            const p = KiLensSelection.world(pad, pad.at.position);
            viewer.on_pick(p);
            return { selected: viewer.selected?.context === pad, x: p.x, y: p.y,
                footprint: document.querySelector('.placement-editor').classList.contains('visible') };
        });
        assert.equal(pickedPad.selected, true, 'Pad filtering selects a nested pad rather than its footprint');
        assert.equal(pickedPad.footprint, false, 'Other objects cannot use the footprint edit form');
        assert.equal(await page.locator('.object-info').isVisible(), true);
        assert.ok((await page.locator('.object-info').innerText()).includes(`${pickedPad.x}, ${pickedPad.y} mm`));
        await setFilter('pad', false);
        assert.equal(await page.evaluate(() => getViewer().selected), null, 'Disabling a category clears its selection');
        await setFilter('footprint', true);
        await setFilter('pad', true);
        await page.evaluate(() => {
            const v = getViewer(), f = v.board.footprints[0];
            v.on_pick(KiLensSelection.world(f.pads[0], f.pads[0].at.position));
        });
        assert.ok(await page.locator('.object-picker button').count() >= 2, 'Overlapping objects offer a choice');
        await page.locator('.object-picker button').filter({ hasText: 'Pads' }).first().click();
        await page.evaluate(() => {
            const v = getViewer(), pad = v.board.footprints[0].pads[0];
            pad.locked = true;
            v.on_pick(KiLensSelection.world(pad, pad.at.position));
        });
        assert.equal(await page.evaluate(() => getViewer().selected?.context.constructor.name), 'Footprint', 'Locked pad is excluded');
        await setFilter('footprint', false);
        await setFilter('locked', true);
        await page.evaluate(() => {
            const v = getViewer(), pad = v.board.footprints[0].pads[0];
            v.on_pick(KiLensSelection.world(pad, pad.at.position));
            pad.locked = false;
        });
        assert.equal(await page.evaluate(() => getViewer().selected?.context.constructor.name), 'Pad', 'Locked selection can be enabled');
        assert.equal(await page.evaluate(() => window.savedPreviewState.selectionFilter.locked), true);
        for (const category of ['track', 'via', 'text', 'graphic']) {
            await setFilter('all', true);
            await setFilter('all', false);
            await setFilter(category, true);
            const result = await page.evaluate(category => {
                const v = getViewer();
                for (const layer of v.layers.in_order()) {
                    for (const [item, box] of layer.selectionBoxes ?? []) {
                        if (KiLensSelection.kind(item) !== category) continue;
                        v.on_pick(box.center);
                        return KiLensSelection.kind(v.selected?.context);
                    }
                }
            }, category);
            assert.equal(result, category, `${category} can be selected and inspected`);
            assert.equal(await page.locator('.object-info').isVisible(), true);
        }
        const transformed = await page.evaluate(() => KiLensSelection.world({ parent: {
            constructor: { name: 'Footprint' }, at: { position: { x: 10, y: 20 }, rotation: 90 }
        } }, { x: 2, y: 3 }));
        assert.ok(Math.abs(transformed.x - 13) < 1e-8 && Math.abs(transformed.y - 18) < 1e-8,
            'Child coordinates respect footprint translation and rotation');
        await setFilter('all', true);
        await setFilter('all', false);
        await setFilter('point', true);
        assert.equal(await page.evaluate(() => {
            const v = getViewer(), track = v.board.segments[0];
            v.on_pick(track.start);
            return v.selected?.context.selectionPoint;
        }), true, 'Endpoints can be inspected independently');
        await setFilter('all', true);
        assert.equal(await page.locator('.selection-filter h3').innerText(), 'Selection filters');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.selection-filter').isVisible(), false);
        await filterButton.click();
        await netButton.click();
        assert.equal(await page.locator('.selection-filter').isVisible(), false, 'Net and filter popovers do not overlap');
        await filterButton.click();
        assert.equal(await page.locator('.pcb-display-controls').isVisible(), false);
        await page.evaluate(() => { getViewer().zoom_to_board(); getViewer().paint_selected(); });
        await page.evaluate(() => new Promise(requestAnimationFrame));
        if (process.env.KILENS_SELECTION_SCREENSHOT) await page.screenshot({ path: process.env.KILENS_SELECTION_SCREENSHOT });
        if (process.env.KILENS_SELECTION_SCREENSHOT) {
            await page.evaluate(() => {
                const v = getViewer();
                v.select(v.board.footprints[0]);
                v.paint_selected();
            });
            await page.evaluate(() => new Promise(requestAnimationFrame));
            await page.screenshot({ path: process.env.KILENS_SELECTION_SCREENSHOT.replace('.png', '-footprint.png') });
        }
        assert.equal(errors.length, 0, errors.join('\n'));
        console.log('Browser: pixels, toggle, pan/zoom/flip/resize, route connection and disconnection passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
