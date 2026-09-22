/* PCB object selection and read-only board-coordinate inspection. */
(function (root) {
    const categories = { footprint: 'Footprints', text: 'Text', track: 'Tracks', via: 'Vias', pad: 'Pads', graphic: 'Graphics', zone: 'Zones', rule: 'Rule areas', dimension: 'Dimensions', other: 'Other items', point: 'Points' };
    const kind = item => {
        const name = item?.constructor?.name ?? '';
        if (item?.selectionPoint) return 'point';
        if (name === 'Footprint') return 'footprint';
        if (name === 'Pad') return 'pad';
        if (name === 'Via') return 'via';
        if (/^(Line|Arc)Segment$/.test(name)) return 'track';
        if (/Text|Property/.test(name)) return 'text';
        if (name === 'Zone') return item.keepout ? 'rule' : 'zone';
        if (/Dimension/.test(name)) return 'dimension';
        if (/^(Gr|Fp)(Line|Arc|Circle|Rect|Poly|Curve)/.test(name)) return 'graphic';
        return 'other';
    };
    const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.y);
    function world(item, p) {
        if (!valid(p)) return null;
        if (item.parent?.constructor?.name !== 'Footprint' || item.selectionPoint) return p;
        const { position: origin, rotation } = item.parent.at;
        const a = (rotation ?? 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
        return { x: origin.x + c * p.x + s * p.y, y: origin.y - s * p.x + c * p.y };
    }
    function installRendering(viewer) {
        // Capture rendered bounds for nested pads/text as well as top-level items.
        // Save and restore the renderer's current bounding accumulator around each item.
        let highlightTarget = null, withinTarget = false;
        const createPainter = viewer.create_painter;
        viewer.create_painter = function (...args) {
            const painter = createPainter.apply(this, args), gfx = painter.gfx;
            const paintLayer = painter.paint_layer, paintItem = painter.paint_item;
            let collecting = false;
            painter.paint_layer = function (layer) {
                layer.selectionBoxes = new Map(); collecting = true;
                try { return paintLayer.call(this, layer); } finally { collecting = false; }
            };
            painter.paint_item = function (layer, item, ...args) {
                if (highlightTarget) {
                    if (!withinTarget && item !== highlightTarget && item !== highlightTarget.parent) return;
                    const previous = withinTarget;
                    withinTarget ||= item === highlightTarget;
                    try { return paintItem.call(this, layer, item, ...args); }
                    finally { withinTarget = previous; }
                }
                if (!collecting) return paintItem.call(this, layer, item, ...args);
                const previous = gfx.end_bbox(null);
                gfx.start_bbox();
                try { return paintItem.call(this, layer, item, ...args); }
                finally {
                    const bounds = gfx.end_bbox(item);
                    gfx.start_bbox(); gfx.add_bbox(previous); gfx.add_bbox(bounds);
                    if (bounds.valid) layer.selectionBoxes.set(item, bounds);
                }
            };
            return painter;
        };
        // Render only the selected object's real geometry over a dimmed board.
        const layerState = () => [...viewer.layers.in_display_order()].map(layer => layer.name + ':' + layer.visible + ':' + layer.opacity).join('|');
        let highlightedLayers = '';
        viewer.paint_selected = function () {
            highlightedLayers = layerState();
            const overlay = this.layers.overlay;
            overlay.clear();
            const item = this.selected?.context;
            if (item) {
                const graphics = [];
                if (item.selectionPoint) {
                    this.renderer.start_layer(overlay.name);
                    const color = overlay.color.copy();
                    Object.assign(color, { r: 1, g: .651, b: .043, a: 1 });
                    this.renderer.circle(item.at.position, .16, color);
                    graphics.push(this.renderer.end_layer());
                } else {
                    highlightTarget = item;
                    const parent = item.parent?.constructor?.name === 'Footprint' ? item.parent : item;
                    try {
                        for (const layer of this.layers.in_display_order()) {
                            if (layer === overlay || !layer.visible || layer.opacity === 0 || !layer.selectionBoxes?.has(item)) continue;
                            this.renderer.start_layer(overlay.name + layer.name);
                            this.painter.paint_item(layer, parent);
                            graphics.push(this.renderer.end_layer());
                        }
                    } finally { highlightTarget = null; withinTarget = false; }
                }
                // Keep copper, holes and text in their original layer order.
                for (const part of graphics) part.composite_operation = 'source-over';
                overlay.graphics = {
                    composite_operation: 'source-over',
                    render(matrix, depth) { graphics.forEach((part, index) => part.render(matrix, depth + index * .01, 1)); },
                    dispose() { for (const part of graphics) part.dispose(); }
                };
            }
            this.draw();
        };
        const paint = viewer.paint;
        viewer.paint = function (...args) {
            const result = paint.apply(this, args);
            this.paint_selected();
            return result;
        };
        const onDraw = viewer.on_draw;
        viewer.on_draw = function (...args) {
            if (this.selected && highlightedLayers !== layerState()) this.paint_selected();
            const restores = [];
            if (this.selected) {
                for (const layer of this.layers.in_order()) {
                    const graphics = layer.graphics;
                    if (!graphics) continue;
                    const render = graphics.render;
                    graphics.render = function (matrix, depth, opacity = 1) { return render.call(this, matrix, depth, opacity * .2); };
                    restores.push(() => { graphics.render = render; });
                }
            }
            const airwires = this.canvas.parentNode.querySelector('[data-kilens-ratsnest]');
            if (airwires) airwires.style.opacity = this.selected ? '.2' : '1';
            try { return onDraw.apply(this, args); }
            finally { for (const restore of restores) restore(); }
        };
        viewer.paint(); viewer.draw();
    }

    function install(viewer, saved = {}, persist = () => {}) {
        const panel = document.createElement('section');
        panel.className = 'selection-filter';
        panel.hidden = true; panel.id = 'selection-filter-panel';
        const summary = document.createElement('h3');
        summary.textContent = 'Selection filters';
        const grid = document.createElement('div');
        grid.className = 'selection-filter-grid';
        panel.append(summary, grid);
        document.body.append(panel);
        const filterButton = document.createElement('button');
        filterButton.type = 'button'; filterButton.className = 'refresh-button filter-toolbar-button';
        filterButton.title = 'Selection filters';
        filterButton.setAttribute('aria-label', 'Selection filters');
        filterButton.setAttribute('aria-controls', panel.id);
        filterButton.setAttribute('aria-expanded', 'false');
        filterButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 4h18l-7 8v7l-4 2v-9z"></path></svg>';
        document.body.append(filterButton);
        const netButton = document.querySelector('.net-toolbar-button');
        function openFilters(open) {
            panel.hidden = !open;
            filterButton.setAttribute('aria-expanded', String(open));
            if (open && netButton.getAttribute('aria-expanded') === 'true') netButton.click();
        }
        filterButton.addEventListener('click', () => openFilters(panel.hidden));
        document.addEventListener('pointerdown', event => {
            if (!event.composedPath().includes(panel) && !event.composedPath().includes(filterButton)) openFilters(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !panel.hidden) { openFilters(false); filterButton.focus(); }
        });
        const info = document.createElement('section');
        info.className = 'object-info'; info.hidden = true;
        info.setAttribute('aria-label', 'Object position');
        const picker = document.createElement('div');
        picker.className = 'object-picker'; picker.hidden = true;
        picker.setAttribute('aria-label', 'Choose an object');
        document.body.append(info, picker);
        const inputs = {};
        function checkbox(key, label, checked) {
            const row = document.createElement('label'), input = document.createElement('input');
            input.type = 'checkbox'; input.name = 'select-' + key; input.checked = checked;
            row.append(input, document.createTextNode(label)); grid.append(row); inputs[key] = input;
            return input;
        }
        const all = checkbox('all', 'All items', true);
        const locked = checkbox('locked', 'Locked items', saved.locked === true);
        for (const [key, label] of Object.entries(categories)) checkbox(key, label, saved[key] !== false);
        function sync() {
            const count = Object.keys(categories).filter(key => inputs[key].checked).length;
            all.checked = count === Object.keys(categories).length;
            all.indeterminate = count > 0 && !all.checked;
        }
        function save() {
            persist(Object.fromEntries([...Object.keys(categories), 'locked'].map(key => [key, inputs[key].checked])));
        }
        const allowed = item => inputs[kind(item)].checked && (locked.checked || !(item.locked || item.parent?.locked));
        grid.addEventListener('change', event => {
            if (event.target === all) for (const key of Object.keys(categories)) inputs[key].checked = all.checked;
            sync(); save(); picker.hidden = true;
            if (viewer.selected && !allowed(viewer.selected.context)) viewer.select(null);
        });

        sync();

        installRendering(viewer);
        const title = item => categories[kind(item)] + ' · ' + (item.reference ?? item.number ?? item.shown_text ?? item.value ?? item.text ?? item.netname ?? item.name ?? item.constructor.name);
        function choose(bounds) { picker.hidden = true; viewer.select(bounds); }
        viewer.on_pick = function (position) {
            const found = new Map();
            for (const layer of viewer.layers.in_order()) {
                if (!layer.visible || layer.opacity === 0) continue;
                for (const [item, bounds] of layer.selectionBoxes ?? []) {
                    if (allowed(item) && bounds.contains_point(position)) found.set(item, bounds);
                    if (inputs.point.checked && (locked.checked || !(item.locked || item.parent?.locked))) {
                        for (const key of ['start', 'mid', 'end']) {
                            const p = world(item, item[key]);
                            if (!p) continue;
                            const screen = viewer.viewport.camera.world_to_screen(p);
                            const mouse = viewer.viewport.camera.world_to_screen(position);
                            if (Math.hypot(screen.x - mouse.x, screen.y - mouse.y) > 6) continue;
                            const id = (item.unique_id ?? title(item)) + ':' + key;
                            const box = bounds.copy(); box.x = p.x - .12; box.y = p.y - .12; box.w = box.h = .24;
                            box.context = { selectionPoint: true, at: { position: p }, name: title(item) + ' / ' + key, locked: item.locked || item.parent?.locked };
                            found.set(id, box);
                        }
                    }
                }
            }
            const hits = [...found.values()];
            if (!hits.length) { choose(null); return; }
            if (hits.length === 1) { choose(hits[0]); return; }
            picker.replaceChildren();
            const priority = { footprint: 0, pad: 1, graphic: 2 };
            for (const bounds of hits.sort((a, b) =>
                (priority[kind(a.context)] ?? 3) - (priority[kind(b.context)] ?? 3)
                || a.w * a.h - b.w * b.h)) {
                const button = document.createElement('button'); button.type = 'button';
                button.textContent = title(bounds.context);
                button.addEventListener('click', () => choose(bounds)); picker.append(button);
            }
            picker.hidden = false;
            const p = viewer.viewport.camera.world_to_screen(position), rect = viewer.canvas.getBoundingClientRect();
            picker.style.left = Math.max(8, Math.min(innerWidth - picker.offsetWidth - 8, rect.left + p.x)) + 'px';
            picker.style.top = Math.max(8, Math.min(innerHeight - picker.offsetHeight - 8, rect.top + p.y)) + 'px';
            picker.querySelector('button')?.focus();
        };
        document.addEventListener('pointerdown', event => { if (!event.composedPath().includes(picker)) picker.hidden = true; });
        document.addEventListener('keydown', event => { if (event.key === 'Escape') picker.hidden = true; });
        viewer.addEventListener('kicanvas:select', event => {
            const item = event.detail?.item;
            info.hidden = !item || kind(item) === 'footprint';
            if (info.hidden) return;
            info.replaceChildren();
            const heading = document.createElement('h3'); heading.textContent = title(item);
            const list = document.createElement('dl'); info.append(heading, list);
            function row(label, value) {
                const dt = document.createElement('dt'), dd = document.createElement('dd');
                dt.textContent = label; dd.textContent = value; list.append(dt, dd);
            }
            const fmt = n => Number(n.toFixed(4)).toString();
            function point(label, p) { if (valid(p)) row(label, fmt(p.x) + ', ' + fmt(p.y) + ' mm'); }
            const p = world(item, item.at?.position ?? item.position);
            if (p) point('X, Y', p);
            for (const [key, label] of [['start', 'Start'], ['mid', 'Arc midpoint'], ['end', 'End'], ['center', 'Center']]) point(label, world(item, item[key]));
            if (!p && !valid(item.start) && !valid(item.center)) point('Bounds center', viewer.selected?.center);
            if (Number.isFinite(item.at?.rotation)) row('Angle', fmt(item.at.rotation) + '°');
            if (item.layer) row('Layer', item.layer.name ?? String(item.layer));
            if (item.netname) row('Net', item.netname);
            if (item.parent?.reference) row('Footprint', item.parent.reference);
            row('Status', item.locked || item.parent?.locked ? 'Locked · Read-only' : 'Read-only');
        });
    }
    root.KiLensSelection = { install, kind, world };
})(globalThis);
