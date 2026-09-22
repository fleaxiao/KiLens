/* Draw only the links between disconnected copper components. */
(function (root) {
    const connectivity = root.KiLensConnectivity ?? (typeof require === 'function' ? require('./connectivity.js') : null);
    function buildRatsnest(board) { return connectivity.analyze(board).edges; }

    function install(viewer, enabled, persist, options = {}) {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2';
        canvas.setAttribute('aria-hidden', 'true');
        viewer.canvas.parentNode.appendChild(canvas);
        const context = canvas.getContext('2d');
        let analysis = connectivity.analyze(viewer.board);
        const control = document.createElement('label');
        control.className = 'net-display-control';
        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.name = 'ratsnest-visible';
        const caption = document.createElement('span');
        caption.textContent = 'All nets';
        const status = document.createElement('span');
        status.className = 'net-count';
        control.append(toggle, caption, status);
        const group = document.createElement('div');
        group.className = 'net-display-controls';
        const heading = document.createElement('h3');
        heading.className = 'net-panel-title';
        heading.textContent = 'Net visibility';
        const hiddenNets = new Set(options.hiddenNets ?? []);
        const netNames = new Map((viewer.board.nets ?? []).filter(net => net.number > 0 && net.name).map(net => [net.number, net.name]));
        for (const footprint of viewer.board.footprints ?? []) {
            for (const pad of footprint.pads ?? []) {
                if (pad.net?.number > 0 && pad.net.name) netNames.set(pad.net.number, pad.net.name);
            }
        }
        const nameFor = net => netNames.get(net) ?? String(net).replace(/^name:/, '');
        // Explicit net selection takes precedence over the legacy global switch.
        if (options.hiddenNets == null && enabled === false) {
            for (const name of netNames.values()) hiddenNets.add(name);
            for (const edge of analysis.edges) hiddenNets.add(nameFor(edge.net));
        }
        const list = document.createElement('div');
        list.className = 'net-list';
        list.setAttribute('role', 'group');
        list.setAttribute('aria-label', 'Visible nets');
        const netControls = [];
        function saveSelection() {
            persist(visibleEdges().length > 0);
            options.persistHiddenNets?.([...hiddenNets]);
            updateStatus();
            viewer.draw();
        }
        for (const [number, name] of [...netNames].sort((a, b) => a[1].localeCompare(b[1]))) {
            const row = document.createElement('label');
            row.className = 'net-display-control';
            row.title = name;
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = 'visible-net';
            input.value = name;
            input.checked = !hiddenNets.has(name);
            const caption = document.createElement('span');
            caption.className = 'net-name';
            caption.textContent = name;
            const count = document.createElement('span');
            count.className = 'net-count';
            row.append(input, caption, count);
            list.appendChild(row);
            netControls.push({ input, name, number, count });
            input.addEventListener('change', () => {
                if (input.checked) hiddenNets.delete(name); else hiddenNets.add(name);
                saveSelection();
            });
        }
        if (!netControls.length) list.textContent = 'No nets found';
        group.append(control, list);
        (options.container ?? document.body).appendChild(heading);
        (options.container ?? document.body).appendChild(group);
        function updateListOverflow() {
            // Flex layout can introduce a one-pixel rounding difference, which
            // must not create a scrollbar when all rows already fit.
            list.classList.toggle('needs-scroll', list.scrollHeight > list.clientHeight + 1);
        }
        requestAnimationFrame(updateListOverflow);
        window.addEventListener('resize', updateListOverflow);
        if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateListOverflow).observe(list);
        function visibleEdges() { return analysis.edges.filter(edge => !hiddenNets.has(nameFor(edge.net))); }
        function updateStatus() {
            const visibleCount = visibleEdges().length;
            const edgeCounts = new Map();
            for (const edge of analysis.edges) edgeCounts.set(edge.net, (edgeCounts.get(edge.net) ?? 0) + 1);
            const selectedCount = netControls.filter(({ input }) => input.checked).length;
            const allSelected = netControls.length > 0 && selectedCount === netControls.length;
            toggle.checked = allSelected;
            toggle.indeterminate = selectedCount > 0 && !allSelected;
            toggle.disabled = netControls.length === 0;
            toggle.title = allSelected ? 'Deselect all nets' : 'Select all nets';
            status.textContent = visibleCount + ' / ' + analysis.edges.length;
            control.title = analysis.padCount + ' pads, ' + analysis.netCount + ' nets. Connected airwires are hidden. '
                + analysis.warnings.join('; ');
            canvas.dataset.edgeCount = String(analysis.edges.length);
            canvas.dataset.visibleEdgeCount = String(visibleCount);
            for (const { number, count } of netControls) {
                const n = edgeCounts.get(number) ?? 0;
                count.textContent = String(n);
                count.title = n + ' unconnected airwires';
            }
        }
        canvas.dataset.kilensRatsnest = '';
        updateStatus();
        function draw() {
            const width = viewer.canvas.clientWidth, height = viewer.canvas.clientHeight;
            const ratio = window.devicePixelRatio || 1;
            if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
            if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
            context.setTransform(ratio, 0, 0, ratio, 0, 0);
            context.clearRect(0, 0, width, height);
            const edges = visibleEdges();
            if (!edges.length) return;
            context.strokeStyle = 'rgba(180,235,245,0.9)';
            context.lineWidth = 1.25;
            context.beginPath();
            for (const edge of edges) {
                const a = viewer.viewport.camera.world_to_screen(edge.start);
                const b = viewer.viewport.camera.world_to_screen(edge.end);
                context.moveTo(a.x, a.y);
                context.lineTo(b.x, b.y);
                if (Math.hypot(a.x - b.x, a.y - b.y) < 1) {
                    context.moveTo(a.x + 4, a.y);
                    context.arc(a.x, a.y, 4, 0, Math.PI * 2);
                }
            }
            context.stroke();
        }
        const original = viewer.on_draw;
        viewer.on_draw = function (...args) { original.apply(this, args); draw(); };
        const originalPaint = viewer.paint;
        if (originalPaint) viewer.paint = function (...args) {
            const result = originalPaint.apply(this, args);
            analysis = connectivity.analyze(this.board);
            updateStatus();
            return result;
        };
        toggle.addEventListener('change', () => {
            const visible = toggle.checked;
            hiddenNets.clear();
            if (!visible) {
                for (const edge of analysis.edges) hiddenNets.add(nameFor(edge.net));
            }
            for (const { input, name } of netControls) {
                input.checked = visible;
                if (visible) hiddenNets.delete(name); else hiddenNets.add(name);
            }
            saveSelection();
        });
        viewer.draw();
    }
    root.KiLensRatsnest = { buildRatsnest, install };
    if (typeof module !== 'undefined') module.exports = root.KiLensRatsnest;
})(globalThis);
