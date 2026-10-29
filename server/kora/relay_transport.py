"""Kora relay transport — the board-side handoff (ADR 0019 rev.2 #3).

The async half of the transport seam in :mod:`server.kora.relay`. The
executor-side unit (``vesmaro-session-relay.service`` — the assignment-
poller family: same token ladder, same supervision pattern) cannot be
called synchronously from the send path, so a delivery for a relay-
capable executor is PARKED here and stays honestly ``queued`` on the
board («accepted ≠ delivered») until the unit confirms:

  POST /api/executors/{id}/kora-relay/pickup    — the unit pulls its
        pending steering commands (executor token ONLY — see below);
  POST /api/executors/{id}/kora-relay/confirm   — the unit reports
        delivered / failed(+retryable) per delivery id.

State is in-memory ONLY (rev.2 #3: the disk spool 0600 was rejected —
false delivery confidence + secret surface) and per-process, so a board
restart is a clean slate: items the unit never picked up disappear with
the process — the same honest direction as the queue itself.

Pull, not push, because the ADR fixes the family (the poller pattern)
and the seam contract anticipates it — server/kora/relay.py: "Returning
``queued`` keeps the item pending (handed off, awaiting the executor's
own confirmation)".

Access class (сверено с _guard-ами): pickup and confirm accept an
APPROVED EXECUTOR token bound to the path identity — NEVER the machine
token. The kora-scan ingest admits the machine class because a listing
is metadata; steering prompts are ui-class CONTENT, and the machine
token is deliberately handed to autostarted agent children
(scripts/assignment_poller.py CHILD_ENV_KEYS) — letting it read steering
material would give every launched agent a scoop channel. The ADR's
«executor-токен, никаких board-классовых кредов за пределами хоста» is
enforced here by construction.

Capability gate: the handoff parks a delivery only when the executor is
approved AND carries the owner-declared ``session-relay`` capability
(default OFF — ADR gate 7). Without it the send path keeps answering the
honest failed/retryable (a better reason than the no-transport line,
same semantics).

Hygiene: prompt text lives in the parked payload only (it must reach
the executor to be injected) and is wiped by the queue's own settle
path on terminal resolution; audits carry ids + counts, never content.
"""

from __future__ import annotations

import json
import threading
from typing import Any, Callable

from . import relay as kora_relay

# Owner-declared executor capability (executors.capabilities — free-form
# owner-managed strings; ADR 0019 gate 7 «capability session-relay
# default OFF»).
CAPABILITY = "session-relay"

# A parked delivery that is NEVER picked up resolves failed (retryable)
# after this long — the queue bounds must not leak by a silent parked
# item, and the owner must see «не доставлено — повторите», not an
# eternal «queued».
PENDING_TTL_SECONDS = 300

# A picked-up delivery the unit never confirms (unit died mid-flight;
# confirm retries exhausted) resolves failed (retryable) after this
# long. In-memory honest recovery: the turn MAY have reached the store —
# the message says exactly that, unconfirmed ≠ not delivered.
INFLIGHT_TTL_SECONDS = 3600

PICKUP_DEFAULT_LIMIT = 8
PICKUP_MAX_LIMIT = 32

ExecutorLookup = Callable[[str], dict[str, Any] | None]
SessionLookup = Callable[[str, str], dict[str, Any] | None]

_lock = threading.Lock()
_pending: dict[str, list[dict[str, Any]]] = {}   # executor_id -> [payload]
_inflight: dict[str, dict[str, Any]] = {}        # delivery_id -> envelope
_lookup: ExecutorLookup | None = None
_session_lookup: SessionLookup | None = None

_NO_CAPABILITY_MESSAGE = (
    "У исполнителя не подключён реле-транспорт (capability "
    "session-relay выключена либо исполнитель не approved). "
    "Не доставлено — повторите позже.")


class RelayTransportError(RuntimeError):
    """Typed board-side handoff failure (never carries prompt text)."""


def _caps(executor: dict[str, Any]) -> set[str]:
    try:
        raw = json.loads(executor.get("capabilities") or "[]")
    except (TypeError, ValueError):
        return set()
    return {c for c in raw if isinstance(c, str)}


def install(lookup_executor: ExecutorLookup, *,
            lookup_session: SessionLookup | None = None) -> None:
    """Plug the handoff into the transport seam (idempotent). The
    lookups are injected (app.py passes ``store.get_executor`` and
    ``store.kora_session``) so this module never imports the store
    directly (import-order independence). The session lookup enriches
    the pickup payload with the registry's fresh ``cwd`` (the unit's
    driver passes ``--cwd`` so the resumed turn lands in the project)."""
    global _lookup, _session_lookup
    _lookup = lookup_executor
    _session_lookup = lookup_session
    kora_relay.transport = _transport


def uninstall() -> None:
    """Test/drain seam: clear the outbox and detach from the seam (the
    honest no-transport semantics return)."""
    global _lookup, _session_lookup
    with _lock:
        _pending.clear()
        _inflight.clear()
    _lookup = None
    _session_lookup = None
    kora_relay.transport = None


def _payload(item: kora_relay.DeliveryItem, picked_at: str | None) -> dict[str, Any]:
    """The executor-facing pickup envelope. ``text`` rides ONLY here and
    only to the owning executor over the executor-token leg — the audit
    and every view carry hash + length instead (gate 3)."""
    row = (_session_lookup(item.executor_id, item.native_id)
           if _session_lookup else None)
    return {
        "delivery_id": item.delivery_id,
        "session_id": f"{item.executor_id}:{item.native_id}",
        "native_id": item.native_id,
        "executor_id": item.executor_id,
        "mode": item.mode,
        "confirm_required": item.confirm_required,
        "text": item.text,
        "text_len": item.text_len,
        "text_sha256": item.text_sha256,
        "queued_at": item.queued_at,
        "picked_at": picked_at,
        "cwd": (row.get("cwd") if row else None) or "",
    }


def _transport(item: kora_relay.DeliveryItem) -> tuple[str, str | None]:
    """The seam callable (server/kora/relay.py signature). Never raises
    and never logs content — _dispatch turns an exception into the type
    name only, and every returned failure is the honest retryable kind."""
    executor = _lookup(item.executor_id) if _lookup else None
    if (executor is None or executor.get("state") != "approved"
            or CAPABILITY not in _caps(executor)):
        return (kora_relay.STATUS_FAILED, _NO_CAPABILITY_MESSAGE)
    now = kora_relay._iso(kora_relay._now())
    with _lock:
        _sweep_locked(now)
        _pending.setdefault(item.executor_id, []).append(
            _payload(item, picked_at=None) | {"_enqueued_at": now,
                                              "_item": item})
    return (kora_relay.STATUS_QUEUED, None)


def _sweep_locked(now: str) -> int:
    """Resolve parked-forever / confirmed-never items (call under the
    lock). Returns the number resolved. Both TTLs end in the SAME honest
    place: failed, retryable, a reason the owner can act on."""
    resolved = 0
    for executor_id, items in list(_pending.items()):
        keep: list[dict[str, Any]] = []
        for entry in items:
            if (_seconds_since(now, entry["_enqueued_at"])
                    >= PENDING_TTL_SECONDS):
                _resolve_entry(entry, kora_relay.STATUS_FAILED,
                               "Реле-исполнитель не забрал промпт "
                               f"за {PENDING_TTL_SECONDS}s — повторите.")
                resolved += 1
            else:
                keep.append(entry)
        if keep:
            _pending[executor_id] = keep
        else:
            _pending.pop(executor_id, None)
    for delivery_id, entry in list(_inflight.items()):
        if (_seconds_since(now, entry["picked_at"])
                >= INFLIGHT_TTL_SECONDS):
            _inflight.pop(delivery_id, None)
            _resolve_entry(entry, kora_relay.STATUS_FAILED,
                           "Реле-исполнитель не отчиталось о доставке "
                           f"за {INFLIGHT_TTL_SECONDS}s — подтверждение "
                           "не получено, повторите при необходимости.")
            resolved += 1
    return resolved


def _seconds_since(now: str, since: str) -> float:
    return (kora_relay._parse_iso(now) - kora_relay._parse_iso(since)
            ).total_seconds()


def _resolve_entry(entry: dict[str, Any], status: str, error: str) -> None:
    """Settle a swept entry through the queue's own state machine (the
    item reference is the one kora_relay.enqueue_prompt returned — the
    resolve clears the text and frees the pending bounds)."""
    item: kora_relay.DeliveryItem = entry["_item"]
    if status == kora_relay.STATUS_FAILED:
        kora_relay.resolve_transport_result(
            item.delivery_id, status=status, error=error, retryable=True)
    else:  # defensive — sweeps never deliver
        kora_relay.resolve_transport_result(
            item.delivery_id, status=status, error=None)


def pickup(executor_id: str, limit: int) -> list[dict[str, Any]]:
    """Atomically move up to ``limit`` pending deliveries into the
    in-flight window and return their executor-facing payloads (text
    included — the injection material). Order is FIFO per executor."""
    now = kora_relay._iso(kora_relay._now())
    with _lock:
        _sweep_locked(now)
        entries = _pending.get(executor_id, [])[:max(1, limit)]
        if not entries:
            return []
        rest = _pending.get(executor_id, [])[len(entries):]
        if rest:
            _pending[executor_id] = rest
        else:
            _pending.pop(executor_id, None)
        picked: list[dict[str, Any]] = []
        for entry in entries:
            entry["picked_at"] = now
            _inflight[entry["delivery_id"]] = entry
            payload = {k: v for k, v in entry.items() if not k.startswith("_")}
            picked.append(payload)
        return picked


def confirm(executor_id: str, delivery_id: str, status: str,
            error: str | None, retryable: bool) -> bool:
    """Apply the unit's delivery verdict. Ingest binding (ADR gate 1):
    only the executor the item was parked under may confirm it. Returns
    False (honestly, no error) for unknown/already-settled deliveries —
    a board restart orphans the unit's confirm, that is the in-memory
    design, not a fault."""
    if status not in (kora_relay.STATUS_DELIVERED, kora_relay.STATUS_FAILED):
        raise RelayTransportError(f"invalid delivery status: {status!r}")
    with _lock:
        entry = _inflight.get(delivery_id)
        if entry is None or entry["executor_id"] != executor_id:
            return False
        _inflight.pop(delivery_id, None)
    resolved = kora_relay.resolve_transport_result(
        delivery_id, status=status,
        error=(error or None) if status == kora_relay.STATUS_FAILED else None,
        retryable=retryable)
    return resolved


def outbox_snapshot() -> dict[str, Any]:
    """Test/diagnostics view — counts only, NEVER content."""
    with _lock:
        return {
            "pending_by_executor": {k: len(v)
                                    for k, v in _pending.items()},
            "inflight": len(_inflight),
        }


def reset_for_tests() -> None:
    """Test seam: same as uninstall, named for test readability."""
    uninstall()
