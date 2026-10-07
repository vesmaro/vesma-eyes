#!/usr/bin/env python3
"""ME-090 (F6): built-artifact CSP smoke — the audit the pytest suite can
only run against the SOURCE viewer/index.html (the «hashes come from
source index.html, not dist» boundary, tests/test_security_headers.py
TestServedHtmlInlineScripts docstring). This script closes that gap for
the BUILT artifact: it runs `vite build` (or reuses an existing
viewer/dist/index.html with --use-existing-dist) and audits the BUILT
index.html with the same inline-scripts audit as the pytest suite.

What is GATED here:
  - every inline <script> in the BUILT viewer/dist/index.html
    (attribute-bearing tags included) must be hash-allowed by the SAME
    CSP constant the server serves (server/app.py CSP / the copy in
    tests/test_security_headers.py),
  - no script tag may carry an inline event-handler attribute.

What is NOT gated here:
  - the SERVED bytes (prod serves the built file through the FastAPI
    SPA handlers; the pytest suite audits served bytes via the fake
    APP_DIR dist and the board root — this script audits the artifact
    on disk, not over HTTP),
  - the dist is gitignored, so this CANNOT be a pytest gate (the suite
    must stay hermetic on a clean checkout — there is no dist/ in CI
    and running a ~15-40s node build inside pytest would break the
    suite runtime contract). CI/users who want the full gate run this
    script after the build; the fixture-based unit test
    (tests/test_dist_csp_smoke.py) keeps the audit logic itself under
    test without the build.

Exit 0 = the built dist passes; exit 1 = a finding (fail-closed).
Requires: node/npm on PATH for the build path (--use-existing-dist
needs only python).

Usage:
  python3 scripts/check_dist_csp.py                     # build + audit
  python3 scripts/check_dist_csp.py --use-existing-dist # audit only
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
_VIEWER_DIR = _REPO_ROOT / "viewer"
_DIST_INDEX = _VIEWER_DIR / "dist" / "index.html"

# The served CSP (server/app.py) — imported from the repo when available so
# the script can never drift from it; the literal below is the fallback for
# runs from a context where `server` is not importable (keep in sync).
try:  # pragma: no cover - import path depends on invocation cwd
    sys.path.insert(0, str(_REPO_ROOT))
    from server.app import _CSP as _CSP  # type: ignore[attr-defined]
except Exception:  # pragma: no cover - literal fallback
    _CSP = ("default-src 'self'; "
            "script-src 'self' 'sha256-d3y7ZpF47i1J+tapUN8K5ZWPk3189s7BDjMbXPNOJp4=' "
            "'sha256-k85nuNkWNWz2VjD38EcDAkNliknfzuSNN6HBSJQjvkc='; "
            "style-src 'self' 'unsafe-inline'; object-src 'none'; "
            "base-uri 'self'; frame-ancestors 'none'; connect-src 'self'; "
            "img-src 'self' data:; font-src 'self' data:")

_SCRIPT_TAG_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S)
_EVENT_HANDLER_ATTR_RE = re.compile(r"\bon\w+\s*=", re.I)


def audit_inline_scripts(html: str, served_csp: str) -> None:
    """The tests/test_security_headers.py audit, mirrored verbatim: every
    inline <script> (WITH attributes) must be hash-allowed; no event
    handlers. Raises AssertionError on the first finding."""
    for attrs, body in re.findall(_SCRIPT_TAG_RE, html):
        handler = _EVENT_HANDLER_ATTR_RE.search(attrs)
        assert handler is None, (
            f"built index.html carries an inline event-handler attribute "
            f"({handler.group(0)!r} in <script{attrs}>) — the CSP blocks "
            "it at runtime; inline handlers must not ship")
        if "src=" in attrs or not body.strip():
            continue
        digest = ("sha256-"
                  + base64.b64encode(
                      hashlib.sha256(body.encode("utf-8")).digest()
                  ).decode("ascii"))
        assert digest in served_csp, (
            f"{digest} (inline script{attrs}) in the BUILT index.html is "
            "not allowed by the served CSP — the vite build added an "
            "inline script (or the bootstraps drifted) — rotate the "
            "script-src hash in server/app.py or make the script external")


def build() -> None:
    """`vite build` in viewer/ (typecheck + budget are separate npm
    scripts — this is the artifact-generating core only)."""
    npm = shutil.which("npm")
    if npm is None:
        raise SystemExit(
            "npm not found on PATH — install node or run with "
            "--use-existing-dist against a viewer/dist you built")
    subprocess.run([npm, "run", "--silent", "build"], cwd=_VIEWER_DIR,
                   check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--use-existing-dist", action="store_true",
        help="do not build; audit the existing viewer/dist/index.html")
    args = parser.parse_args()

    if args.use_existing_dist:
        if not _DIST_INDEX.exists():
            raise SystemExit(
                "viewer/dist/index.html not found — run the build first "
                "(or drop --use-existing-dist)")
    else:
        build()
        assert _DIST_INDEX.exists(), "vite build produced no dist/index.html"

    html = _DIST_INDEX.read_text(encoding="utf-8")
    try:
        audit_inline_scripts(html, _CSP)
    except AssertionError as finding:
        print(f"DIST CSP SMOKE: FAIL — {finding}")
        return 1
    print("DIST CSP SMOKE: PASS — built viewer/dist/index.html carries no "
          "inline script outside the hash-allowed bootstraps")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())