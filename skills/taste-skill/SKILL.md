---
name: taste-skill
description: Context-aware frontend art direction and anti-generic UI implementation for landing pages, portfolios, marketing sites, product surfaces, and redesigns. Use when designing, redesigning, critiquing, polishing, or visually validating a web interface whose hierarchy, typography, palette, layout, motion, responsive behavior, or overall distinctiveness matters.
---

# Taste Skill

Create a coherent interface for this brief, not a collage of fashionable
patterns.

## Establish the design read

Before editing:

1. Inspect the current interface, repository guidance, stack, brand assets,
   screenshots, references, audience, and accessibility constraints.
2. Infer one sentence:
   `Reading this as: <surface> for <audience>, with <visual language>, optimized for <primary outcome>.`
3. Ask one question only if two plausible readings would materially change the
   result. Otherwise state the read and continue.
4. Choose three contextual dials from 1 to 10:
   - `DESIGN_VARIANCE`: symmetry and predictability versus expressive layout.
   - `MOTION_INTENSITY`: static clarity versus cinematic interaction.
   - `VISUAL_DENSITY`: spacious storytelling versus information compression.

Treat the values as decision constraints, not decoration.

## Audit before redesigning

For an existing interface, map:

- content hierarchy and primary task;
- existing design tokens and component conventions;
- repeated spacing, typography, color, radius, and icon rules;
- responsive breakpoints and failure states;
- brand assets worth preserving;
- visual defects supported by rendered evidence.

Do not erase useful product behavior or recognizable brand material merely to
make the interface look newer.

## Build one visual system

Define and apply:

- a type scale with deliberate display and body roles;
- one neutral family and one primary accent strategy;
- a spacing rhythm;
- a radius and border rule;
- an icon family;
- an image or illustration treatment;
- a motion posture consistent with the context.

Use an official design system when the product context calls for one. Otherwise
extend the existing stack. Check dependencies before importing anything.

Read `references/design-rules.md` for detailed heuristics. Apply them
contextually; explicit brand requirements and accessibility constraints win.

## Correct model defaults

Reject unearned defaults such as:

- centered hero plus three equal cards;
- purple-blue glow as an automatic technology aesthetic;
- glass panels without hierarchy or contrast;
- random serif emphasis inside a sans heading;
- card containers around every content group;
- mixed radius, icon, neutral, or accent systems;
- fake testimonials, unsupported metrics, or arbitrary stock imagery;
- motion on every element.

A pattern is not banned when the brief justifies it. The burden is coherence and
purpose, not novelty for its own sake.

## Implement complete states

Cover the actual product cycle:

- default, hover, focus, active, disabled;
- loading, empty, error, success;
- long content, localization, narrow mobile, zoom, and reduced motion;
- keyboard and screen-reader behavior where interactive.

Do not ship a polished happy path with broken edge states.

## Validate rendered output

Run the repository's required static checks first. Then inspect the rendered
interface at representative desktop and mobile sizes. Verify the whole surface,
not only the hero.

Read `references/visual-qa.md` and iterate until critical defects are gone. Do
not claim visual success from code inspection alone.

## Delivery

Report:

- the final design read and dial values;
- material changes to the visual system;
- validation actually performed;
- remaining limitations or unverified states.

Read `references/sources.md` only for provenance.
