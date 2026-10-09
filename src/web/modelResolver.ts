import * as vscode from 'vscode';
import { modelReferences } from './board3dData';

const maximumBytes = 40 * 1024 * 1024;
const referenceCache = new WeakMap<vscode.TextDocument, { version: number; references: ReturnType<typeof modelReferences> }>();
let windowsLibraries: { expires: number; result: Promise<vscode.Uri[]> } | undefined;
type NativeDiscovery = (reference: string, includeInstallations?: boolean) => Promise<{ variables: Record<string, string>; roots: string[] }>;
let nativeDiscovery: NativeDiscovery | undefined;
export function setNativeModelDiscovery(discovery: NativeDiscovery): void { nativeDiscovery = discovery; }

/** Probe only standard installation folders, never recursively scan drives. */
async function discoverWindowsLibraries(document: vscode.TextDocument): Promise<vscode.Uri[]> {
    if (!vscode.workspace.isTrusted || document.uri.scheme !== 'file' || !/^\/[a-z]:/i.test(document.uri.path)) return [];
    if (windowsLibraries && windowsLibraries.expires > Date.now()) return windowsLibraries.result;
    const result = (async () => {
        const drives = Array.from({ length: 24 }, (_, i) => String.fromCharCode(67 + i));
        const installations = (await Promise.all(drives.map(async drive => {
            const root = vscode.Uri.file(`${drive}:/`);
            try { await vscode.workspace.fs.stat(root); } catch { return []; }
            return (await Promise.all(['KiCad', 'Program Files/KiCad', 'Program Files (x86)/KiCad'].map(async folder => {
                const base = vscode.Uri.joinPath(root, folder);
                try {
                    const entries = await vscode.workspace.fs.readDirectory(base);
                    const versions = entries.filter(([name, type]) => (type & vscode.FileType.Directory) !== 0 && /^\d+\.\d+(?:\.\d+)?$/.test(name))
                        .map(([name]) => name).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
                    return [...versions.map(version => vscode.Uri.joinPath(base, version, 'share/kicad/3dmodels')),
                        vscode.Uri.joinPath(base, 'share/kicad/3dmodels')];
                } catch { return []; }
            }))).flat();
        }))).flat();
        return (await Promise.all(installations.map(async uri => {
            try { return ((await vscode.workspace.fs.stat(uri)).type & vscode.FileType.Directory) !== 0 ? [uri] : []; }
            catch { return []; }
        }))).flat();
    })();
    windowsLibraries = { expires: Date.now() + 30000, result };
    return result;
}
function pathUri(path: string): vscode.Uri {
    return /^[a-z][a-z\d+.-]*:\/\//i.test(path) ? vscode.Uri.parse(path) : vscode.Uri.file(path);
}
function inside(uri: vscode.Uri, root: vscode.Uri): boolean {
    const normalize = (p: string) => uri.scheme === 'file' && /^\/[a-z]:/i.test(uri.path) ? p.toLowerCase() : p;
    const path = normalize(uri.path), base = normalize(root.path).replace(/\/$/, '');
    return uri.scheme === root.scheme && uri.authority === root.authority && (path === base || path.startsWith(base + '/'));
}
export async function readModel(document: vscode.TextDocument, index: number) {
    let cached = referenceCache.get(document);
    if (!cached || cached.version !== document.version) {
        cached = { version: document.version, references: modelReferences(document.getText()) };
        referenceCache.set(document, cached);
    }
    const reference = cached.references[index];
    if (!reference) throw new Error('The referenced model no longer exists. Refresh the preview.');
    const directory = vscode.Uri.joinPath(document.uri, '..');
    const config = vscode.workspace.getConfiguration('kilens', document.uri);
    const configuredVariables = config.get<Record<string, string>>('modelPathVariables', {});
    const configured = config.get<string[]>('modelSearchPaths', []).map(pathUri);
    const project = vscode.workspace.getWorkspaceFolder(document.uri)?.uri ?? directory;
    const originalPath = reference.path.replace(/\\/g, '/');
    if (!/\.(step|stp|wrl)$/i.test(originalPath)) throw new Error('Only STEP, STP and VRML 2.0 (.wrl) models are supported.');
    const library = originalPath.match(/^\$\{(KICAD\d*_3DMODEL_DIR|KISYS3DMOD)\}\/(.*)$/);
    const tried = new Set<string>();
    const denied = new Set<string>();
    let unresolved = false;

    async function search(roots: vscode.Uri[], nativeVariables: Record<string, string> = {}, deferUnresolvedExplicit = false) {
        const variables = { ...nativeVariables, ...configuredVariables };
        for (const key of Object.keys(variables)) {
            for (let i = 0; i < 8; i++) {
                const next = variables[key].replace(/\$\{([^}]+)\}/g, (all, name: string) => variables[name] || all);
                if (next === variables[key]) break;
                variables[key] = next;
            }
        }
        const resolvedPath = originalPath.replace(/\$\{([^}]+)\}/g, (all, name: string) =>
            name === 'KIPRJMOD' ? directory.toString() : variables[name] || all);
        unresolved = resolvedPath.includes('${');
        const candidates: vscode.Uri[] = [];
        if (library) {
            // Explicit variables may depend on native variables. Resolve those
            // before trying lower-priority configured search directories.
            if (deferUnresolvedExplicit && configuredVariables[library[1]] && unresolved) return;
            const resolved = !unresolved ? pathUri(resolvedPath) : undefined;
            if (resolved && configuredVariables[library[1]]) candidates.push(resolved);
            candidates.push(...configured.map(root => vscode.Uri.joinPath(root, library[2])));
            if (resolved && !configuredVariables[library[1]]) candidates.push(resolved);
            candidates.push(...roots.map(root => vscode.Uri.joinPath(root, library[2])));
        } else if (unresolved) return;
        else if (/^(?:[a-z]:\/|\/|[a-z][a-z\d+.-]*:\/\/)/i.test(resolvedPath)) candidates.push(pathUri(resolvedPath));
        else {
            candidates.push(vscode.Uri.joinPath(directory, resolvedPath));
            candidates.push(...roots.map(root => vscode.Uri.joinPath(root, resolvedPath)));
        }
        const allowedRoots = [project, directory];
        if (vscode.workspace.isTrusted) allowedRoots.push(...roots, ...Object.values(variables).filter(Boolean).map(pathUri));
        for (const uri of candidates) {
            const key = uri.toString();
            if (!allowedRoots.some(root => inside(uri, root))) { denied.add(key); continue; }
            denied.delete(key);
            if (tried.has(key)) continue;
            tried.add(key);
            let stat: vscode.FileStat;
            try { stat = await vscode.workspace.fs.stat(uri); } catch { continue; }
            if (stat.type !== vscode.FileType.File) continue;
            if (stat.size > maximumBytes) throw new Error('Model exceeds the 40 MB preview limit.');
            const bytes = await vscode.workspace.fs.readFile(uri);
            if (bytes.byteLength > maximumBytes) throw new Error('Model exceeds the 40 MB preview limit.');
            return { bytes: Array.from(bytes), format: /\.wrl$/i.test(uri.path) ? 'wrl' : 'step' };
        }
    }

    // Explicit paths should not wait for OS settings, registry queries or drive scans.
    let result = await search(configured, {}, true);
    if (result) return result;
    const discoveryReference = reference.path + '\n' + Object.values(configuredVariables).join('\n');
    const discover = (installations: boolean) => vscode.workspace.isTrusted && nativeDiscovery
        ? nativeDiscovery(discoveryReference, installations).catch(() => ({ variables: {}, roots: [] }))
        : Promise.resolve({ variables: {}, roots: [] });
    const native = await discover(false);
    result = await search([...configured, ...native.roots.map(pathUri)], native.variables);
    if (result) return result;
    if (unresolved && !library) throw new Error(`Unresolved path variable in ${reference.path}. Configure kilens.modelPathVariables.`);

    const installations = await discover(true);
    result = await search([...configured, ...installations.roots.map(pathUri)], installations.variables);
    if (result) return result;
    const defaults = [
        ...['10.0', '9.0', '8.0', '7.0'].map(v => vscode.Uri.file(`C:/Program Files/KiCad/${v}/share/kicad/3dmodels`)),
        vscode.Uri.file('/usr/share/kicad/3dmodels'), vscode.Uri.file('/usr/local/share/kicad/3dmodels'),
        vscode.Uri.file('/Library/Application Support/kicad/3dmodels'),
        vscode.Uri.file('/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels')
    ];
    const discovered = await discoverWindowsLibraries(document);
    const requestedVersion = reference.path.match(/\$\{KICAD(\d+)_3DMODEL_DIR\}/)?.[1];
    const matchesVersion = (uri: vscode.Uri) => requestedVersion && uri.path.includes(`/${requestedVersion}.0/`) ? 1 : 0;
    result = await search([...configured, ...installations.roots.map(pathUri),
        ...[...discovered, ...defaults].sort((a, b) => matchesVersion(b) - matchesVersion(a))], installations.variables);
    if (result) return result;
    throw new Error(denied.size
        ? 'Model is outside the allowed folders. Trust this workspace and add its folder to kilens.modelSearchPaths.'
        : 'Model file not found in the configured or detected libraries. Install the KiCad 3D model library, or configure kilens.modelSearchPaths in VS Code settings.');
}
