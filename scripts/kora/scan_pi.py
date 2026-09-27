#!/usr/bin/env python3
"""Kora pi scanner — host-side listing push (ADR 0019, slice 2).

Reads the local pi session store STRICTLY read-only
(server/kora/pi_reader.py — self-describing JSONL logs, first record =
id+cwd, parentId chains untouched) and upserts the listing onto the
board — the exact scan_zcode.py contract:

  POST {board_url}/api/executors/{executor_id}/kora-scan
       body {"sessions": [...], "drop_missing": true}

Auth: Bearer $VESMARO_EXECUTOR_TOKEN (preferred) or $VESMARO_BOARD_TOKEN
(env only — never a config file, never a log line).

One-shot by design (the slice-1 directive holds — the timer is an owner
decision, see the slice-2 report). Idempotent replay; honest empty scan.

Exit codes: 0 = pushed; 1 = configuration error; 2 = store unreadable;
3 = board rejected.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))

from scripts.kora.scan_common import (  # noqa: E402  (path bootstrap above)
    DEFAULT_BOARD_URL,
    BoardPushError,
    ScannerConfigError,
    log_scan_result,
    push_scan,
    resolve_ca_bundle,
    setup_logging,
)
from server.kora.pi_reader import (  # noqa: E402  (path bootstrap above)
    DEFAULT_PI_ROOT,
    ReaderError,
    scan_pi_stores,
)

log = logging.getLogger("kora.scan-pi")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Kora slice-2 pi scanner: read-only session listing "
                    "pushed to the board registry (ADR 0019; lists from "
                    "the self-describing JSONL headers).")
    parser.add_argument("--board-url", default=os.environ.get(
        "VESMARO_BOARD_URL", DEFAULT_BOARD_URL),
        help="board base URL (env VESMARO_BOARD_URL)")
    parser.add_argument("--executor-id", required=True,
        help="executor registry id (ex-…); the ingest binds to it")
    parser.add_argument("--sessions-root", default=None,
        help="pi sessions dir (default: ~/.pi/agent/sessions)")
    parser.add_argument("--keep-missing", action="store_true",
        help="delta push: do NOT drop registry rows the scan missed")
    parser.add_argument("--dry-run", action="store_true",
        help="scan only; print the listing summary, no board push")
    parser.add_argument("--ca-bundle", default="",
        help="lab CA bundle path for self-signed board TLS (poller parity)")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    setup_logging(args.verbose)
    try:
        verify = resolve_ca_bundle(args.ca_bundle)
    except ScannerConfigError:
        return 1

    try:
        result = (scan_pi_stores(args.sessions_root) if args.sessions_root
                  else scan_pi_stores())
    except ReaderError as exc:
        log.error("store scan failed: %s", exc)
        return 2
    states: dict[str, int] = {}
    for row in result.sessions:
        states[row["state"]] = states.get(row["state"], 0) + 1
    log_scan_result(log, len(result.sessions), states,
                    store_path=result.store_path,
                    extra=f"skipped={result.skipped_files}")
    if args.dry_run:
        print(f"dry-run: {len(result.sessions)} sessions ({states}), "
              f"skipped={result.skipped_files}")
        return 0
    try:
        verdict = push_scan(args.board_url, args.executor_id,
                            result.sessions,
                            drop_missing=not args.keep_missing,
                            verify=verify)
    except ScannerConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except BoardPushError as exc:
        log.error("board rejected the scan: %s", exc)
        return 3
    log.info("board verdict: %s", verdict)
    print(f"pushed {verdict.get('scanned', 0)} sessions: {verdict}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
