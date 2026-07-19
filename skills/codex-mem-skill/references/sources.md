# Sources and adaptation boundary

This skill is an original Codex-native adaptation informed by:

- `thedotmack/claude-mem` — Apache-2.0:
  https://github.com/thedotmack/claude-mem
- Upstream memory-search workflow:
  https://github.com/thedotmack/claude-mem/blob/main/plugin/skills/mem-search/SKILL.md

Concepts retained:

- persistent continuity across sessions;
- progressive disclosure;
- search, filter, then fetch detail;
- token-cost awareness;
- privacy and evidence citations.

Concepts intentionally not copied into this standalone skill:

- Claude Code lifecycle hooks;
- the Bun worker service;
- SQLite, FTS5, Chroma, and MCP server implementation;
- automatic transcript capture.

Those are plugin/runtime capabilities, not capabilities a standalone Codex
instruction skill can honestly provide.
