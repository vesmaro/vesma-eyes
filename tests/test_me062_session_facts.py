"""ME-062 (agents-ui-spec §6.1, slice 1 — the BE storage leg): the
discovery ingest's additive ``sessions[]`` and ``environments[]`` stop
being accepted-and-ignored — they are validated, stored, and served.

Coverage map (spec §2/§3/§4):
- a fact from the executor's agent lands in the task card
  (GET /api/tasks/{id}/sessions, ui-class): fields, path visibility,
  the '{executor_id}:{native_id}' Kora glue id, age;
- CHILD facts never land: another executor's token → 403 identity
  mismatch; the machine/board token → 401 (the discovery leg is
  executor-token class — a child holding only loopback report tokens
  has no leg); a child-registered executor posting against a task the
  board attributed to the PARENT is dropped on task-linkage
  (claimed_by_executor is the authoritative attribution) + audited;
- grammar drops follow the discovery-names pattern (never 422):
  unknown harness, missing task_id/native_id, unclaimed task;
- caps are honest 422s: > 32 session rows per post; the STORE bounds
  the per-executor mirror at 32 rows (audited trim, never silent);
- environments[] caps: > 32 rows, name-lists over 50/50/30/30, the
  capabilities object over 8 KiB — all 422;
- harness_inventory: stored, served on the OPEN executor read, last
  -report snapshot, identical re-report is a silent no-op, an empty
  report never wipes the last valid snapshot;
- the card read is ui-only: anonymous → 401, mnd_ device → the
  explanatory 403 wall (host ``path`` in the fact — spec §2.2/§7).
"""

from __future__ import annotations

import json

import pytest

from conftest import get_app_module
from server.security import RateLimiter



@pytest.fixture(autouse=True)
def fresh_me062_state(app_module, client, monkeypatch):
    """Per-test isolation (test_me015 pattern): fresh limiters, wiped
    executor registry + session-fact store; tasks/assignments made via
    _make_task clean themselves up."""
    for name in ("_executor_register_limiter",
                 "_executor_heartbeat_limiter",
                 "_assignment_limiter", "_assignment_ui_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM task_session_facts")
        db.execute("DELETE FROM executors")
    _CREATED_TASKS.clear()
    yield
    for task_id in _CREATED_TASKS:
        client.delete(f"/api/tasks/{task_id}", headers=_ui_headers())
    _CREATED_TASKS.clear()
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM task_session_facts")
        db.execute("DELETE FROM executors")


def _ui_headers() -> dict:
    """Effective ui-class headers, resolved LIVE (module globals — tests
    that toggle ``split_tokens`` keep working; the conftest make_task
    pattern)."""
    m = get_app_module()
    effective = m.UI_WRITE_TOKEN or m.BOARD_WRITE_TOKEN
    return {"Authorization": f"Bearer {effective}"}


def _register(client, auth, name: str, approve=True) -> tuple[dict, str]:
    payload = {"name": name, "harness": "zcode"}
    r = client.post("/api/executors", json=payload, headers=auth)
    assert r.status_code == 201, r.text
    body = r.json()
    executor, secret = body["executor"], body["executor_secret"]
    if approve:
        r = client.patch(f"/api/executors/{executor['id']}",
                         json={"state": "approved"},
                         headers=_ui_headers())  # ui-class under split too
        assert r.status_code == 200, r.text
    return executor, secret


def _ex_headers(secret: str) -> dict:
    return {"Authorization": f"Bearer {secret}"}


def _fact(native_id="sess_a1b2c3", **over) -> dict:
    return {
        "task_id": "", "harness": "pi", "native_id": native_id,
        "specialist": "gcw-tech-lead",
        "path": "/home/u/.local/share/vesmaro/pi-sessions/sess_a1b2c3.jsonl",
        "tool_calls": 12, "duration_s": 340,
        "started_at": "2026-09-30T10:04:11Z",
        "ended_at": "2026-09-30T10:09:51Z",
        "parent_native_id": "",
    } | over


_SECRET: dict[str, str] = {}
_CREATED_TASKS: list[str] = []


def _register_with_secret(client, auth, name: str) -> tuple[dict, str]:
    executor, secret = _register(client, auth, name)
    _SECRET[executor["id"]] = secret
    return executor, secret


def _make_task(client, title: str) -> str:
    r = client.post("/api/tasks", json={"title": title},
                    headers=_ui_headers())
    assert r.status_code == 201, r.text
    task_id = r.json()["id"]
    _CREATED_TASKS.append(task_id)
    return task_id


def _claimed_task(client, executor: dict) -> str:
    """A task whose assignment the executor claimed (the board's own
    claimed_by_executor attribution — what task-linkage validates)."""
    task_id = _make_task(client, "me062 task")
    r = client.post("/api/assignments",
                    json={"task_id": task_id, "specialist": "gcw-tech-lead",
                          "harness": "zcode"}, headers=_ui_headers())
    assert r.status_code == 201, r.text
    a = r.json()["assignment"]
    r = client.post(f"/api/assignments/{a['id']}/claim",
                    json={"claimed_by": "me062-poller"},
                    headers=_ex_headers(_SECRET[executor["id"]]))
    assert r.status_code == 200, r.text
    return task_id


def _board_events(app_module, kind: str, executor_id: str) -> list[dict]:
    """Audit rows for THIS executor (session-scoped events table —
    queried directly, the _me015 pattern)."""
    with app_module.store._lock, app_module.store._conn() as db:
        rows = db.execute(
            "SELECT id, ts, kind, task_id, payload FROM events "
            "WHERE kind=? ORDER BY id ASC", (kind,)).fetchall()
    out = []
    for r in rows:
        payload = json.loads(r["payload"])
        if payload.get("executor_id") == executor_id:
            out.append({"id": r["id"], "kind": r["kind"],
                        "payload": payload})
    return out


class TestAgentFactsLand:
    """The happy path: an agent's session fact reaches the task card."""

    def test_fact_appears_in_task_card(self, client, auth, ui_auth,
                                       app_module):
        executor, secret = _register_with_secret(client, auth, "me062-a1")
        task_id = _claimed_task(client, executor)
        r = client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"harnesses": [{"name": "zcode", "version": "1"}],
                  "sessions": [_fact(task_id=task_id)]},
            headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["sessions_accepted"] == 1
        assert out["sessions_dropped"] == 0

        r = client.get(f"/api/tasks/{task_id}/sessions", headers=ui_auth)
        assert r.status_code == 200, r.text
        card = r.json()
        assert card["count"] == 1
        fact = card["items"][0]
        assert fact["session_id"] == f"{executor['id']}:sess_a1b2c3"
        assert fact["executor_id"] == executor["id"]
        assert fact["task_id"] == task_id
        assert fact["harness"] == "pi"
        assert fact["specialist"] == "gcw-tech-lead"
        assert fact["tool_calls"] == 12
        assert fact["duration_s"] == 340
        assert fact["started_at"] == "2026-09-30T10:04:11Z"
        # the host path IS served — the ui-class card is its one surface
        assert fact["path"].endswith("sess_a1b2c3.jsonl")
        assert fact["reported_age_s"] >= 0
        assert fact["reported_at"]
        assert _board_events(app_module, "sessions.reported",
                             executor["id"])[0]["payload"]["accepted"] == 1

    def test_upsert_by_native_id_dedup(self, client, auth, ui_auth):
        executor, secret = _register_with_secret(client, auth, "me062-a2")
        task_id = _claimed_task(client, executor)
        for tool_calls in (12, 40):
            r = client.post(
                f"/api/executors/{executor['id']}/discovery",
                json={"harnesses": [],
                      "sessions": [_fact(task_id=task_id,
                                         tool_calls=tool_calls)]},
                headers=_ex_headers(secret))
            assert r.status_code == 200, r.text
        card = client.get(f"/api/tasks/{task_id}/sessions",
                          headers=ui_auth).json()
        assert card["count"] == 1
        assert card["items"][0]["tool_calls"] == 40  # last report wins

    def test_old_agent_without_sessions_untouched(self, client, auth):
        """A v2 agent posting neither additive field gets the exact old
        behavior: 200, zero counters, no store writes."""
        executor, secret = _register_with_secret(client, auth, "me062-a3")
        r = client.post(f"/api/executors/{executor['id']}/discovery",
                        json={"harnesses": [{"name": "zcode"}]},
                        headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["sessions_accepted"] == 0
        assert out["sessions_dropped"] == 0


class TestChildFactsNeverLand:
    """Spec §2.2: a child can neither post nor mint linkage."""

    def test_foreign_executor_token_identity_403(self, client, auth):
        parent, _ = _register_with_secret(client, auth, "me062-b1-parent")
        _, child_secret = _register_with_secret(client, auth, "me062-b1-child")
        task_id = _claimed_task(client, parent)
        r = client.post(
            f"/api/executors/{parent['id']}/discovery",
            json={"sessions": [_fact(task_id=task_id)]},
            headers=_ex_headers(child_secret))
        assert r.status_code == 403, r.text

    def test_child_without_executor_token_401(self, client, auth):
        """The machine/board token is NOT a discovery-class credential —
        a child holding only loopback report tokens has no leg at all."""
        executor, _ = _register_with_secret(client, auth, "me062-b2")
        r = client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"sessions": [_fact()]}, headers=auth)
        assert r.status_code == 401, r.text
        r = client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"sessions": [_fact()]})
        assert r.status_code == 401, r.text

    def test_child_executor_cannot_mint_linkage(self, client, auth, ui_auth,
                                                app_module):
        """A separately-registered child executor posts on ITS OWN leg
        (identity fine) against the parent's task — the board's
        claimed_by_executor attribution drops the fact + audits it."""
        parent, _ = _register_with_secret(client, auth, "me062-b3-parent")
        child, child_secret = _register_with_secret(
            client, auth, "me062-b3-child")
        task_id = _claimed_task(client, parent)
        r = client.post(
            f"/api/executors/{child['id']}/discovery",
            json={"sessions": [_fact(task_id=task_id)]},
            headers=_ex_headers(child_secret))
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["sessions_accepted"] == 0
        assert out["sessions_dropped"] == 1
        card = client.get(f"/api/tasks/{task_id}/sessions",
                          headers=ui_auth).json()
        assert card["count"] == 0
        rejected = _board_events(app_module, "sessions.rejected",
                                 child["id"])
        assert len(rejected) == 1
        assert rejected[0]["payload"]["reasons"] == {"task_linkage": 1}

    def test_grammar_drops_follow_discovery_pattern(self, client, auth,
                                                    ui_auth, app_module):
        """Unknown harness / missing task_id / missing native_id /
        unclaimed-task — drops + audit, NEVER 422 (spec §2.1)."""
        executor, secret = _register_with_secret(client, auth, "me062-b4")
        task_id = _claimed_task(client, executor)
        other = _make_task(client, "me062 unclaimed")
        r = client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"sessions": [
                _fact("s1", task_id=task_id, harness="aider"),
                _fact("s2", task_id="", ),
                _fact("", task_id=task_id),
                _fact("s4", task_id=other),        # exists, not claimed
                _fact("s5", task_id="ME-NOPE"),    # unknown task
            ]},
            headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["sessions_accepted"] == 0
        assert out["sessions_dropped"] == 5
        rejected = _board_events(app_module, "sessions.rejected",
                                 executor["id"])
        assert rejected[-1]["payload"]["reasons"] == {
            "harness": 1, "task_linkage": 3, "native_id": 1}
        assert client.get(f"/api/tasks/{task_id}/sessions",
                          headers=ui_auth).json()["count"] == 0


class TestCaps:
    """Honest 422s on over-cap posts; the bounded store trims audited."""

    def test_sessions_post_cap_422(self, client, auth):
        executor, secret = _register_with_secret(client, auth, "me062-c1")
        task_id = _claimed_task(client, executor)
        r = client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"sessions": [_fact(f"s{i}", task_id=task_id)
                               for i in range(33)]},
            headers=_ex_headers(secret))
        assert r.status_code == 422, r.text
        assert "cap 32" in r.json()["detail"]

    def test_store_bound_trims_to_32_audited(self, client, auth, ui_auth,
                                             app_module):
        executor, secret = _register_with_secret(client, auth, "me062-c2")
        task_id = _claimed_task(client, executor)
        r = client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"sessions": [_fact(f"sess-{i:02d}", task_id=task_id)
                               for i in range(32)]},
            headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        assert r.json()["sessions_accepted"] == 32
        # one MORE fact on the next tick: the mirror stays at 32 rows —
        # the oldest (sess-00) is shaved, the trim is audited
        r = client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"sessions": [_fact("sess-new", task_id=task_id)]},
            headers=_ex_headers(secret))
        assert r.status_code == 200, r.text
        card = client.get(f"/api/tasks/{task_id}/sessions",
                          headers=ui_auth).json()
        assert card["count"] == 32
        native_ids = {i["native_id"] for i in card["items"]}
        assert "sess-00" not in native_ids
        assert "sess-new" in native_ids
        trimmed = _board_events(app_module, "sessions.trimmed",
                                executor["id"])
        assert len(trimmed) == 1
        assert trimmed[0]["payload"]["trimmed"] == 1


class TestHarnessInventory:
    """environments[] → harness_inventory: stored, served OPEN, snapshot
    semantics of the discovery mirror (spec §3.3/§4)."""

    ENV = {"name": "zcode", "kind": "cli", "home_path": "/home/u/.zcode",
           "capabilities": {
               "specialists": ["bathys-researcher", "gcw-tech-lead"],
               "specialists_count": 39, "gcw_specialists_count": 38,
               "skills": ["a11y-audit"], "skills_count": 121,
               "plugins": [], "instructions": ["architectural-committee.md"],
               "instructions_count": 24,
               "notes": {"agents_md": True, "gcw_managed": True}}}

    def _report(self, client, executor_id, secret, environments):
        return client.post(
            f"/api/executors/{executor_id}/discovery",
            json={"harnesses": [], "environments": environments},
            headers=_ex_headers(secret))

    def test_inventory_stored_and_served_open(self, client, auth):
        executor, secret = _register_with_secret(client, auth, "me062-d1")
        r = self._report(client, executor["id"], secret, [self.ENV])
        assert r.status_code == 200, r.text
        # OPEN registry read (no auth — the GET /api/executors boundary)
        r = client.get(f"/api/executors/{executor['id']}")
        assert r.status_code == 200, r.text
        inv = r.json()["harness_inventory"]
        assert len(inv) == 1
        assert inv[0]["name"] == "zcode"
        assert inv[0]["capabilities"]["specialists_count"] == 39
        assert inv[0]["capabilities"]["gcw_specialists_count"] == 38
        assert inv[0]["capabilities"]["skills"] == ["a11y-audit"]
        assert inv[0]["capabilities"]["notes"]["gcw_managed"] is True

    def test_last_report_snapshot_and_noop(self, client, auth, app_module):
        executor, secret = _register_with_secret(client, auth, "me062-d2")
        self._report(client, executor["id"], secret, [self.ENV])
        before = client.get(
            f"/api/executors/{executor['id']}").json()["updated_at"]
        # identical re-report: silent no-op (no churn, one audit total)
        self._report(client, executor["id"], secret, [self.ENV])
        row = client.get(f"/api/executors/{executor['id']}").json()
        assert row["updated_at"] == before
        assert len(_board_events(app_module, "inventory.reported",
                                 executor["id"])) == 1
        # a CHANGED report replaces the snapshot
        changed = [dict(self.ENV, version="1.22.0")]
        self._report(client, executor["id"], secret, changed)
        inv = client.get(
            f"/api/executors/{executor['id']}").json()["harness_inventory"]
        assert inv[0].get("version") == "1.22.0"

    def test_empty_report_never_wipes_snapshot(self, client, auth):
        """P3-1 precedent: a report with no environments refreshes
        nothing — the last valid snapshot survives."""
        executor, secret = _register_with_secret(client, auth, "me062-d3")
        self._report(client, executor["id"], secret, [self.ENV])
        self._report(client, executor["id"], secret, [])
        inv = client.get(
            f"/api/executors/{executor['id']}").json()["harness_inventory"]
        assert len(inv) == 1

    def test_inventory_caps_422(self, client, auth):
        executor, secret = _register_with_secret(client, auth, "me062-d4")
        # > 32 rows
        rows = [{"name": f"env{i}", "kind": "cli"} for i in range(33)]
        r = self._report(client, executor["id"], secret, rows)
        assert r.status_code == 422, r.text
        assert "environments" in r.json()["detail"]
        # specialists over 50
        env = {"name": "zcode", "capabilities": {
            "specialists": [f"spec-{i}" for i in range(51)]}}
        r = self._report(client, executor["id"], secret, [env])
        assert r.status_code == 422, r.text
        assert "specialists" in r.json()["detail"]
        # instructions over 30
        env = {"name": "zcode", "capabilities": {
            "instructions": [f"i-{i}.md" for i in range(31)]}}
        r = self._report(client, executor["id"], secret, [env])
        assert r.status_code == 422, r.text
        # capabilities over 8 KiB marshaled
        env = {"name": "zcode", "capabilities": {
            "skills": [f"skill-name-{i}-{'x' * 40}" for i in range(50)],
            "notes": {"blob": "y" * 9000}}}
        r = self._report(client, executor["id"], secret, [env])
        assert r.status_code == 422, r.text
        assert "8 KiB" in r.json()["detail"]
        # a nameless row is malformed, not droppable
        r = self._report(client, executor["id"], secret, [{"kind": "cli"}])
        assert r.status_code == 422, r.text

    def test_legacy_empty_inventory_reads_empty(self, client, auth,
                                                app_module):
        executor, _ = _register_with_secret(client, auth, "me062-d5")
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute("UPDATE executors SET harness_inventory='' "
                       "WHERE id=?", (executor["id"],))
        r = client.get(f"/api/executors/{executor['id']}")
        assert r.json()["harness_inventory"] == []


class TestCardReadGuard:
    """GET /api/tasks/{id}/sessions is ui-class only (spec §4/§7-2)."""

    def test_anonymous_and_split_machine_401(self, client, auth,
                                             split_tokens):
        """Headerless + cookieless → 401. Under the ADR 0009 A1 split the
        machine/board bearer is NOT a ui-class read credential → 401 (in
        the single-token transition mode it legitimately IS — the ui
        fallback — so this test pins the split)."""
        executor, secret = _register_with_secret(client, auth, "me062-e1")
        task_id = _claimed_task(client, executor)
        client.post(
            f"/api/executors/{executor['id']}/discovery",
            json={"sessions": [_fact(task_id=task_id)]},
            headers=_ex_headers(secret))
        client.cookies.clear()  # the ui mutation above issued a session
        assert client.get(
            f"/api/tasks/{task_id}/sessions").status_code == 401
        assert client.get(
            f"/api/tasks/{task_id}/sessions",
            headers=auth).status_code == 401

    def test_ui_bearer_reads_unknown_task_404(self, client, auth, ui_auth):
        assert client.get("/api/tasks/ME-NOPE/sessions",
                          headers=ui_auth).status_code == 404

    def test_mnd_device_hits_explanatory_wall(self, client, auth, ui_auth,
                                              app_module):
        """A VALID mnd_ device reaches the handler (the /api/tasks* read
        table) and gets the explanatory 403 — host paths never leave the
        ui class (spec §2.2 «раскрытие путей»)."""
        executor, secret = _register_with_secret(client, auth, "me062-e2")
        task_id = _claimed_task(client, executor)
        row, _ = app_module.store.create_pairing_request(
            device_name="me062-dev")
        app_module.store.scan_pairing(row["id"], device_name="me062-dev",
                                      source_ip="testclient")
        app_module.store.confirm_pairing(row["id"], allow=True)
        _device, token = app_module.store.issue_device_session(row["id"])
        try:
            r = client.get(f"/api/tasks/{task_id}/sessions",
                           headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 403, r.text
            assert "ui-класс" in r.json()["detail"]
            # ...while the same device still reads the OPEN task surface
            assert client.get(f"/api/tasks/{task_id}",
                              headers={"Authorization": f"Bearer {token}"}
                              ).status_code == 200
        finally:
            # the shared session DB must not leak the device row into
            # the ≤5-active quota (test_device_scope_v1 pattern)
            with app_module.store._lock, app_module.store._conn() as db:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (_device["id"],))

    def test_honest_empty_for_task_without_facts(self, client, auth,
                                                 ui_auth):
        task_id = _make_task(client, "me062 empty")
        r = client.get(f"/api/tasks/{task_id}/sessions",
                       headers=ui_auth)
        assert r.status_code == 200, r.text
        card = r.json()
        assert card["count"] == 0
        assert card["items"] == []
