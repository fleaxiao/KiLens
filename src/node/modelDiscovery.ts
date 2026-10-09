import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const modelVariable = /^(?:KICAD\d*_3DMODEL_DIR|KISYS3DMOD)$/;
export interface DiscoveryHost {
    platform: string; home: string; env: Record<string, string | undefined>;
    readText(path: string): Promise<string>;
    directories(path: string): Promise<string[]>;
    registryInstallations(): Promise<string[]>;
}
const host: DiscoveryHost = {
    platform: process.platform, home: os.homedir(), env: process.env,
    readText: file => fs.readFile(file, 'utf8'),
    directories: async folder => (await fs.readdir(folder, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name),
    registryInstallations: async () => {
        if (process.platform !== 'win32') return [];
        const query = async (args: string[]) => {
            try { return (await run('reg.exe', ['query', ...args], { windowsHide: true, timeout: 5000, maxBuffer: 2 * 1024 * 1024 })).stdout; }
            catch { return ''; }
        };
        const uninstallKeys = [
            'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
            'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
            'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
        ];
        const matches = await Promise.all(uninstallKeys.map(key => query([key, '/s', '/f', 'KiCad', '/d'])));
        const keys = [...new Set(matches.flatMap(text => text.match(/^HKEY[^\r\n]+/gm) ?? []))];
        const entries = await Promise.all(keys.map(key => query([key])));
        return entries.flatMap(text => {
            if (!/^\s*DisplayName\s+REG_\w+\s+.*KiCad/im.test(text)) return [];
            const location = text.match(/^\s*InstallLocation\s+REG_\w+\s+(.+)$/im)?.[1]?.trim();
            if (location) return [location];
            const icon = text.match(/^\s*DisplayIcon\s+REG_\w+\s+(.+)$/im)?.[1]?.trim().replace(/,\d+$/, '').replace(/^"|"$/g, '');
            return icon ? [path.dirname(path.dirname(icon))] : [];
        });
    }
};

/** OS access stays in the desktop extension host; the web build keeps its own fallback. */
export function createNativeDiscovery(system: DiscoveryHost = host) {
    const paths = system.platform === 'win32' ? path.win32 : path.posix;
    const cache = new Map<string, { expires: number; result: Promise<{ variables: Record<string, string>; roots: string[] }> }>();
    let registry: Promise<string[]> | undefined;
    const expand = (value: string, variables: Record<string, string | undefined>): string => {
        let result = value.replace(/^~(?=[/\\]|$)/, system.home);
        for (let i = 0; i < 8; i++) {
            const next = result.replace(/\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z_\d]*)|%([^%]+)%/g,
                (all, a, b, c) => variables[a ?? b ?? c] || all);
            if (next === result) break;
            result = next;
        }
        return result;
    };
    return async (reference: string, includeInstallations = true) => {
        const requested = reference.match(/\$\{KICAD(\d+)_3DMODEL_DIR\}/)?.[1] ?? '';
        let cached = cache.get(requested);
        if (!cached || cached.expires < Date.now()) {
            const result = (async () => {
                const configHome = system.env.KICAD_CONFIG_HOME || (system.platform === 'win32'
                    ? paths.join(system.env.APPDATA || paths.join(system.home, 'AppData/Roaming'), 'kicad')
                    : system.platform === 'darwin' ? paths.join(system.home, 'Library/Preferences/kicad')
                        : paths.join(system.env.XDG_CONFIG_HOME || paths.join(system.home, '.config'), 'kicad'));
                const base = expand(configHome, system.env);
                let versions: string[] = [];
                try { versions = (await system.directories(base)).filter(v => /^\d+\.\d+(?:\.\d+)?$/.test(v)); } catch { /* KiCad need not be installed. */ }
                versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
                if (requested && versions.includes(`${requested}.0`)) versions = [...versions.filter(v => v !== `${requested}.0`), `${requested}.0`];
                const variables: Record<string, string> = {};
                const configs = await Promise.all([base, ...versions.map(v => paths.join(base, v))].map(async folder => {
                    try {
                        return JSON.parse(await system.readText(paths.join(folder, 'kicad_common.json')));
                    } catch { return {}; }
                }));
                // Read in parallel, then apply the original version precedence.
                for (const config of configs) {
                    for (const [key, value] of Object.entries(config?.environment?.vars ?? {})) {
                        if (typeof value === 'string' && value) variables[key] = value;
                    }
                }
                // KiCad gives system environment variables precedence over Configure Paths.
                for (const [key, value] of Object.entries(system.env)) {
                    if (value && (modelVariable.test(key) || key in variables)) variables[key] = value;
                }
                const combined = { ...system.env, ...variables };
                for (const key of Object.keys(variables)) variables[key] = expand(variables[key], combined);
                const roots = Object.entries(variables).filter(([key]) => modelVariable.test(key))
                    .sort(([a], [b]) => b.localeCompare(a, undefined, { numeric: true })).map(([, value]) => value);
                if (system.platform === 'darwin') {
                    roots.push(paths.join(system.home, 'Library/Application Support/kicad/3dmodels'),
                        '/Library/Application Support/kicad/3dmodels', '/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels');
                } else if (system.platform !== 'win32') {
                    roots.push('/usr/share/kicad/3dmodels', '/usr/local/share/kicad/3dmodels', '/app/share/kicad/3dmodels');
                    const flatpak = 'org.kicad.KiCad';
                    for (const baseDir of ['/var/lib/flatpak/app', paths.join(system.home, '.local/share/flatpak/app')]) {
                        let architectures: string[] = [];
                        try { architectures = await system.directories(paths.join(baseDir, flatpak)); } catch { continue; }
                        for (const arch of architectures) roots.push(paths.join(baseDir, flatpak, arch, 'stable/active/files/share/kicad/3dmodels'));
                    }
                }
                return { variables, roots: [...new Set(roots.filter(root => root && !root.includes('${')))] };
            })();
            cached = { expires: Date.now() + 30000, result }; cache.set(requested, cached);
        }
        const found = await cached.result;
        const variables = { ...found.variables };
        // Include custom environment variables only when the model/settings reference them.
        for (const match of reference.matchAll(/\$\{([^}]+)\}/g)) {
            if (!variables[match[1]] && system.env[match[1]]) variables[match[1]] = expand(system.env[match[1]]!, system.env);
        }
        const roots = [...found.roots];
        if (system.platform === 'win32' && includeInstallations) {
            registry ??= system.registryInstallations().catch(() => []);
            roots.push(...(await registry).map(folder => paths.join(expand(folder, system.env), 'share/kicad/3dmodels')));
        }
        return { roots: [...new Set(roots.filter(root => root && !root.includes('${')))], variables };
    };
}
