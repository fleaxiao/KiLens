# Project instructions

## Interface language

- All product interface text must be in English, including existing and newly added button labels, tooltips, accessibility labels, dialogs, status messages, and errors.
- Check both static markup and dynamically assigned UI text. Translate any non-English interface text found while working on the project.
- Preserve user-provided content, file names, and KiCad design text in their original language.
- This requirement applies to the product interface; reply to the user in their preferred language.

## Toolbar icon style

- Keep the upper-right and lower-right toolbar icons visually consistent. Reuse the shared `.refresh-button` and `.refresh-button svg` rules in `media/theme.css`; do not add individual size or stroke overrides.
- Use 34 × 34 px buttons with a 4 px corner radius, centered 16 × 16 px SVG icons, a `0 0 24 24` viewBox, a 2.1-unit stroke, and rounded line caps and joins.
- Use outline icons with `fill="none"` and `stroke="currentColor"`, sharing the toolbar color and hover variables. Small filled details are allowed when needed for the symbol.
- Keep toolbar buttons 4 px apart and 8 px from the viewport edges. Preserve English tooltips and accessible labels when changing icons.

## Project maintenance

- Keep the project organized and remove confirmed unused code, obsolete branches, and duplicate implementations when working in the affected area. Preserve existing behavior and unrelated work.
- Reuse shared helpers and styles when behavior is identical; avoid abstractions without a concrete reuse case.
- Keep README.md concise: product overview, main features, quick start, and links. Put detailed usage and limitations in docs/USAGE.md and development instructions in docs/DEVELOPMENT.md.
- Keep source changes in src/, scripts/, and maintained media files. Rebuild dist/ and media/3d/ instead of editing generated output; keep KiCanvas changes reproducible with patch scripts and preserve third-party notices.
- Keep reusable test helpers in scripts/test-utils.cjs and shared fixtures in scripts/fixtures/. Do not extract fixtures by parsing another test script.
- Keep TypeScript unused-local and unused-parameter checks enabled. Run npm run compile-web and npm run check after code cleanup, plus focused tests for behavior not covered there.
