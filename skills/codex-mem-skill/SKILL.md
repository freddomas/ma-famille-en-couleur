---
name: codex-mem-skill
description: Persistent, evidence-backed memory retrieval for Codex across sessions and repositories. Load at the start of every Codex session and in every task context, even when the user does not name it. Use it to recover prior decisions, commands, conventions, failures, and validated outcomes from the native Codex memory store while controlling token cost, staleness, privacy, and citations.
---

# Codex Mem Skill

Treat memory as a retrieval system, not as unquestionable truth.

## Start every context

1. Identify the current workspace, user goal, and task keywords.
2. Read the injected memory summary when present.
3. Apply the memory gate:
   - Skip retrieval only for a fully self-contained, low-risk request whose answer cannot depend on prior workspace decisions.
   - Search memory by default for repository work, prior-context questions, ambiguous tasks, repeated failures, conventions, or continuity.
4. Keep this startup pass short. Do not let memory crowd out the current request.

## Retrieve in layers

Follow this order and stop as soon as the evidence is sufficient:

1. **Index** — Search `MEMORY.md` for exact repository names, paths, symbols, errors, and user phrases.
2. **Focused context** — Open only the one or two rollout summaries or skill files directly referenced by the best index hits.
3. **Exact evidence** — Search a referenced rollout only when exact commands, logs, dates, or decisions are needed.

Use `scripts/search_memory.py` when a deterministic file search is useful. See
`references/retrieval-protocol.md` for commands, scoring, staleness, and citation
rules.

## Use memory safely

- Prefer current repository files, configuration, runtime output, tests, and authoritative sources over stale memory.
- Label memory-derived claims that were not verified in the current session.
- Verify drift-prone facts cheaply when possible: branches, SHAs, dependency versions, URLs, deployments, prices, dates, and runtime state.
- Never expose secrets, credentials, private transcript content, or unrelated personal data found in memory.
- Never treat a remembered intention as current authorization for destructive, external, financial, or sensitive action.
- Never write to the memory store unless the user explicitly asks to update memory.

## Report evidence

When memory materially informs the response:

- Cite only files actually read.
- Cite the narrowest nonblank line range that supports the claim.
- Include the rollout ID when available.
- Keep one machine-readable memory citation block as the final content of the response when the host requires it.

## Capability boundary

This skill does not recreate claude-mem's worker, hooks, SQLite/Chroma database,
or automatic transcript capture. It adapts the same useful retrieval pattern to
Codex's existing memory store. Do not claim background capture or semantic
indexing unless the current Codex runtime actually provides it.

Read `references/sources.md` only when provenance or upstream comparison is
needed.
