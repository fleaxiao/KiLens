import * as vscode from 'vscode';

class PreViewProvider implements vscode.CustomTextEditorProvider {
	private readonly refreshCallbacks = new Set<() => void>();

	constructor(private readonly context: vscode.ExtensionContext) { }

	public refresh(): void {
		this.refreshCallbacks.forEach(refresh => refresh());
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		webviewPanel.webview.options = {
			enableScripts: true,
			enableCommandUris: true,
			localResourceRoots: [
				this.context.extensionUri,
				vscode.Uri.joinPath(vscode.Uri.file(document.uri.fsPath), '..')
			]
		};

		const updateWebview = () => {
			webviewPanel.webview.html = this.getWebviewContent(document, webviewPanel, Date.now());
		};

		this.refreshCallbacks.add(updateWebview);
		updateWebview();

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		const messageSubscription = webviewPanel.webview.onDidReceiveMessage(message => {
			if (message?.type === 'refresh') {
				updateWebview();
			}
		});

		webviewPanel.onDidDispose(() => {
			changeDocumentSubscription.dispose();
			messageSubscription.dispose();
			this.refreshCallbacks.delete(updateWebview);
		});
	}

	private getWebviewContent(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		cacheBust: number
	): string {
		const scriptUri = webviewPanel.webview.asWebviewUri(
			vscode.Uri.joinPath(this.context.extensionUri, 'media', 'kicanvas.js')
		).with({ query: 'v=kicanvas-rounded-gr-rect-v2' });

		const fileUri = webviewPanel.webview.asWebviewUri(document.uri).with({ query: `v=${cacheBust}` });
		
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
				</style>
			</head>
			<body>
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
				<kicanvas-embed src="${fileUri}" theme="kicad" controls="basic" controlslist="nooverlay"></kicanvas-embed>
				<script>
					const vscode = acquireVsCodeApi();
					const embed = document.querySelector('kicanvas-embed');
					const zoomButtonSelector = 'kc-ui-button[name^="zoom_to_"]';
					const savedState = vscode.getState() ?? {};
					const copperOpacity = {
						front: normalizeOpacity(savedState.frontCopperOpacity),
						back: normalizeOpacity(savedState.backCopperOpacity)
					};
					let currentZoomMode = 'zoom_to_page';

					document.querySelector('.refresh-button')?.addEventListener('click', () => {
						vscode.postMessage({ type: 'refresh' });
					});

					function normalizeOpacity(value) {
						const numericValue = Number(value);
						return Number.isFinite(numericValue)
							? Math.min(1, Math.max(0, numericValue))
							: 0.75;
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
						vscode.setState({
							...savedState,
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
					void applyZoomMode('zoom_to_page');
				</script>
			</body>
			</html>`;
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new PreViewProvider(context);

	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			'kilens.preview',
			provider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		),
		vscode.commands.registerCommand('kilens.refresh', () => provider.refresh())
	);
}

export function deactivate() { }
