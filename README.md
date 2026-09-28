# KiLens

Preview KiCad schematics and PCBs in VS Code, powered by bundled [KiCanvas](https://github.com/theacodes/kicanvas).

## Features

- Open `.kicad_sch` and `.kicad_pcb` files with zoom, pan, and design inspection.
- Edit unlocked PCB footprint positions and rotations.
- Show unconnected pad airwires with per-net visibility controls.
- Preview KiCad 10 name-only nets without changing the source file.
- Orbit a 3D PCB preview with local STEP/STP and WRL component models.
- Refresh automatically when the document changes.

## Usage

Open a schematic or board with **KiCAD Viewer**. Use the preview controls to inspect it, `Space` to cycle zoom modes, or **Refresh Preview** to reload.

Select a PCB footprint to edit X, Y, and rotation, then choose **Apply**. Arrow keys move it by one grid step; `Shift` + arrow moves ten steps; `R` rotates it by 90°. Save the document to keep placement changes. Schematic symbols are read-only.

Airwires use tracks, vias, and saved copper fills. Unfilled zones do not count as connections; custom or chamfered pads may retain extra airwires, and arcs are approximated. Use KiCad for final connectivity checks and DRC.

## 3D preview

Open a `.kicad_pcb` file and click **3D** in the upper-right toolbar. Drag to rotate, right-drag to pan, and scroll to zoom. **Fit**, **Top**, and **Bottom** change the camera; **Components** toggles model visibility and **Silkscreen** toggles silkscreen graphics and text. Use `Alt+3` for 3D while the PCB viewer is active. Press `Esc` or the upper-right **2D** button to return. Refresh and document changes preserve the camera and preview mode.

Tracks use round ends and joins. Surface artwork is clipped to the board outline and drill holes, with separate heights for tracks, pads, and silkscreen. Camera depth precision is adjusted while navigating to prevent stripes and incorrect overlaps.

Both F.SilkS and B.SilkS include graphic lines, filled shapes, board text, footprint text, and visible footprint properties such as references and values. Text uses the same bundled KiCad Newstroke font as the 2D viewer, including alignment, size, thickness, italic, markup, rotation and mirroring. Hidden fields and text on fabrication layers are excluded. Local `${REFERENCE}`/`${VALUE}` and property variables are resolved. Saved font outline polygons are used when present; other custom fonts fall back to the stroke font with a preview notice. Text boxes are not supported yet.

Models must already be referenced by the footprint's `(model ...)` entries. STEP/STP geometry is converted locally in a worker using bundled OpenCascade WebAssembly; WRL supports self-contained VRML 2.0 models with KiCad's 2.54 mm unit convention. The viewer applies model scale, XYZ rotation, offset, footprint rotation and back-side placement. No model files are uploaded or downloaded. Missing or unsupported models are listed in the preview while the rest of the board remains usable.

Relative paths and `${KIPRJMOD}` resolve from the board directory. Common KiCad installation directories are searched for `${KICAD*_3DMODEL_DIR}` and `${KISYS3DMOD}`. On Windows, trusted local workspaces also detect versioned installations under `KiCad`, `Program Files/KiCad`, and `Program Files (x86)/KiCad` on available drives C–Z (for example `D:/kicad/10.0/share/kicad/3dmodels`), preferring the requested KiCad version. Discovery is cached for 30 seconds. If models are missing, set `kilens.modelSearchPaths` in VS Code settings to the library directory containing `*.3dshapes` folders. Custom variables and other folders can be configured with:

```json
{
  "kilens.modelSearchPaths": ["D:/KiCad/3dmodels"],
  "kilens.modelPathVariables": {
    "MY_MODELS": "D:/Projects/component-models"
  }
}
```

The desktop extension also reads system environment variables and KiCad's `kicad_common.json` (`environment.vars`), including `KICAD_CONFIG_HOME`, `APPDATA`, and `XDG_CONFIG_HOME`. It prefers the config version referenced by the model and otherwise uses the newest installed config. System environment variables override KiCad settings; explicit `kilens.modelPathVariables` overrides both. Windows installer registry entries support custom installation locations; macOS user/system model folders and common Linux/Flatpak library locations are included. Configured `kilens.modelSearchPaths` take priority over automatic discovery, including stale KiCad settings. This runs on the extension host machine, so remote development uses that machine's model library. The installer bundles the viewer and STEP engine; users still need their referenced KiCad model files locally or in their project.

External library folders require a trusted workspace. In VS Code for the web, files must be accessible through its filesystem provider; a browser cannot read arbitrary folders on your computer.

The board preview includes closed line/arc/rectangle/circle/polygon Edge.Cuts contours, cutouts, through holes, standard pads, tracks, and silkscreen. Curves are tessellated; custom/trapezoid pads use rectangular approximations. Copper pours, blind/buried vias, solder paste, and detailed mask openings are not rendered. Missing or open outlines are reported without inventing a board shape. VRML 1.0 and external VRML textures/Inline resources are unsupported. Each model is limited to 40 MB; STEP conversion stops after 90 seconds. Use KiCad for final mechanical verification.

## Development

See [the development guide](docs/DEVELOPMENT.md) for the repository layout, build commands, tests, and packaging workflow.

## License

MIT. See `NOTICE` and `LICENSE.KICAD-ICONS` for third-party attribution.
