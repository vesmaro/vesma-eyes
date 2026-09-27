"""zcode store reader — STRICTLY read-only (ADR 0019 §6 gate 8).

The one module that opens the harness store. Disciplines:

- ``mode=ro`` URI open, ALWAYS. A write through this reader is a bug:
  sqlite itself refuses (``attempt to write a readonly database``).
- WAL-snapshot-fallback on the cold start: when the store directory has no
  ``-shm`` (no live harness process has initialized the shared-memory
  index), a read-only open of a WAL database fails with
  ``SQL_READONLY_CANTINIT`` (cannot build the shm without write access).
  The fallback copies ``db.sqlite`` + ``db.sqlite-wal`` into a tmpdir and
  reads the COPY — reading through a snapshot, never opening the store
  for write (the copy is a read of the store files, not a write to it).
- No rollout/model-io: the listing reads the ``session`` table only.
  Previews read the newest ``text`` part of the session (``part`` table,
  JSON), capped and redacted upstream.

Schema facts (verified read-only against the live store 2026-09-25,
docs/cortex-workspace-facts §2):
- session(id TEXT PK, parent_id, directory, title, task_type,
  time_created/time_updated INTEGER epoch-ms)
- part(id, message_id, session_id, time_created, sequence, data JSON;
  data.type='text' carries data.text)

Session liveness (heuristic, honest): ``time_updated`` within the
presence window (default 2h, the ADR's presence discipline) → ``live``;
else ``idle``; archived sessions (time_archived NOT NULL) → ``dead`` —
dead rows STAY in the registry (recovery semantics, contract note).
Subagent sessions (id LIKE 'sess_subagent%') are folded into their
parent: a subagent row is not an independent workspace session for the
owner's list — the parent's time_updated already accounts for the work.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sqlite3
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger("kora.zcode-reader")

DEFAULT_DB_PATH = "~/.zcode/cli/db/db.sqlite"
# Presence window (seconds) — the ADR's two-hour presence discipline,
# applied to SESSION liveness (presence ≠ liveness: executor presence is
# a separate registry clock).
LIVE_WINDOW_SECONDS = 2 * 60 * 60


class ReaderError(RuntimeError):
    """Base — every reader failure is typed, never a bare raise."""


class StoreNotFoundError(ReaderError):
    """The zcode store file does not exist at the expected path."""


class StoreUnreadableError(ReaderError):
    """The store exists but could not be opened read-only even via the
    WAL snapshot fallback."""


class SessionNotFoundError(ReaderError):
    """The requested native session id does not exist in this store
    (transcript serving, slice 2). The board maps it to 404
    session_not_found — the registry row and the store may disagree
    (e.g. a remote-host session whose store this host does not carry)."""


def _ro_uri(path: Path) -> str:
    return f"file:{path}?mode=ro"


def _epoch_ms_to_iso(value: int | None) -> str:
    """epoch-ms (zcode time_*) → RFC 3339 seconds, UTC (contract format).
    Empty string when None/0 (the contract's nullable timestamps)."""
    if not value:
        return ""
    try:
        return datetime.fromtimestamp(
            value / 1000.0, tz=timezone.utc).isoformat(timespec="seconds")
    except (ValueError, OverflowError, OSError):
        return ""


@dataclass(frozen=True)
class ZcodeScanResult:
    """One listing scan: rows for the registry + scan diagnostics."""
    sessions: list[dict[str, Any]]
    scanned_at: str
    store_path: str
    via_fallback: bool


def _connect_ro(db_path: Path) -> tuple[sqlite3.Connection, str | None]:
    """Open the store read-only; on the cold-start WAL failure fall back
    to a tmp snapshot copy. Returns (connection, tmpdir): tmpdir is None
    on a direct ro-open, the snapshot directory on the fallback path.

    The slice-1 review P3 lesson lives here: sqlite3.Connection supports
    NEITHER __dict__ NOR weak references — both the con-attribute stash
    and a weakref.finalize cleanup are impossible on it. The tmpdir
    therefore rides the RETURN VALUE and the caller owns the pair;
    scan_zcode_store closes it in a finally. close_ro(con, tmpdir) is
    the ONE explicit cleanup path.
    """
    if not db_path.is_file():
        raise StoreNotFoundError(f"zcode store not found: {db_path}")
    try:
        con = sqlite3.connect(_ro_uri(db_path), uri=True, timeout=5.0)
        con.execute("SELECT 1 FROM sqlite_master LIMIT 1").fetchone()
        return con, None
    except sqlite3.Error as exc:
        # Cold start (no -shm) or any other ro-open failure → snapshot.
        log.info("ro open failed (%s); falling back to WAL snapshot "
                 "copy", exc)
    tmpdir = tempfile.mkdtemp(prefix="kora-zcode-ro-")
    copy = Path(tmpdir) / db_path.name
    try:
        shutil.copyfile(db_path, copy)
        wal = db_path.parent / (db_path.name + "-wal")
        if wal.is_file():
            shutil.copyfile(wal, Path(tmpdir) / wal.name)
            # A -shm of the ORIGINAL must never ride along: the snapshot
            # builds its own shared memory from db+wal.
    except OSError as exc:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise StoreUnreadableError(
            f"cannot snapshot the zcode store: {exc}") from exc
    try:
        con = sqlite3.connect(_ro_uri(copy), uri=True, timeout=5.0)
        con.execute("SELECT 1 FROM sqlite_master LIMIT 1").fetchone()
    except sqlite3.Error as exc:
        con.close()
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise StoreUnreadableError(
            f"zcode store unreadable even via snapshot: {exc}") from exc
    return con, tmpdir


def close_ro(con: sqlite3.Connection,
             tmpdir: str | None = None) -> None:
    """Close a reader connection; removes the fallback tmpdir when the
    caller holds it (the (con, tmpdir) pair from _connect_ro)."""
    tmpdir = tmpdir or getattr(con, "_kora_tmpdir", None)  # legacy attr
    con.close()
    if tmpdir:
        shutil.rmtree(tmpdir, ignore_errors=True)


def _last_text_preview(con: sqlite3.Connection, session_id: str) -> str:
    """Newest text part of the session (raw; the caller redacts). Cap at
    400 chars here — the registry column bound is 2000, the serving path
    clamps to 160 anyway, and 400 keeps the ingest payload lean."""
    rows = con.execute(
        "SELECT data FROM part WHERE session_id=? "
        "ORDER BY time_created DESC LIMIT 40",
        (session_id,)).fetchall()
    for raw in rows:
        try:
            data = json.loads(raw[0])
        except (ValueError, TypeError):
            continue
        if isinstance(data, dict) and data.get("type") == "text":
            text = data.get("text")
            if isinstance(text, str) and text.strip():
                return text.strip()[:400]
    return ""


def scan_zcode_store(db_path: str | Path = DEFAULT_DB_PATH,
                     *, now: float | None = None,
                     live_window_seconds: int = LIVE_WINDOW_SECONDS,
                     include_subagents: bool = False) -> ZcodeScanResult:
    """One read-only listing scan of a zcode store.

    Returns registry-ready rows: native_id, harness='zcode',
    project/cwd (from directory), state (live/idle/dead heuristic),
    origin='local' (slice-1 scanner sees local sessions only), started_at
    / last_activity_at ISO, preview (RAW — redaction is the board's
    serving choke-point; the ingest transport is authenticated TLS of the
    poller family and the column bound caps the payload).

    Archived sessions are ALWAYS listed as ``dead`` — the contract's
    recovery semantics (``dead`` keeps the session in the registry and
    visible); the ADR's «владелец видит, что происходило» forbids hiding
    archived history from the slice-1 list.
    """
    path = Path(os.path.expanduser(str(db_path)))
    con, tmpdir = _connect_ro(path)
    try:
        now = now if now is not None else datetime.now(timezone.utc).timestamp()
        rows: list[dict[str, Any]] = []
        cur = con.execute(
            "SELECT id, parent_id, directory, title, time_created, "
            "time_updated, time_archived FROM session "
            "WHERE parent_id IS NULL ORDER BY time_updated DESC LIMIT 2000")
        for sid, _parent, directory, title, tc, tu, tarch in cur.fetchall():
            if sid.startswith("sess_subagent") and not include_subagents:
                continue  # folded into the parent session
            if tarch is not None:
                state = "dead"
            elif (tu or 0) / 1000.0 >= now - live_window_seconds:
                state = "live"
            else:
                state = "idle"
            preview = _last_text_preview(con, sid)
            rows.append({
                "native_id": sid,
                "harness": "zcode",
                "project": (directory or "").rstrip("/").rsplit("/", 1)[-1],
                "cwd": directory or "",
                "state": state,
                "origin": "local",
                "steerable": False,  # local sessions: adoption is slice 3
                "started_at": _epoch_ms_to_iso(tc),
                "last_activity_at": _epoch_ms_to_iso(tu),
                "preview": preview,
            })
        return ZcodeScanResult(
            sessions=rows,
            scanned_at=datetime.now(timezone.utc).isoformat(
                timespec="seconds"),
            store_path=str(path),
            via_fallback=tmpdir is not None)
    finally:
        close_ro(con, tmpdir)


# ------------------------------------------------- transcript (slice 2)
# The ONE transcript-serving source for zcode sessions (frozen contract
# GET /kora/sessions/{id}/transcript). Read-only discipline is THE SAME
# as the listing: mode=ro + WAL-snapshot-fallback, no rollout/model-io.
#
# Schema facts (live-store verified read-only 2026-09-27, keys only —
# no owner content leaves the store):
# - message(id, session_id, time_created, time_updated, data JSON,
#   sequence); message.data carries ``role`` (user/assistant).
# - part(id, message_id, session_id, time_created, time_updated,
#   sequence, data JSON); part.data.type ∈ {text, reasoning, tool,
#   step-start, step-finish}; text/reasoning carry ``text``; tool
#   carries {tool, callID, state:{title, status, input, output, ...}}.
#
# Content policy: the reader returns RAW text — masking is the board's
# single choke-point (server/kora/redaction.py redact_body) on the
# serving path. The reader's only caps are LOAD caps (bounded memory on
# a 2 GB store), applied honestly with an explicit truncation marker
# inside the content, never a silent cut.
TRANSCRIPT_MAX_ITEMS = 4000        # newest parts kept (head is dropped)
TRANSCRIPT_ITEM_MAX_CHARS = 20000  # per-item content cap (tool outputs)


@dataclass(frozen=True)
class ZcodeTranscriptResult:
    """One transcript read: the cursor page in store order + read
    diagnostics.

    ``seq`` is the part's ABSOLUTE ascending position in the session
    (anchored to the indexed part count; structural parts leave gaps but
    never shift the numbering) — the frozen contract: «seq is never
    renumbered», and the cursor stays valid when the ``max_items`` window
    slides over sessions longer than the window. ``head_dropped`` marks
    an honest head truncation by TRANSCRIPT_MAX_ITEMS; the first item of
    the served page carries the explicit head-cut marker then. The cursor
    bookkeeping (next_after_seq / has_more) is resolved HERE — the page
    is exactly the frozen KoraTranscriptOut.items content."""
    items: list[dict[str, Any]] = field(default_factory=list)
    next_after_seq: int = 0
    has_more: bool = False
    head_dropped: bool = False
    store_path: str = ""
    via_fallback: bool = False


def _message_role(raw: str | None) -> str:
    """Role from message.data JSON (tolerant: a torn/mid-write row or a
    missing message degrades to ``system`` — content still serves)."""
    if raw:
        try:
            data = json.loads(raw)
        except (ValueError, TypeError):
            return "system"
        if isinstance(data, dict):
            role = data.get("role")
            if role in ("user", "assistant", "system", "tool"):
                return str(role)
    return "system"


def _truncate(text: str) -> str:
    """Load cap with an EXPLICIT marker — silent truncation is hostile
    (the owner must see that the reader cut the payload, and how much)."""
    if len(text) <= TRANSCRIPT_ITEM_MAX_CHARS:
        return text
    dropped = len(text) - TRANSCRIPT_ITEM_MAX_CHARS
    return (text[:TRANSCRIPT_ITEM_MAX_CHARS]
            + f"… [обрезано ридером Коры: {dropped} символов]")


def _part_item(pdata: dict[str, Any], role: str) -> dict[str, Any] | None:
    """One part → transcript item dict (seq assigned by the caller), or
    None for structural markers that carry no content (step-start /
    step-finish — turn boundaries, not transcript material)."""
    kind = pdata.get("type")
    if kind == "text":
        text = pdata.get("text")
        if not isinstance(text, str):
            return None
        return {"role": role, "kind": None,
                "content": _truncate(text)}
    if kind == "reasoning":
        text = pdata.get("text")
        if not isinstance(text, str) or not text:
            return None
        return {"role": "assistant", "kind": "reasoning",
                "content": _truncate(text)}
    if kind == "tool":
        tool = pdata.get("tool")
        state = pdata.get("state")
        state = state if isinstance(state, dict) else {}
        pieces: list[str] = []
        title = state.get("title")
        if isinstance(title, str) and title.strip():
            pieces.append(title.strip())
        status = state.get("status")
        if isinstance(status, str) and status.strip():
            pieces.append(f"status: {status.strip()}")
        output = state.get("output")
        if isinstance(output, str) and output.strip():
            pieces.append(output.strip())
        elif isinstance(output, (dict, list)):
            # structured output (object OR array) — render its JSON so
            # the owner still sees the material (redaction masks
            # credential shapes inside); a bare list was silently lost
            # before the slice-2 review P3 fix.
            try:
                pieces.append(json.dumps(output, ensure_ascii=False,
                                         indent=2))
            except (TypeError, ValueError):
                pass
        if not pieces:
            return None
        label = tool if isinstance(tool, str) and tool else "tool"
        return {"role": "tool", "kind": label,
                "content": _truncate("\n".join(pieces))}
    return None


def read_zcode_transcript(
        db_path: str | Path = DEFAULT_DB_PATH, native_id: str = "",
        *, after_seq: int = 0, limit: int = 50,
        max_items: int = TRANSCRIPT_MAX_ITEMS) -> ZcodeTranscriptResult:
    """One read-only transcript page of a zcode session (slice 2).

    Reads the newest ``max_items`` parts of the session (store order) and
    returns the frozen cursor page: items with ``seq > after_seq``, first
    ``limit`` of them, plus next_after_seq / has_more (next_after_seq
    stays at the request's cursor when the page is empty — the contract's
    exact wording). The content is RAW — the serving path redacts it
    through the choke-point. Unknown session → SessionNotFoundError
    (404 upstream).

    Seq stability (slice-2 review P2-2): ``seq`` is the part's ABSOLUTE
    ascending position in the session (1-based, from a cheap indexed
    COUNT) — structural parts leave GAPS in the numbering but never
    shift it, so the cursor survives the sliding ``max_items`` window
    even on sessions longer than the window («seq is never renumbered»).
    When the window drops a head (sessions > max_items parts), the FIRST
    item of every page carries an explicit marker naming how many head
    records were cut — silent truncation is hostile (P2-1).
    """
    if not native_id:
        raise SessionNotFoundError("empty native session id")
    limit = max(1, min(int(limit), 200))
    path = Path(os.path.expanduser(str(db_path)))
    con, tmpdir = _connect_ro(path)
    try:
        exists = con.execute(
            "SELECT 1 FROM session WHERE id=?", (native_id,)).fetchone()
        if exists is None:
            raise SessionNotFoundError(
                f"session not found in store: {native_id}")
        # Total parts anchor the seq numbering (cheap: part_session_idx
        # — measured 5 ms against the live 2 GB store, 2026-09-27).
        total = con.execute(
            "SELECT COUNT(*) FROM part WHERE session_id=?",
            (native_id,)).fetchone()[0]
        # The newest ``max_items`` parts, then reversed to store order —
        # a bounded read of a multi-GB store; an overflowing HEAD is
        # dropped and reported (honest truncation).
        rows = con.execute(
            "SELECT p.id, p.time_created, p.data, m.data "
            "FROM part p LEFT JOIN message m ON m.id = p.message_id "
            "WHERE p.session_id=? "
            "ORDER BY p.time_created DESC, p.sequence DESC, p.id DESC "
            "LIMIT ?", (native_id, max_items + 1)).fetchall()
        head_dropped = len(rows) > max_items
        head_dropped_count = max(0, total - min(len(rows), max_items))
        rows = list(reversed(rows[:max_items]))
        # Absolute ascending position of the FIRST kept part: everything
        # before it was dropped by the window cap.
        base = total - len(rows) + 1
        items: list[dict[str, Any]] = []
        for offset, (_pid, ptc, praw, mraw) in enumerate(rows):
            try:
                pdata = json.loads(praw)
            except (ValueError, TypeError):
                continue
            if not isinstance(pdata, dict):
                continue
            piece = _part_item(pdata, _message_role(mraw))
            if piece is None:
                continue  # structural part — leaves a GAP in the seq
            piece["seq"] = base + offset
            piece["ts"] = _epoch_ms_to_iso(ptc)
            piece["redaction_applied"] = False  # the choke-point sets it
            items.append(piece)
        window = [it for it in items if it["seq"] > after_seq]
        page = window[:limit]
        if head_dropped and page:
            # P2-1: the head cut must SPEAK. The marker rides the first
            # item of EVERY page while the head stays dropped — a client
            # starting mid-history still learns what it never got.
            page[0]["content"] = (
                f"…[начало транскрипта обрезано ридером Коры: "
                f"{head_dropped_count} записей]…\n" + page[0]["content"])
        return ZcodeTranscriptResult(
            items=page,
            next_after_seq=(page[-1]["seq"] if page else after_seq),
            has_more=len(window) > len(page),
            head_dropped=head_dropped,
            store_path=str(path),
            via_fallback=tmpdir is not None)
    finally:
        close_ro(con, tmpdir)