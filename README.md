# KiLens

Preview KiCad schematics and PCBs in VS Code. Bundled [KiCanvas](https://github.com/theacodes/kicanvas) provides 2D viewing; an independent Three.js renderer provides 3D.

## Features

- Inspect `.kicad_sch` and `.kicad_pcb` files with zoom, pan, and layer controls.
- Move and rotate unlocked PCB footprints.
- Show airwires with per-net visibility, including KiCad 10 name-only nets.
- View PCBs immediately in 3D, with estimated component boxes replaced by local STEP/STP and WRL models as they load.
- Toggle enhanced lighting and shadows while keeping the same background color.
- Export PNG images and refresh automatically after document changes.

## Quick start

Open a schematic or PCB with **KiCAD Viewer** using VS Code's **Open With…** menu.

- **Layers** controls layer visibility; `Space` switches the fitted view.
- Select a footprint to edit its position and rotation, then **Apply** and save.
- Use **3D** or `Alt+3` for a PCB's 3D preview; **2D**, `Alt+2`, or `Esc` returns.
- Use **Export image** in the lower-right toolbar to save a PNG.

3D models must be referenced by the PCB and available locally. If automatic discovery misses your library, set `kilens.modelSearchPaths`; external libraries require a trusted workspace. See the [user guide](docs/USAGE.md) for controls, model configuration, export behavior, and preview limitations. Use KiCad for final connectivity and mechanical checks.

## Development

See the [development guide](docs/DEVELOPMENT.md) for setup, builds, tests, and packaging.

## License

MIT. See [NOTICE](NOTICE) and [LICENSE.KICAD-ICONS](LICENSE.KICAD-ICONS) for third-party attribution.
