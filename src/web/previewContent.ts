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
	).with({ query: 'v=kicanvas-cleanup-v1' });

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
			<link rel="stylesheet" href="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'theme.css')).with({ query: 'v=3' })}">
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
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'connectivity.js')).with({ query: 'v=5' })}"></script>
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'ratsnest.js')).with({ query: 'v=9' })}"></script>
			<script src="${webviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'selection.js')).with({ query: 'v=5' })}"></script>
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

				document.querySelector('.refresh-button:not(.net-toolbar-button)')?.addEventListener('click', () => {
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
					if (!restoreViewerState(viewer)) {
						await applyZoomMode(isSchematicDocument
							? 'zoom_to_schematic'
							: 'zoom_to_page');
					}
					if (!viewer.board) {
						return;
					}
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
					schematicButton.setAttribute('icon', 'svg:schematic_file');
					schematicButton.disabled = false;
					schematicButton.removeAttribute('disabled');
					schematicButton.addEventListener('click', event => {
						event.preventDefault();
						event.stopImmediatePropagation();
						zoomSchematicToContents();
						currentZoomMode = 'zoom_to_schematic';
					}, { capture: true });
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
					if (event.ctrlKey || event.altKey || event.metaKey) {
						return;
					}
					const target = event.target;
					if (target instanceof HTMLElement && target.closest('input, textarea, select, button')) {
						return;
					}
					if (event.code === 'Space') {
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
