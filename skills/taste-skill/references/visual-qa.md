# Visual QA

## Validation order

1. Run repository-mandated type, lint, test, and build checks.
2. Start the intended runtime.
3. Inspect rendered desktop and mobile output.
4. Exercise interactions and state transitions.
5. Fix defects and repeat the smallest relevant checks.

Do not run an expensive end-to-end or browser suite before cheaper static checks
are green when repository instructions prescribe an order.

## Viewports

Use representative widths for the product, including:

- narrow mobile around 320 to 390 CSS pixels;
- wider mobile or small tablet;
- laptop around 1280 to 1440 CSS pixels;
- wide desktop when the layout has a max-width or full-bleed behavior.

Also test browser zoom when accessibility or dense UI makes it relevant.

## Full-surface inspection

Check every section and route in scope for:

- hierarchy and reading order;
- wrapping, clipping, overlap, and overflow;
- inconsistent spacing, radii, icons, or palette;
- low contrast and invisible controls;
- image crop, quality, aspect ratio, and missing assets;
- sticky or fixed elements covering content;
- pointer, keyboard, focus, loading, empty, and error states;
- reduced-motion behavior;
- print layout when the product supports printing.

Counts, navigation, and a clean first viewport are not proof that the complete
experience is visually sound.

## Evidence

Prefer screenshots or browser inspection over code-only judgment. Record:

- viewport;
- route or state;
- defect;
- severity;
- fix;
- revalidation result.

Do not declare success when rendering could not be inspected. State that limit
plainly.

## Severity

- **Critical**: unusable, inaccessible, missing content, broken interaction, or
  major overflow.
- **Important**: weak hierarchy, inconsistent system, illegible state, or
  responsive defect.
- **Polish**: minor optical alignment, rhythm, or transition refinement.

Fix critical and important issues before spending time on polish.
