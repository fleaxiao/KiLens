/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   createFootprintPlacementReplacement: () => (/* binding */ createFootprintPlacementReplacement)
/* harmony export */ });
function parseString(text, start) {
    let value = '';
    let index = start + 1;
    while (index < text.length) {
        const character = text[index];
        if (character === '"') {
            return { kind: 'atom', value, start, end: index + 1 };
        }
        if (character === '\\' && index + 1 < text.length) {
            value += text[index + 1];
            index += 2;
            continue;
        }
        value += character;
        index++;
    }
    throw new Error('Unterminated string in KiCad document.');
}
function parseDocument(text) {
    const root = { kind: 'list', start: 0, end: text.length, items: [] };
    const stack = [root];
    let index = 0;
    while (index < text.length) {
        const character = text[index];
        if (/\s/.test(character)) {
            index++;
            continue;
        }
        if (character === '(') {
            const list = { kind: 'list', start: index, end: -1, items: [] };
            stack[stack.length - 1].items.push(list);
            stack.push(list);
            index++;
            continue;
        }
        if (character === ')') {
            if (stack.length === 1) {
                throw new Error('Unexpected closing parenthesis in KiCad document.');
            }
            stack.pop().end = index + 1;
            index++;
            continue;
        }
        let atom;
        if (character === '"') {
            atom = parseString(text, index);
        }
        else {
            let end = index + 1;
            while (end < text.length && !/[\s()]/.test(text[end])) {
                end++;
            }
            atom = {
                kind: 'atom',
                value: text.slice(index, end),
                start: index,
                end
            };
        }
        stack[stack.length - 1].items.push(atom);
        index = atom.end;
    }
    if (stack.length !== 1) {
        throw new Error('Unterminated list in KiCad document.');
    }
    return root;
}
function head(list) {
    const first = list.items[0];
    return first?.kind === 'atom' ? first.value : undefined;
}
function childList(list, name) {
    return list.items.find((item) => item.kind === 'list' && head(item) === name);
}
function secondAtom(list) {
    const item = list.items[1];
    return item?.kind === 'atom' ? item : undefined;
}
function findFootprint(root, id) {
    const pending = [root];
    while (pending.length > 0) {
        const current = pending.pop();
        if (head(current) === 'footprint') {
            for (const idName of ['uuid', 'tstamp']) {
                const idList = childList(current, idName);
                if (idList && secondAtom(idList)?.value === id) {
                    return current;
                }
            }
        }
        for (const item of current.items) {
            if (item.kind === 'list') {
                pending.push(item);
            }
        }
    }
    return undefined;
}
function formatNumber(value) {
    if (!Number.isFinite(value)) {
        throw new Error('Footprint coordinates and rotation must be finite numbers.');
    }
    const rounded = Math.round(value * 1000000) / 1000000;
    return Object.is(rounded, -0) ? '0' : String(rounded);
}
function createFootprintPlacementReplacement(text, placement) {
    if (!placement.id) {
        throw new Error('The selected footprint has no UUID or timestamp.');
    }
    const root = parseDocument(text);
    const footprint = findFootprint(root, placement.id);
    if (!footprint) {
        throw new Error(`Could not find footprint ${placement.id} in the current document.`);
    }
    const locked = footprint.items.some(item => item.kind === 'atom' && item.value === 'locked');
    if (locked) {
        throw new Error('The selected footprint is locked.');
    }
    const at = childList(footprint, 'at');
    if (!at || at.end < 0) {
        throw new Error(`Footprint ${placement.id} has no placement.`);
    }
    return {
        start: at.start,
        end: at.end,
        text: `(at ${formatNumber(placement.x)} ${formatNumber(placement.y)} ${formatNumber(placement.rotation)})`
    };
}


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	const __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		const cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		const module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat get default export */
/******/ 	(() => {
/******/ 		// getDefaultExport function for compatibility with non-harmony modules
/******/ 		__webpack_require__.n = (module) => {
/******/ 			const getter = module && module.__esModule ?
/******/ 				() => (module['default']) :
/******/ 				() => (module);
/******/ 			__webpack_require__.d(getter, { a: getter });
/******/ 			return getter;
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter/value functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			if(Array.isArray(definition)) {
/******/ 				var i = 0;
/******/ 				while(i < definition.length) {
/******/ 					var key = definition[i++];
/******/ 					var binding = definition[i++];
/******/ 					if(!__webpack_require__.o(exports, key)) {
/******/ 						if(binding === 0) {
/******/ 							Object.defineProperty(exports, key, { enumerable: true, value: definition[i++] });
/******/ 						} else {
/******/ 							Object.defineProperty(exports, key, { enumerable: true, get: binding });
/******/ 						}
/******/ 					} else if(binding === 0) { i++; }
/******/ 				}
/******/ 			} else {
/******/ 				for(var key in definition) {
/******/ 					if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 						Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 					}
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
let __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
(() => {
__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   activate: () => (/* binding */ activate),
/* harmony export */   deactivate: () => (/* binding */ deactivate)
/* harmony export */ });
/* harmony import */ var vscode__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(1);
/* harmony import */ var vscode__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(vscode__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var _kicadPcbEditor__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(2);


class PreViewProvider {
    constructor(context) {
        this.context = context;
        this.refreshCallbacks = new Set();
    }
    refresh() {
        this.refreshCallbacks.forEach(refresh => refresh());
    }
    async resolveCustomTextEditor(document, webviewPanel, _token) {
        webviewPanel.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [
                this.context.extensionUri,
                vscode__WEBPACK_IMPORTED_MODULE_0__.Uri.joinPath(vscode__WEBPACK_IMPORTED_MODULE_0__.Uri.file(document.uri.fsPath), '..')
            ]
        };
        const updateWebview = () => {
            webviewPanel.webview.html = this.getWebviewContent(document, webviewPanel);
        };
        this.refreshCallbacks.add(updateWebview);
        updateWebview();
        const changeDocumentSubscription = vscode__WEBPACK_IMPORTED_MODULE_0__.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                updateWebview();
            }
        });
        const messageSubscription = webviewPanel.webview.onDidReceiveMessage(message => {
            if (message?.type === 'refresh') {
                updateWebview();
            }
            else if (message?.type === 'editFootprintPlacement') {
                void this.editFootprintPlacement(document, message).catch(error => {
                    const detail = error instanceof Error ? error.message : String(error);
                    void vscode__WEBPACK_IMPORTED_MODULE_0__.window.showErrorMessage(`Unable to move footprint: ${detail}`);
                    void webviewPanel.webview.postMessage({
                        type: 'footprintPlacementError',
                        message: detail
                    });
                });
            }
        });
        webviewPanel.onDidDispose(() => {
            changeDocumentSubscription.dispose();
            messageSubscription.dispose();
            this.refreshCallbacks.delete(updateWebview);
        });
    }
    async editFootprintPlacement(document, message) {
        if (!document.uri.path.toLowerCase().endsWith('.kicad_pcb')) {
            throw new Error('Placement editing is currently available only for PCB footprints.');
        }
        const placement = {
            id: typeof message.id === 'string' ? message.id : '',
            x: Number(message.x),
            y: Number(message.y),
            rotation: Number(message.rotation)
        };
        const replacement = (0,_kicadPcbEditor__WEBPACK_IMPORTED_MODULE_1__.createFootprintPlacementReplacement)(document.getText(), placement);
        const edit = new vscode__WEBPACK_IMPORTED_MODULE_0__.WorkspaceEdit();
        edit.replace(document.uri, new vscode__WEBPACK_IMPORTED_MODULE_0__.Range(document.positionAt(replacement.start), document.positionAt(replacement.end)), replacement.text);
        if (!await vscode__WEBPACK_IMPORTED_MODULE_0__.workspace.applyEdit(edit)) {
            throw new Error('VS Code rejected the document edit.');
        }
    }
    getWebviewContent(document, webviewPanel) {
        const scriptUri = webviewPanel.webview.asWebviewUri(vscode__WEBPACK_IMPORTED_MODULE_0__.Uri.joinPath(this.context.extensionUri, 'media', 'kicanvas.js')).with({ query: 'v=kicanvas-rounded-gr-rect-v2' });
        const documentSource = document.getText()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        const pathParts = document.uri.path.split('/');
        const documentName = (pathParts[pathParts.length - 1] || 'design.kicad_pcb')
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        return `<!DOCTYPE html>
			<html>
			<head>
				<style>
					html,
					body {
						height: 100%;
						margin: 0;
						padding: 0;
					}

					.refresh-button {
						align-items: center;
						appearance: none;
						background: #6b5194;
						border: 0;
						border-radius: 4px;
						box-sizing: border-box;
						color: #ffffff;
						cursor: pointer;
						display: flex;
						height: 34px;
						justify-content: center;
						line-height: 0;
						padding: 0;
						position: fixed;
						right: 84px;
						top: 8px;
						width: 34px;
						z-index: 10;
					}

					.refresh-button:hover {
						background: #765da2;
					}

					.refresh-button:focus-visible {
						outline: 2px solid #ffffff;
						outline-offset: 2px;
					}

					.refresh-button svg {
						height: 16px;
						width: 16px;
					}

					.copper-opacity-controls {
						backdrop-filter: blur(8px);
						background: rgba(38, 38, 38, 0.88);
						border: 1px solid rgba(255, 255, 255, 0.14);
						border-radius: 5px;
						color: #ffffff;
						display: grid;
						font: 12px/1.2 system-ui, sans-serif;
						gap: 7px;
						padding: 8px 10px;
						position: fixed;
						right: 128px;
						top: 8px;
						width: 190px;
						z-index: 10;
					}

					.copper-opacity-control {
						align-items: center;
						display: grid;
						gap: 7px;
						grid-template-columns: 32px 1fr 34px;
					}

					.copper-opacity-control input {
						accent-color: #9b7acb;
						margin: 0;
						min-width: 0;
					}

					.copper-opacity-value {
						font-variant-numeric: tabular-nums;
						text-align: right;
					}

					.placement-editor {
						backdrop-filter: blur(8px);
						background: rgba(38, 38, 38, 0.92);
						border: 1px solid rgba(255, 255, 255, 0.14);
						border-radius: 5px;
						color: #ffffff;
						display: none;
						font: 12px/1.3 system-ui, sans-serif;
						left: 8px;
						padding: 10px;
						position: fixed;
						top: 8px;
						width: 230px;
						z-index: 10;
					}

					.placement-editor.visible {
						display: grid;
						gap: 8px;
					}

					.placement-editor-title {
						font-weight: 600;
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					}

					.placement-fields {
						display: grid;
						gap: 6px;
						grid-template-columns: repeat(3, 1fr);
					}

					.placement-field {
						display: grid;
						gap: 3px;
					}

					.placement-field input {
						background: #1f1f1f;
						border: 1px solid #666666;
						border-radius: 3px;
						box-sizing: border-box;
						color: #ffffff;
						min-width: 0;
						padding: 4px;
						width: 100%;
					}

					.placement-actions {
						display: grid;
						gap: 6px;
						grid-template-columns: 1fr;
					}

					.placement-actions button {
						background: #5c477c;
						border: 0;
						border-radius: 3px;
						color: #ffffff;
						cursor: pointer;
						padding: 5px;
					}

					.placement-actions button:hover {
						background: #765da2;
					}

					.placement-actions button:disabled,
					.placement-field input:disabled {
						cursor: not-allowed;
						opacity: 0.55;
					}

					.placement-grid {
						align-items: center;
						display: grid;
						gap: 6px;
						grid-template-columns: auto 70px 1fr;
					}

					.placement-grid input {
						background: #1f1f1f;
						border: 1px solid #666666;
						border-radius: 3px;
						color: #ffffff;
						min-width: 0;
						padding: 3px 4px;
					}

					.placement-status {
						color: #c9c9c9;
						font-size: 11px;
					}

					.placement-status.error {
						color: #ff9b9b;
					}
				</style>
			</head>
			<body>
				<form class="placement-editor" aria-label="Footprint placement editor">
					<div class="placement-editor-title">No footprint selected</div>
					<div class="placement-fields">
						<label class="placement-field">
							<span>X (mm)</span>
							<input name="placement-x" type="number" step="any">
						</label>
						<label class="placement-field">
							<span>Y (mm)</span>
							<input name="placement-y" type="number" step="any">
						</label>
						<label class="placement-field">
							<span>Angle</span>
							<input name="placement-rotation" type="number" step="any">
						</label>
					</div>
					<div class="placement-actions">
						<button name="apply-placement" type="submit">Apply</button>
					</div>
					<label class="placement-grid">
						<span>Grid</span>
						<input name="placement-grid" type="number" min="0.000001" step="any">
						<span>mm</span>
					</label>
					<div class="placement-status" role="status"></div>
				</form>
				<div class="copper-opacity-controls" aria-label="Copper layer opacity">
					<label class="copper-opacity-control">
						<span>F.Cu</span>
						<input name="front-copper-opacity" type="range" min="0" max="1" step="0.05">
						<output class="copper-opacity-value" for="front-copper-opacity"></output>
					</label>
					<label class="copper-opacity-control">
						<span>B.Cu</span>
						<input name="back-copper-opacity" type="range" min="0" max="1" step="0.05">
						<output class="copper-opacity-value" for="back-copper-opacity"></output>
					</label>
				</div>
				<button class="refresh-button" type="button" title="Refresh Preview" aria-label="Refresh Preview">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M20 11a8 8 0 1 0-2.34 5.66"></path>
						<path d="M20 4v7h-7"></path>
					</svg>
				</button>
				<script type="module" src="${scriptUri}"></script>
				<kicanvas-embed theme="kicad" controls="basic" controlslist="nooverlay">
					<kicanvas-source name="${documentName}">${documentSource}</kicanvas-source>
				</kicanvas-embed>
				<script>
					const vscode = acquireVsCodeApi();
					const embed = document.querySelector('kicanvas-embed');
					const zoomButtonSelector = 'kc-ui-button[name^="zoom_to_"]';
					let savedState = vscode.getState() ?? {};
					const copperOpacity = {
						front: normalizeOpacity(savedState.frontCopperOpacity),
						back: normalizeOpacity(savedState.backCopperOpacity)
					};
					let currentZoomMode = 'zoom_to_page';
					let selectedFootprint = null;

					const placementEditor = document.querySelector('.placement-editor');
					const placementTitle = placementEditor?.querySelector('.placement-editor-title');
					const placementStatus = placementEditor?.querySelector('.placement-status');
					const placementX = placementEditor?.querySelector('input[name="placement-x"]');
					const placementY = placementEditor?.querySelector('input[name="placement-y"]');
					const placementRotation = placementEditor?.querySelector('input[name="placement-rotation"]');
					const placementGrid = placementEditor?.querySelector('input[name="placement-grid"]');
					const placementButtons = Array.from(placementEditor?.querySelectorAll('button') ?? []);

					document.querySelector('.refresh-button')?.addEventListener('click', () => {
						vscode.postMessage({ type: 'refresh' });
					});

					if (placementGrid instanceof HTMLInputElement) {
						const savedGrid = finiteNumber(savedState.placementGrid);
						placementGrid.value = String(savedGrid !== null && savedGrid > 0 ? savedGrid : 0.5);
						placementGrid.addEventListener('change', () => {
							const grid = finiteNumber(placementGrid.value);
							if (grid !== null && grid > 0) {
								setPersistentState({ placementGrid: grid });
								setPlacementStatus('');
							} else {
								setPlacementStatus('Grid must be greater than zero.', true);
							}
						});
					}

					placementEditor?.addEventListener('submit', event => {
						event.preventDefault();
						submitPlacementInputs();
					});
					window.addEventListener('message', event => {
						if (event.data?.type === 'footprintPlacementError') {
							setPlacementStatus(event.data.message ?? 'Unable to edit footprint.', true);
						}
					});

					function normalizeOpacity(value) {
						const numericValue = Number(value);
						return Number.isFinite(numericValue)
							? Math.min(1, Math.max(0, numericValue))
							: 0.75;
					}

					function setPersistentState(patch) {
						savedState = { ...savedState, ...patch };
						vscode.setState(savedState);
					}

					function finiteNumber(value) {
						const numericValue = Number(value);
						return Number.isFinite(numericValue) ? numericValue : null;
					}

					function normalizeRotation(value) {
						const normalized = value % 360;
						return normalized < 0 ? normalized + 360 : normalized;
					}

					function setPlacementStatus(message, error = false) {
						if (!(placementStatus instanceof HTMLElement)) {
							return;
						}
						placementStatus.textContent = message;
						placementStatus.classList.toggle('error', error);
					}

					function captureViewerState() {
						const camera = getViewer()?.viewport?.camera;
						const centerX = finiteNumber(camera?.center?.x);
						const centerY = finiteNumber(camera?.center?.y);
						const zoom = finiteNumber(camera?.zoom);
						const rotationRadians = finiteNumber(camera?.rotation?.radians);
						if (centerX === null || centerY === null || zoom === null
							|| zoom <= 0 || rotationRadians === null) {
							return;
						}
						setPersistentState({
							viewerState: {
								centerX,
								centerY,
								zoom,
								rotationRadians,
								flipped: Boolean(camera.flipped)
							}
						});
					}

					function restoreViewerState(viewer) {
						const camera = viewer?.viewport?.camera;
						const state = savedState.viewerState;
						const centerX = finiteNumber(state?.centerX);
						const centerY = finiteNumber(state?.centerY);
						const zoom = finiteNumber(state?.zoom);
						const rotationRadians = finiteNumber(state?.rotationRadians);
						if (!camera || centerX === null || centerY === null
							|| zoom === null || zoom <= 0 || rotationRadians === null
							|| !camera.rotation) {
							return false;
						}

						camera.center?.set(centerX, centerY);
						camera.zoom = zoom;
						camera.rotation.radians = rotationRadians;
						camera.flipped = Boolean(state.flipped);
						viewer.draw?.();
						return true;
					}

					function updatePlacementInputs() {
						if (!selectedFootprint) {
							return;
						}
						if (placementX instanceof HTMLInputElement) {
							placementX.value = String(selectedFootprint.x);
						}
						if (placementY instanceof HTMLInputElement) {
							placementY.value = String(selectedFootprint.y);
						}
						if (placementRotation instanceof HTMLInputElement) {
							placementRotation.value = String(selectedFootprint.rotation);
						}
					}

					function showSelectedFootprint(item) {
						const id = item?.unique_id ?? item?.uuid ?? item?.tstamp;
						const x = finiteNumber(item?.at?.position?.x);
						const y = finiteNumber(item?.at?.position?.y);
						const rotation = finiteNumber(item?.at?.rotation ?? 0);

						if (!id || x === null || y === null || rotation === null) {
							selectedFootprint = null;
							placementEditor?.classList.remove('visible');
							setPersistentState({ selectedFootprintId: null });
							return;
						}

						selectedFootprint = {
							id: String(id),
							reference: String(item.reference ?? id),
							x,
							y,
							rotation,
							locked: Boolean(item.locked)
						};
						placementEditor?.classList.add('visible');
						if (placementTitle instanceof HTMLElement) {
							placementTitle.textContent = selectedFootprint.reference
								+ (selectedFootprint.locked ? ' (locked)' : '');
						}
						for (const control of [placementX, placementY, placementRotation, ...placementButtons]) {
							if (control instanceof HTMLInputElement || control instanceof HTMLButtonElement) {
								control.disabled = selectedFootprint.locked;
							}
						}
						updatePlacementInputs();
						setPlacementStatus(selectedFootprint.locked ? 'Locked footprints cannot be edited.' : '');
						setPersistentState({ selectedFootprintId: selectedFootprint.id });
					}

					function submitFootprintPlacement(x, y, rotation) {
						if (!selectedFootprint || selectedFootprint.locked) {
							return;
						}
						if (![x, y, rotation].every(Number.isFinite)) {
							setPlacementStatus('X, Y, and angle must be valid numbers.', true);
							return;
						}

						selectedFootprint = { ...selectedFootprint, x, y, rotation };
						updatePlacementInputs();
						setPlacementStatus('Applying…');
						captureViewerState();
						vscode.postMessage({
							type: 'editFootprintPlacement',
							id: selectedFootprint.id,
							x,
							y,
							rotation
						});
					}

					function submitPlacementInputs() {
						const x = finiteNumber(placementX?.value);
						const y = finiteNumber(placementY?.value);
						const rotation = finiteNumber(placementRotation?.value);
						if (x === null || y === null || rotation === null) {
							setPlacementStatus('X, Y, and angle must be valid numbers.', true);
							return;
						}
						submitFootprintPlacement(x, y, rotation);
					}

					function rotateSelectedFootprint(delta) {
						if (!selectedFootprint) {
							return;
						}
						submitFootprintPlacement(
							selectedFootprint.x,
							selectedFootprint.y,
							normalizeRotation(selectedFootprint.rotation + delta)
						);
					}

					function nudgeSelectedFootprint(key, multiplier) {
						if (!selectedFootprint) {
							return;
						}
						const grid = finiteNumber(placementGrid?.value);
						if (grid === null || grid <= 0) {
							setPlacementStatus('Grid must be greater than zero.', true);
							return;
						}
						let x = selectedFootprint.x;
						let y = selectedFootprint.y;
						const distance = grid * multiplier;
						if (key === 'ArrowLeft') {
							x -= distance;
						} else if (key === 'ArrowRight') {
							x += distance;
						} else if (key === 'ArrowUp') {
							y -= distance;
						} else if (key === 'ArrowDown') {
							y += distance;
						}
						submitFootprintPlacement(x, y, selectedFootprint.rotation);
					}

					async function setupViewerState() {
						const startedAt = Date.now();
						let viewer = null;
						while (Date.now() - startedAt < 10000) {
							viewer = getViewer();
							if (viewer?.loaded?.isOpen) {
								break;
							}
							await delay(50);
						}
						if (!viewer?.loaded?.isOpen) {
							return;
						}

						if (!restoreViewerState(viewer)) {
							await applyZoomMode('zoom_to_page');
						}
						if (!viewer.board) {
							return;
						}
						viewer.addEventListener('kicanvas:select', event => {
							showSelectedFootprint(event.detail?.item);
						});
						if (savedState.selectedFootprintId) {
							viewer.select?.(savedState.selectedFootprintId);
						}
					}

					function delay(ms) {
						return new Promise(resolve => window.setTimeout(resolve, ms));
					}

					function getViewerApp() {
						return embed?.shadowRoot?.querySelector('kc-board-app, kc-schematic-app') ?? null;
					}

					function getViewer() {
						return getViewerApp()?.viewer ?? null;
					}

					function applyCopperLayerOpacity(layerName, opacity) {
						const viewer = getViewer();
						const layers = viewer?.layers;
						if (!layers) {
							return false;
						}

						let layerFound = false;
						for (const name of [layerName, ':' + layerName + ':Zones']) {
							const layer = layers.by_name?.(name);
							if (layer) {
								layer.opacity = opacity;
								layerFound = true;
							}
						}

						if (layerFound) {
							viewer.draw?.();
						}
						return layerFound;
					}

					function saveCopperOpacity() {
						setPersistentState({
							frontCopperOpacity: copperOpacity.front,
							backCopperOpacity: copperOpacity.back
						});
					}

					function setupCopperOpacityControl(name, side, layerName) {
						const input = document.querySelector('input[name="' + name + '"]');
						const output = input?.parentElement?.querySelector('output');
						if (!(input instanceof HTMLInputElement) || !(output instanceof HTMLOutputElement)) {
							return;
						}

						const update = () => {
							const opacity = normalizeOpacity(input.valueAsNumber);
							copperOpacity[side] = opacity;
							output.value = Math.round(opacity * 100) + '%';
							applyCopperLayerOpacity(layerName, opacity);
							saveCopperOpacity();
						};

						input.value = String(copperOpacity[side]);
						output.value = Math.round(copperOpacity[side] * 100) + '%';
						input.addEventListener('input', update);
					}

					async function applySavedCopperOpacity() {
						const startedAt = Date.now();

						while (Date.now() - startedAt < 10000) {
							const frontApplied = applyCopperLayerOpacity('F.Cu', copperOpacity.front);
							const backApplied = applyCopperLayerOpacity('B.Cu', copperOpacity.back);
							if (frontApplied && backApplied) {
								return;
							}

							await delay(50);
						}
					}

					function getZoomButtons() {
						const toolbar = getViewerApp()?.shadowRoot?.querySelector('kc-viewer-bottom-toolbar');
						return Array.from(toolbar?.shadowRoot?.querySelectorAll(zoomButtonSelector) ?? []);
					}

					function isButtonEnabled(button) {
						return !button.disabled && !button.hasAttribute('disabled');
					}

					async function waitForZoomControls() {
						const startedAt = Date.now();

						while (Date.now() - startedAt < 10000) {
							const buttons = getZoomButtons();
							if (buttons.length > 0) {
								return buttons;
							}

							await delay(50);
						}

						return [];
					}

					function zoomWithViewer(modeName) {
						const viewer = getViewer();
						if (!viewer) {
							return false;
						}

						switch (modeName) {
							case 'zoom_to_page':
								viewer.zoom_to_page?.();
								return true;
							case 'zoom_to_selection':
								viewer.zoom_to_selection?.();
								return true;
							case 'zoom_to_edge_cuts':
								viewer.zoom_to_board?.();
								return true;
							default:
								return false;
						}
					}

					async function applyZoomMode(modeName) {
						const buttons = await waitForZoomControls();
						const button = buttons.find(item => item.name === modeName);

						if (button && isButtonEnabled(button)) {
							button.click();
							currentZoomMode = modeName;
							return;
						}

						if (zoomWithViewer(modeName)) {
							currentZoomMode = modeName;
						}
					}

					async function cycleZoomMode() {
						const buttons = (await waitForZoomControls()).filter(isButtonEnabled);
						const modes = buttons.map(button => button.name);

						if (modes.length === 0) {
							await applyZoomMode('zoom_to_page');
							return;
						}

						const currentIndex = modes.indexOf(currentZoomMode);
						const nextMode = modes[(currentIndex + 1) % modes.length];
						await applyZoomMode(nextMode);
					}

					document.addEventListener('keydown', event => {
						if (!selectedFootprint || selectedFootprint.locked
							|| event.ctrlKey || event.altKey || event.metaKey) {
							return;
						}
						const target = event.target;
						if (target instanceof HTMLElement && target.closest('input, textarea, select, button')) {
							return;
						}

						if (event.code === 'KeyR') {
							event.preventDefault();
							rotateSelectedFootprint(90);
							return;
						}
						if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
							event.preventDefault();
							nudgeSelectedFootprint(event.key, event.shiftKey ? 10 : 1);
						}
					});

					document.addEventListener('keydown', event => {
						if (event.code !== 'Space' || event.ctrlKey || event.altKey || event.metaKey) {
							return;
						}

						const target = event.target;
						if (target instanceof HTMLElement && target.closest('input, textarea, select, button')) {
							return;
						}

						event.preventDefault();
						void cycleZoomMode();
					});

					setupCopperOpacityControl('front-copper-opacity', 'front', 'F.Cu');
					setupCopperOpacityControl('back-copper-opacity', 'back', 'B.Cu');
					void applySavedCopperOpacity();
					void setupViewerState();
				</script>
			</body>
			</html>`;
    }
}
function activate(context) {
    const provider = new PreViewProvider(context);
    context.subscriptions.push(vscode__WEBPACK_IMPORTED_MODULE_0__.window.registerCustomEditorProvider('kilens.preview', provider, { webviewOptions: { retainContextWhenHidden: true } }), vscode__WEBPACK_IMPORTED_MODULE_0__.commands.registerCommand('kilens.refresh', () => provider.refresh()));
}
function deactivate() { }

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=extension.js.map