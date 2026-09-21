import * as vscode from 'vscode';
import { createFootprintPlacementReplacement } from './kicadPcbEditor';
import { getWebviewContent } from './previewContent';

class PreviewProvider implements vscode.CustomTextEditorProvider {
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
			webviewPanel.webview.html = getWebviewContent(this.context.extensionUri, document, webviewPanel);
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
		vscode.commands.registerCommand('kilens.refresh', () => provider.refresh())
	);
}
