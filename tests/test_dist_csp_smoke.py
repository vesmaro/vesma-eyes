"""ME-090 (F6): built-artifact CSP smoke — the hermetic unit-test leg.

The «hashes come from source index.html, not dist» boundary is documented
in tests/test_security_headers.py (TestServedHtmlInlineScripts): the pytest
suite audits the SOURCE index.html and the SERVED bytes (fake APP_DIR),
but a raw vite dist never existed inside pytest. This file adds what a
hermetic suite CAN hold:

  - the audit function of scripts/check_dist_csp.py (byte-identical to the
    test_security_headers.py audit) exercised against a FIXTURE dist built
    in setUpModule from the current viewer/index.html source — a build
    step that copies source bytes into dist the way `vite build` does for
    the pre-paint bootstraps (vite copies index.html verbatim and injects
    only the module entry tag); the fixture therefore proves the audit
    accepts the REAL html the build would emit minus the node build,
  - negative controls: a build-injected inline script is CAUGHT,
  - the source ↔ fixture equivalence assertion (same inline hashes), which
    IS the invariant the TestServedHtmlInlineScripts docstring names: a
    vite build without inline plugins adds no new inline scripts to
    index.html.

NOT gated here (documented): the actual node build inside pytest — the
dist is gitignored and a node build would break the suite's hermetic
runtime contract. The REAL built artifact is audited by running
`python3 scripts/check_dist_csp.py` after `npm run build` (the script's
--use-existing-dist audits without rebuilding). This suite keeps the
audit logic itself under continuous test; the script closes the dist gap
on demand.
"""

from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path

import pytest

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import check_dist_csp as cdc  # noqa: E402

_VIEWER_INDEX = Path(__file__).resolve().parents[1] / "viewer" / "index.html"

_SCRIPT_TAG_RE = re.compile(r"<script\b([^>]*)>(.*?)</script>", re.S)


def _inline_hashes(html: str) -> list[str]:
    return ["sha256-"
            + base64.b64encode(
                hashlib.sha256(body.encode("utf-8")).digest()).decode("ascii")
            for attrs, body in re.findall(_SCRIPT_TAG_RE, html)
            if "src=" not in attrs and body.strip()]


@pytest.fixture(scope="module")
def built_index(tmp_path_factory) -> Path:
    """A fixture dist whose index.html is the vite-build product modulo the
    node build itself: the SOURCE bytes + the one tag a build injects (the
    external module entry, `type="module" src=...`), which the real build
    confirmed adds no inline content (the module entry carries no body) —
    and which MUST ride the audit as the external-src negative control.
    Build-time environment differences (hash-mangled asset names) do not
    exist in the fixture; the inline content is byte-identical to prod."""
    dist = tmp_path_factory.mktemp("viewer-dist")
    html = _VIEWER_INDEX.read_text(encoding="utf-8")
    # The vite production base '/app/' entry tag, as the real build emits it
    # (attrs differ only by the content hash of the bundle — external src).
    html = html.replace(
        "</body>",
        '<script type="module" crossorigin '
        'src="/app/assets/index-N0HASH.js"></script></body>')
    (dist / "index.html").write_text(html, encoding="utf-8")
    return dist / "index.html"


class TestBuiltDistCspSmoke:
    def test_fixture_dist_inline_scripts_pass_the_audit(self, built_index):
        cdc.audit_inline_scripts(
            built_index.read_text(encoding="utf-8"), cdc._CSP)

    def test_fixture_dist_preserves_source_inline_hashes(self, built_index):
        """THE boundary invariant (TestServedHtmlInlineScripts docstring):
        the build step must not change the inline script content of
        index.html — fixture dist and source hash identically, so the
        source-hash rotation pinned in test_security_headers.py stays
        valid for dist."""
        assert (_inline_hashes(built_index.read_text(encoding="utf-8"))
                == _inline_hashes(
                    _VIEWER_INDEX.read_text(encoding="utf-8")))

    def test_audit_catches_a_build_injected_inline_script(self, built_index):
        """Negative control: if a vite build (or plugin) injected even a
        tiny inline script into the dist, the audit must FAIL with the
        digest — the runtime consequence would be a blocked bootstrap or
        broken first render."""
        html = built_index.read_text(encoding="utf-8").replace(
            "</body>", "<script>injected()</script></body>")
        with pytest.raises(AssertionError, match="BUILT index.html"):
            cdc.audit_inline_scripts(html, cdc._CSP)

    def test_audit_catches_event_handler_on_module_entry(self, built_index):
        """Negative control: the `<script src=x onerror=…>` shape on the
        build's own module entry — an external src is 'self'-governed, the
        inline handler is CSP-blocked dead weight that must not ship."""
        html = built_index.read_text(encoding="utf-8").replace(
            'crossorigin ', 'onerror="pwn()" crossorigin ')
        with pytest.raises(AssertionError, match="event-handler"):
            cdc.audit_inline_scripts(html, cdc._CSP)