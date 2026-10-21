"""Cache-Control contract for the served UI shells and their assets.

The shell must never be heuristically cached: / serves web/index.html
(Cache-Control: no-cache — the FileResponse ETag turns every revalidation
into a cheap 304, a release always lands as a fresh 200) and the viewer
dist shell is pinned no-cache in test_app_spa.py.

The board tree (VESMARO_WEB) is versioned by cache-bust query strings:
scripts/sync-version.sh rewrites every web/index.html asset URL to
?v=X.Y.Z on each release. A ?v=-pinned URL is content-pinned by that
scheme → public, max-age=31536000, immutable. The same file WITHOUT the
pin — and the trees no stylesheet version-pins (fonts are referenced from
fonts.css at bare /fonts/... URLs) — must revalidate (no-cache): heuristic
caching on those URLs is exactly the stale-UI-after-release bug class
this file pins shut. /api/* is out of scope here: the global middleware
stamps no-store on it (test_security_headers.py).
"""

from __future__ import annotations

import pytest

IMMUTABLE = "public, max-age=31536000, immutable"


@pytest.fixture()
def root_app(app_module, monkeypatch):
    """Flip the module to the post-Ф4 layout (the viewer owns "/") —
    handlers read ROOT_APP at request time, same contract as
    test_root_app_switch.py."""
    monkeypatch.setattr(app_module, "ROOT_APP", "app")


class TestShellNeverCached:
    def test_root_index_no_cache_with_validator(self, client):
        """/ serves the board shell: no-cache (mandatory revalidation —
        no heuristic caching) and an ETag so the mandatory check is a
        304 between releases."""
        r = client.get("/")
        assert r.status_code == 200
        assert r.headers["Cache-Control"] == "no-cache"
        assert r.headers.get("etag"), (
            "no-cache without a validator forces a full refetch every "
            "load; FileResponse always has one — do not lose it")


class TestBoardAssets:
    def test_versioned_script_is_immutable(self, client):
        """?v=-pinned script URL: cache forever — the version in the URL
        is the invalidation mechanism (sync-version.sh bumps it every
        release, so a new release is a different URL, never stale)."""
        r = client.get("/js/app.js?v=0.0.0-test")
        assert r.status_code == 200
        assert r.headers["Cache-Control"] == IMMUTABLE

    def test_versioned_stylesheet_is_immutable(self, client):
        r = client.get("/styles/board.css?v=0.0.0-test")
        assert r.status_code == 200
        assert r.headers["Cache-Control"] == IMMUTABLE

    def test_bare_asset_url_must_revalidate(self, client):
        """The same file requested WITHOUT the version pin must not be
        immutable: the bare URL's content can change under a release
        while the URL stays — immutable would stick it forever."""
        r = client.get("/js/app.js")
        assert r.status_code == 200
        assert r.headers["Cache-Control"] == "no-cache"

    def test_unversioned_font_tree_must_revalidate(self, client):
        """fonts.css references the woff2 files at bare /fonts/... URLs
        (no ?v= anywhere in that tree) — heuristic caching there is the
        bug class; revalidation keeps them honest at 304 cost."""
        r = client.get("/fonts/inter-latin.woff2")
        assert r.status_code == 200
        assert r.headers["Cache-Control"] == "no-cache"

    def test_board_prefix_versioned_asset_is_immutable(self, client,
                                                       root_app):
        """After the Ф4 flip the board tree also answers under /board/
        (board_asset route) — the versioned leg must keep the immutable
        contract there too."""
        r = client.get("/board/js/app.js?v=0.0.0-test")
        assert r.status_code == 200
        assert r.headers["Cache-Control"] == IMMUTABLE
