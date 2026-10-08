import * as vscode from 'vscode';

/** The webview supplies pixels; only the save dialog chooses the destination. */
export async function exportPreviewImage(source: vscode.Uri, message: { mode?: unknown; dataUrl?: unknown }): Promise<{ cancelled: boolean }> {
    const { mode, dataUrl } = message;
    const prefix = 'data:image/png;base64,';
    if ((mode !== '2d' && mode !== '3d') || typeof dataUrl !== 'string' || !dataUrl.startsWith(prefix)
        || dataUrl.length > 64 * 1024 * 1024) throw new Error('Invalid PNG image or image too large.');
    const bytes = Uint8Array.from(atob(dataUrl.slice(prefix.length)), character => character.charCodeAt(0));
    if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
        throw new Error('Invalid PNG image.');
    }
    const filename = (source.path.split('/').pop() || 'preview').replace(/\.[^.]+$/, '') + '.png';
    const destination = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.joinPath(source, '..', filename),
        filters: { 'PNG image': ['png'] }, saveLabel: 'Export image', title: 'Export current view as image'
    });
    if (!destination) return { cancelled: true };
    await vscode.workspace.fs.writeFile(destination, bytes);
    return { cancelled: false };
}
