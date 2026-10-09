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
| `src/web/exportImage.ts` | PNG validation and VS Code save dialog/filesystem bridge |
| `media/export-image.js` | Current-view capture, 2D overlay composition, and export controls |
| `src/web/kicadPcbEditor.ts` | KiCad parsing, net normalization, and footprint edits |
| `src/web/board3dData.ts` | Board geometry and silkscreen extraction |
| `src/web/preview3d.ts` | Three.js renderer and component placement |
| `src/web/strokeText.ts`, `src/web/fonts/newstrokeData.ts` | Standalone Newstroke layout and checked-in glyph data for 3D |
| `src/web/enhancedRender.ts` | On-demand material enhancement, cached shadows, studio environment, depth-aware ambient occlusion, and resource ownership |
| `src/web/modelResolver.ts` | Model paths, filesystem access, and loading limits |
| `src/web/test/` | VS Code web extension tests |
| `media/` | Maintained browser scripts, styles, icons, and patched KiCanvas bundle |
| `scripts/` | Build helpers, KiCanvas patches, STEP worker source, regression tests, and shared `test-utils.cjs` |
| `scripts/fixtures/` | Shared PCB fixtures and reference font outputs |
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
npm run typecheck      # TypeScript and unused-code checks without emitting files
npm run check          # TypeScript, connectivity, 3D, and image export regression tests
npm test               # Build and run the VS Code web extension test suite
```

Run `npm run compile-web` before browser regression tests on a fresh checkout.
Individual suites are available as `npm run test-ratsnest`, `npm run test-3d`, and `npm run test-image-export`.
Screenshots and temporary profiles are written under `dist/test-output/`.

Image export tests cover PNG save/cancel/failure handling, source-folder/basename defaults (including Windows and remote URIs), PCB board bounds,
camera restoration, independence from editor size and zoom, schematic captures,
visible airwires, HiDPI resolution, and ordinary 3D. The 3D suite
also compares an enhanced PNG against the displayed frame and checks repeated toggles, orbiting, model visibility and camera restoration. Capture redraws synchronously, preserving WebGL's default buffer policy instead of enabling continuous drawing-buffer preservation.

The 3D browser suite exercises enhanced rendering and the LDR fallback on devices without floating-point targets. Copper fill tests cover saved contours, bridged clearance holes, front/back winding, footprint transforms, keepout exclusions, and rendered pixels at copper, clearances, drills and board cutouts in both render modes. On Windows, set `KILENS_TEST_GPU=1` to use ANGLE's D3D11 backend. Software rendering can be substantially slower.

Model lookup tries project paths and explicit configuration before native settings,
installer registry entries, and drive discovery. Tests verify skipped discovery,
path precedence, trust restrictions, and deduplicated file probes. The renderer
prefetches at most two distinct model reads while keeping STEP conversion serial,
and displays board artwork and estimated component boxes before the reads finish.
Footprint-derived estimates use physical millimetres, unaffected by model unit
scaling. Replacements expand clipping bounds incrementally without refitting the
camera; a final pass tightens the bounds. Browser tests hold model responses to
verify the initial frame and navigation before releasing real geometry.

The desktop shortcut test opens an isolated VS Code profile. It checks repeated
Esc/Alt+3 switching after focusing the 3D viewport, including focus behavior that
a standalone browser cannot reproduce. Build first, then in PowerShell run:

```powershell
$env:KILENS_VSCODE_EXECUTABLE = 'C:/path/to/Microsoft VS Code/Code.exe'
npm run test-shortcuts
```

The test leaves the user's settings and installed extensions unchanged.

## Assets and licenses

`scripts/bundle-3d.cjs` copies the STEP engine and dependency licenses and combines
the importer with `scripts/step-worker.js`. The independent Newstroke data and
layout implementation are compiled directly into the lazy-loaded 3D bundle.
The 3D build does not read or patch `media/kicanvas.js`. The controller receives
the original PCB text and an optional 2D activation callback from the host;
it does not query KiCanvas elements or wait for 2D initialization.
Webpack generates the renderer in `media/3d/`. The build works without an existing
`media/3d/` directory. See `NOTICE` for upstream attribution and source locations.

The 3D browser suite removes the KiCanvas script and elements from its page and
checks STEP/WRL, artwork, image export, mode switching, restored state, enhanced
rendering and fallback without them. Font tests compare against stored outputs
from the previous font bridge (`scripts/fixtures/stroke-text.json`), without
loading KiCanvas. Keep the checked-in glyph data and its upstream notices together;
normal builds must not regenerate it from the 2D bundle.

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
