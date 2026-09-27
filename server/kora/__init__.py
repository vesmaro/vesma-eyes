"""Kora feature package (ADR 0019 rev.2 — phase 1).

Slice 1 modules:
- ``redaction``  — the SINGLE content choke-point (x-kora-redaction).
- ``zcode_reader`` — read-only store reader (mode=ro + WAL fallback).

Slice 2 additions:
- ``vscode_reader`` — read-only chatSessions JSONL scanner (envelope v3).
- ``pi_reader``     — read-only session-log scanner (parentId chains).

No module here writes to any harness store: Кора = view + relay, never
a fork (NO-DRIFT).
"""