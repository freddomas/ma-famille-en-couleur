# Sources and adaptation notes

Primary source:

- `leonxlnx/taste-skill` — MIT:
  https://github.com/leonxlnx/taste-skill
- Default upstream skill:
  https://github.com/leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md
- GPT-oriented upstream variant:
  https://github.com/leonxlnx/taste-skill/blob/main/skills/gpt-tasteskill/SKILL.md

Retained ideas:

- infer the brief before choosing an aesthetic;
- tune variance, motion, and density;
- counter statistically common AI design clichés;
- audit an existing interface before redesigning it;
- enforce a pre-delivery visual check.

Adaptation decisions:

- make prohibitions contextual instead of universal;
- avoid simulated randomness and fake verification;
- avoid requiring GSAP or any library without checking the project;
- include dashboards and product UI when the user asks for them;
- require rendered evidence before claiming visual quality;
- preserve existing product behavior and scoped repository rules.
