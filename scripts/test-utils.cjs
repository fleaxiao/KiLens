const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { URI, Utils } = require('vscode-uri');

// Each top-level load gets an isolated module cache and explicit host mocks.
function load(name, mocks = {}, cache = new Map()) {
    name = path.resolve(name);
    if (cache.has(name)) return cache.get(name);
    const exports = {};
    cache.set(name, exports);
    const context = { exports, console, URL, process, setTimeout, clearTimeout, atob, Uint8Array,
        require: module => {
            if (Object.hasOwn(mocks, module)) return mocks[module];
            return module.startsWith('.')
                ? load(path.resolve(path.dirname(name), module + '.ts'), mocks, cache)
                : require(module);
        } };
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(name, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
    }).outputText, context, { filename: name });
    return exports;
}

const { getWebviewContent } = load('src/web/previewContent.ts', { vscode: { Uri: { joinPath: Utils.joinPath } } });

function previewHtml(source, filename = 'board.kicad_pcb') {
    return getWebviewContent(URI.parse('https://kilens.test'),
        { uri: URI.file('/project/' + filename), getText: () => source },
        { webview: { asWebviewUri: uri => uri } });
}

module.exports = { load, previewHtml };
