#!/usr/bin/env python3
"""vesmaro-session-relay — the executor-side relay unit (ADR 0019
rev.2 #3, line A1).

The assignment-poller family member that turns board steering into real
harness deliveries: poll → inject → confirm.

  POST {board}/api/executors/{id}/kora-relay/pickup    pull parked
        steering commands (FIFO, ≤ batch_limit) — the ONLY leg that
        carries prompt text, executor-token authenticated;
  <driver>                                             inject the prompt
        into the live harness session on THIS host;
  POST {board}/api/executors/{id}/kora-relay/confirm   settle the honest
        queued → delivered/failed state machine with the verdict.

Auth (the class boundary, deliberately tighter than the scanner): the
unit takes $VESMARO_EXECUTOR_TOKEN ONLY — no VESMARO_BOARD_TOKEN
fallback. Pickup/confirm are content-class steering surfaces on the
board and admit no machine token; the unit acts AS its executor, so the
executor token is the legal credential (ADR: «executor-токен, никаких
board-классовых кредов за пределами хоста»). Env only, never a config
file, never a log line.

Injection (the ADR week-0 P0 fact-check, closed 2026-10-29 on zcode
0.17.0): the plain CLI has NO argv-free prompt channel except stdin —
``-p/--prompt`` requires a value (argv leak, the rejected
zcode-headless.sh pattern) while ``--prompt=-`` reads the prompt from
STDIN (verified by a stdin-hold timing probe). The default driver
therefore spawns the headless harness exactly as the ADR ratifies —

    <command> --cwd <cwd> --resume <native_id> --prompt=- --json --mode <m>

— prompt material rides the child's stdin ONLY, never argv, never an
env var, never a shell. The app-server leg (ADR priority option) stays
behind the same driver seam for a later line: its wire protocol is
vendor-internal and undocumented, and guessing frames into the deliver
was rejected (pragmatism over invention).

Delivery semantics (honest, NO-DRIFT): «delivered» = the harness
ACCEPTED the prompt and the turn is in flight (the store gets the tail
via the harness itself; the browser reads it through the B-leg) —
NOT «the turn finished». Classification: the child exits 0 within the
grace window → delivered; it exits non-zero → failed (typed, retryable
unless the native id is simply unknown); it is alive at the grace
deadline → delivered, the turn continues under a background watcher.
A full turn is never waited on, never killed: unit shutdown leaves
running children alone (the poller precedent — the next start's
recovery is the board's dead-session honesty, and the store stays the
single source of truth).

Per-session writer mutex (ADR §2): one injection at a time per native
session id, held for the child's whole lifetime (a steering prompt
lands after the previous turn frees the session — same as typing in
the GUI). A prompt that cannot get the lock within lock_wait_seconds
confirms failed/retryable «сессия занята» instead of blocking the
queue past the board's in-flight window.

Audit (gate 3): every decision lands in the JSONL audit as ids +
prompt sha256 + byte length — never the text, never the token.
"""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import logging
import os
import random
import re
import signal
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import yaml

log = logging.getLogger("kora.relay")

POLL_INTERVAL_DEFAULT = 5.0       # seconds between pickup calls
POLL_JITTER_DEFAULT = 1.5         # ± seconds on the interval
BATCH_LIMIT_DEFAULT = 8
INJECTION_GRACE_DEFAULT = 10.0    # delivered-classification window
LOCK_WAIT_DEFAULT = 120.0         # per-session writer-mutex bound
CONFIRM_RETRIES = 5               # a settled delivery must reach the board
CONFIRM_BACKOFF = 1.5             # exponential base between confirm tries
STDERR_CLASSIFY_CAP = 4000        # scanned tail for typed failure classes

# Typed, content-free failure classes (scanned on the child's stderr
# tail; the error STRING that reaches the board is ours, never the raw
# harness output — defense in depth against prompt echoes).
_SESSION_NOT_FOUND_RE = re.compile(r"Session not found", re.IGNORECASE)
_AUTH_RE = re.compile(r"not (?:logged )?in|unauthenticated|login required",
                      re.IGNORECASE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _state_dir() -> Path:
    base = os.environ.get("XDG_STATE_HOME") or "~/.local/state"
    return Path(base).expanduser() / "vesma-eyes"


def _config_dir() -> Path:
    base = os.environ.get("XDG_CONFIG_HOME") or "~/.config"
    return Path(base).expanduser() / "vesma-eyes"


# --------------------------------------------------------------------- errors
class RelayUnitError(RuntimeError):
    """Base class — every unit failure is typed, never a bare raise."""


class ConfigError(RelayUnitError):
    """Invalid relay.yaml — refuse to start (fail-closed at load time)."""


class BoardError(RelayUnitError):
    """Board call failed (transport or unexpected HTTP status)."""

    def __init__(self, status: int, path: str, detail: str):
        super().__init__(f"board {status} on {path}: {detail}")
        self.status = status
        self.path = path
        self.detail = detail


# --------------------------------------------------------------------- config
@dataclass(frozen=True)
class DriverConfig:
    """The steering driver. v1 ships ``zcode-stdin``; the app-server leg
    is a future driver behind the same seam (see module docstring)."""

    harness: str
    command: tuple[str, ...]
    mode_map: dict[str, str] = field(
        default_factory=lambda: {"confirm": "build", "yolo": "yolo"})

    def mode_arg(self, mode: str) -> str:
        # confirm is the board default; yolo is an explicit opt-in —
        # the mapping is config-visible so the host-side permission
        # semantics are an owner decision, not a hidden constant.
        return self.mode_map.get(mode, self.mode_map.get("confirm", "build"))


@dataclass(frozen=True)
class RelayConfig:
    board_url: str
    executor_id: str
    poll_interval: float = POLL_INTERVAL_DEFAULT
    poll_jitter: float = POLL_JITTER_DEFAULT
    batch_limit: int = BATCH_LIMIT_DEFAULT
    injection_grace: float = INJECTION_GRACE_DEFAULT
    lock_wait: float = LOCK_WAIT_DEFAULT
    ca_bundle: str = ""
    audit_path: Path = field(
        default_factory=lambda: _state_dir() / "relay-audit.jsonl")
    lock_path: Path = field(default_factory=lambda: _state_dir() / "relay.lock")
    driver: DriverConfig = field(default_factory=lambda: DriverConfig(
        harness="zcode-stdin", command=("zcode-stdin-headless.sh",)))

    @classmethod
    def from_file(cls, path: Path | str) -> "RelayConfig":
        path = Path(path).expanduser()
        try:
            raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        except FileNotFoundError as exc:
            raise ConfigError(f"config not found: {path}") from exc
        except yaml.YAMLError as exc:
            raise ConfigError(f"config is not valid YAML: {path}: {exc}") from exc
        if not isinstance(raw, dict):
            raise ConfigError("config root must be a mapping")
        return cls.from_dict(raw)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "RelayConfig":
        board_url = str(raw.get("board_url") or "").strip().rstrip("/")
        if not re.fullmatch(r"https?://\S+", board_url):
            raise ConfigError(
                f"board_url must be an http(s) base URL, got: {board_url!r}")
        executor_id = str(raw.get("executor_id") or "").strip()
        if not 1 <= len(executor_id) <= 120:
            raise ConfigError("executor_id must be 1..120 chars")

        def _number(key: str, default: float, *, minimum: float) -> float:
            value = raw.get(key, default)
            try:
                value = float(value)
            except (TypeError, ValueError) as exc:
                raise ConfigError(f"{key} must be a number") from exc
            if value < minimum:
                raise ConfigError(f"{key} must be >= {minimum}")
            return value

        batch_limit = raw.get("batch_limit", BATCH_LIMIT_DEFAULT)
        if isinstance(batch_limit, bool) or not isinstance(batch_limit, int) \
                or not 1 <= batch_limit <= 32:
            raise ConfigError("batch_limit must be an integer 1..32")

        driver_raw = raw.get("driver") or {}
        if not isinstance(driver_raw, dict):
            raise ConfigError("driver must be a mapping")
        harness = str(driver_raw.get("harness") or "zcode-stdin").strip()
        if harness != "zcode-stdin":
            raise ConfigError(
                f"unknown driver harness: {harness!r} (v1 ships "
                "'zcode-stdin'; the app-server leg is a future driver)")
        command = driver_raw.get("command") or ["zcode-stdin-headless.sh"]
        if isinstance(command, str):
            command = [command]
        if (not isinstance(command, list) or not command
                or not all(isinstance(t, str) and t.strip() for t in command)):
            raise ConfigError("driver.command must be a non-empty string list")
        mode_map_raw = driver_raw.get("mode_map") or {}
        if not isinstance(mode_map_raw, dict):
            raise ConfigError("driver.mode_map must be a mapping")
        mode_map: dict[str, str] = dict(
            {"confirm": "build", "yolo": "yolo"})
        for key, value in mode_map_raw.items():
            if key not in ("confirm", "yolo"):
                raise ConfigError(
                    f"driver.mode_map keys are confirm|yolo, got: {key!r}")
            mode_map[key] = str(value)
        ca_bundle = str(raw.get("ca_bundle") or "").strip()
        if ca_bundle and not Path(ca_bundle).expanduser().is_file():
            raise ConfigError(f"ca_bundle not found: {ca_bundle}")
        audit = raw.get("audit_path")
        lock = raw.get("lock_path")
        return cls(
            board_url=board_url,
            executor_id=executor_id,
            poll_interval=_number("poll_interval", POLL_INTERVAL_DEFAULT,
                                  minimum=0.5),
            poll_jitter=_number("poll_jitter", POLL_JITTER_DEFAULT,
                                minimum=0.0),
            batch_limit=batch_limit,
            injection_grace=_number("injection_grace",
                                    INJECTION_GRACE_DEFAULT, minimum=0.5),
            lock_wait=_number("lock_wait", LOCK_WAIT_DEFAULT, minimum=1.0),
            ca_bundle=ca_bundle,
            audit_path=Path(audit).expanduser() if audit
            else _state_dir() / "relay-audit.jsonl",
            lock_path=Path(lock).expanduser() if lock
            else _state_dir() / "relay.lock",
            driver=DriverConfig(
                harness=harness,
                command=tuple(command),
                mode_map=mode_map),
        )


# ---------------------------------------------------------------- board client
@dataclass(frozen=True)
class SteeringCommand:
    """One picked-up delivery (the pickup payload contract, see
    server/kora/relay_transport.py). ``text`` is the injection material;
    it never reaches a log, an audit row or an exception string."""

    delivery_id: str
    session_id: str
    native_id: str
    mode: str
    confirm_required: bool
    text: str
    cwd: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "SteeringCommand":
        """Boundary check: a malformed 200 must surface as a typed
        BoardError, never as a KeyError crashing the loop."""
        missing = [k for k in ("delivery_id", "session_id", "native_id",
                               "mode", "confirm_required", "text")
                   if k not in payload]
        if missing:
            raise BoardError(200, "pickup", f"missing fields: {missing}")
        return cls(
            delivery_id=str(payload["delivery_id"]),
            session_id=str(payload["session_id"]),
            native_id=str(payload["native_id"]),
            mode=str(payload["mode"]),
            confirm_required=bool(payload["confirm_required"]),
            text=str(payload["text"]),
            cwd=str(payload.get("cwd") or ""),
        )


class RelayBoardClient:
    """Thin HTTP face of the board's relay transport API (executor
    class). ``transport`` is injectable for tests (httpx.MockTransport —
    the poller BoardClient pattern)."""

    def __init__(self, board_url: str, executor_id: str, token: str, *,
                 transport: httpx.BaseTransport | None = None,
                 timeout: float = 15.0, verify: str | bool = True):
        if not token:
            raise ConfigError(
                "executor token is empty — set VESMARO_EXECUTOR_TOKEN "
                "(the relay unit takes NO board/machine token fallback: "
                "pickup is content-class steering)")
        self.executor_id = executor_id
        self._http = httpx.Client(
            base_url=board_url.rstrip("/"),
            headers={"Authorization": f"Bearer {token}"},
            transport=transport,
            timeout=httpx.Timeout(timeout),
            verify=verify,
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> "RelayBoardClient":
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.close()

    def _request(self, method: str, path: str, *,
                 params: dict[str, Any] | None = None,
                 json_body: dict[str, Any] | None = None) -> dict[str, Any]:
        try:
            resp = self._http.request(method, path, params=params,
                                      json=json_body)
        except httpx.HTTPError as exc:
            raise BoardError(0, path, f"transport: {exc}") from exc
        if resp.status_code >= 400:
            detail = resp.text[:300]
            try:
                detail = str(resp.json().get("detail", detail))
            except ValueError:
                pass
            raise BoardError(resp.status_code, path, detail)
        try:
            body = resp.json()
        except ValueError as exc:
            raise BoardError(resp.status_code, path,
                             "response is not JSON") from exc
        if not isinstance(body, dict):
            raise BoardError(resp.status_code, path, "response is not an object")
        return body

    def pickup(self, limit: int) -> list[SteeringCommand]:
        path = f"/api/executors/{self.executor_id}/kora-relay/pickup"
        body = self._request("POST", path, params={"limit": limit})
        items = body.get("items")
        if not isinstance(items, list):
            raise BoardError(200, path, "missing items list")
        commands: list[SteeringCommand] = []
        for payload in items:
            if not isinstance(payload, dict):
                raise BoardError(200, path, "malformed pickup item")
            commands.append(SteeringCommand.from_payload(payload))
        return commands

    def confirm(self, delivery_id: str, status: str, *, error: str = "",
                retryable: bool = True) -> bool:
        """Returns the board's ``resolved`` flag: False means the board
        no longer knows the delivery (restart = clean slate) — not an
        error; the unit drops it and moves on."""
        path = f"/api/executors/{self.executor_id}/kora-relay/confirm"
        body = self._request("POST", path, json_body={
            "delivery_id": delivery_id,
            "status": status,
            "error": error or None,
            "retryable": retryable,
        })
        return bool(body.get("resolved"))


# ------------------------------------------------------------------- audit log
class AuditLog:
    """Append-only local relay log (the poller AuditLog pattern): one
    JSON per line, ids + hashes + lengths ONLY — the prompt text and the
    token never enter a record (ADR gate 3)."""

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def append(self, *, event: str, delivery_id: str = "",
               native_id: str = "", mode: str = "", confirm_required: bool = False,
               prompt_len: int = 0, prompt_sha256: str = "",
               pid: int | None = None, outcome: str = "") -> None:
        record = {
            "ts": _now_iso(), "event": event,
            "delivery_id": delivery_id, "native_id": native_id,
            "mode": mode, "confirm_required": confirm_required,
            "prompt_len": prompt_len, "prompt_sha256": prompt_sha256,
            "pid": pid, "outcome": outcome,
        }
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")


# ----------------------------------------------------------------- results
@dataclass(frozen=True)
class SteeringResult:
    """The driver's verdict — maps 1:1 onto the board confirm body."""

    delivered: bool
    error: str = ""            # content-free typed reason (failed only)
    retryable: bool = True

    @property
    def status(self) -> str:
        return "delivered" if self.delivered else "failed"


def _classify_failure(stderr_tail: str, rc: int) -> SteeringResult:
    """Typed, content-free failure mapping: the board gets OUR sentence,
    never the raw harness output (a harness echo of the prompt must not
    ride the confirm body)."""
    if _SESSION_NOT_FOUND_RE.search(stderr_tail):
        return SteeringResult(
            delivered=False,
            error="harness: unknown session (native id not in the store)",
            retryable=False)   # a retry cannot create the session
    if _AUTH_RE.search(stderr_tail):
        return SteeringResult(
            delivered=False,
            error="harness not authenticated (owner login required on "
                  "the executor host)",
            retryable=True)
    return SteeringResult(
        delivered=False,
        error=f"harness exited rc={rc}",
        retryable=True)


# ------------------------------------------------------------------- drivers
class ZcodeStdinDriver:
    """The default steering driver (module docstring has the wire). The
    invocation is process-group isolated (start_new_session — the child
    survives terminal signals, the poller precedent) and prompt material
    is piped to the child's stdin — NEVER argv, NEVER an env var."""

    def __init__(self, config: DriverConfig, grace: float, lock_wait: float,
                 audit: AuditLog, *,
                 clock: Any = time.monotonic):
        self.config = config
        self.grace = grace
        self.lock_wait = lock_wait
        self.audit = audit
        self._clock = clock
        self._meta_lock = threading.Lock()
        self._session_locks: dict[str, threading.Lock] = {}

    def _lock_for(self, native_id: str) -> threading.Lock:
        with self._meta_lock:
            return self._session_locks.setdefault(native_id,
                                                  threading.Lock())

    def inject(self, command: SteeringCommand) -> SteeringResult:
        """One injection with the full honest semantics (see module
        docstring). Never raises; never logs content. Exactly one path
        releases the writer mutex: instant exit → _finish_exited, spawn
        failure → here, running child → the exit watcher."""
        session_lock = self._lock_for(command.native_id)
        if not session_lock.acquire(timeout=self.lock_wait):
            return SteeringResult(
                delivered=False,
                error="session busy: the previous relay turn still holds "
                      "the writer mutex — повторите позже",
                retryable=True)
        return self._spawn_and_classify(command, session_lock)

    def _spawn_and_classify(self, command: SteeringCommand,
                            session_lock: threading.Lock) -> SteeringResult:
        argv = list(self.config.command)
        argv[0] = os.path.expanduser(argv[0])
        extra = ["--resume", command.native_id, "--prompt=-", "--json",
                 "--mode", self.config.mode_arg(command.mode)]
        if command.cwd and os.path.isdir(command.cwd):
            extra = ["--cwd", command.cwd] + extra
        argv = argv + extra
        prompt_bytes = command.text.encode("utf-8")
        try:
            proc = subprocess.Popen(
                argv,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
                start_new_session=True,
            )
        except OSError as exc:
            session_lock.release()
            return SteeringResult(
                delivered=False,
                error=f"spawn failed: {type(exc).__name__}",
                retryable=True)
        try:
            # The OS pipe buffer is far larger than the 32000-char
            # contract cap — the write cannot block the loop.
            proc.stdin.write(prompt_bytes)
            proc.stdin.close()
        except (BrokenPipeError, OSError):
            pass   # the child died instantly; classification handles it
        deadline = self._clock() + self.grace
        while self._clock() < deadline:
            rc = proc.poll()
            if rc is not None:
                return self._finish_exited(command, proc, rc, session_lock)
            time.sleep(0.05)
        # Alive at the grace deadline → the harness accepted the prompt
        # and the turn is in flight. The watcher releases the writer
        # mutex when the child exits; the unit does NOT wait for the
        # turn (delivery ≠ completion).
        pid = proc.pid
        threading.Thread(target=self._watch_exit,
                         args=(command, proc, session_lock),
                         name=f"relay-watch-{command.native_id}",
                         daemon=True).start()
        self.audit.append(event="delivered", delivery_id=command.delivery_id,
                          native_id=command.native_id, mode=command.mode,
                          confirm_required=command.confirm_required,
                          prompt_len=len(prompt_bytes),
                          prompt_sha256=hashlib.sha256(
                              prompt_bytes).hexdigest(),
                          pid=pid, outcome="in-flight")
        return SteeringResult(delivered=True)

    def _finish_exited(self, command: SteeringCommand,
                       proc: subprocess.Popen, rc: int,
                       session_lock: threading.Lock) -> SteeringResult:
        session_lock.release()
        tail = ""
        try:
            stderr = proc.stderr.read(STDERR_CLASSIFY_CAP) \
                if proc.stderr else b""
            tail = stderr.decode("utf-8", errors="replace")
        except (OSError, ValueError):
            tail = ""
        result = SteeringResult(delivered=True) if rc == 0 \
            else _classify_failure(tail, rc)
        self.audit.append(
            event=result.status, delivery_id=command.delivery_id,
            native_id=command.native_id, mode=command.mode,
            confirm_required=command.confirm_required,
            prompt_len=len(command.text.encode("utf-8")),
            prompt_sha256=hashlib.sha256(
                command.text.encode("utf-8")).hexdigest(),
            pid=proc.pid,
            outcome="exited-0" if rc == 0 else f"exited-{rc}")
        return result

    def _watch_exit(self, command: SteeringCommand,
                    proc: subprocess.Popen,
                    session_lock: threading.Lock) -> None:
        """Release the writer mutex when the turn's child exits; the
        outcome is the harness store's business (NO-DRIFT) — the audit
        line keeps the pid trail only."""
        rc = proc.wait()
        session_lock.release()
        self.audit.append(event="turn-exit", delivery_id=command.delivery_id,
                          native_id=command.native_id, pid=proc.pid,
                          outcome=f"rc={rc}")


# -------------------------------------------------------------------- unit
class RelayUnit:
    """The poll loop: pickup → inject → confirm. Single-threaded by
    design (the poller discipline); turns continue on daemon watchers."""

    def __init__(self, config: RelayConfig, board: RelayBoardClient,
                 driver: ZcodeStdinDriver, audit: AuditLog):
        self.config = config
        self.board = board
        self.driver = driver
        self.audit = audit
        self._stop = threading.Event()

    def request_stop(self) -> None:
        self._stop.set()

    def run(self, max_cycles: int | None = None) -> None:
        cycles = 0
        while not self._stop.is_set():
            self.step()
            cycles += 1
            if max_cycles is not None and cycles >= max_cycles:
                break
            self._sleep_poll()

    def step(self) -> None:
        try:
            commands = self.board.pickup(self.config.batch_limit)
        except BoardError as exc:
            log.error("pickup: %s", exc)
            return
        for command in commands:
            if self._stop.is_set():
                break
            self._deliver(command)

    def _deliver(self, command: SteeringCommand) -> None:
        log.info("delivery %s: session %s mode=%s confirm=%s len=%d",
                 command.delivery_id[:12], command.session_id, command.mode,
                 command.confirm_required, len(command.text.encode("utf-8")))
        result = self.driver.inject(command)
        self._confirm_with_retries(command, result)

    def _confirm_with_retries(self, command: SteeringCommand,
                              result: SteeringResult) -> None:
        """A settled delivery MUST reach the board (the poller's
        FINISH_RETRIES discipline): bounded retries with backoff; past
        the bound the audit records ``unconfirmed`` — the board's
        in-flight sweep resolves the item honestly later."""
        delay = CONFIRM_BACKOFF
        for attempt in range(1, CONFIRM_RETRIES + 1):
            try:
                resolved = self.board.confirm(
                    command.delivery_id, result.status,
                    error=result.error, retryable=result.retryable)
            except BoardError as exc:
                log.error("confirm %s (attempt %d/%d) failed: %s",
                          command.delivery_id[:12], attempt, CONFIRM_RETRIES,
                          exc)
                if attempt == CONFIRM_RETRIES:
                    self.audit.append(
                        event="unconfirmed",
                        delivery_id=command.delivery_id,
                        native_id=command.native_id, mode=command.mode,
                        prompt_len=len(command.text.encode("utf-8")),
                        prompt_sha256=hashlib.sha256(
                            command.text.encode("utf-8")).hexdigest(),
                        outcome=result.status)
                    log.critical(
                        "delivery %s settled %s but the board was not told "
                        "after %d tries — the in-flight sweep will resolve "
                        "it honestly", command.delivery_id[:12],
                        result.status, CONFIRM_RETRIES)
                    return
                time.sleep(delay)
                delay *= 2
                continue
            if resolved:
                log.info("delivery %s → %s (resolved)",
                         command.delivery_id[:12], result.status)
            else:
                log.info(
                    "delivery %s → %s (board no longer tracks it — "
                    "restart clean slate; dropped)",
                    command.delivery_id[:12], result.status)
            return

    def _sleep_poll(self) -> None:
        interval = self.config.poll_interval
        jitter = self.config.poll_jitter
        self._stop.wait(max(0.0,
                            random.uniform(interval - jitter,
                                           interval + jitter)))


def acquire_singleton_lock(lock_path: Path) -> "int | None":
    """fcntl.flock singleton (the poller discipline). Returns the held
    fd or None."""
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        return None
    return fd


def executor_token() -> str:
    """$VESMARO_EXECUTOR_TOKEN ONLY (the class boundary — see module
    docstring). Never the board/machine token."""
    token = os.environ.get("VESMARO_EXECUTOR_TOKEN", "").strip()
    if not token:
        raise ConfigError(
            "VESMARO_EXECUTOR_TOKEN is not set — the relay unit takes "
            "no board-token fallback (pickup/confirm are content-class "
            "steering; the token lives in the environment, never in a "
            "file)")
    return token


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="vesmaro-session-relay — the Kora executor relay "
                    "unit (ADR 0019 rev.2 #3)")
    parser.add_argument("--config",
                        default=str(_config_dir() / "relay.yaml"),
                        help="path to relay.yaml (default: "
                             "~/.config/vesma-eyes/relay.yaml)")
    parser.add_argument("--once", action="store_true",
                        help="config/token validation + a single DRY "
                             "cycle: pickup, injection and confirm are "
                             "LOGGED, not performed (pickup is a board "
                             "mutation — a dry run must not move items)")
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    try:
        token = executor_token()
        config = RelayConfig.from_file(args.config)
    except ConfigError as exc:
        log.error("config error: %s", exc)
        return 2

    lock_fd = acquire_singleton_lock(config.lock_path)
    if lock_fd is None:
        log.error("another relay unit holds %s — exiting",
                  config.lock_path)
        return 3

    audit = AuditLog(config.audit_path)
    driver = ZcodeStdinDriver(config.driver, config.injection_grace,
                              config.lock_wait, audit)

    def _on_signal(signum: int, _frame: Any) -> None:
        log.info("signal %s received — stopping after this cycle", signum)
        unit.request_stop()

    dry_run = args.once
    log.info("relay unit start: board=%s executor=%s driver=%s "
             "grace=%.1fs dry_run=%s",
             config.board_url, config.executor_id,
             config.driver.harness, config.injection_grace, dry_run)
    if dry_run:
        audit.append(event="dry-run", outcome="config-ok")
        log.info("dry run: config and token are valid — nothing picked "
                 "up, nothing injected (pickup is a board mutation)")
        board = RelayBoardClient(config.board_url, config.executor_id,
                                 token, verify=config.ca_bundle or True)
        board.close()
        os.close(lock_fd)
        return 0

    board = RelayBoardClient(config.board_url, config.executor_id, token,
                             verify=config.ca_bundle or True)
    unit = RelayUnit(config, board, driver, audit)
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)
    try:
        unit.run()
    finally:
        board.close()
        os.close(lock_fd)
        log.info("relay unit stopped; running turns were left alone (the "
                 "harness owns its store; restart clears session locks)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
