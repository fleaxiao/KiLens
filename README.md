# KiLens

KiLens is a Visual Studio Code extension for previewing KiCad schematic and PCB files inside the editor.

## Features

- Opens `.kicad_sch` and `.kicad_pcb` files in a custom VS Code editor.
- Renders the preview with the bundled [KiCanvas](https://kicanvas.org/) web component.
- Supports KiCanvas basic controls, including zooming, panning, and design inspection.
- Refreshes the preview when the underlying document changes.
- Provides a **Refresh Preview** command and editor title button for manual reloads.
- Keeps the preview webview alive while it is hidden, so switching editor tabs is smoother.

## Usage

1. Open a KiCad `.kicad_sch` or `.kicad_pcb` file in VS Code.
2. KiLens opens the file with the **KiCAD Viewer** custom editor.
3. Use the KiCanvas controls to inspect the schematic or board.
4. Run **Refresh Preview** from the command palette, or click the refresh button in the editor title, if you need to reload the preview manually.

## Notes

- KiLens uses a bundled copy of KiCanvas from `media/kicanvas.js`.
- KiCanvas is an interactive browser-based viewer for KiCad schematics and boards. It is developed separately from KiLens; see the [KiCanvas repository](https://github.com/theacodes/kicanvas) for upstream documentation and issue reporting.
- KiCad is a separate open-source EDA project and is not bundled with this extension.

## Credits

KiLens is based on KiCode by Sajad Ghorbani.

This extension includes KiCanvas by Alethea Katherine Flowers and the KiCanvas contributors.

Modifications for KiLens are copyright (c) 2026 fleaxiao.

## License

KiLens is licensed under the MIT License. See [LICENSE.txt](LICENSE.txt) and [NOTICE](NOTICE) for copyright, attribution, and third-party notices.
