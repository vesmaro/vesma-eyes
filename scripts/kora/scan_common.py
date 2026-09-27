#!/usr/bin/env python3
"""Shared Kora scanner plumbing (ADR 0019 — the poller family).

One board-push implementation for every harness scanner: read-only
listing → POST {board}/api/executors/{id}/kora-scan. Auth, transport and
the verdict contract are IDENTICAL across zcode/vscode/pi (scan_zcode.py
was the образец; slice 2 deduplicated it here instead of copying it).

Exit codes (every scanner main()):
0 = pushed (even an empty listing — an honest empty scan);
1 = configuration error; 2 = store unreadable; 3 = board rejected.
"""

from __future__ import annotations

import logging
import os
import sys

import httpx

log = logging.getLogger("kora.scan")

DEFAULT_BOARD_URL = "https://board.local"   # overridden by --board-url


class ScannerConfigError(RuntimeError):
    """Bad CLI/env combination — refuse to start (fail-closed)."""


class BoardPushError(RuntimeError):
    """The board rejected the scan (typed; the status code rides along)."""

    def __init__(self, status: int, detail: str):
        super().__init__(f"board {status}: {detail}")
        self.status = status


def scanner_token() -> str:
    token = (os.environ.get("VESMARO_EXECUTOR_TOKEN")
             or os.environ.get("VESMARO_BOARD_TOKEN") or "").strip()
    if not token:
        raise ScannerConfigError(
            "no token: set VESMARO_EXECUTOR_TOKEN (preferred) or "
            "VESMARO_BOARD_TOKEN in the environment — never in a file")
    return token


def push_scan(board_url: str, executor_id: str, sessions: list[dict],
              *, drop_missing: bool = True, token: str = "",
              transport: httpx.BaseTransport | None = None,
              timeout: float = 30.0, verify: str | bool = True) -> dict:
    """Upsert the listing on the board. Returns the ingest verdict
    (scanned/upserted/listed/dropped). ``transport`` is the test seam
    (httpx.MockTransport — the poller BoardClient pattern)."""
    token = token or scanner_token()
    url = board_url.rstrip("/") + f"/api/executors/{executor_id}/kora-scan"
    body = {"sessions": sessions, "drop_missing": drop_missing}
    try:
        with httpx.Client(transport=transport, timeout=timeout,
                          verify=verify) as client:
            resp = client.post(
                url, json=body,
                headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as exc:
        raise BoardPushError(0, f"transport: {exc}") from exc
    if resp.status_code >= 400:
        raise BoardPushError(resp.status_code, resp.text[:300])
    try:
        verdict = resp.json()
    except ValueError as exc:
        raise BoardPushError(resp.status_code, "response is not JSON") from exc
    if not isinstance(verdict, dict) or "upserted" not in verdict:
        raise BoardPushError(resp.status_code, "malformed ingest verdict")
    return verdict


def setup_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s")


def resolve_ca_bundle(ca_bundle: str) -> str | bool:
    """--ca-bundle validation shared by every scanner main(): a missing
    bundle file is a CONFIG error (exit 1 upstream), not a push error."""
    if ca_bundle and not os.path.isfile(ca_bundle):
        print(f"ca bundle not found: {ca_bundle}", file=sys.stderr)
        raise ScannerConfigError(f"ca bundle not found: {ca_bundle}")
    return ca_bundle or True


def log_scan_result(log: logging.Logger, count: int, states: dict[str, int],
                    *, via_fallback: bool = False, store_path: str = "",
                    extra: str = "") -> None:
    """The one structured scan log line (observability standard):
    counts by state + the fallback/store facts, never session content."""
    suffix = f" {extra}" if extra else ""
    log.info("scanned %d sessions (%s) via_fallback=%s store=%s%s",
             count, states, via_fallback, store_path, suffix)
