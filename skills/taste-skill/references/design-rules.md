# Contextual design rules

## Typography

- Use type to establish hierarchy before adding decoration.
- Keep body copy near a readable line length, usually 45 to 75 characters.
- Prevent display text from becoming a narrow multi-line wall.
- Use one display family and one body family at most unless the brand system
  explicitly requires more.
- Emphasize within a heading through weight, style, color, or spacing before
  introducing an unrelated font.
- Check italic descenders and tight line heights for clipping.
- Load fonts through the project's supported, privacy-appropriate mechanism and
  provide robust fallbacks.

## Color

- Choose one neutral temperature and keep it consistent.
- Give each semantic color a stable meaning.
- Use one dominant accent strategy; add more colors only when content semantics
  require them.
- Verify text, icon, focus, disabled, and button contrast in every theme.
- Do not infer a palette from industry clichés. A premium product does not
  automatically require beige and brass; an AI product does not automatically
  require violet gradients.

## Layout

- Let the primary action and content determine the grid.
- Prefer asymmetric composition when the design read calls for expression, not
  as a forced anti-symmetry trick.
- Use CSS Grid for multi-column structure and Flexbox for one-dimensional
  alignment.
- Avoid brittle percentage arithmetic and accidental horizontal overflow.
- Use dynamic viewport units where mobile browser chrome affects full-height
  sections.
- Preserve meaningful density in dashboards and meaningful breathing room in
  storytelling surfaces.

## Cards and material

- Use a container only when it communicates grouping, interaction, or elevation.
- Choose one radius system and document exceptions.
- Tint shadows to the surrounding palette; avoid default black blur as the only
  depth cue.
- Avoid stacking border, shadow, blur, gradient, and glow on every component.
- Use separators, whitespace, alignment, or typography instead of cards when
  those communicate the relationship more clearly.

## Images and assets

- Prefer user-provided, repository-local, or properly licensed assets.
- Never invent a silent fallback for a missing required asset.
- Match crop, color treatment, and visual grammar across the full page.
- Do not use arbitrary remote placeholder services in production output.
- If image generation is authorized and useful, generate a coherent set rather
  than unrelated one-off images.

## Components and states

- Use one icon family and consistent stroke/fill behavior.
- Make button hierarchy obvious without relying on color alone.
- Design focus states as first-class visual elements.
- Match skeletons to the final content geometry.
- Give empty states a next action and errors a recovery path.
- Keep destructive actions visually and behaviorally distinct.

## Motion

- Animate state change, spatial relationship, and feedback before decoration.
- Let interaction frequency determine intensity.
- Make keyboard-driven and high-frequency actions immediate.
- Respect `prefers-reduced-motion`.
- Use `transform` and `opacity` for most animation; measure before animating
  layout properties.

## Stack discipline

- Inspect `package.json` or the equivalent before choosing libraries.
- Use the existing framework and component model unless change is authorized.
- Do not mix multiple design systems in one surface.
- Do not claim a web approximation is an official platform design system.
- Keep client-only interaction isolated when using server-rendered frameworks.
