---
name: design-motion-principles
description: Purposeful, accessible interface-motion creation and evidence-backed motion audits for web and app UI. Use when building, improving, reviewing, or debugging transitions, hover and press feedback, enter/exit behavior, scroll effects, micro-interactions, animation systems, reduced-motion support, or motion performance in CSS, React, Motion, Framer Motion, GSAP, native apps, Rive, or Lottie.
---

# Design Motion Principles

Choose motion by context, frequency, and user benefit.

## Route the request

- **Create**: the user asks to build, add, improve, or fix motion. Read
  `references/create-workflow.md`.
- **Audit**: the user asks to review, evaluate, inventory, or critique existing
  motion. Read `references/audit-workflow.md`.
- **Ambiguous**: infer from the requested deliverable. Ask one concise question
  only when creation and read-only audit would materially diverge.

An audit does not authorize implementation. A request to fix or improve does.

## Establish context

Inspect the repository guidance, product type, interaction model, animation
libraries, existing timings/easings, input methods, and accessibility
requirements.

State a short motion posture:

`Motion posture: <restrained|polished|expressive>, because <context>; frequent interactions stay <instant|minimal>.`

Use three complementary lenses without treating any as universal:

- **Restraint and speed** — ask whether motion should exist at all.
- **Production polish** — ask whether timing, easing, continuity, and finish are
  coherent.
- **Expression and delight** — ask where playfulness adds value without harming
  task completion.

Weight the lenses by product context. Productivity tools usually favor
restraint; consumer and mobile products favor polish; creative and children's
experiences may allow more expression.

## Apply the frequency gate

Before approving or adding animation:

| Trigger frequency | Default posture |
|---|---|
| Rare | Expressive motion may be useful |
| Occasional | Subtle, quick, purposeful |
| Frequent | Minimal or instant |
| Keyboard-driven | Immediate; avoid decorative delay |

Override only when user benefit and context justify it.

## Core constraints

- Make state and spatial relationships understandable with motion disabled.
- Respect `prefers-reduced-motion` or the platform equivalent in the same
  implementation.
- Avoid unpausable ambient loops and vestibular triggers.
- Prefer transform and opacity; measure before animating layout or filters.
- Match the codebase's established motion grammar unless that grammar is the
  defect being corrected.
- Use explicit durations, springs, and easing curves. Do not scatter arbitrary
  magic numbers.
- Test entry and exit, interruption, rapid repetition, slow devices, resize,
  keyboard, and reduced-motion behavior.

Read `references/accessibility-performance.md` for implementation checks.

## Report truthfully

For create work, explain the motion posture and validation performed. For audit
work, cite files and lines, rank findings by impact, and separate defects from
optional opportunities.

Do not generate an HTML report or open a browser unless the user requests an
artifact or rendered audit. Inline evidence is the default.

Read `references/sources.md` only for provenance.
