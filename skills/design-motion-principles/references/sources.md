# Sources and adaptation notes

Primary source:

- `kylezantos/design-motion-principles` — MIT:
  https://github.com/kylezantos/design-motion-principles
- Upstream skill:
  https://github.com/kylezantos/design-motion-principles/blob/main/skills/design-motion-principles/SKILL.md

The upstream synthesis attributes public motion-design principles to Emil
Kowalski, Jakub Krehel, and Jhey Tompkins and explicitly states that they did not
author or endorse the skill.

Retained ideas:

- two modes: create and audit;
- context-sensitive weighting of restraint, polish, and expression;
- frequency as a primary motion decision;
- mandatory reduced-motion behavior;
- motion-gap analysis alongside anti-pattern detection.

Adaptation decisions:

- use neutral lens names in the operational workflow;
- default audits to read-only inline output;
- avoid blocking on weighting confirmation when context is clear;
- avoid unrequested HTML writes and browser launches;
- preserve the user's framework and installed dependencies;
- distinguish audit authorization from implementation authorization.
