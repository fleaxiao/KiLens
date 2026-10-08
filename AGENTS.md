# Project instructions

## Interface language

- Use English for all new or modified user-facing interface text, including button labels, tooltips, accessibility labels, dialogs, status messages, and errors.
- Preserve user-provided content, file names, and KiCad design text in their original language.
- This requirement applies to the product interface; reply to the user in their preferred language.

## Toolbar icon style

- Keep the upper-right and lower-right toolbar icons visually consistent. Reuse the shared `.refresh-button` and `.refresh-button svg` rules in `media/theme.css`; do not add individual size or stroke overrides.
- Use 34 × 34 px buttons with a 4 px corner radius, centered 16 × 16 px SVG icons, a `0 0 24 24` viewBox, a 2.1-unit stroke, and rounded line caps and joins.
- Use outline icons with `fill="none"` and `stroke="currentColor"`, sharing the toolbar color and hover variables. Small filled details are allowed when needed for the symbol.
- Keep toolbar buttons 4 px apart and 8 px from the viewport edges. Preserve English tooltips and accessible labels when changing icons.
