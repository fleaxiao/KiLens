# KiLens

Preview KiCad schematics and PCBs in VS Code, powered by bundled [KiCanvas](https://github.com/theacodes/kicanvas).

## Features

- Open `.kicad_sch` and `.kicad_pcb` files with zoom, pan, and design inspection.
- Edit unlocked PCB footprint positions and rotations.
- Show unconnected pad airwires with per-net visibility controls.
- Preview KiCad 10 name-only nets without changing the source file.
- Refresh automatically when the document changes.

## Usage

Open a schematic or board with **KiCAD Viewer**. Use the preview controls to inspect it, `Space` to cycle zoom modes, or **Refresh Preview** to reload.

Select a PCB footprint to edit X, Y, and rotation, then choose **Apply**. Arrow keys move it by one grid step; `Shift` + arrow moves ten steps; `R` rotates it by 90°. Save the document to keep placement changes. Schematic symbols are read-only.

Airwires use tracks, vias, and saved copper fills. Unfilled zones do not count as connections; custom or chamfered pads may retain extra airwires, and arcs are approximated. Use KiCad for final connectivity checks and DRC.

## Development

```sh
npm ci
npm run compile-web   # Development build
npm run test-ratsnest # Net adaptation, connectivity, and browser checks
npm run package      # Production build and VSIX packaging
code --install-extension kilens-1.0.0.vsix
```

Browser checks require Playwright's Chromium (`npx playwright install chromium`). Use `npm run watch-web` while developing or `npm test` for the VS Code web test suite.

The extension provider is in `src/web/extension.ts`, preview markup and controls in `src/web/previewContent.ts`, and PCB document edits in `src/web/kicadPcbEditor.ts`. Viewer assets and connectivity overlays live in `media/`.

## License

MIT. See `NOTICE` and `LICENSE.KICAD-ICONS` for third-party attribution.
