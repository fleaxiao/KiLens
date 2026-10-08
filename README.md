# KiLens

Preview KiCad schematics and PCBs in VS Code, powered by bundled [KiCanvas](https://github.com/theacodes/kicanvas).

## Features

- Open `.kicad_sch` and `.kicad_pcb` files with zoom, pan, and design inspection.
- Edit unlocked PCB footprint positions and rotations.
- Show unconnected pad airwires with per-net visibility controls.
- Preview KiCad 10 name-only nets without changing the source file.
- Orbit a 3D PCB preview with local STEP/STP and WRL component models.
- Export the current 2D or 3D view as a PNG image.
- Refresh automatically when the document changes.

## Usage

Open a schematic or board with **KiCAD Viewer**. Click the lower-right **Switch view** button or press `Space` to cycle the available zoom modes (selection, board/schematic, and page). Unavailable modes are skipped. Use **Refresh Preview** to reload.

Click the lower-right image export icon (**Export image**) in either 2D or 3D, then choose a PNG save location. The dialog defaults to the source file's folder and basename: `expert.kicad_pcb` exports as `expert.png`. A 2D PCB image fits the complete **Edge.Cuts** board bounds, without page margins or the drawing sheet, regardless of preview zoom or editor size. It uses 20 pixels/mm, capped at 4096 pixels on the longest side, and retains visible layers and airwires. A valid board outline is required. Schematics export their current view. In 3D it captures the current enhanced or standard render with a transparent background at the canvas physical resolution, without a sampling wait. Images exclude toolbars and status text. Export does not change the preview camera.

Select a PCB footprint to edit X, Y, and rotation, then choose **Apply**. Arrow keys move it by one grid step; `Shift` + arrow moves ten steps; `R` rotates it by 90°. Save the document to keep placement changes. Schematic symbols are read-only.

Airwires use tracks, vias, and saved copper fills. Unfilled zones do not count as connections; custom or chamfered pads may retain extra airwires, and arcs are approximated. Use KiCad for final connectivity checks and DRC.

## 3D preview

Open a `.kicad_pcb` file and click **3D** in the upper-right toolbar. Drag to rotate, right-drag to pan, and scroll to zoom. **Fit**, **Top**, and **Bottom** change the camera; **Components** toggles model visibility and **Silkscreen** toggles silkscreen graphics and text. Use `Alt+3` for 3D while the PCB viewer is active. Press `Alt+2`, `Esc`, or the upper-right **2D** button to return. The first frame is shown after model loading finishes, with one fit to the complete assembly. A loading message is shown meanwhile. Refresh and document changes preserve a valid saved camera and preview mode; Fit, Top and Bottom explicitly reposition the camera.

Tracks use round ends and joins. Surface artwork is clipped to the board outline and drill holes, with separate heights for tracks, pads, and silkscreen. Camera depth precision is adjusted while navigating to prevent stripes and incorrect overlaps.

Saved **F.Cu** and **B.Cu** zone fills are shown beneath the solder mask in standard and enhanced 3D. Filled contours preserve clearance holes and thermal connections, including footprint-local zones. Keepouts and inner copper layers are excluded. If a zone has no saved fill, fill zones in KiCad (`B`) and save the PCB; KiLens does not calculate fills from zone outlines.

**Enhanced rendering** is disabled by default and saved with the preview. It adds studio environment lighting, material highlights, cached soft shadow maps and screen-space ambient occlusion using realtime raster rendering. There is no path tracing, sampling countdown or separate fast mode. The PCB retains classic green solder mask and saved copper fills.

The color image uses the full physical canvas resolution and multisample antialiasing. Only the ambient occlusion pass uses half resolution with depth-aware filtering, preserving sharp text and edges. Occlusion is skipped while dragging or loading models and restored when interaction ends. Rendering runs on demand and stops in 2D or hidden pages. Devices without floating-point render targets use an LDR target without environment reflections; initialization failures fall back to standard rendering with a notice. Performance depends on the GPU, resolution and model complexity.

Both F.SilkS and B.SilkS include graphic lines, filled shapes, board text, footprint text, and visible footprint properties such as references and values. Text uses the same bundled KiCad Newstroke font as the 2D viewer, including alignment, size, thickness, italic, markup, rotation and mirroring. Hidden fields and text on fabrication layers are excluded. Local `${REFERENCE}`/`${VALUE}` and property variables are resolved. Saved font outline polygons are used when present; other custom fonts fall back to the stroke font with a preview notice. Text boxes are not supported yet.

Models must already be referenced by the footprint's `(model ...)` entries. STEP/STP geometry is converted locally in a worker using bundled OpenCascade WebAssembly; WRL supports self-contained VRML 2.0 models with KiCad's 2.54 mm unit convention. Embedded CAD backgrounds are excluded so they cannot obscure the PCB or distort the fitted view. The viewer applies model scale, XYZ rotation, offset, footprint rotation and back-side placement. No model files are uploaded or downloaded. Missing or unsupported models are listed in the preview while the rest of the board remains usable.

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

The board preview includes closed line/arc/rectangle/circle/polygon Edge.Cuts contours, cutouts, through holes, standard pads, tracks, saved outer-layer copper fills, and silkscreen. Curves are tessellated; custom/trapezoid pads use rectangular approximations. Inner copper layers, legacy segment-based zone fills, blind/buried vias, solder paste, and detailed mask openings are not rendered. Missing or open outlines are reported without inventing a board shape. VRML 1.0 and external VRML textures/Inline resources are unsupported. Each model is limited to 40 MB; STEP conversion stops after 90 seconds. Use KiCad for final mechanical verification.

## Development

See [the development guide](docs/DEVELOPMENT.md) for the repository layout, build commands, tests, and packaging workflow.

## License

MIT. See `NOTICE` and `LICENSE.KICAD-ICONS` for third-party attribution.
