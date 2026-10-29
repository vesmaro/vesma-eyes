"""Kora slice-3 relay state (ADR 0019 rev.2, the «порулить» slice).

BOARD-side relay perimeter only. The ADR's executor-side unit
(``vesmaro-session-relay.service``, rev.2 #3 — same family as the
assignment poller, in-memory queue, honest «не доставлено — повторите»)
is a separate line: until its transport plugs into ``transport`` below,
every accepted prompt resolves HONESTLY as ``failed`` (retryable).
Accepted ≠ delivered; nothing on the board pretends a store write
(NO-DRIFT: only the harness writes its own store).

What lives here (all in-memory, thread-safe, restart = clean slate —
the safe direction for unlocks and queues):

- the step-up PIN grant (rev.2 #4: TTL ≤ 15 min, OFF by default, reading
  never requires step-up). The PIN is stored ONLY as its scrypt envelope
  (the ME-080 canon — never plaintext, never logged; even the envelope's
  source env var is dropped after the first read). Deliberately STRICTER
  than the contract's «hash + length» logging analogy: a human PIN is
  low-entropy, so even a hash of attempts would be brute-forceable —
  step-up audits carry no PIN material at all;
- the prompt queue with honest KoraDelivery statuses (rev.2 #3: the
  in-memory queue + «не доставлено — повторите»; the disk spool 0600 was
  rejected by the ADR as false delivery confidence + secret surface);
- the confirm/yolo mode resolver (rev.2 #4: confirm is the default;
  yolo is an explicit per-session opt-in for RELAY-ORIGIN sessions,
  audited, never default). The opt-in WIRE is a future additive line —
  the frozen week-0 contract carries no opt-in route, so this slice only
  builds the resolver + the relay-origin invariant it must enforce.
"""

from __future__ import annotations

import hashlib
import os
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Callable

from ..security import hash_password, verify_password

# The steering PIN env (compose/chart provisioning, same class as the
# token envs). Dropped from os.environ after the first read: the process
# keeps only the scrypt verifier.
STEERING_PIN_ENV = "VESMARO_KORA_STEERING_PIN"

# Contract cap (KoraStepUpOut.ttl_seconds maximum == 900 — pinned by the
# frozen-spec gate test); the ADR's «TTL ~15 мин».
STEP_UP_TTL_SECONDS = 900

# Queue bounds (in-memory by design; overflow is an honest 429, never a
# silent drop). The bounds count UNRESOLVED (pending) prompts: the real
# flood guard for synchronous callers is the route's rate limiter — these
# bounds exist for the async transport future (a slow executor relay
# must not let one session starve the rest or grow the memory without
# bound). History keeps a capped window of resolved views (text cleared)
# for honest diagnostics.
QUEUE_MAX_TOTAL = 200
QUEUE_MAX_PER_SESSION = 20
QUEUE_HISTORY_MAX = 200

# Delivery statuses (the frozen KoraDeliveryOut enum).
STATUS_QUEUED = "queued"
STATUS_DELIVERED = "delivered"
STATUS_FAILED = "failed"


class SteeringPinNotConfigured(RuntimeError):
    """The step-up ritual is not provisioned on this board (fail-closed:
    the route answers 503, steering stays unavailable — same grammar as
    the unconfigured-token-class 503s)."""


class QueueFull(RuntimeError):
    """The in-memory queue bound was hit (total or per-session) — the
    route answers 429; the caller retries later. Nothing is dropped."""


# ------------------------------------------------------------- step-up PIN
_pin_lock = threading.Lock()
_pin_verifier: str | None = None    # scrypt envelope — NEVER plaintext
_pin_checked: bool = False          # has the lazy env read happened?

_grant_lock = threading.Lock()
_grant: dict[str, str] | None = None  # {"granted_at", "granted_until"} ISO


def configure_steering_pin(pin: str | None) -> None:
    """Set/clear the PIN verifier. The ONLY storage form is the scrypt
    envelope (ME-080 canon): the plaintext never outlives this call and
    is never logged. A PIN rotation clears any active grant — an unlock
    minted under the old PIN must not survive it."""
    global _pin_verifier, _pin_checked, _grant
    with _pin_lock:
        _pin_verifier = hash_password(pin) if pin else None
        _pin_checked = True
    with _grant_lock:
        _grant = None


def _ensure_pin_from_env() -> None:
    """Lazy first read of the provisioned PIN (import-time env reads are
    the app.py pattern; this module is import-order independent). The env
    value is consumed: os.environ keeps no PIN plaintext afterwards."""
    global _pin_checked, _pin_verifier
    if _pin_checked:
        return
    with _pin_lock:
        if _pin_checked:
            return
        pin = os.environ.pop(STEERING_PIN_ENV, "").strip()
        _pin_verifier = hash_password(pin) if pin else None
        _pin_checked = True


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def _parse_iso(value: str) -> datetime:
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def step_up_enable(pin: str) -> dict[str, str] | None:
    """Verify the PIN; on success mint a FRESH ≤900s grant. A new enable
    replaces any previous grant (a new window per ritual — never an
    extension of an older one; the contract's «sliding per grant» is
    implemented conservatively: sliding = a new window per enable, the
    window itself never grows). Returns the grant dict, or None when the
    PIN is wrong. Raises SteeringPinNotConfigured when unprovisioned."""
    global _grant
    _ensure_pin_from_env()
    with _pin_lock:
        verifier = _pin_verifier
    if verifier is None:
        raise SteeringPinNotConfigured(
            f"steering PIN is not provisioned ({STEERING_PIN_ENV})")
    if not verify_password(pin, verifier):
        return None
    with _grant_lock:
        start = _now()
        _grant = {
            "granted_at": _iso(start),
            "granted_until": _iso(start + timedelta(seconds=STEP_UP_TTL_SECONDS)),
        }
        return dict(_grant)


def step_up_active() -> bool:
    """Is a live (unexpired) grant present? An expired grant is lazily
    cleared — the status endpoint and every steering gate share this one
    answer."""
    global _grant
    with _grant_lock:
        if _grant is None:
            return False
        if _parse_iso(_grant["granted_until"]) <= _now():
            _grant = None
            return False
        return True


def step_up_status() -> dict[str, Any]:
    """The frozen KoraStepUpStatusOut payload: active + the remaining
    window (nulls when inactive)."""
    with _grant_lock:
        grant = dict(_grant) if _grant else None
    if grant is None:
        return {"active": False, "granted_until": None,
                "ttl_remaining_seconds": None}
    remaining = int((_parse_iso(grant["granted_until"]) - _now())
                    .total_seconds())
    if remaining <= 0:
        step_up_active()  # lazy-clear the expired grant
        return {"active": False, "granted_until": None,
                "ttl_remaining_seconds": None}
    return {"active": True, "granted_until": grant["granted_until"],
            "ttl_remaining_seconds": min(remaining, STEP_UP_TTL_SECONDS)}


def step_up_revoke() -> bool:
    """The one-command kill switch. True when a LIVE grant was cleared."""
    global _grant
    with _grant_lock:
        had = _grant is not None
        _grant = None
    return had


# ----------------------------------------------------------- confirm / yolo
_yolo_lock = threading.Lock()
_yolo_sessions: set[str] = set()


def set_yolo_opt_in(session_id: str, origin: str) -> bool:
    """Per-session yolo opt-in (ADR §2: explicit, audited, RELAY-origin
    only). NO wire exists in slice 3 — the frozen contract carries no
    opt-in route, so the only caller is the future additive line, which
    MUST call this from an audited ui-only route. Local-origin sessions
    are refused (the invariant, not a convention)."""
    if origin != "relay":
        return False
    with _yolo_lock:
        _yolo_sessions.add(session_id)
    return True


def clear_yolo_opt_in(session_id: str) -> None:
    with _yolo_lock:
        _yolo_sessions.discard(session_id)


def session_mode(session_id: str, origin: str) -> str:
    """confirm is the DEFAULT; yolo only for relay-origin sessions with
    an explicit opt-in. An opt-in keyed on a session_id that later
    resolves to a local-origin row still answers confirm — the origin is
    re-checked here, never trusted from the opt-in itself."""
    with _yolo_lock:
        opted = session_id in _yolo_sessions
    if opted and origin == "relay":
        return "yolo"
    return "confirm"


# ------------------------------------------------------------ delivery queue
@dataclass
class DeliveryItem:
    """One relay prompt. ``text`` lives in-memory ONLY: it is never
    served, never logged, never echoed (logs and audits carry
    sha256 + length — prompt hygiene, ADR security gate 3) and is
    CLEARED the moment the delivery reaches a terminal state — a
    resolved prompt is material nobody needs anymore (the honest trace
    is the hash + length, which stay)."""
    delivery_id: str
    session_id: str
    executor_id: str
    native_id: str
    mode: str
    confirm_required: bool
    text: str
    text_len: int
    text_sha256: str
    queued_at: str
    status: str = STATUS_QUEUED
    delivered_at: str | None = None
    retryable: bool = True
    error: str | None = None


# The executor-side transport seam. Signature: (item) -> (status, error).
# Returning ``queued`` keeps the item pending (handed off, awaiting the
# executor's own confirmation); delivered/failed settle it. None (the
# slice-3 reality) = every accepted prompt resolves failed with the
# honest «релей-транспорт не подключён» reason. The future
# vesmaro-session-relay line plugs a real handoff here without reshaping
# the API or the state machine.
transport: Callable[[DeliveryItem], tuple[str, str | None]] | None = None

_NO_TRANSPORT_MESSAGE = (
    "Промпт принят в очередь, но релей-транспорт исполнителя ещё не "
    "подключён (юнит-процесс vesmaro-session-relay — отдельная линия; "
    "срез 3 строит API-периметр руления). Не доставлено — повторите "
    "позже.")

_DEAD_SESSION_MESSAGE = (
    "Процесс сессии завершён (state=dead): доставка невозможна, сессия "
    "остаётся в реестре. Создайте новую сессию или дождитесь "
    "восстановления исполнителя.")

_queue_lock = threading.Lock()
_items: dict[str, DeliveryItem] = {}   # insertion-ordered, bounded by
#                                       QUEUE_HISTORY_MAX after settling
_pending_total = 0
_pending_by_session: dict[str, int] = {}


def enqueue_prompt(session_id: str, executor_id: str, native_id: str,
                   text: str, *, session_state: str = "idle",
                   mode: str = "confirm",
                   confirm_required: bool = True) -> DeliveryItem:
    """Queue one prompt, then run the delivery handoff synchronously (a
    real transport hands off to the executor relay; the seam keeps the
    honest queued → delivered/failed state machine identical). Raises
    QueueFull on a pending bound."""
    global _pending_total
    with _queue_lock:
        if (_pending_by_session.get(session_id, 0) >= QUEUE_MAX_PER_SESSION
                or _pending_total >= QUEUE_MAX_TOTAL):
            raise QueueFull(
                f"kora relay queue is full "
                f"(pending per-session "
                f"{_pending_by_session.get(session_id, 0)}/"
                f"{QUEUE_MAX_PER_SESSION}, pending total "
                f"{_pending_total}/{QUEUE_MAX_TOTAL}) — wait for delivery "
                "or retry later; nothing is dropped silently")
        item = DeliveryItem(
            delivery_id=uuid.uuid4().hex,
            session_id=session_id,
            executor_id=executor_id,
            native_id=native_id,
            mode=mode,
            confirm_required=confirm_required,
            text=text,
            text_len=len(text.encode("utf-8")),
            text_sha256=hashlib.sha256(text.encode("utf-8")).hexdigest(),
            queued_at=_iso(_now()),
        )
        _items[item.delivery_id] = item
        _pending_by_session[session_id] = (
            _pending_by_session.get(session_id, 0) + 1)
        _pending_total += 1
    _dispatch(item, session_state=session_state)
    return item


def _dispatch(item: DeliveryItem, *, session_state: str) -> None:
    """One delivery attempt. Never raises, never logs content: transport
    failures surface as the type name only — an exception STRING could
    carry prompt material (defense in depth; the audit payload already
    carries hash + length instead of text)."""
    if item.status != STATUS_QUEUED:
        return
    if session_state == "dead":
        status, error = STATUS_FAILED, _DEAD_SESSION_MESSAGE
        item.retryable = False
    elif transport is None:
        status, error = STATUS_FAILED, _NO_TRANSPORT_MESSAGE
    else:
        try:
            status, error = transport(item)
        except Exception as exc:  # noqa: BLE001 — type name only, see above
            status, error = STATUS_FAILED, (
                f"relay transport error: {type(exc).__name__}")
    with _queue_lock:
        item.status = status
        item.error = error
        if status == STATUS_DELIVERED:
            item.delivered_at = _iso(_now())
        if status in (STATUS_DELIVERED, STATUS_FAILED):
            _settle(item)


def _settle(item: DeliveryItem) -> None:
    """Terminal resolution (call under _queue_lock): clear the prompt
    material, free the pending bounds, prune the resolved history."""
    global _pending_total
    item.text = ""
    _pending_total = max(0, _pending_total - 1)
    left = _pending_by_session.get(item.session_id, 0) - 1
    if left > 0:
        _pending_by_session[item.session_id] = left
    else:
        _pending_by_session.pop(item.session_id, None)
    terminal_ids = [i for i, it in _items.items()
                    if it.status in (STATUS_DELIVERED, STATUS_FAILED)]
    overflow = len(_items) - QUEUE_HISTORY_MAX
    for drop_id in terminal_ids[:max(0, overflow)]:
        _items.pop(drop_id, None)


def resolve_transport_result(delivery_id: str, *, status: str,
                             error: str | None,
                             retryable: bool = True) -> bool:
    """The transport seam's ASYNC half: the executor-side relay unit
    (vesmaro-session-relay.service) reports its verdict for a handoff
    that left this board as ``queued`` (server/kora/relay_transport.py
    pickup/confirm). Settles a still-pending item through the SAME
    honest state machine as a synchronous transport result: delivered
    stamps ``delivered_at``; failed carries the retryable flag + the
    human reason (no content — the executor confirms typed reasons).
    Returns False for unknown or already-settled deliveries (a board
    restart orphans the unit's confirm — in-memory design, not a fault).
    A malformed status raises ValueError (caller contract bug)."""
    if status not in (STATUS_DELIVERED, STATUS_FAILED):
        raise ValueError(f"invalid transport resolution status: {status!r}")
    with _queue_lock:
        item = _items.get(delivery_id)
        if item is None or item.status != STATUS_QUEUED:
            return False
        item.status = status
        if status == STATUS_DELIVERED:
            item.delivered_at = _iso(_now())
            item.error = None
        else:
            item.error = error
            item.retryable = bool(retryable)
        _settle(item)
    return True


def delivery_view(item: DeliveryItem) -> dict[str, Any]:
    """The frozen KoraDeliveryOut payload — the ONLY projection of a
    queue item: statuses and the honest error line, never the text."""
    return {
        "status": item.status,
        "queued_at": item.queued_at,
        "delivered_at": item.delivered_at,
        "retryable": item.retryable,
        "error": item.error,
    }


def queue_snapshot() -> list[dict[str, Any]]:
    """Queue views in arrival order (tests / honest diagnostics). Views
    carry no prompt text by construction (delivery_view); resolved items
    additionally carry empty text inside the item itself."""
    with _queue_lock:
        items = list(_items.values())
    return [delivery_view(i) for i in items]


def reset_all() -> None:
    """Test/drain seam: clear grants, queue, yolo opt-ins and the
    transport seam. The drain ritual for runtime updates (ADR §2) uses
    the same primitives — a restart is a clean slate by design."""
    global _grant, transport, _pending_total
    with _grant_lock:
        _grant = None
    with _queue_lock:
        _items.clear()
        _pending_total = 0
        _pending_by_session.clear()
    with _yolo_lock:
        _yolo_sessions.clear()
    transport = None
