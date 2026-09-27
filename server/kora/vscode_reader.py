"""VS Code Copilot Chat store reader — STRICTLY read-only (ADR 0019
§1 gate 8, slice 2: «vscode — списки (метаданные+превью)»).

Store facts (docs/cortex-workspace-facts §2, verified read-only on the
owner's hosts 2026-09-22; no owner content was copied):

- ``~/.config/Code/User/workspaceStorage/<wsHash>/chatSessions/<uuid>.jsonl``
  plus ``globalStorage/emptyWindowChatSessions/*.jsonl`` (no workspace);
- the folder mapping lives in ``workspaceStorage/<wsHash>/workspace.json``
  ({"folder": "file:///..."});
- format: a JSONL envelope — the first line ``{"kind": 0, "v": {version: 3,
  sessionId, requests…}}``, then incremental ``{"kind": 1, "k": […],
  "v": …}`` patches. Full transcript requires patch application — the
  KNOWN GAP of slice 2 (kind:1); this reader serves LISTS + previews only
  (coverage «lists-only»), from the kind:0 envelope and the file tail.

Disciplines (the zcode-reader образец):
- opens files with plain ``open(..., "r")`` — a write through this reader
  is a bug; the scan leaves every byte untouched (anti-write tests);
- caps everywhere: per-file tail window, per-item preview cap, session
  count cap — a big workspace tree never becomes an unbounded scan;
- a malformed/unparsable file is SKIPPED with a debug log — parse
  degradation is a visibility loss, never a store risk (the ADR's
  accepted residual risk, tracked per runtime upgrade).
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("kora.vscode-reader")

DEFAULT_VSCODE_ROOT = "~/.config/Code/User"
# Presence window (seconds) — the ADR's two-hour discipline, applied to
# SESSION liveness via file mtime (vscode has no liveness signal beyond
# the last file write; presence ≠ liveness is still the rule).
LIVE_WINDOW_SECONDS = 2 * 60 * 60
# Scan caps (honest load bounds, not content policy).
MAX_SESSIONS = 2000
MAX_FILE_BYTES = 32 * 1024 * 1024     # a bigger file is skipped + logged
TAIL_WINDOW_BYTES = 262_144           # preview scan window from the EOF
PREVIEW_MAX_CHARS = 400               # registry column bound is 2000


class ReaderError(RuntimeError):
    """Base — every reader failure is typed, never a bare raise."""


class StoreNotFoundError(ReaderError):
    """The vscode User directory does not exist at the expected path."""


def _epoch_or_iso(value: Any) -> str:
    """Envelope timestamps arrive as ISO strings, epoch seconds or epoch
    milliseconds depending on the VS Code release — all three normalize
    to RFC 3339; unknown shapes answer '' (contract's nullable ts)."""
    if isinstance(value, str) and value:
        return value
    if isinstance(value, (int, float)) and value > 0:
        ms = value if value > 1e11 else value * 1000.0
        try:
            return datetime.fromtimestamp(
                ms / 1000.0, tz=timezone.utc).isoformat(timespec="seconds")
        except (ValueError, OverflowError, OSError):
            return ""
    return ""


def _mtime_iso(path: Path) -> str:
    try:
        return datetime.fromtimestamp(
            path.stat().st_mtime, tz=timezone.utc).isoformat(timespec="seconds")
    except OSError:
        return ""


def _folder_from_workspace_json(path: Path) -> tuple[str, str]:
    """workspace.json → (cwd, project). The folder value is a file:// URI;
    multi-root workspaces (a list) answer the first folder; unparsable →
    ('', '') — the session still lists, honestly without a project."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return "", ""
    folder = data.get("folder") if isinstance(data, dict) else None
    if isinstance(folder, list):
        folder = next((f for f in folder if isinstance(f, str)), None)
    if not isinstance(folder, str) or not folder:
        return "", ""
    cwd = folder
    if folder.startswith("file://"):
        from urllib.parse import unquote, urlparse
        cwd = unquote(urlparse(folder).path)
    project = cwd.rstrip("/").rsplit("/", 1)[-1] if cwd else ""
    return cwd, project


def _text_from_message(message: Any) -> str:
    """Tolerant text extraction from a chat request/response message:
    str, {text: str}, or a parts list of {text: str} (the inner shapes
    varied across VS Code releases; the reader takes what is there)."""
    if isinstance(message, str):
        return message
    if isinstance(message, dict):
        text = message.get("text")
        if isinstance(text, str):
            return text
        parts = message.get("parts")
        if isinstance(parts, list):
            joined = "\n".join(
                p.get("text") for p in parts
                if isinstance(p, dict) and isinstance(p.get("text"), str))
            if joined.strip():
                return joined
    return ""


def _preview_from_envelope(envelope: dict[str, Any]) -> str:
    """The LAST request's text out of the kind:0 envelope (the cap keeps
    the ingest payload lean; masking is the board's choke-point). Takes
    the WHOLE parsed first line and reaches through ``v``."""
    v = envelope.get("v")
    if not isinstance(v, dict):
        return ""
    requests = v.get("requests")
    if not isinstance(requests, list):
        return ""
    for request in reversed(requests):
        if not isinstance(request, dict):
            continue
        text = _text_from_message(request.get("message")).strip()
        if text:
            return text[:PREVIEW_MAX_CHARS]
    return ""


def _preview_from_tail(path: Path) -> str:
    """Tail-window preview for envelope files whose kind:0 header does
    not carry the last request (large sessions). Reads AT MOST the last
    TAIL_WINDOW_BYTES; kind:1 patch lines carry {"v": …} values whose
    text fields may hold the newest message — tolerant scan, newest
    text wins. Read-only, byte-capped."""
    try:
        size = path.stat().st_size
        with path.open("rb") as fh:
            if size > TAIL_WINDOW_BYTES:
                fh.seek(size - TAIL_WINDOW_BYTES)
            raw = fh.read(TAIL_WINDOW_BYTES)
    except OSError as exc:
        log.debug("tail read failed for %s: %s", path, exc)
        return ""
    text = raw.decode("utf-8", errors="replace")
    # drop the (almost surely partial) first line of the window
    lines = text.splitlines()[1:]
    for line in reversed(lines):
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if not isinstance(record, dict):
            continue
        candidate = record.get("v")
        found = _text_from_message(candidate).strip() \
            if not isinstance(candidate, dict) \
            else (_text_from_message(candidate.get("message")).strip()
                  or _text_from_message(candidate).strip())
        if found:
            return found[:PREVIEW_MAX_CHARS]
    return ""


@dataclass(frozen=True)
class VscodeScanResult:
    """One listing scan: rows for the registry + scan diagnostics."""
    sessions: list[dict[str, Any]] = field(default_factory=list)
    scanned_at: str = ""
    store_path: str = ""
    skipped_files: int = 0


def _session_row(jsonl: Path, cwd: str, project: str,
                 *, now: float, live_window_seconds: int) -> dict[str, Any] | None:
    """One chatSessions/<uuid>.jsonl → a registry row (or None when the
    envelope is unreadable). The file's mtime is the only liveness and
    last-activity signal vscode exposes externally."""
    try:
        if jsonl.stat().st_size > MAX_FILE_BYTES:
            log.warning("vscode session file too large, skipped: %s", jsonl)
            return None
        with jsonl.open("r", encoding="utf-8", errors="replace") as fh:
            first = fh.readline()
    except OSError as exc:
        log.debug("unreadable vscode session file %s: %s", jsonl, exc)
        return None
    try:
        envelope = json.loads(first)
    except ValueError:
        return None
    if not isinstance(envelope, dict) or envelope.get("kind") != 0:
        return None
    v = envelope.get("v")
    native_id = ""
    if isinstance(v, dict):
        native_id = str(v.get("sessionId") or "")
    native_id = native_id or jsonl.stem
    # Second stat — must not escape the OSError net: a file deleted
    # between the first stat and here would otherwise crash the WHOLE
    # scan (same class as the slice-2 review P3 on pi_reader). Skip.
    try:
        mtime = jsonl.stat().st_mtime
    except OSError:
        return None
    state = "live" if mtime >= now - live_window_seconds else "idle"
    preview = _preview_from_envelope(envelope)
    if not preview:
        preview = _preview_from_tail(jsonl)
    created = v.get("creationDate") if isinstance(v, dict) else None
    return {
        "native_id": native_id,
        "harness": "vscode",
        "project": project or "",
        "cwd": cwd,
        "state": state,
        "origin": "local",
        "steerable": False,   # vscode has no continuation surface (facts §2)
        "started_at": _epoch_or_iso(created),
        "last_activity_at": _mtime_iso(jsonl),
        "preview": preview,
    }


def scan_vscode_stores(user_root: str | Path = DEFAULT_VSCODE_ROOT,
                       *, now: float | None = None,
                       live_window_seconds: int = LIVE_WINDOW_SECONDS,
                       max_sessions: int = MAX_SESSIONS) -> VscodeScanResult:
    """One read-only listing scan of the VS Code Copilot Chat stores.

    Walks ``<user_root>/workspaceStorage/<wsHash>/chatSessions/*.jsonl``
    (project via workspace.json) and ``<user_root>/globalStorage/
    emptyWindowChatSessions/*.jsonl`` (project unknown → ''). A missing
    User directory is a typed error; an existing dir with no sessions is
    an honest empty listing.
    """
    root = Path(os.path.expanduser(str(user_root)))
    if not root.is_dir():
        raise StoreNotFoundError(f"vscode user dir not found: {root}")
    now = now if now is not None else datetime.now(timezone.utc).timestamp()
    rows: list[dict[str, Any]] = []
    skipped = 0
    chat_roots: list[tuple[Path, str, str]] = []
    for ws_dir in sorted((root / "workspaceStorage").glob("*")):
        if not ws_dir.is_dir():
            continue
        cwd, project = _folder_from_workspace_json(ws_dir / "workspace.json")
        chat_roots.append((ws_dir / "chatSessions", cwd, project))
    chat_roots.append((root / "globalStorage" / "emptyWindowChatSessions",
                       "", ""))
    for chat_dir, cwd, project in chat_roots:
        if not chat_dir.is_dir():
            continue
        for jsonl in sorted(chat_dir.glob("*.jsonl")):
            if len(rows) >= max_sessions:
                break
            row = _session_row(jsonl, cwd, project, now=now,
                               live_window_seconds=live_window_seconds)
            if row is None:
                skipped += 1
                continue
            rows.append(row)
    if skipped:
        log.info("vscode scan skipped %d unparsable session files", skipped)
    return VscodeScanResult(
        sessions=rows,
        scanned_at=datetime.now(timezone.utc).isoformat(
            timespec="seconds"),
        store_path=str(root),
        skipped_files=skipped)
