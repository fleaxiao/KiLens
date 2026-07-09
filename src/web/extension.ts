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
		).with({ query: 'v=kicanvas-zoom-edge-cuts-icon' });

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
				</style>
			</head>
			<body>
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
					document.querySelector('.refresh-button')?.addEventListener('click', () => {
						vscode.postMessage({ type: 'refresh' });
					});
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
