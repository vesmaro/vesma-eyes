"""ME-015 (slice 2): the discovery ingest leg — POST
/api/executors/{id}/discovery, the board side of agent protocol §3 (the
leg agent v0.5+ posts hourly through the mesh relay).

Coverage map:
- executor-token identity-match (401 no token / 403 mismatch / 403
  revoked; pending MAY report — the approve panel reads the mirror);
- known harness names accepted into the ``discovered`` mirror; unknown
  names DROPPED + audited (discovery.rejected); the dictionary is NEVER
  auto-extended; capabilities stay owner-declared;
- the stored list is the LAST report; an identical re-report does not
  churn updated_at (hourly cadence, no audit spam; comparison ignores
  the write-time seen_at stamp — review P2-1); a report with NO accepted
  facts never wipes the last valid mirror (review P3-1);
- cap 32 → honest 422; the additive AGW-17 ``environments`` field is
  accepted and ignored; the report proves liveness (last_seen ticks);
- no migrations: the ``discovered`` column rides the additive ALTER
  (registered_via precedent) — a pre-ME-015 row reads back as ``[]``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from server.security import RateLimiter



@pytest.fixture(autouse=True)
def fresh_me015_state(app_module, monkeypatch):
    """Per-test isolation mirroring test_api_executors.fresh_executor_state:
    fresh machine-class limiters + a wiped executor registry. The board
    events table is session-scoped shared state — audit assertions query
    it directly (see _board_events)."""
    for name in ("_executor_register_limiter",
                 "_executor_heartbeat_limiter",
                 "_assignment_limiter", "_assignment_ui_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")


def _register(client, auth, name: str, **extra) -> tuple[dict, str]:
    payload = {"name": name, "harness": "zcode"} | extra
    r = client.post("/api/executors", json=payload, headers=auth)
    assert r.status_code == 201, r.text
    body = r.json()
    return body["executor"], body["executor_secret"]


def _ex_headers(secret: str) -> dict:
    return {"Authorization": f"Bearer {secret}"}


def _row(client, executor_id: str) -> dict:
    r = client.get(f"/api/executors/{executor_id}")
    assert r.status_code == 200, r.text
    return r.json()

def _board_events(app_module, kind: str, executor_id: str) -> list[dict]:
    """Audit rows for THIS executor (the events table is session-scoped
    shared state and grows past the store.events() read window in a full
    run — query it directly instead of through the windowed helper)."""
    import json as _json
    with app_module.store._lock, app_module.store._conn() as db:
        rows = db.execute(
            "SELECT id, ts, kind, task_id, payload FROM events "
            "WHERE kind=? ORDER BY id ASC", (kind,)).fetchall()
    out = []
    for r in rows:
        payload = _json.loads(r["payload"])
        if payload.get("executor_id") == executor_id:
            out.append({"id": r["id"], "ts": r["ts"], "kind": r["kind"],
                        "task_id": r["task_id"], "payload": payload})
    return out

class TestDiscoveryLeg:
    """POST /api/executors/{id}/discovery — the board side of agent
    protocol §3 (the leg v0.5+ posts hourly through the mesh relay)."""

    def _post(self, client, executor_id, secret, harnesses,
              **extra) -> object:
        payload = {"harnesses": harnesses} | extra
        return client.post(f"/api/executors/{executor_id}/discovery",
                           json=payload, headers=_ex_headers(secret))

    def test_known_names_accepted_into_mirror(self, client, auth):
        executor, secret = _register(client, auth, "me015-c1")
        r = self._post(client, executor["id"], secret, [
            {"name": "zcode", "version": "1.22.0", "path": "/usr/bin/zcode"},
            {"name": "aider", "version": "", "path": ""},
        ])
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["accepted"] == 2
        assert out["rejected"] == 0
        mirror = {d["name"]: d for d in out["executor"]["discovered"]}
        assert set(mirror) == {"zcode", "aider"}
        assert mirror["zcode"]["version"] == "1.22.0"
        assert mirror["zcode"]["path"] == "/usr/bin/zcode"
        assert _row(client, executor["id"])["discovered"] == \
            out["executor"]["discovered"]

    def test_unknown_names_dropped_audited_dictionary_not_extended(
            self, client, auth, app_module):
        executor, secret = _register(client, auth, "me015-c2")
        r = self._post(client, executor["id"], secret, [
            {"name": "zcode", "version": "1.22.0"},
            {"name": "totally-unknown-x", "version": "9"},
        ])
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["accepted"] == 1
        assert out["rejected"] == 1
        assert out["rejected_names"] == ["totally-unknown-x"]
        # the dictionary is owner-managed — never auto-extended
        names = {h["name"] for h in client.get("/api/harnesses").json()["items"]}
        assert "totally-unknown-x" not in names
        assert "zcode" in names
        rejected = _board_events(app_module, "discovery.rejected",
                                 executor["id"])
        assert len(rejected) == 1
        assert rejected[0]["payload"]["names"] == ["totally-unknown-x"]
        assert rejected[0]["payload"]["executor_id"] == executor["id"]

    def test_capabilities_stay_owner_declared(self, client, auth):
        executor, secret = _register(client, auth, "me015-c3")
        r = self._post(client, executor["id"], secret,
                       [{"name": "zcode", "version": "1"}])
        assert r.status_code == 200, r.text
        assert r.json()["executor"]["capabilities"] == []

    def test_last_report_wins(self, client, auth):
        executor, secret = _register(client, auth, "me015-c4")
        self._post(client, executor["id"], secret,
                   [{"name": "zcode", "version": "1"}])
        r = self._post(client, executor["id"], secret,
                       [{"name": "pi", "version": "5"}])
        assert r.status_code == 200, r.text
        names = [d["name"] for d in r.json()["executor"]["discovered"]]
        assert names == ["pi"]

    def test_identical_re_report_is_a_noop(self, client, auth, app_module,
                                           monkeypatch):
        """Two byte-identical reports land 90 s apart (fake clock — the
        real hourly cadence, not the same-second fluke): no update, no
        audit, and seen_at keeps the FIRST write time (review P2-1)."""
        base = datetime(2026, 9, 27, 12, 0, 0, tzinfo=timezone.utc)
        clock = {"t": base}

        def fake_now():
            return clock["t"].isoformat(timespec="seconds")

        monkeypatch.setattr("server.store._now", fake_now)
        executor, secret = _register(client, auth, "me015-c5")
        report = [{"name": "zcode", "version": "1", "path": "/usr/bin/zcode"}]
        first = self._post(client, executor["id"], secret, report).json()
        before = first["executor"]["updated_at"]
        assert before == base.isoformat(timespec="seconds")
        clock["t"] += timedelta(seconds=90)
        second = self._post(client, executor["id"], secret, report).json()
        assert second["executor"]["updated_at"] == before
        assert second["executor"]["discovered"] == \
            first["executor"]["discovered"]
        assert second["executor"]["discovered"][0]["seen_at"] == before
        assert len(_board_events(
            app_module, "discovery.reported", executor["id"])) == 1

    def test_all_unknown_report_never_wipes_mirror(self, client, auth,
                                                   app_module):
        """Review P3-1: a scan that finds NOTHING known must not replace
        the last valid mirror with an empty snapshot — the rejected-names
        audit is the trail, the mirror stays."""
        executor, secret = _register(client, auth, "me015-c10")
        self._post(client, executor["id"], secret,
                   [{"name": "zcode", "version": "1.22.0"}])
        mirror = _row(client, executor["id"])["discovered"]
        before = _row(client, executor["id"])["updated_at"]
        r = self._post(client, executor["id"], secret,
                       [{"name": "ghost-harness-x", "version": "9"}])
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["accepted"] == 0
        assert out["rejected"] == 1
        assert out["executor"]["discovered"] == mirror
        assert _row(client, executor["id"])["updated_at"] == before
        rejected = _board_events(app_module, "discovery.rejected",
                                 executor["id"])
        assert len(rejected) == 1
        assert rejected[0]["payload"]["names"] == ["ghost-harness-x"]
        # the only discovery.reported is the INITIAL write — the all-unknown
        # scan added no second write event
        assert len(_board_events(
            app_module, "discovery.reported", executor["id"])) == 1

    def test_report_proves_liveness(self, client, auth):
        executor, secret = _register(client, auth, "me015-c6")
        r = self._post(client, executor["id"], secret,
                       [{"name": "zcode"}])
        assert r.status_code == 200, r.text
        assert r.json()["executor"]["presence"] == "online"

    def test_auth_class_matches_heartbeat(self, client, auth):
        executor, secret = _register(client, auth, "me015-c7")
        _, other_secret = _register(client, auth, "me015-c7-other")
        # no token → 401; another executor's token → 403 (identity error)
        assert client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"harnesses": []}).status_code == 401
        assert client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"harnesses": []},
            headers=_ex_headers(other_secret)).status_code == 403
        # pending MAY report (the approve panel reads the mirror)
        r = self._post(client, executor["id"], secret,
                       [{"name": "zcode"}])
        assert r.status_code == 200, r.text
        # revoked is the kill-switch
        client.patch(f"/api/executors/{executor['id']}",
                     json={"state": "revoked"}, headers=auth)
        assert self._post(client, executor["id"], secret,
                          [{"name": "zcode"}]).status_code == 403

    def test_environments_field_never_pollutes_harness_mirror(
            self, client, auth):
        """AGW-17: the rich environment facts ride along additively and
        (ME-062) land in the SEPARATE harness_inventory snapshot — they
        must never leak into the ``discovered`` harness-name mirror
        (v2-payload compatibility)."""
        executor, secret = _register(client, auth, "me015-c8")
        r = self._post(client, executor["id"], secret,
                       [{"name": "zcode", "version": "1"}],
                       environments=[{"name": "copilot", "kind": "cli",
                                      "home_path": "/home/u/.copilot",
                                      "markers": ["agents"],
                                      "session_hints": {"count": 42}}])
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["accepted"] == 1
        assert all(d["name"] != "copilot"
                   for d in out["executor"]["discovered"])

    def test_over_cap_is_explicit_422(self, client, auth):
        executor, secret = _register(client, auth, "me015-c9")
        entries = [{"name": f"zcode{i}"} for i in range(33)]
        r = self._post(client, executor["id"], secret, entries)
        assert r.status_code == 422, r.text
        assert "cap 32" in r.json()["detail"]

class TestNoMigration:
    """The discovered column rides the additive ALTER — a pre-ME-015 row
    (discovered='') reads back as [] and nothing wipes."""

    def test_legacy_empty_discovered_reads_as_empty_list(self, client, auth,
                                                         app_module):
        executor, _secret = _register(client, auth, "me015-d1")
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute("UPDATE executors SET discovered='' WHERE id=?",
                       (executor["id"],))
        assert _row(client, executor["id"])["discovered"] == []
