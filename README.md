<p align="center">
  <img src="icon.png" alt="KiLens icon" width="128" />
</p>

# KiLens

KiLens is a Visual Studio Code extension for previewing KiCad schematic and PCB files inside the editor.

## Features

- Opens `.kicad_sch` and `.kicad_pcb` files in a custom VS Code editor.
- Renders the preview with the latest [KiCanvas](https://kicanvas.org/) web component.
- Supports KiCanvas basic controls, including zooming, panning, and design inspection.
- Refreshes the preview when the underlying document changes.
- Provides a **Refresh Preview** command and editor title button for manual reloads.
- Keeps the preview webview alive while it is hidden, so switching editor tabs is smoother.

## Usage

1. Open any `.kicad_sch` or `.kicad_pcb` file from the Explorer. KiLens opens the file with the **KiCAD Viewer** custom editor.
2. Use the built-in KiCanvas controls to inspect the design:

   - Scroll or pinch to zoom.
   - Drag to pan around the schematic or board.
   - Use the KiCanvas toolbar and inspector controls shown inside the preview.
3. Refresh the preview when needed.

## Notes

- KiLens uses a bundled copy of KiCanvas from `media/kicanvas.js`.
- KiCanvas is an interactive browser-based viewer for KiCad schematics and boards. It is developed separately from KiLens; see the [KiCanvas repository](https://github.com/theacodes/kicanvas) for upstream documentation and issue reporting.
- KiCad is a separate open-source EDA project and is not bundled with this extension.

## License

KiLens is licensed under the MIT License.
