"""Kora В2a — the specialist roster read (KORA-SPECIALISTS-1, additive).

The contract (kora-ide §5.3): the read-only roster of the board's
specialists feeds the composer's specialist selector; before this line
the selector honestly did not render. This suite pins:

1. THE ROSTER — derived from the board's ACTIVE tasks (the refresh-all
   derivation), sorted + deduplicated, empty honestly on an empty board;
   each row carries the declared name, the profile-route slug (ONE
   computation, two callers — the extraction is pinned by equality with
   the profile route's own slug) and the read-only profile-cache bit.
2. ACCESS CLASSES — the kora LISTING tier (the slice-1 precedent):
   anonymous 401 (the frozen envelope), ui bearer 200, the owner-session
   cookie leg 200, a valid mnd_ DEVICE 200 (the device-class decision:
   open facts — specialists already ride GET /api/board; no content, no
   outbound calls), an invalid mnd_ 401 in the middleware, a MACHINE
   bearer 401 (not a listing class).
3. SHAPE — no content fields by construction: the response body never
   carries task/report/memory material, only name/slug/profile_cached.
"""

from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient
from conftest import BOARD_TOKEN, UI_TOKEN, DATA_DIR, get_app_module


def _ui_headers() -> dict:
    effective = get_app_module().UI_WRITE_TOKEN or get_app_module().BOARD_WRITE_TOKEN
    return {"Authorization": f"Bearer {effective}"}


def _roster_names(client: TestClient) -> list[str]:
    resp = client.get("/api/kora/specialists", headers=_ui_headers())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["count"] == len(body["items"])
    return [item["name"] for item in body["items"]]


def _profile_slug(name: str) -> str:
    """The profile route's slug computation, mirrored in the test (an
    independent restatement — if the server's extraction drifts, the
    equality with the profile route itself pins it in
    test_row_shape_and_slug_matches_profile_route)."""
    return (name.lower().replace("@gcw: ", "gcw-")
            .replace(" ", "-").replace("/", "-"))


# ------------------------------------------------------------------ roster
class TestRoster:
    def test_roster_shape_sorted_deduped(self, client: TestClient):
        """Whatever the board holds (the QA contour pre-seeds tasks —
        _seed_if_empty), the roster is the honest projection: sorted,
        deduplicated, count == len(items), every row exactly
        {name, slug, profile_cached} and nothing else (no content
        fields by construction)."""
        resp = client.get("/api/kora/specialists", headers=_ui_headers())
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert body["count"] == len(body["items"])
        names = [item["name"] for item in body["items"]]
        assert names == sorted(set(names))
        for item in body["items"]:
            assert set(item) == {"name", "slug", "profile_cached"}
            assert isinstance(item["profile_cached"], bool)
            assert item["slug"] == _profile_slug(item["name"])
        assert set(body["meta"]) == {"generated_at"}

    def test_roster_derived_from_board_tasks_sorted_deduped(
            self, client: TestClient, make_task):
        """The refresh-all derivation: the deduplicated union of the
        tasks' specialists, sorted; a task with no specialists adds
        nothing."""
        make_task(title="qa roster a", specialists=["@GCW: Tech Lead"])
        make_task(title="qa roster b",
                  specialists=["@GCW: Tech Lead", "owner"])
        make_task(title="qa roster c", specialists=[])
        names = _roster_names(client)
        assert names == sorted(set(names))
        assert "@GCW: Tech Lead" in names
        assert "owner" in names
        assert len(names) == len(set(names))

    def test_row_shape_and_slug_matches_profile_route(
            self, client: TestClient, make_task):
        """Every row is exactly {name, slug, profile_cached}; the slug is
        THE profile route's computation (the extraction can never
        drift)."""
        make_task(title="qa slug row", specialists=["SRE/DevOps"])
        resp = client.get("/api/kora/specialists", headers=_ui_headers())
        items = {item["name"]: item
                 for item in resp.json()["items"]}
        row = items["SRE/DevOps"]
        assert set(row) == {"name", "slug", "profile_cached"}
        # The profile route slugifies spaces and slashes identically.
        assert row["slug"] == "sre-devops"
        profile = client.get("/api/specialists/profile",
                             params={"name": "SRE/DevOps"})
        assert profile.status_code == 200
        assert profile.json()["slug"] == row["slug"]

    def test_profile_cached_bit_reflects_the_cache(
            self, client: TestClient, make_task, app_module):
        """profile_cached reads the SAME cache the profile route serves
        (read-only honesty about the detail read; the roster itself
        never builds a profile)."""
        make_task(title="qa cached row", specialists=["@GCW: Tech Lead"])
        store = app_module.store
        assert store.get_profile_cache("@GCW: Tech Lead") is None
        before = {i["name"]: i for i in client.get(
            "/api/kora/specialists", headers=_ui_headers()
        ).json()["items"]}
        assert before["@GCW: Tech Lead"]["profile_cached"] is False
        store.put_profile_cache("@GCW: Tech Lead", {"slug": "gcw-tech-lead"})
        after = {i["name"]: i for i in client.get(
            "/api/kora/specialists", headers=_ui_headers()
        ).json()["items"]}
        assert after["@GCW: Tech Lead"]["profile_cached"] is True
        with sqlite3.connect(DATA_DIR / "board.db") as db:
            db.execute("DELETE FROM profile_cache WHERE specialist=?",
                       ("@GCW: Tech Lead",))
            db.commit()


# ----------------------------------------------------------- access classes
class TestAccess:
    _created_devices: list[str] = []

    @classmethod
    def _paired_device(cls, app_module, name="kora-w2a-phone"):
        store = app_module.store
        row, _code = store.create_pairing_request(device_name=name)
        store.scan_pairing(row["id"], device_name=name,
                           source_ip="testclient")
        store.confirm_pairing(row["id"], allow=True)
        device, token = store.issue_device_session(row["id"])
        cls._created_devices.append(device["id"])
        return device, token

    @pytest.fixture(autouse=True)
    def _delete_guard_devices(self, app_module):
        yield
        with sqlite3.connect(DATA_DIR / "board.db") as db:
            for device_id in self._created_devices:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (device_id,))
        self._created_devices.clear()

    def test_anonymous_401(self, client: TestClient):
        resp = client.get("/api/kora/specialists")
        assert resp.status_code == 401

    def test_machine_bearer_is_not_a_listing_class(self, client: TestClient):
        """ADR 0009 A1: the machine token opens no owner surfaces — the
        same verdict the sessions listing gives it (401, the precise
        class-mismatch detail, never silent success)."""
        resp = client.get("/api/kora/specialists", headers={
            "Authorization": f"Bearer {BOARD_TOKEN}"})
        assert resp.status_code == 401
        assert "machine-class" in resp.json()["detail"]

    def test_valid_device_reads_the_roster(
            self, client: TestClient, app_module):
        """THE DEVICE-CLASS DECISION, pinned: a valid mnd_ device reads
        the roster (200). Open facts — the specialists already ride
        GET /api/board; no content, no outbound probe (unlike the
        hermes status/pull routes, which stay behind the metadata_only
        wall because they touch board-ops or fire live calls)."""
        make = app_module
        device, token = self._paired_device(make)
        resp = client.get("/api/kora/specialists", headers={
            "Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["ok"] is True
        assert isinstance(body["items"], list)

    def test_invalid_device_token_401(self, client: TestClient):
        resp = client.get("/api/kora/specialists", headers={
            "Authorization": "Bearer mnd_bogus"})
        assert resp.status_code == 401

    def test_cookie_leg_reads_the_roster(self, client: TestClient,
                                         app_module):
        app_module  # the ui cookie name comes from the app module
        client.cookies.set(get_app_module()._UI_COOKIE_NAME, UI_TOKEN)
        try:
            resp = client.get("/api/kora/specialists")
            assert resp.status_code == 200, resp.text
            assert resp.json()["ok"] is True
        finally:
            client.cookies.clear()
