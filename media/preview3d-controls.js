/* Lazy-load 3D assets only when the PCB preview is opened. */
window.KiLens3DControls = {
    install(options) {
        const button = document.querySelector('.three-toolbar-button');
        const panel = document.querySelector('.three-panel');
        const embed = document.querySelector('kicanvas-embed');
        let mounted, loading, opened = false;
        async function toggle(open) {
            opened = open;
            panel.hidden = !open;
            document.body.classList.toggle('three-active', open);
            embed.inert = open;
            button.setAttribute('aria-pressed', String(open));
            options.persist({ preview3d: open });
            if (!open) { mounted?.setActive(false); button.focus(); return; }
            panel.querySelector('.three-close').focus();
            if (mounted) { mounted.setActive(true); return; }
            if (loading) return;
            loading = true;
            try {
                if (!window.KiLens3D) await new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = options.bundleUrl;
                    script.onload = resolve;
                    script.onerror = () => { script.remove(); reject(new Error('Unable to load bundled 3D viewer.')); };
                    document.head.append(script);
                });
                const fontDeadline = Date.now() + 10000;
                while (!window.KiLensStrokeText && Date.now() < fontDeadline) await new Promise(resolve => setTimeout(resolve, 25));
                if (!window.KiLensStrokeText) throw new Error('The bundled silkscreen font did not load');
                mounted = window.KiLens3D.mount({
                    container: panel,
                    source: document.querySelector('kicanvas-source').textContent,
                    workerUrl: options.workerUrl, wasmUrl: options.wasmUrl,
                    postMessage: message => options.vscode.postMessage(message),
                    state: options.savedState.camera3d,
                    textStrokes: window.KiLensStrokeText,
                    persist: camera3d => options.persist({ camera3d })
                });
                mounted.setActive(opened);
            } catch (error) {
                panel.querySelector('.three-status').textContent = `3D preview unavailable: ${error.message}. Check WebGL support, then refresh.`;
            } finally { loading = false; }
        }
        button.addEventListener('click', () => void toggle(!opened));
        panel.querySelector('.three-close').addEventListener('click', () => void toggle(false));
        window.addEventListener('message', event => {
            if (event.data?.type === 'setPreviewMode' && ['2d', '3d'].includes(event.data.mode)) void toggle(event.data.mode === '3d');
        });
        function handleModeShortcut(event) {
            // Keep VS Code's menu bar from taking focus when Alt is released.
            // Other Alt combinations still bubble to the host with their modifiers.
            if (event.key === 'Alt') {
                event.preventDefault(); event.stopImmediatePropagation();
                return true;
            }
            // Forwarded webview keyboard events can omit the physical key code.
            const isThree = ['Digit3', 'Numpad3'].includes(event.code) || event.key === '3' || [51, 99].includes(event.keyCode);
            if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && isThree) {
                event.preventDefault(); event.stopImmediatePropagation();
                if (!event.repeat && !opened) void toggle(true);
                return true;
            }
            return false;
        }
        // Some desktop keyboard handlers consume keydown while still delivering keyup.
        // Selecting an explicit mode makes the fallback safe when both events arrive.
        window.addEventListener('keyup', handleModeShortcut, true);
        window.addEventListener('keydown', event => {
            if (handleModeShortcut(event)) return;
            if (!opened) return;
            if (event.altKey || event.ctrlKey || event.metaKey) return;
            // Keep PCB editing/selection shortcuts from modifying the hidden 2D board.
            if (event.key === 'Escape') { event.preventDefault(); void toggle(false); }
            event.stopImmediatePropagation();
        }, true);
        window.addEventListener('pagehide', () => mounted?.dispose(), { once: true });
        if (options.savedState.preview3d) void toggle(true);
    }
};
