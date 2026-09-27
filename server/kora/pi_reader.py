"""pi store reader — STRICTLY read-only (ADR 0019 §1 gate 8, slice 2:
«pi-список»).

Store facts (docs/cortex-workspace-facts §2, verified read-only on the
owner's host 2026-09-22; no owner content was copied):

- ``~/.pi/agent/sessions/<mangled-cwd>/<ts>_<uuid7>.jsonl`` — append-only
  JSONL event logs; the FIRST record self-describes the session:
  ``{"type": "session", "version": "3", "id", "timestamp", "cwd"}``;
- entries are chained by ``parentId`` (a tree owned by the pi process —
  the reader never touches the chain, it only lists);
- siblings: ``subagent-artifacts/*_transcript.jsonl``,
  ``run-history.jsonl`` (run index), ``context-mode/sessions/*.db`` —
  none of them is an interactive session listing row.

Disciplines (the zcode-reader образец):
- read-only file opens; the scan leaves every byte untouched;
- caps everywhere (file size, session count, preview window);
- a malformed file is SKIPPED with a debug log — parse degradation is a
  visibility loss, never a store risk; inner (post-header) record shapes
  are parsed tolerantly (``text`` / ``content`` keys) because only the
  session header is format-stable across pi releases.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("kora.pi-reader")

DEFAULT_PI_ROOT = "~/.pi/agent/sessions"
LIVE_WINDOW_SECONDS = 2 * 60 * 60      # the ADR two-hour discipline
MAX_SESSIONS = 2000
MAX_FILE_BYTES = 32 * 1024 * 1024      # a bigger file is skipped + logged
TAIL_WINDOW_BYTES = 262_144            # preview scan window from the EOF
PREVIEW_MAX_CHARS = 400

# Files/dirs in the sessions root that are NOT interactive sessions.
_SKIP_NAMES = frozenset({"run-history.jsonl"})
_SKIP_PARTS = ("subagent-artifacts", "context-mode")


class ReaderError(RuntimeError):
    """Base — every reader failure is typed, never a bare raise."""


class StoreNotFoundError(ReaderError):
    """The pi sessions directory does not exist at the expected path."""


def _ts_to_iso(value: Any) -> str:
    """Header timestamps: ISO string, epoch seconds or epoch ms — all
    normalize to RFC 3339; unknown shapes answer '' (nullable ts)."""
    if isinstance(value, str) and value:
        try:
            stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            return stamp.isoformat(timespec="seconds")
        except ValueError:
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


def _texts_from_record(record: dict[str, Any]) -> str:
    """Tolerant text extraction from a pi event record: ``text`` key, or
    ``content`` as str / list of {type: text, text: str} parts."""
    text = record.get("text")
    if isinstance(text, str) and text.strip():
        return text
    content = record.get("content")
    if isinstance(content, str) and content.strip():
        return content
    if isinstance(content, list):
        joined = "\n".join(
            part.get("text") for part in content
            if isinstance(part, dict)
            and isinstance(part.get("text"), str))
        if joined.strip():
            return joined
    return ""


def _preview_from_tail(path: Path) -> str:
    """Newest text in the file, scanned from the tail within a byte cap
    (the append-only log puts the freshest records at the EOF)."""
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
    for line in reversed(text.splitlines()[1:]):  # drop the partial head
        line = line.strip()
        if not line:
            continue
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if not isinstance(record, dict):
            continue
        found = _texts_from_record(record).strip()
        if found:
            return found[:PREVIEW_MAX_CHARS]
    return ""


@dataclass(frozen=True)
class PiScanResult:
    """One listing scan: rows for the registry + scan diagnostics."""
    sessions: list[dict[str, Any]] = field(default_factory=list)
    scanned_at: str = ""
    store_path: str = ""
    skipped_files: int = 0


def _session_files(root: Path) -> list[Path]:
    """Interactive-session JSONLs under the sessions root: any depth,
    skipping the non-session siblings (facts §2). The tree is small
    (the owner's host had 168 files); a bounded walk keeps it honest.
    The walk is symlink-loop safe: every visited directory is recorded
    by its REALPATH (slice-2 review P3) — a cyclic symlink chain can
    only waste the loop budget, never hang the scan."""
    out: list[Path] = []
    seen: set[str] = set()
    stack = [root]
    while stack and len(out) < MAX_SESSIONS * 4:
        current = stack.pop()
        try:
            entries = sorted(current.iterdir())
        except OSError:
            continue
        for entry in entries:
            if entry.is_dir():
                real = os.path.realpath(entry)
                if real in seen:
                    continue  # symlink cycle — never walk it twice
                seen.add(real)
                if entry.name not in _SKIP_PARTS:
                    stack.append(entry)
                continue
            if entry.name in _SKIP_NAMES or entry.suffix != ".jsonl":
                continue
            out.append(entry)
    return sorted(out)


def _session_row(jsonl: Path, *, now: float,
                 live_window_seconds: int) -> dict[str, Any] | None:
    """One session JSONL → a registry row (or None when the header is
    unreadable). native_id = the header id (the uuid7), falling back to
    the file stem; cwd/project from the header."""
    try:
        if jsonl.stat().st_size > MAX_FILE_BYTES:
            log.warning("pi session file too large, skipped: %s", jsonl)
            return None
        with jsonl.open("r", encoding="utf-8", errors="replace") as fh:
            first = fh.readline()
    except OSError as exc:
        log.debug("unreadable pi session file %s: %s", jsonl, exc)
        return None
    try:
        header = json.loads(first)
    except ValueError:
        return None
    if not isinstance(header, dict) or header.get("type") != "session":
        return None
    native_id = str(header.get("id") or "") or jsonl.stem
    cwd = header.get("cwd")
    cwd = cwd if isinstance(cwd, str) else ""
    project = cwd.rstrip("/").rsplit("/", 1)[-1] if cwd else ""
    # Second stat — must not escape the OSError net: a file deleted
    # between the first stat and here (live harness churn) would
    # otherwise crash the WHOLE scan (slice-2 review P3). Skip honestly.
    try:
        mtime = jsonl.stat().st_mtime
    except OSError:
        return None
    state = "live" if mtime >= now - live_window_seconds else "idle"
    version = header.get("version")
    if version not in ("3", 3, None):
        # An unknown envelope version still lists (id/cwd are stable);
        # the note rides in the log, the coverage screen tells the gap.
        log.info("pi session %s: unknown header version %r", native_id,
                 version)
    return {
        "native_id": native_id,
        "harness": "pi",
        "project": project,
        "cwd": cwd,
        "state": state,
        "origin": "local",
        "steerable": False,   # adoption/steering is slice 3
        "started_at": _ts_to_iso(header.get("timestamp")),
        "last_activity_at": _mtime_iso(jsonl),
        "preview": _preview_from_tail(jsonl),
    }


def scan_pi_stores(root_path: str | Path = DEFAULT_PI_ROOT,
                   *, now: float | None = None,
                   live_window_seconds: int = LIVE_WINDOW_SECONDS,
                   max_sessions: int = MAX_SESSIONS) -> PiScanResult:
    """One read-only listing scan of the pi session store. A missing
    root is a typed error; an existing root with no sessions is an
    honest empty listing."""
    root = Path(os.path.expanduser(str(root_path)))
    if not root.is_dir():
        raise StoreNotFoundError(f"pi sessions dir not found: {root}")
    now = now if now is not None else datetime.now(timezone.utc).timestamp()
    rows: list[dict[str, Any]] = []
    skipped = 0
    for jsonl in _session_files(root):
        if len(rows) >= max_sessions:
            break
        row = _session_row(jsonl, now=now,
                           live_window_seconds=live_window_seconds)
        if row is None:
            skipped += 1
            continue
        rows.append(row)
    if skipped:
        log.info("pi scan skipped %d unparsable session files", skipped)
    return PiScanResult(
        sessions=rows,
        scanned_at=datetime.now(timezone.utc).isoformat(
            timespec="seconds"),
        store_path=str(root),
        skipped_files=skipped)
