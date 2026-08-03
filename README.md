<p align="center">
  <img src="https://raw.githubusercontent.com/fleaxiao/KiLens/main/icon.png?v=20260803" alt="KiLens circuit magnifier icon" width="128" />
</p>

# KiLens

KiLens is a Visual Studio Code extension for previewing KiCad schematic and PCB files inside the editor.

## Features

- Opens `.kicad_sch` and `.kicad_pcb` files in a custom VS Code editor.
- Renders the preview with the latest [KiCanvas](https://kicanvas.org/) web component.
- Supports KiCanvas basic controls, including zooming, panning, and design inspection.
- Edits PCB footprint X/Y coordinates and rotation from the preview.
- Moves selected PCB footprints on a configurable grid with the arrow keys and rotates them with `R`.
- Refreshes the preview when the underlying document changes.
- Provides a **Refresh Preview** command and editor title button for manual reloads.
- Keeps the preview webview alive while it is hidden, so switching editor tabs is smoother.

## Installation

1. Clone the repository:

```sh
git clone https://github.com/fleaxiao/KiLens.git
cd KiLens
```

2. Install dependencies:

```sh
npm install
```

3. Build and package the extension:

```sh
npm run package-web
npm run package
```

4. Install the generated `.vsix` package:

```sh
code --install-extension kilens-0.0.1.vsix
```

## Usage

1. Open any `.kicad_sch` or `.kicad_pcb` file from the Explorer. KiLens opens the file with the **KiCad Viewer** custom editor.
2. Use the built-in KiCanvas controls to inspect the design:

   - Scroll or pinch to zoom.
   - Press Space to cycle through the preview zoom modes.
   - Drag to pan around the schematic or board.
   - Use the KiCanvas toolbar and inspector controls shown inside the preview.
3. In a PCB preview, select a footprint to open the placement editor:

   - Enter X, Y, or angle values and choose **Apply**.
   - Press `R` to rotate the selected footprint by 90°.
   - Use the arrow keys to move it by the configured grid amount.
   - Hold `Shift` with an arrow key to move by 10 grid steps.

4. Refresh the preview when needed.

## Notes

- KiLens uses a bundled copy of KiCanvas from `media/kicanvas.js`.
- Placement editing currently applies only to unlocked PCB footprints. Schematic symbols remain read-only.
- KiCanvas is an interactive browser-based viewer for KiCad schematics and boards. It is developed separately from KiLens; see the [KiCanvas repository](https://github.com/theacodes/kicanvas) for upstream documentation and issue reporting.
- KiCad is a separate open-source EDA project and is not bundled with this extension.

## License

KiLens is licensed under the MIT License.
