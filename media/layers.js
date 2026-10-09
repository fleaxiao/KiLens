/* 2D layer visibility. Keep dependent pad/zone layers controlled by their copper layer. */
window.KiLensLayers = {
    install({ visibility = {}, persist }) {
        const button = document.querySelector('.layers-toolbar-button');
        const panel = document.querySelector('#layers-panel');
        const list = panel.querySelector('.layers-list');
        const names = {
            ':DrawingSheet': 'Page', ':Grid': 'Grid', ':Marks': 'Marks',
            ':Symbol:Field': 'Symbol fields', ':Label': 'Labels', ':Junction': 'Junctions',
            ':Wire': 'Wires', ':Symbol:Foreground': 'Symbols', ':Notes': 'Notes',
            ':Bitmap': 'Images', ':Symbol:Pin': 'Pins', ':Symbol:Background': 'Symbol backgrounds'
        };
        let viewer;
        let choices = { ':DrawingSheet': false, ...visibility };
        function layers(set) {
            const page = set.by_name(':DrawingSheet'), grid = set.by_name(':Grid');
            const design = set.in_ui_order ? [...set.in_ui_order()]
                : [...set.in_order()].filter(layer => names[layer.name] && layer !== page && layer !== grid);
            return [page, ...design, grid].filter(Boolean);
        }
        function apply(set) {
            for (const layer of layers(set)) {
                if (typeof choices[layer.name] === 'boolean') layer.visible = choices[layer.name];
            }
            return set;
        }
        function render() {
            if (!viewer?.layers) return;
            list.replaceChildren();
            for (const layer of layers(viewer.layers)) {
                const row = document.createElement('label');
                const input = document.createElement('input');
                input.type = 'checkbox'; input.checked = layer.visible;
                input.dataset.layer = layer.name;
                const label = document.createElement('span');
                label.textContent = names[layer.name] ?? layer.name;
                row.append(input, label); list.append(row);
                input.addEventListener('change', () => {
                    const current = viewer.layers.by_name(layer.name);
                    if (!current) return;
                    current.visible = input.checked;
                    choices = { ...choices, [layer.name]: input.checked };
                    persist(choices);
                    viewer.draw();
                });
            }
        }
        function close() {
            panel.hidden = true;
            button.setAttribute('aria-expanded', 'false');
        }
        button.addEventListener('click', () => {
            if (!panel.hidden) { close(); return; }
            for (const other of document.querySelectorAll('.net-toolbar-button, .filter-toolbar-button')) {
                if (other.getAttribute('aria-expanded') === 'true') other.click();
            }
            render(); panel.hidden = false;
            button.setAttribute('aria-expanded', 'true');
        });
        document.addEventListener('pointerdown', event => {
            if (!event.composedPath().includes(panel) && !event.composedPath().includes(button)) close();
        });
        document.addEventListener('click', event => {
            if (event.target.closest('.net-toolbar-button, .filter-toolbar-button')) close();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && !panel.hidden) { close(); button.focus(); }
        });
        return {
            close,
            attach(next) {
                viewer = next;
                const create = viewer.create_layer_set;
                viewer.create_layer_set = function (...args) { return apply(create.apply(this, args)); };
                apply(viewer.layers);
                button.disabled = false;
                viewer.draw();
            }
        };
    }
};
