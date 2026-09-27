"""UI-28 «Активность» contract tests (Ф1+Ф2) — spec
docs/design/2026-09-27-task-activity-stream-spec.md §3.2/§7/§8 + the TL
verdicts of 2026-09-27 on the spec's open questions:

- the /api/activity projection: cursor stability, limit clamp + 422s,
  the type/task_id/agent/host filters (garbage → 422, unknown task →
  empty page 200), the row shape with ABSENT optional keys;
- the actor-strip policy (verdict 2): anonymous AND machine-bearer legs
  read rows with NO ``actor`` key; ui-bearer / ui-cookie / mnd_ legs
  read it. The same policy strips task.* SSE frames for
  unauthenticated SUBSCRIBERS (decision at subscription, strip at read);
- the bucket form (Ф2): zero-filled hourly buckets, hours clamped
  1..48, same filters, same access classes;
- the events retention (verdict 1): the validation sweep prunes
  non-task audit rows at 90 days and trims to the 500k cap — task.* is
  exempt in both passes (it feeds the per-task history).

Test contour notes: the session-scoped board DB is shared, so every
seeding test isolates itself via a unique task/report/agent marker
instead of asserting on global counts. The default (transition) env
counts the board token as the ui class — the machine-strip contract
needs the ``split_tokens`` fixture to make the classes actually
distinct.
"""

from __future__ import annotations

import asyncio
import json
import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from starlette.requests import Request

from conftest import DATA_DIR

DB_PATH = DATA_DIR / "board.db"


# ------------------------------------------------------------------ helpers
def _db() -> sqlite3.Connection:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    return db


def _insert_event(kind: str, task_id: str | None, payload: dict,
                  ts: str) -> None:
    """Direct audit-row seed (the test_store pattern): retention and
    filter tests need shapes the live writers do not produce (aged
    timestamps, machine actors)."""
    with _db() as db:
        db.execute(
            "INSERT INTO events (ts, kind, task_id, payload) "
            "VALUES (?,?,?,?)",
            (ts, kind, task_id, json.dumps(payload)),
        )


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def _seed_task(client, auth, title: str) -> str:
    r = client.post("/api/tasks", json={"title": title}, headers=auth)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _items(client, headers=None, **params) -> dict:
    r = client.get("/api/activity", params=params, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------- Ф1: the лента contract
class TestActivityFeedContract:
    def test_open_read_anonymous(self, client, auth):
        """§3.2: OPEN read like every listing — no token, no 401. The
        strip policy is the only leg difference (asserted below)."""
        _seed_task(client, auth, "ui28-open")
        r = client.get("/api/activity")
        assert r.status_code == 200

    def test_cursor_stability_under_live_landing(self, client, auth):
        """§8.8: before_id pages stay stable while new events land —
        strictly-descending ids, no dupes across pages, a fresh event
        does not shift an already-fetched page."""
        task = _seed_task(client, auth, "ui28-cursor")
        for i in range(3):
            r = client.post(f"/api/tasks/{task}/reports",
                            json={"body": f"cursor {i}",
                                  "kind": "intermediate",
                                  "agent": "ui28-cursor-agent"},
                            headers=auth)
            assert r.status_code == 201, r.text
        page1 = _items(client, task_id=task, type="report", limit=2)
        assert page1["count"] == 2
        ids = [i["id"] for i in page1["items"]]
        assert ids == sorted(ids, reverse=True)
        boundary = page1["items"][-1]["id"]
        # a new event lands BETWEEN pages — the cursor must not move
        r = client.post(f"/api/tasks/{task}/reports",
                        json={"body": "cursor live", "kind": "intermediate",
                              "agent": "ui28-cursor-agent"},
                        headers=auth)
        assert r.status_code == 201
        page2 = _items(client, task_id=task, type="report",
                       limit=2, before_id=boundary)
        p1 = {i["id"] for i in page1["items"]}
        p2 = {i["id"] for i in page2["items"]}
        assert not p1 & p2, "cursor pages must never overlap"
        assert all(i["id"] < boundary for i in page2["items"])
        # the live event (above the boundary) is NOT in page 2 — the page
        # a client already walks stays byte-stable while events land
        assert page2["count"] == 1

    def test_has_more_true_then_last_page_false(self, client, auth):
        """Reconciliation (TL verdict): has_more = rows exist below the
        last returned id under the same filters — the honest end of the
        journal. Middle page → true; the last page → false; the empty
        feed → false."""
        task = _seed_task(client, auth, "ui28-has-more")
        for i in range(3):
            r = client.post(f"/api/tasks/{task}/reports",
                            json={"body": f"hm {i}", "kind": "intermediate",
                                  "agent": "ui28-hm-agent"},
                            headers=auth)
            assert r.status_code == 201, r.text
        page1 = _items(client, task_id=task, type="report", limit=2)
        assert page1["count"] == 2 and page1["has_more"] is True
        boundary = page1["items"][-1]["id"]
        page2 = _items(client, task_id=task, type="report", limit=2,
                       before_id=boundary)
        assert page2["count"] == 1 and page2["has_more"] is False
        empty = _items(client, task_id="t-does-not-exist")
        assert empty["count"] == 0 and empty["has_more"] is False

    def test_report_kind_final_vs_intermediate(self, client, auth):
        """Reconciliation (TL verdict): task.report rows carry
        report_kind ("intermediate" | "final"); non-report rows lack
        the key — additive, ABSENT not null."""
        task = _seed_task(client, auth, "ui28-report-kind")
        for kind in ("intermediate", "final"):
            r = client.post(f"/api/tasks/{task}/reports",
                            json={"body": f"rk {kind}", "kind": kind,
                                  "agent": "ui28-rk-agent"},
                            headers=auth)
            assert r.status_code == 201, r.text
        items = _items(client, task_id=task)["items"]
        reports = [i for i in items if i["kind"] == "task.report"]
        assert len(reports) == 2
        assert {i["report_kind"] for i in reports} == {"intermediate",
                                                       "final"}
        assert all(i["detail"] == f"rk {i['report_kind']}" for i in reports)
        created = [i for i in items if i["kind"] == "task.created"]
        assert created and "report_kind" not in created[0]

    def test_limit_clamp_truncated_flag(self, client):
        """Cursor canon (§11/CV-6): over the cap → silent clamp +
        truncated:true; at the cap → not truncated."""
        assert _items(client, limit=201)["truncated"] is True
        assert _items(client, limit=200)["truncated"] is False

    @pytest.mark.parametrize("limit", [0, -1, -100])
    def test_nonpositive_limit_422(self, client, limit):
        """A non-positive limit is a contract violation → 422, never a
        silent interpretation (the ge=1 cursor convention)."""
        assert client.get("/api/activity",
                          params={"limit": limit}).status_code == 422

    def test_type_filter_families_and_exact_kinds(self, client, auth):
        """§3.2: type= accepts family names AND exact dictionary kinds;
        the csv is a union."""
        task = _seed_task(client, auth, "ui28-types")
        r = client.post(f"/api/tasks/{task}/reports",
                        json={"body": "types", "kind": "final",
                              "agent": "ui28-types-agent"},
                        headers=auth)
        assert r.status_code == 201, r.text
        assert {i["kind"] for i in
                _items(client, task_id=task, type="task")["items"]} \
            == {"task.created"}
        assert {i["kind"] for i in
                _items(client, task_id=task, type="report")["items"]} \
            == {"task.report"}
        assert {i["kind"] for i in
                _items(client, task_id=task, type="task.created")["items"]} \
            == {"task.created"}
        assert {i["kind"] for i in
                _items(client, task_id=task, type="task,report")["items"]} \
            == {"task.created", "task.report"}

    @pytest.mark.parametrize("bad", ["bogus", "task,bogus", "tasks",
                                     "executor.registered"])
    def test_type_filter_garbage_422(self, client, bad):
        """A mistyped filter is an honest error state, not a silent
        empty page (§5.3); off-dictionary families (executor.*) are
        also rejected — §7 keeps them on their own surfaces."""
        assert client.get("/api/activity",
                          params={"type": bad}).status_code == 422

    def test_task_filter_unknown_is_empty_page(self, client):
        """§3.2: an unknown task_id is a FILTER value, not an addressed
        resource → empty page 200, never 404."""
        j = _items(client, task_id="t-does-not-exist")
        assert j["count"] == 0 and j["items"] == []

    def test_task_filter_exact(self, client, auth):
        task = _seed_task(client, auth, "ui28-task-filter")
        rows = _items(client, task_id=task)["items"]
        assert rows and {i["task_id"] for i in rows} == {task}

    def test_agent_filter_declared_identity(self, client, auth):
        """§2.3: report rows answer with their DECLARED identity
        (report.agent) — matched verbatim by agent=."""
        task = _seed_task(client, auth, "ui28-agent")
        r = client.post(f"/api/tasks/{task}/reports",
                        json={"body": "agent probe", "kind": "intermediate",
                              "agent": "ui28-dba"},
                        headers=auth)
        assert r.status_code == 201, r.text
        rows = _items(client, agent="ui28-dba")["items"]
        assert rows
        assert all(i["kind"] == "task.report" and i["task_id"] == task
                   for i in rows)
        assert _items(client, agent="ui28-nobody")["count"] == 0

    def test_agent_filter_machine_actor_forms(self, client, auth):
        """machine:<id> actors match by the full machine: form AND the
        bare id part. The audit carries machine actors only where the
        writers put them, so the shape is pinned on a synthetic row."""
        task = _seed_task(client, auth, "ui28-machine")
        _insert_event("task.updated", task, {"actor": "machine:reaper"},
                      _iso(datetime.now(timezone.utc)))
        full = _items(client, task_id=task, agent="machine:reaper")["items"]
        bare = _items(client, task_id=task, agent="reaper")["items"]
        assert full and bare
        assert {i["id"] for i in full} == {i["id"] for i in bare}
        assert _items(client, task_id=task,
                      agent="machine:ui")["count"] == 0

    def test_host_filter_and_host_field(self, client, auth):
        """§2.4/§3.2: host resolves through the executors registry AT
        READ TIME (best-effort); rows carry the resolved host; an
        unknown host is an empty page."""
        task = _seed_task(client, auth, "ui28-host")
        r = client.post("/api/executors",
                        json={"name": "ui28-ex-host", "harness": "zcode",
                              "host": "ui28-host-a"},
                        headers=auth)
        assert r.status_code == 201, r.text
        ex_id = r.json()["executor"]["id"]
        try:
            r = client.post("/api/assignments",
                            json={"task_id": task,
                                  "specialist": "gcw-tech-lead",
                                  "executor_id": ex_id},
                            headers=auth)
            assert r.status_code == 201, r.text
            rows = _items(client, task_id=task, type="assignment",
                          host="ui28-host-a")["items"]
            assert rows
            assert all(i["host"] == "ui28-host-a"
                       and i["executor_id"] == ex_id for i in rows)
            assert _items(client, host="ui28-host-none")["count"] == 0
        finally:
            assert client.delete(f"/api/executors/{ex_id}",
                                 headers=auth).status_code == 200
        # the executor is gone → the resolve finds nothing → empty page
        assert _items(client, task_id=task, type="assignment",
                      host="ui28-host-a")["count"] == 0

    def test_row_optional_keys_absent_not_null(self, client, auth):
        """§3.2 additive contract: optional keys are ABSENT (not null)
        when there is nothing honest to put there; a deleted task keeps
        its audit rows with the raw id and NO task_title."""
        task = _seed_task(client, auth, "ui28-gone")
        assert client.delete(f"/api/tasks/{task}",
                             headers=auth).status_code == 200
        rows = _items(client, task_id=task)["items"]
        assert rows
        for i in rows:
            assert "task_title" not in i
            assert "host" not in i
            assert "executor_id" not in i
            assert i["task_id"] == task
        assert {i["kind"] for i in rows} >= {"task.created", "task.deleted"}

    def test_report_row_detail_is_clipped_body(self, client, auth):
        """detail carries the raw fact (report body excerpt, clip 200);
        task.created rows have none (the title already says it)."""
        task = _seed_task(client, auth, "ui28-detail")
        r = client.post(f"/api/tasks/{task}/reports",
                        json={"body": "d" * 500, "kind": "final",
                              "agent": "ui28-detail-agent"},
                        headers=auth)
        assert r.status_code == 201, r.text
        rows = [i for i in _items(client, task_id=task)["items"]
                if i["kind"] == "task.report"]
        assert rows and len(rows[0]["detail"]) == 200
        created = [i for i in _items(client, task_id=task)["items"]
                   if i["kind"] == "task.created"]
        assert created and "detail" not in created[0]

    def test_default_feed_never_leaves_the_dictionary(self, client):
        """§7: executor.*/pairing.* audit rows NEVER surface in the
        feed — with or without an explicit type=."""
        from server.app import _ACTIVITY_V1_KINDS
        now = _iso(datetime.now(timezone.utc))
        _insert_event("executor.registered", None, {"id": "ui28-ex"}, now)
        _insert_event("pairing.created", None, {}, now)
        for i in _items(client)["items"]:
            assert i["kind"] in _ACTIVITY_V1_KINDS


# --------------------------------------------- Ф1: the actor-strip policy
class TestActivityActorStrip:
    def test_anonymous_get_has_no_actor_key(self, client, auth):
        """§8.12: an anonymous leg reads rows with the actor key ABSENT
        (server-side strip, additive)."""
        task = _seed_task(client, auth, "ui28-strip")
        client.cookies.clear()
        rows = _items(client, task_id=task)["items"]
        assert rows and all("actor" not in i for i in rows)

    def test_ui_bearer_sees_actor(self, client, auth):
        task = _seed_task(client, auth, "ui28-strip-ui")
        rows = _items(client, auth, task_id=task)["items"]
        assert rows and all(i["actor"] == "ui" for i in rows)

    def test_ui_cookie_leg_sees_actor(self, client, auth, app_module,
                                      monkeypatch):
        """The cookie leg is authenticated (ADR 0014): login at the
        door, then a headerless GET reads attribution. The login
        limiters are module globals — fresh ones per test."""
        from server.security import RateLimiter
        monkeypatch.setattr(app_module, "_auth_verify_ip_limiter",
                            RateLimiter(limit=10, window=60.0))
        monkeypatch.setattr(app_module, "_auth_verify_global_limiter",
                            RateLimiter(limit=10, window=60.0))
        task = _seed_task(client, auth, "ui28-strip-cookie")
        effective = app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN
        r = client.post("/api/auth/ui-token", json={"token": effective})
        assert r.status_code == 200, r.text
        rows = _items(client, task_id=task)["items"]
        assert rows and all(i["actor"] == "ui" for i in rows)

    def test_machine_bearer_is_stripped_in_split_mode(
            self, app_module, client, split_tokens, machine_auth, ui_auth):
        """Verdict 2: a machine bearer is a service credential, not a
        person — in split mode (the classes actually distinct) its reads
        are stripped. Needs split_tokens: in the transition env the
        board token IS the effective ui class."""
        task = _seed_task(client, ui_auth, "ui28-split")
        rows = _items(client, machine_auth, task_id=task)["items"]
        assert rows and all("actor" not in i for i in rows)
        rows = _items(client, ui_auth, task_id=task)["items"]
        assert rows and all(i["actor"] == "ui" for i in rows)

    def test_mnd_device_leg_sees_actor(self, app_module, client):
        """An mnd_ leg is authenticated (verdict 2): device-created rows
        carry the device attribution and the device reads it; an
        anonymous read of the same rows does not."""
        row, _code = app_module.store.create_pairing_request(
            device_name="ui28-dev")
        app_module.store.scan_pairing(row["id"], device_name="ui28-dev",
                                      source_ip="testclient")
        app_module.store.confirm_pairing(row["id"], allow=True)
        device, token = app_module.store.issue_device_session(row["id"])
        headers = {"Authorization": f"Bearer {token}"}
        try:
            r = client.post("/api/tasks", json={"title": "ui28-device"},
                            headers=headers)
            assert r.status_code == 201, r.text
            task = r.json()["id"]
            expected = f"device:{device['id']} {device['name']}"
            rows = _items(client, headers, task_id=task)["items"]
            assert rows and rows[-1]["actor"] == expected
            client.cookies.clear()
            anon = _items(client, task_id=task)["items"]
            assert anon and all("actor" not in i for i in anon)
        finally:
            with _db() as db:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (device["id"],))
                db.execute("DELETE FROM pairing_requests WHERE id=?",
                           (row["id"],))


# ------------------------------------------------------ Ф2: bucket форма
class TestActivityBuckets:
    def test_bucket_shape_zero_filled_chronological(self, client, auth):
        """§3.2 Ф2: hourly buckets ending at the current hour,
        zero-filled, oldest first, fixed by_type keys."""
        task = _seed_task(client, auth, "ui28-bucket")
        r = client.post(f"/api/tasks/{task}/reports",
                        json={"body": "bucket", "kind": "intermediate",
                              "agent": "ui28-bucket-agent"},
                        headers=auth)
        assert r.status_code == 201, r.text
        r = client.post("/api/assignments",
                        json={"task_id": task,
                              "specialist": "gcw-tech-lead"},
                        headers=auth)
        assert r.status_code == 201, r.text
        j = _items(client, bucket="hour", task_id=task)
        assert j["bucket"] == "hour" and j["hours"] == 24
        buckets = j["buckets"]
        assert len(buckets) == 24
        assert [b["ts"] for b in buckets] == sorted(
            b["ts"] for b in buckets), "oldest first"
        assert sum(b["total"] for b in buckets) == 3
        assert buckets[-1]["total"] == 3
        assert buckets[-1]["by_type"] == {"task": 1, "assignment": 1,
                                          "report": 1}
        assert buckets[0]["total"] == 0
        assert buckets[0]["by_type"] == {"task": 0, "assignment": 0,
                                         "report": 0}

    @pytest.mark.parametrize("raw,expect", [
        (0, 1), (-5, 1), (1, 1), (3, 3), (48, 48), (999, 48),
    ])
    def test_hours_clamped_1_to_48(self, client, raw, expect):
        """The Ф2 window clamps silently to 1..48; the response reports
        the EFFECTIVE hours."""
        j = _items(client, bucket="hour", hours=raw)
        assert j["hours"] == expect
        assert len(j["buckets"]) == expect

    def test_non_integer_hours_422(self, client):
        assert client.get("/api/activity", params={"bucket": "hour",
                                                   "hours": "abc"}
                          ).status_code == 422

    def test_unknown_bucket_value_422(self, client):
        assert client.get("/api/activity",
                          params={"bucket": "day"}).status_code == 422

    def test_buckets_honor_type_filter(self, client, auth):
        """Ф2: the same filters as the лента — type=report counts only
        report rows into the report counter."""
        task = _seed_task(client, auth, "ui28-bucket-type")
        r = client.post(f"/api/tasks/{task}/reports",
                        json={"body": "bt", "kind": "final",
                              "agent": "ui28-bt-agent"},
                        headers=auth)
        assert r.status_code == 201, r.text
        j = _items(client, bucket="hour", hours=1, task_id=task,
                   type="report")
        assert len(j["buckets"]) == 1
        assert j["buckets"][0]["by_type"] == {"task": 0, "assignment": 0,
                                              "report": 1}
        assert j["buckets"][0]["total"] == 1

    def test_cursor_params_ignored_in_bucket_form(self, client):
        """Documented shape: limit/before_id are meaningless for the
        histogram and are ignored (no 422 — one endpoint, one param)."""
        assert client.get("/api/activity", params={
            "bucket": "hour", "limit": 5, "before_id": 2}).status_code == 200


# ------------------------------------------------- retention (verdict 1)
class TestEventsRetention:
    def test_age_sweep_deletes_non_task_only(self, app_module):
        """90-day pass: aged non-task rows go, aged task.* rows stay
        (they feed the per-task history)."""
        old = _iso(datetime.now(timezone.utc) - timedelta(days=91))
        _insert_event("assignment.created", None, {}, old)
        _insert_event("task.created", None, {}, old)
        swept = app_module.store.sweep_events_retention()
        assert swept["aged"] >= 1
        with _db() as db:
            left = {r["kind"] for r in db.execute(
                "SELECT kind FROM events WHERE ts=?", (old,)).fetchall()}
        assert left == {"task.created"}, "aged task.* must survive"

    def test_cap_trims_oldest_non_task(self, app_module, monkeypatch):
        """500k pass (the number shrunk for test): above the cap the
        OLDEST non-task rows go, oldest first; task.* is exempt."""
        import server.store as store_mod
        monkeypatch.setattr(store_mod, "ACTIVITY_RETENTION_CAP", 3)
        base = datetime.now(timezone.utc) - timedelta(hours=2)
        for i in (1, 2, 3):
            _insert_event("assignment.created", None, {"n": i},
                          _iso(base + timedelta(minutes=i)))
        _insert_event("task.moved", None, {"n": 4},
                      _iso(base + timedelta(minutes=4)))
        swept = app_module.store.sweep_events_retention()
        assert swept["aged"] == 0
        assert swept["capped"] >= 2
        with _db() as db:
            rows = [json.loads(r["payload"])["n"] for r in db.execute(
                "SELECT payload FROM events WHERE payload LIKE '%\"n\":%' "
                "ORDER BY id ASC").fetchall()]
        assert 1 not in rows, "the oldest non-task row must go first"
        assert 4 in rows, "task.* rows are never capped away"

    def test_cap_cannot_delete_task_family(self, app_module, monkeypatch):
        """The extreme case is honest: when non-task rows are exhausted
        the board may stay ABOVE the cap — retention trims chatter,
        never history. Pinned: cap deletions touch non-task rows only,
        and a task.* row is never removed by the cap pass."""
        import server.store as store_mod
        monkeypatch.setattr(store_mod, "ACTIVITY_RETENTION_CAP", 1)
        marker = json.dumps({"probe": "ui28-cap-task"})
        _insert_event("task.created", None, {"probe": "ui28-cap-task"},
                      _iso(datetime.now(timezone.utc)))
        with _db() as db:
            non_task_before = db.execute(
                "SELECT COUNT(*) AS n FROM events "
                "WHERE kind NOT LIKE 'task.%'").fetchone()["n"]
        swept = app_module.store.sweep_events_retention()
        with _db() as db:
            non_task_after = db.execute(
                "SELECT COUNT(*) AS n FROM events "
                "WHERE kind NOT LIKE 'task.%'").fetchone()["n"]
            task_left = db.execute(
                "SELECT COUNT(*) AS n FROM events WHERE payload=?",
                (marker,)).fetchone()["n"]
        assert swept["capped"] == non_task_before - non_task_after, \
            "the cap pass deletes non-task rows only"
        assert task_left == 1

    def test_validation_sweep_tick_runs_retention(self, app_module):
        """Verdict 1: retention rides the EXISTING validation sweep —
        one tick prunes aged audit rows alongside its WF-1 flagging
        (whose return contract is unchanged)."""
        old = _iso(datetime.now(timezone.utc) - timedelta(days=120))
        _insert_event("pairing.created", None, {}, old)
        flagged = app_module._validation_sweep_once()
        assert isinstance(flagged, int)  # the WF-1 contract is untouched
        with _db() as db:
            left = db.execute(
                "SELECT COUNT(*) AS n FROM events WHERE ts=?",
                (old,)).fetchone()["n"]
        assert left == 0


# ------------------------------------- SSE strip on subscription (v.2)
def _sse_request(headers: dict | None = None) -> Request:
    scope = {"type": "http", "method": "GET", "path": "/api/events",
             "headers": [(k.lower().encode(), v.encode())
                         for k, v in (headers or {}).items()],
             "query_string": b"", "server": ("test", 80),
             "client": ("127.0.0.1", 1), "scheme": "http"}
    return Request(scope)


async def _subscribe_frames(app_module, request: Request,
                            broadcasts: list[dict], n: int) -> list[dict]:
    """Drive the real /api/events subscription: register (the leg is
    classified HERE), let the broadcasts fan out, read n data frames,
    then close the generator (the finally-block unsubscribes)."""
    resp = await app_module.events(request)
    it = resp.body_iterator
    first = await asyncio.wait_for(it.__anext__(), timeout=5)
    assert first.startswith(b"retry: ")
    hello = json.loads(
        (await asyncio.wait_for(it.__anext__(), timeout=5))
        .decode()[len("data: "):].strip())
    assert hello["kind"] == "hello"
    for ev in broadcasts:
        app_module._broadcast(ev)
    frames = []
    for _ in range(n):
        raw = await asyncio.wait_for(it.__anext__(), timeout=5)
        frames.append(json.loads(raw.decode()[len("data: "):].strip()))
    await it.aclose()
    return frames


class TestSseActorStrip:
    def test_anonymous_subscription_strips_task_actor(self, app_module):
        """Verdict 2: an unauthenticated SUBSCRIBER gets task.* frames
        with the actor key absent — additive, everything else rides
        byte-identical."""
        frames = asyncio.run(_subscribe_frames(
            app_module, _sse_request(),
            [{"kind": "task.created", "task": {"id": "x"}, "actor": "ui"}],
            1))
        assert frames[0]["kind"] == "task.created"
        assert "actor" not in frames[0]
        assert frames[0]["task"] == {"id": "x"}

    def test_authenticated_subscription_keeps_actor(self, app_module,
                                                    machine_auth):
        frames = asyncio.run(_subscribe_frames(
            app_module, _sse_request(machine_auth),
            [{"kind": "task.created", "task": {"id": "y"}, "actor": "ui"}],
            1))
        assert frames[0]["actor"] == "ui"

    def test_non_task_frames_are_never_stripped(self, app_module):
        """The strip targets attribution on task.* frames only: the
        report frame's actor is DECLARED identity (§7 — a fact) and
        assignment frames carry no top-level actor at all; both pass
        through unchanged for an anonymous subscriber."""
        frames = asyncio.run(_subscribe_frames(
            app_module, _sse_request(),
            [{"kind": "report", "task_id": "t", "actor": "ui28-a"},
             {"kind": "assignment.created", "assignment": {"id": 1}}],
            2))
        assert frames[0]["actor"] == "ui28-a"
        assert "actor" not in frames[1]

    def test_leg_classification_unit(self, app_module):
        """The one classifier both surfaces share: ui-bearer / ui-cookie
        / mnd_ → True; anonymous / a mismatching bearer → False. (The
        machine-bearer negative is pinned in split mode above.)"""
        assert app_module._leg_is_authenticated(_sse_request()) is False
        wrong = _sse_request(
            {"Authorization": "Bearer ui28-not-a-real-token"})
        assert app_module._leg_is_authenticated(wrong) is False
        device = _sse_request()
        device.state.device = {"id": "d", "name": "Tab"}
        assert app_module._leg_is_authenticated(device) is True

    def test_strip_task_actor_unit(self, app_module):
        ev = {"kind": "task.moved", "task": {}, "actor": "ui",
              "notification": {"id": 1}}
        stripped = app_module._strip_task_actor(ev)
        assert stripped == {"kind": "task.moved", "task": {},
                            "notification": {"id": 1}}
        assert "actor" in ev, "the fan-out event must never be mutated"
        non_task = {"kind": "report", "actor": "x"}
        assert app_module._strip_task_actor(non_task) is non_task
