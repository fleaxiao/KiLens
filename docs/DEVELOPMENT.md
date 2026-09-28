# Development

Run commands from the repository root. Install dependencies with `npm ci`.
Browser tests use Playwright provided by the VS Code web test tooling; install
its browser with `npx playwright install chromium`.

## Repository layout

| Location | Purpose |
| --- | --- |
| `src/node/` | Desktop entry point and local KiCad library discovery |
| `src/web/extension.ts` | Shared custom editor provider and VS Code commands |
| `src/web/previewContent.ts` | Webview markup and 2D interaction |
| `src/web/kicadPcbEditor.ts` | KiCad parsing, net normalization, and footprint edits |
| `src/web/board3dData.ts` | Board geometry and silkscreen extraction |
| `src/web/preview3d.ts` | Three.js renderer and component placement |
| `src/web/modelResolver.ts` | Model paths, filesystem access, and loading limits |
| `src/web/test/` | VS Code web extension tests |
| `media/` | Maintained browser scripts, styles, icons, and patched KiCanvas bundle |
| `scripts/` | Build helpers, KiCanvas patches, STEP worker source, and regression tests |
| `licenses/` | Additional third-party license texts copied into the 3D bundle |
| `dist/` | Generated extension bundles and test output; ignored by Git |
| `media/3d/` | Generated renderer, worker, WASM, and license copies; ignored by Git |

Keep source changes in `src/`, `scripts/`, and the maintained files in `media/`.
Rebuild generated files instead of editing them directly. KiCanvas is a vendored
bundle; keep its local changes reproducible in `scripts/patch-kicanvas-*.cjs`.

## Build and verify

```sh
npm run compile-web    # Build desktop/web entry points, 3D assets, and web tests
npm run watch-web      # Prepare 3D dependencies, then watch source changes
npm run typecheck      # TypeScript checks without emitting files
npm run check          # TypeScript, connectivity, and 3D browser regression tests
npm test               # Build and run the VS Code web extension test suite
```

Run `npm run compile-web` before browser regression tests on a fresh checkout.
Individual suites are available as `npm run test-ratsnest` and `npm run test-3d`.
Screenshots and temporary profiles are written under `dist/test-output/`.

The desktop shortcut test opens an isolated VS Code profile. It checks repeated
Esc/Alt+3 switching after focusing the 3D viewport, including focus behavior that
a standalone browser cannot reproduce. Build first, then in PowerShell run:

```powershell
$env:KILENS_VSCODE_EXECUTABLE = 'C:/path/to/Microsoft VS Code/Code.exe'
npm run test-shortcuts
```

The test leaves the user's settings and installed extensions unchanged.

## Assets and licenses

`scripts/bundle-3d.cjs` copies the STEP engine and dependency licenses, combines
the importer with `scripts/step-worker.js`, and applies the Newstroke font bridge.
Webpack generates the renderer in `media/3d/`. The build works without an existing
`media/3d/` directory. See `NOTICE` for upstream attribution and source locations.

## Packaging

Builds and tests do not create a VSIX. Package only when a release is requested:

```sh
npm run package
```

This runs the production build and creates `kilens-<version>.vsix` in the root.
The version is defined in `package.json` and `package-lock.json`. The package
includes compiled desktop/web entry points, runtime media, and license notices;
it does not include tests, development profiles, or archived packages.

Install a requested build with `code --install-extension kilens-<version>.vsix`,
then reload VS Code. Publishing is a separate explicit step (`npm run publish`).
