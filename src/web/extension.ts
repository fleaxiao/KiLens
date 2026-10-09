import * as vscode from 'vscode';
import { createFootprintPlacementReplacement } from './kicadPcbEditor';
import { getWebviewContent } from './previewContent';
import { readModel } from './modelResolver';
import { exportPreviewImage } from './exportImage';

class PreviewProvider implements vscode.CustomTextEditorProvider {
	private readonly refreshCallbacks = new Set<() => void>();
	private readonly pcbPanels = new Set<vscode.WebviewPanel>();

	constructor(private readonly context: vscode.ExtensionContext) { }

	public refresh(): void {
		this.refreshCallbacks.forEach(refresh => refresh());
	}

	public setPreviewMode(mode: '2d' | '3d'): void {
		for (const panel of this.pcbPanels) {
			if (panel.active) void panel.webview.postMessage({ type: 'setPreviewMode', mode });
		}
	}

	public async resolveCustomTextEditor(
		document: vscode.TextDocument,
		webviewPanel: vscode.WebviewPanel,
		_token: vscode.CancellationToken
	): Promise<void> {
		if (document.uri.path.toLowerCase().endsWith('.kicad_pcb')) this.pcbPanels.add(webviewPanel);
		webviewPanel.webview.options = {
			enableScripts: true,
			enableCommandUris: true,
			localResourceRoots: [
				this.context.extensionUri,
				vscode.Uri.joinPath(vscode.Uri.file(document.uri.fsPath), '..')
			]
		};

		const updateWebview = () => {
			webviewPanel.webview.html = getWebviewContent(this.context.extensionUri, document, webviewPanel);
		};

		this.refreshCallbacks.add(updateWebview);
		updateWebview();

		const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(e => {
			if (e.document.uri.toString() === document.uri.toString()) {
				updateWebview();
			}
		});

		let exportingImage = false;
		const messageSubscription = webviewPanel.webview.onDidReceiveMessage(message => {
			if (message?.type === 'exportPreviewImage' && typeof message.requestId === 'string') {
				if (exportingImage) {
					void webviewPanel.webview.postMessage({ type: 'exportPreviewImageResult', requestId: message.requestId, error: 'Please finish the open image save dialog first.' });
					return;
				}
				exportingImage = true;
				void exportPreviewImage(document.uri, message).then(
					result => webviewPanel.webview.postMessage({ type: 'exportPreviewImageResult', requestId: message.requestId, ...result }),
					error => webviewPanel.webview.postMessage({ type: 'exportPreviewImageResult', requestId: message.requestId, error: String(error.message ?? error) })
				).finally(() => { exportingImage = false; });
				return;
			}
			if (message?.type === 'load3dModel' && Number.isInteger(message.index) && typeof message.requestId === 'string') {
				const requestId = message.requestId;
				void readModel(document, message.index).then(
					result => webviewPanel.webview.postMessage({ type: 'model3dResult', requestId, ...result }),
					error => webviewPanel.webview.postMessage({ type: 'model3dResult', requestId, error: String(error.message ?? error) })
				);
			} else if (message?.type === 'refresh') {
				updateWebview();
			} else if (message?.type === 'editFootprintPlacement') {
				void this.editFootprintPlacement(document, message).catch(error => {
					const detail = error instanceof Error ? error.message : String(error);
					void vscode.window.showErrorMessage(`Unable to move footprint: ${detail}`);
					void webviewPanel.webview.postMessage({
						type: 'footprintPlacementError',
						message: detail
					});
				});
			}
		});

		webviewPanel.onDidDispose(() => {
			this.pcbPanels.delete(webviewPanel);
			changeDocumentSubscription.dispose();
			messageSubscription.dispose();
			this.refreshCallbacks.delete(updateWebview);
		});
	}

	private async editFootprintPlacement(
		document: vscode.TextDocument,
		message: {
			id?: unknown;
			x?: unknown;
			y?: unknown;
			rotation?: unknown;
		}
	): Promise<void> {
		if (!document.uri.path.toLowerCase().endsWith('.kicad_pcb')) {
			throw new Error('Placement editing is currently available only for PCB footprints.');
		}

		const placement = {
			id: typeof message.id === 'string' ? message.id : '',
			x: Number(message.x),
			y: Number(message.y),
			rotation: Number(message.rotation)
		};
		const replacement = createFootprintPlacementReplacement(document.getText(), placement);
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			document.uri,
			new vscode.Range(
				document.positionAt(replacement.start),
				document.positionAt(replacement.end)
			),
			replacement.text
		);

		if (!await vscode.workspace.applyEdit(edit)) {
			throw new Error('VS Code rejected the document edit.');
		}
	}
}

export function activate(context: vscode.ExtensionContext) {
	const provider = new PreviewProvider(context);

	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			'kilens.preview',
			provider,
			{ webviewOptions: { retainContextWhenHidden: true } }
		),
		vscode.commands.registerCommand('kilens.refresh', () => provider.refresh()),
		vscode.commands.registerCommand('kilens.show2d', () => provider.setPreviewMode('2d')),
		vscode.commands.registerCommand('kilens.show3d', () => provider.setPreviewMode('3d'))
	);
}
