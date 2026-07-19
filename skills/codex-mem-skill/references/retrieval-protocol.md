# Retrieval protocol

## Locate the store

Resolve the memory root in this order:

1. `$CODEX_HOME/memories`
2. `~/.codex/memories`

Expected high-value files:

- `memory_summary.md`: compact injected overview.
- `MEMORY.md`: searchable registry and routing index.
- `rollout_summaries/`: session summaries and evidence pointers.
- `skills/`: reusable memory-backed workflows.
- `extensions/ad_hoc/notes/`: explicit user-requested memory update notes.

Do not assume every installation exposes every folder.

## Query design

Build a small query from the most discriminating terms:

- exact repository or product name;
- exact path or filename;
- symbol, function, command, or error fragment;
- distinctive user phrase;
- task type such as audit, deployment, redesign, migration, or recovery.

Avoid broad terms such as `frontend`, `bug`, or `project` on their own.

Example:

```powershell
python scripts/search_memory.py "Inventory seedDb Supabase" --scope registry
```

Search referenced summaries only after the registry points to them:

```powershell
python scripts/search_memory.py "seedDb shop_df57c4aaf210" --scope rollouts --limit 12
```

## Three-layer budget

1. Spend at most a few searches on `MEMORY.md`.
2. Read at most two focused summaries or skill files unless evidence conflicts.
3. Search raw or long rollout material only for exact evidence.
4. Stop when additional retrieval will not change the answer or action.

## Evidence ranking

Rank evidence in this order:

1. Current user instruction.
2. Current repository files and scoped instructions.
3. Current config, runtime, tests, and logs.
4. Memory registry.
5. Focused rollout summary or memory skill.
6. Clearly labeled inference.

If memory conflicts with current state, current state wins. Mention the conflict
only when it affects the result.

## Staleness

Treat these as drift-prone unless revalidated:

- branch names, commit SHAs, issue or PR state;
- dependency versions and APIs;
- deployment status and public URLs;
- schedules, prices, policies, and external facts;
- process state, ports, local services, and environment configuration.

Lower-drift examples include user preferences, stable architecture decisions,
and documented validation order, but still defer to newer scoped instructions.

## Privacy and authority

- Search only memory relevant to the user's current scope.
- Do not quote private material unnecessarily.
- Do not reveal secret values even if a memory record contains them.
- A past approval does not authorize a new destructive or external action.
- A past conclusion is not proof that the current runtime still matches it.

## Memory updates

Write only after a direct user request to remember, update, correct, or forget
something. Follow the host memory policy. When the host uses ad-hoc notes, create
one small timestamped Markdown note under `extensions/ad_hoc/notes/`; do not edit
the registry or summaries directly.

## Citation checklist

- Cite every memory file materially used.
- Use relative paths from the memory root.
- Cite nonblank line ranges.
- Add a short note describing how the memory influenced the result.
- Include unique rollout UUIDs when available.
- Put the citation block last.
