import * as vscode from 'vscode';
import { normalizePreviewNets } from './kicadPcbEditor';

export function getWebviewContent(
	extensionUri: vscode.Uri,
	document: vscode.TextDocument,
	webviewPanel: vscode.WebviewPanel
): string {
	const documentPath = document.uri.path.toLowerCase();
	const isSchematic = documentPath.endsWith('.kicad_sch');
	const scriptUri = webviewPanel.webview.asWebviewUri(
		vscode.Uri.joinPath(extensionUri, 'media', 'kicanvas.js')
	).with({ query: 'v=kicanvas-silktext-v1' });

	const previewText = documentPath.endsWith('.kicad_pcb')
		? normalizePreviewNets(document.getText()) : document.getText();
	const documentSource = previewText
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
			<link rel="stylesheet" href="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'theme.css')).with({ query: 'v=12' })}">
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
				<div class="placement-status" role="status"></div>
			</form>
			${isSchematic ? '' : `<button class="refresh-button net-toolbar-button" type="button" title="Net" aria-label="Net" aria-expanded="false" aria-controls="net-panel">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M5 12h6M18 5h-7v14h7"></path>
					<circle cx="3" cy="12" r="2"></circle>
					<circle cx="20" cy="5" r="2"></circle>
					<circle cx="20" cy="19" r="2"></circle>
					<circle cx="11" cy="12" r="1.6" fill="currentColor" stroke="none"></circle>
				</svg>
			</button>
			<div id="net-panel" class="pcb-display-controls" aria-label="Net visibility" hidden>
			</div>`}
			<button class="refresh-button" type="button" title="Refresh Preview" aria-label="Refresh Preview">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M20 11a8 8 0 1 0-2.34 5.66"></path>
					<path d="M20 4v7h-7"></path>
				</svg>
			</button>
			<button class="refresh-button export-image-button" type="button" title="Export image (PNG)" aria-label="Export image">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<rect x="3" y="3" width="18" height="18" rx="2"></rect>
					<path d="m3 17 6-6 4 4 3-3 5 5"></path>
					<circle cx="8" cy="8" r="1.5"></circle>
				</svg>
			</button>
			<div class="export-image-status" role="status" hidden></div>
			<button class="refresh-button cycle-view-button" type="button" title="Switch view (Space)" aria-label="Switch view" aria-keyshortcuts="Space" disabled>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M8 7V3h13v13h-4"></path>
					<rect x="3" y="7" width="14" height="14" rx="2"></rect>
					<path d="M6 14h8m-3-3 3 3-3 3"></path>
				</svg>
			</button>
			${isSchematic ? '' : `<button class="refresh-button copper-toolbar-button" type="button" title="铜层交替：F.Cu / B.Cu" aria-label="铜层交替" aria-pressed="false" disabled>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M4 5h16M4 19h16M9 15V9l-2 2m2-2 2 2M15 9v6l-2-2m2 2 2-2"></path>
				</svg>
			</button>`}
			${isSchematic ? '' : `<button class="refresh-button three-toolbar-button" type="button" title="3D Preview (Alt+3)" aria-label="3D Preview" aria-keyshortcuts="Alt+3" aria-pressed="false">3D</button>
			<section class="three-panel" aria-label="3D PCB preview" hidden>
				<div class="three-viewport"></div>
				<div class="three-controls">
					<button type="button" data-three-view="iso">Fit</button>
					<button type="button" data-three-view="top">Top</button>
					<button type="button" data-three-view="bottom">Bottom</button>
					<label><input type="checkbox" name="three-models" checked> Components</label>
					<label><input type="checkbox" name="three-silkscreen" checked> Silkscreen</label>
					<label title="Soft shadows, environment reflections and ambient occlusion without a sampling wait"><input type="checkbox" name="three-render"> Enhanced rendering</label>
				</div>
				<button type="button" class="refresh-button three-close" title="Back to 2D (Alt+2 / Esc)" aria-label="2D" aria-keyshortcuts="Alt+2 Escape">2D</button>
				<div class="three-message"><div class="three-status" role="status">Loading 3D preview…</div>
					<div class="three-render-status" hidden></div>
				<pre class="three-details" hidden></pre>
				</div>
			</section>
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'preview3d-controls.js')).with({ query: 'v=enhanced-3' })}"></script>`}
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'export-image.js')).with({ query: 'v=3' })}"></script>
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'connectivity.js')).with({ query: 'v=5' })}"></script>
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'ratsnest.js')).with({ query: 'v=9' })}"></script>
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'selection.js')).with({ query: 'v=6' })}"></script>
			<script type="module" src="${scriptUri}"></script>
			<kicanvas-embed theme="kicad" controls="basic" controlslist="nooverlay noflipview nodownload">
				<kicanvas-source name="${documentName}">${documentSource}</kicanvas-source>
			</kicanvas-embed>
			<script>
				const vscode = acquireVsCodeApi();
				const embed = document.querySelector('kicanvas-embed');
				const zoomButtonSelector = 'kc-ui-button[name^="zoom_to_"]';
				const isSchematicDocument = ${isSchematic};
				let savedState = vscode.getState() ?? {};
				let currentZoomMode = isSchematicDocument
					? 'zoom_to_schematic'
					: 'zoom_to_page';
				let selectedFootprint = null;

				const placementEditor = document.querySelector('.placement-editor');
				const placementTitle = placementEditor?.querySelector('.placement-editor-title');
				const placementStatus = placementEditor?.querySelector('.placement-status');
				const placementX = placementEditor?.querySelector('input[name="placement-x"]');
				const placementY = placementEditor?.querySelector('input[name="placement-y"]');
				const placementRotation = placementEditor?.querySelector('input[name="placement-rotation"]');
				const placementButtons = Array.from(placementEditor?.querySelectorAll('button') ?? []);

				document.querySelector('.refresh-button[aria-label="Refresh Preview"]')?.addEventListener('click', () => {
					vscode.postMessage({ type: 'refresh' });
				});
				const netButton = document.querySelector('.net-toolbar-button');
				const netPanel = document.querySelector('#net-panel');
				function setNetPanelOpen(open) {
					if (!netPanel || !netButton) return;
					netPanel.hidden = !open;
					netButton.setAttribute('aria-expanded', String(open));
				}
				netButton?.addEventListener('click', () => setNetPanelOpen(netPanel.hidden));
				document.addEventListener('pointerdown', event => {
					if (!event.composedPath().includes(netButton) && !event.composedPath().includes(netPanel)) setNetPanelOpen(false);
				});
				document.addEventListener('keydown', event => {
					if (event.key === 'Escape' && netPanel && !netPanel.hidden) {
						setNetPanelOpen(false);
						netButton.focus();
					}
				});

				placementEditor?.addEventListener('submit', event => {
					event.preventDefault();
					submitPlacementInputs();
				});
				window.addEventListener('message', event => {
					if (event.data?.type === 'footprintPlacementError') {
						setPlacementStatus(event.data.message ?? 'Unable to edit footprint.', true);
					}
				});

				function setPersistentState(patch) {
					savedState = { ...savedState, ...patch };
					vscode.setState(savedState);
				}

				const threeControls = isSchematicDocument ? null : KiLens3DControls.install({
					vscode, savedState, persist: setPersistentState,
					bundleUrl: '${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', '3d', 'preview3d.js'))}',
					workerUrl: '${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', '3d', 'step-worker.js'))}',
					wasmUrl: '${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', '3d', 'occt-import-js.wasm'))}'
				});

				KiLensImageExport.install({ vscode, capture: mode => mode === '3d'
					? threeControls.captureImage() : KiLensImageExport.capture2d(getViewer()) });

				function setupCopperOrder(viewer) {
					const button = document.querySelector('.copper-toolbar-button');
					if (!button) return;
					let swapped = savedState.copperOrderSwapped === true;
					function wrapLayers(layers) {
						const original = layers.in_display_order;
						layers.in_display_order = function* () {
							const ordered = [...original.call(this)];
							if (swapped) {
								for (const [front, back] of [
									['F.Cu', 'B.Cu'],
									[':F.Cu:Zones', ':B.Cu:Zones'],
									[':Pads:Front', ':Pads:Back'],
									[':Pads:Front:NetName', ':Pads:Back:NetName']
								]) {
									const a = ordered.findIndex(layer => layer.name === front);
									const b = ordered.findIndex(layer => layer.name === back);
									if (a >= 0 && b >= 0) [ordered[a], ordered[b]] = [ordered[b], ordered[a]];
								}
							}
							// Layer-specific via graphics were interleaved with copper and
							// covered by SMD pads. Draw every visible annulus above pads,
							// followed by every drill, so another side's ring cannot fill it.
							const viaWalls = ordered.filter(layer => /:(?:BBViaHoleWalls|Via:HoleWalls)$/.test(layer.name));
							const viaHoles = ordered.filter(layer => /:(?:BBViaHoles|Via:Holes)$/.test(layer.name));
							const vias = new Set([...viaWalls, ...viaHoles]);
							yield* ordered.filter(layer => !vias.has(layer) && layer !== this.overlay);
							const padSelected = ['Pad', 'Footprint'].includes(viewer.selected?.context?.constructor?.name);
							if (padSelected) yield this.overlay;
							yield* viaWalls;
							yield* viaHoles;
							if (!padSelected) yield this.overlay;
						};
						return layers;
					}
					const createLayers = viewer.create_layer_set;
					viewer.create_layer_set = function (...args) {
						return wrapLayers(createLayers.apply(this, args));
					};
					wrapLayers(viewer.layers);
					function update() {
						button.setAttribute('aria-pressed', String(swapped));
						button.title = '铜层交替：' + (swapped ? 'B.Cu' : 'F.Cu') + ' 在上，点击互换';
						viewer.draw();
					}
					button.disabled = false;
					button.addEventListener('click', () => {
						swapped = !swapped;
						setPersistentState({ copperOrderSwapped: swapped });
						update();
					});
					update();
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
					const id = item?.constructor?.name === 'Footprint' ? (item.unique_id ?? item.uuid ?? item.tstamp) : null;
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
					submitFootprintPlacement(
						Number(placementX?.value),
						Number(placementY?.value),
						Number(placementRotation?.value)
					);
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

					await setupSchematicZoomControl();
					await setupCycleViewControl();
					if (!restoreViewerState(viewer)) {
						await applyZoomMode(isSchematicDocument
							? 'zoom_to_schematic'
							: 'zoom_to_page');
					}
					if (!viewer.board) {
						return;
					}
					setupCopperOrder(viewer);
					KiLensRatsnest.install(viewer, savedState.ratsnestVisible !== false,
						visible => setPersistentState({ ratsnestVisible: visible }), {
							container: document.querySelector('.pcb-display-controls'),
							hiddenNets: savedState.hiddenNets,
							persistHiddenNets: names => setPersistentState({ hiddenNets: names })
						});
					viewer.addEventListener('kicanvas:select', event => {
						showSelectedFootprint(event.detail?.item);
					});
					KiLensSelection.install(viewer, savedState.selectionFilter,
						selectionFilter => setPersistentState({ selectionFilter }));
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

				function zoomSchematicToContents() {
					const viewer = getViewer();
					const camera = viewer?.viewport?.camera;
					if (!viewer?.schematic || !camera) {
						return false;
					}

					const contentLayerNames = [
						':Marks',
						':Symbol:Field',
						':Label',
						':Junction',
						':Wire',
						':Symbol:Foreground',
						':Notes',
						':Bitmap',
						':Symbol:Pin',
						':Symbol:Background'
					];
					const bounds = contentLayerNames
						.map(name => viewer.layers?.by_name?.(name)?.bbox)
						.filter(bbox => bbox?.valid);
					if (bounds.length === 0) {
						viewer.zoom_to_page?.();
						return true;
					}

					const left = Math.min(...bounds.map(bbox => bbox.x));
					const top = Math.min(...bounds.map(bbox => bbox.y));
					const right = Math.max(...bounds.map(bbox => bbox.x2));
					const bottom = Math.max(...bounds.map(bbox => bbox.y2));
					const contentBounds = bounds[0].copy();
					contentBounds.x = left;
					contentBounds.y = top;
					contentBounds.w = right - left;
					contentBounds.h = bottom - top;
					const padding = Math.max(contentBounds.w, contentBounds.h) * 0.08;
					camera.bbox = contentBounds.grow(Math.max(padding, 5));
					viewer.draw?.();
					return true;
				}

				async function setupSchematicZoomControl() {
					if (!isSchematicDocument) {
						return;
					}
					const buttons = await waitForZoomControls();
					const schematicButton = buttons.find(
						button => button.name === 'zoom_to_edge_cuts'
					);
					if (!schematicButton) {
						return;
					}
					schematicButton.name = 'zoom_to_schematic';
					schematicButton.title = 'zoom to schematic';
					// The bundled button's icon attribute callback uses a stale selector.
					const schematicIcon = schematicButton.shadowRoot?.querySelector('kc-ui-icon');
					if (schematicIcon) schematicIcon.textContent = 'svg:schematic_file';
					schematicButton.disabled = false;
					schematicButton.removeAttribute('disabled');
					schematicButton.addEventListener('click', event => {
						event.preventDefault();
						event.stopImmediatePropagation();
						zoomSchematicToContents();
						currentZoomMode = 'zoom_to_schematic';
					}, { capture: true });
				}

				function updateCycleViewControl() {
					const names = { zoom_to_page: 'Page', zoom_to_edge_cuts: 'Board', zoom_to_selection: 'Selection', zoom_to_schematic: 'Schematic' };
					const button = document.querySelector('.cycle-view-button');
					button.title = 'Switch view (Space) · Current: ' + names[currentZoomMode];
					button.dataset.view = currentZoomMode;
				}

				async function setupCycleViewControl() {
					const buttons = await waitForZoomControls();
					for (const button of buttons) {
						button.style.setProperty('display', 'none', 'important');
						button.setAttribute('aria-hidden', 'true');
					}
					const control = document.querySelector('.cycle-view-button');
					control.disabled = false;
					control.addEventListener('click', () => void cycleZoomMode());
					updateCycleViewControl();
				}

				function zoomWithViewer(modeName) {
					const viewer = getViewer();
					if (!viewer) {
						return false;
					}

					switch (modeName) {
						case 'zoom_to_schematic':
							return zoomSchematicToContents();
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
						updateCycleViewControl();
						return;
					}

					if (zoomWithViewer(modeName)) {
						currentZoomMode = modeName;
						updateCycleViewControl();
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
					if (event.ctrlKey || event.altKey || event.metaKey) {
						return;
					}
					if (document.body.classList.contains('three-active')) return;
					if (event.composedPath().some(target => target instanceof HTMLElement
						&& (target.matches('input, textarea, select, button') || target.isContentEditable))) {
						return;
					}
					if (event.code === 'Space' || event.key === ' ') {
						event.preventDefault();
						void cycleZoomMode();
						return;
					}
					if (!selectedFootprint || selectedFootprint.locked) {
						return;
					}
					if (event.code === 'KeyR') {
						event.preventDefault();
						rotateSelectedFootprint(90);
					}
				});

				void setupViewerState();
			</script>
		</body>
		</html>`;
}
