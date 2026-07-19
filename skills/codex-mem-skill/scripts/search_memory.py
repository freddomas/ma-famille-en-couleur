#!/usr/bin/env python3
"""Search Codex's file-backed memory store without modifying it."""

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class Hit:
    score: int
    path: Path
    line: int
    text: str


def memory_root(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    return (codex_home / "memories").resolve()


def candidate_files(root: Path, scope: str) -> Iterable[Path]:
    groups = {
        "registry": [root / "MEMORY.md"],
        "summary": [root / "memory_summary.md"],
        "rollouts": sorted((root / "rollout_summaries").glob("*.md")),
        "skills": sorted((root / "skills").rglob("*.md")),
    }
    if scope == "all":
        for name in ("registry", "summary", "rollouts", "skills"):
            yield from groups[name]
        return
    yield from groups[scope]


def score_line(line: str, phrase: str, terms: list[str]) -> int:
    folded = line.casefold()
    score = 0
    if phrase and phrase in folded:
        score += 12
    for term in terms:
        count = folded.count(term)
        if count:
            score += 2 + min(count, 3)
    return score


def search(root: Path, query: str, scope: str, limit: int) -> list[Hit]:
    phrase = " ".join(query.casefold().split())
    terms = [term for term in re.split(r"\W+", phrase) if len(term) > 1]
    hits: list[Hit] = []

    for path in candidate_files(root, scope):
        if not path.is_file():
            continue
        try:
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
        except OSError:
            continue
        for index, line in enumerate(lines, start=1):
            score = score_line(line, phrase, terms)
            if score:
                hits.append(Hit(score, path, index, line.strip()))

    hits.sort(key=lambda hit: (-hit.score, str(hit.path).casefold(), hit.line))
    return hits[:limit]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search Codex memory with phrase- and term-weighted ranking."
    )
    parser.add_argument("query", help="Distinctive repository, symbol, path, or phrase")
    parser.add_argument(
        "--scope",
        choices=("registry", "summary", "rollouts", "skills", "all"),
        default="registry",
    )
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--root", help="Override the memory root")
    parser.add_argument(
        "--json",
        action="store_true",
        help="Emit one JSON object per hit instead of readable text",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.limit < 1 or args.limit > 200:
        raise SystemExit("--limit must be between 1 and 200")

    root = memory_root(args.root)
    if not root.is_dir():
        raise SystemExit(f"Memory root not found: {root}")

    hits = search(root, args.query, args.scope, args.limit)
    for hit in hits:
        relative = hit.path.relative_to(root)
        record = {
            "score": hit.score,
            "file": relative.as_posix(),
            "line": hit.line,
            "text": hit.text,
        }
        if args.json:
            print(json.dumps(record, ensure_ascii=False))
        else:
            print(
                f"{record['score']:>2} {record['file']}:{record['line']} "
                f"{record['text']}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
