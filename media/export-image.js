/* Capture synchronously after drawing: WebGL's default buffer is transient. */
window.KiLensImageExport = {
    capture2d(viewer) {
        if (!viewer?.layers || !viewer.canvas?.width) throw new Error('The preview is still loading. Please try again shortly.');
        if (!viewer.board) return this.captureCanvas(viewer);
        const bounds = viewer.layers.by_name('Edge.Cuts')?.bbox;
        if (!bounds?.valid || bounds.w <= 0 || bounds.h <= 0) throw new Error('Cannot export board-sized image: no valid Edge.Cuts outline found.');
        const canvas = viewer.canvas, camera = viewer.viewport.camera;
        const sheet = viewer.layers.by_name(':DrawingSheet');
        const saved = { style: canvas.style.cssText, x: camera.center.x, y: camera.center.y,
            zoom: camera.zoom, rotation: camera.rotation.radians,
            width: camera.viewport_size.x, height: camera.viewport_size.y, sheetVisible: sheet?.visible };
        // Fixed scale gives the same PNG regardless of editor size, zoom or HiDPI.
        const scale = Math.min(20, 4096 / Math.max(bounds.w, bounds.h));
        const ratio = window.devicePixelRatio || 1;
        try {
            canvas.style.setProperty('width', `${Math.max(1, Math.round(bounds.w * scale)) / ratio}px`, 'important');
            canvas.style.setProperty('height', `${Math.max(1, Math.round(bounds.h * scale)) / ratio}px`, 'important');
            const rect = canvas.getBoundingClientRect();
            camera.viewport_size.set(rect.width, rect.height);
            camera.rotation.radians = 0;
            camera.bbox = bounds;
            if (sheet) sheet.visible = false;
            viewer.grid?.update();
            return this.captureCanvas(viewer);
        } finally {
            canvas.style.cssText = saved.style;
            camera.viewport_size.set(saved.width, saved.height);
            camera.center.set(saved.x, saved.y);
            camera.zoom = saved.zoom;
            camera.rotation.radians = saved.rotation;
            if (sheet) sheet.visible = saved.sheetVisible;
            viewer.grid?.update();
            viewer.on_draw();
        }
    },
    captureCanvas(viewer) {
        viewer.on_draw();
        const source = viewer.canvas;
        const image = document.createElement('canvas');
        image.width = source.width;
        image.height = source.height;
        const context = image.getContext('2d');
        context.fillStyle = getComputedStyle(source).backgroundColor;
        context.fillRect(0, 0, image.width, image.height);
        context.drawImage(source, 0, 0);
        const overlay = source.parentNode.querySelector('[data-kilens-ratsnest]');
        if (overlay && overlay.width && overlay.height) {
            const style = getComputedStyle(overlay);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
                context.globalAlpha = Number(style.opacity);
                // The ratsnest backing buffer is drawn in the source camera's coordinates.
                context.drawImage(overlay, 0, 0, image.width, image.height);
            }
        }
        return image.toDataURL('image/png');
    },
    install({ vscode, capture }) {
        const button = document.querySelector('.export-image-button');
        const status = document.querySelector('.export-image-status');
        let pending, sequence = 0, timer;
        function finish(message) {
            pending = undefined;
            button.disabled = false;
            status.textContent = message;
            status.hidden = !message;
            clearTimeout(timer);
            if (message) timer = setTimeout(() => { status.hidden = true; }, 6000);
        }
        button.addEventListener('click', () => {
            if (pending) return;
            button.disabled = true;
            status.hidden = true;
            try {
                const mode = document.body.classList.contains('three-active') ? '3d' : '2d';
                const dataUrl = capture(mode);
                pending = `image-${Date.now()}-${++sequence}`;
                vscode.postMessage({ type: 'exportPreviewImage', requestId: pending, mode, dataUrl });
            } catch (error) { finish(`Export failed: ${error.message}`); }
        });
        window.addEventListener('message', event => {
            const result = event.data;
            if (result?.type !== 'exportPreviewImageResult' || !pending || result.requestId !== pending) return;
            finish(result.error ? `Export failed: ${result.error}` : result.cancelled ? '' : 'Image saved');
        });
    }
};
