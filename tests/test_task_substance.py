"""Task card substance (P1 «карточка = вещество»): GET
/api/tasks/{task_id}/substance — ONE ui-class read composing what the
board DB really holds about a card. Contract pinned here:

- honest empties (ME-062 §5 precedent): a fresh task answers count 0 /
  items [] / final null for every source — never a skeleton/stub;
- 404 on an unknown task; anonymous → 401; a machine-class bearer under
  split_tokens → 401; a VALID mnd_ device → the explanatory 403 wall
  (the composite carries session facts with host paths — the /sessions
  wall);
- reports: chronological, slug pair per agent (display name
  «@GCW: Tech Lead» → ``gcw-tech-lead``), live final picked, superseded
  finals stay in items flagged (BE-11a semantics unchanged);
- slug misses are honest: a name that does not normalize keeps its raw
  form with slug_ok=false (never dropped, never mangled);
- nominations: full assignment history + active pick; claim_token and
  spec_snapshot never appear in the payload (SSE dictionary §11);
- session facts: same projection as GET /sessions (session_id glue,
  host path) — honest-empty while no facts exist;
- memories: linked ids + count are board-DB truth by default with NO
  egress (decoy stays at zero connections); ?resolve_memories=true
  resolves the checkpoint cards through the shared mnemos resolver;
- review is null BY CONTRACT: the board DB holds no review source (no
  table, no tasks column, no history event kind) — the explicit null
  tells the FE «источника нет в базе», never a forgotten section.

Every authenticated read below carries the bearer EXPLICITLY. A
headerless GET can only pass through the ``vesmaro_ui`` cookie leg, and
that cookie is set by the ui-write sliding-reissue whose 5-minute
per-IP budget (``_ui_reissue_last``) is module-global — order- and
timing-dependent, invisible in a solo re-run. The cookie side channel
is board behavior, not something a contract test may lean on.
"""

from __future__ import annotations

import json

import pytest


@pytest.fixture(autouse=True)
def fresh_substance_state(app_module, client):
    """Per-test isolation: session facts are NOT cascaded by task delete
    (delete_task removes reports + assignments), so wipe them explicitly;
    tasks/assignments ride the make_task teardown."""
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM task_session_facts")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM task_session_facts")


@pytest.fixture()
def fake_server(app_module, fake_mnemos):
    """Register an enabled fake vesma server for memory resolution
    (test_task_history pattern); removed again on teardown."""
    name = "substfake"
    app_module.store.upsert_server({
        "name": name, "url": fake_mnemos.url, "group_name": "default",
        "description": "substance test double", "token_ref": "",
        "enabled": True,
    })
    yield {"name": name, "fake": fake_mnemos}
    app_module.store.delete_server(name)


def _report(client, auth, task_id, kind, agent, body="тело отчёта"):
    r = client.post(f"/api/tasks/{task_id}/reports",
                    json={"kind": kind, "agent": agent, "body": body},
                    headers=auth)
    assert r.status_code == 201, r.text
    return r.json()["report"]


def _substance(client, task_id, headers=None, **params):
    return client.get(f"/api/tasks/{task_id}/substance", headers=headers,
                      params=params)


class TestSubstanceContract:
    def test_honest_empty_fresh_task(self, client, auth, make_task):
        """A task the loop never touched: every source honestly empty."""
        task = make_task(title="subst-empty")
        r = _substance(client, task["id"], headers=auth)
        assert r.status_code == 200
        out = r.json()
        assert out["ok"] is True
        assert out["task_id"] == task["id"]
        assert out["task"]["id"] == task["id"]
        assert out["reports"] == {"count": 0, "live_count": 0,
                                  "final": None, "items": []}
        assert out["executors"] == {"count": 0, "active": None,
                                    "items": []}
        assert out["sessions"] == {"count": 0, "items": []}
        assert out["memories"] == {"count": 0, "linked": [], "items": {},
                                   "unresolved": [], "sources": {}}
        assert out["review"] is None  # no review source in the board DB

    def test_unknown_task_404(self, client, auth):
        # authed caller: the guard passes, the unknown id is a plain 404
        # (an anonymous caller gets the 401 first — no existence leak)
        assert _substance(client, "no-such-task",
                          headers=auth).status_code == 404

    def test_reports_slugs_final_and_chronology(self, client, auth,
                                                make_task):
        task = make_task(title="subst-reports")
        _report(client, auth, task["id"], "intermediate",
                "@GCW: Tech Lead", "промежуточный")
        _report(client, auth, task["id"], "final",
                "gcw-senior-system-engineer", "финальный")
        out = _substance(client, task["id"], headers=auth).json()
        reports = out["reports"]
        assert reports["count"] == 2
        assert reports["live_count"] == 2
        assert [i["kind"] for i in reports["items"]] == \
            ["intermediate", "final"]  # oldest first
        assert reports["final"] is not None
        assert reports["final"]["kind"] == "final"
        assert reports["final"]["body"] == "финальный"
        # slug pair: display name normalizes; canonical slug passes through
        by_kind = {i["kind"]: i for i in reports["items"]}
        assert by_kind["intermediate"]["agent"] == "@GCW: Tech Lead"
        assert by_kind["intermediate"]["agent_slug"] == "gcw-tech-lead"
        assert by_kind["intermediate"]["agent_slug_ok"] is True
        assert by_kind["final"]["agent_slug"] == "gcw-senior-system-engineer"
        assert all("human_body" in i for i in reports["items"])

    def test_superseded_final_stays_flagged(self, client, auth, make_task):
        task = make_task(title="subst-supersede")
        _report(client, auth, task["id"], "final", "gcw-tech-lead", "v1")
        _report(client, auth, task["id"], "final", "gcw-tech-lead", "v2")
        out = _substance(client, task["id"],
                         headers=auth).json()["reports"]
        assert out["count"] == 2
        assert out["live_count"] == 1
        assert out["final"]["body"] == "v2"
        assert [i["superseded"] for i in out["items"]] == [True, False]

    def test_slug_miss_is_honest(self, client, auth, make_task):
        """A name that does not normalize stays verbatim with slug_ok=false
        (allowlist-miss is SIGNALLED, never silently dropped); an explicit
        gcw- head is never doubled."""
        task = make_task(title="subst-slug-miss")
        _report(client, auth, task["id"], "intermediate", "Максим")
        _report(client, auth, task["id"], "final", "@gcw-product-architect")
        items = _substance(client, task["id"],
                           headers=auth).json()["reports"]["items"]
        miss = items[0]
        assert miss["agent"] == "Максим"
        assert miss["agent_slug"] == ""
        assert miss["agent_slug_ok"] is False
        hit = items[1]
        assert hit["agent_slug"] == "gcw-product-architect"
        assert hit["agent_slug_ok"] is True


class TestSubstanceAuth:
    def test_anonymous_401(self, client, make_task):
        task = make_task(title="subst-anon")
        assert _substance(client, task["id"]).status_code == 401

    def test_split_tokens_machine_401_ui_200(self, client, split_tokens,
                                             machine_auth, ui_auth,
                                             make_task):
        """Split mode: the composite rides the /sessions wall — machine
        bearer refuses, ui bearer passes."""
        task = make_task(title="subst-split")
        r = client.get(f"/api/tasks/{task['id']}/substance",
                       headers=machine_auth)
        assert r.status_code == 401
        r = client.get(f"/api/tasks/{task['id']}/substance",
                       headers=ui_auth)
        assert r.status_code == 200

    def test_mnd_device_hits_explanatory_wall(self, client, auth, app_module,
                                              make_task):
        """A VALID mnd_ device reaches the handler (the /api/tasks* read
        table) and gets the EXPLANATORY 403 wall — the composite carries
        session facts with host paths, never device-readable (the
        /sessions wall, ME-020/062 §7); the same device still reads the
        open task surface (test_me062 pattern)."""
        task = make_task(title="subst-mnd-wall")
        row, _ = app_module.store.create_pairing_request(
            device_name="subst-dev")
        app_module.store.scan_pairing(row["id"], device_name="subst-dev",
                                      source_ip="testclient")
        app_module.store.confirm_pairing(row["id"], allow=True)
        _device, token = app_module.store.issue_device_session(row["id"])
        try:
            r = _substance(client, task["id"],
                           headers={"Authorization": f"Bearer {token}"})
            assert r.status_code == 403, r.text
            assert "ui-класс" in r.json()["detail"]
            assert client.get(f"/api/tasks/{task['id']}",
                              headers={"Authorization": f"Bearer {token}"}
                              ).status_code == 200
        finally:
            # the shared session DB must not leak the device row into
            # the ≤5-active quota (test_device_scope_v1 pattern)
            with app_module.store._lock, app_module.store._conn() as db:
                db.execute("DELETE FROM device_sessions WHERE id=?",
                           (_device["id"],))


class TestSubstanceExecutors:
    def test_nomination_projection_and_secrets(self, client, auth,
                                               make_task):
        task = make_task(title="subst-assign")
        r = client.post("/api/assignments",
                        json={"task_id": task["id"],
                              "specialist": "@GCW: QA Engineer"},
                        headers=auth)
        assert r.status_code == 201, r.text
        out = _substance(client, task["id"],
                         headers=auth).json()["executors"]
        assert out["count"] == 1
        assert out["active"] is not None
        assert out["active"]["state"] == "queued"
        # mint-time slug (Loop S-step 1) + read-side pair agree
        assert out["active"]["specialist"] == "gcw-qa-engineer"
        assert out["active"]["specialist_slug"] == "gcw-qa-engineer"
        assert out["active"]["specialist_slug_ok"] is True
        raw = json.dumps(_substance(client, task["id"],
                                    headers=auth).json())
        assert "claim_token" not in raw
        assert "spec_snapshot" not in raw

    def test_cancelled_assignment_leaves_history_no_active(self, client,
                                                           auth, make_task):
        task = make_task(title="subst-assign-cancel")
        r = client.post("/api/assignments",
                        json={"task_id": task["id"],
                              "specialist": "gcw-qa-engineer"},
                        headers=auth)
        assignment_id = r.json()["assignment"]["id"]
        r = client.post(f"/api/assignments/{assignment_id}/cancel",
                        json={"reason": "тест"}, headers=auth)
        assert r.status_code == 200, r.text
        out = _substance(client, task["id"],
                         headers=auth).json()["executors"]
        assert out["count"] == 1  # history kept
        assert out["active"] is None
        assert out["items"][0]["state"] == "cancelled"
        assert out["items"][0]["finished_at"]


class TestSubstanceSessions:
    def test_fact_row_served_with_glue_id(self, client, auth, app_module,
                                          make_task):
        task = make_task(title="subst-sessions")
        assert _substance(client, task["id"],
                          headers=auth).json()["sessions"] == \
            {"count": 0, "items": []}  # honest empty first
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute(
                "INSERT INTO task_session_facts (executor_id, native_id, "
                "task_id, harness, specialist, path, tool_calls, duration_s,"
                " started_at, ended_at, parent_native_id, first_seen_at,"
                " reported_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                ("exec-1", "sess_abc", task["id"], "zcode",
                 "gcw-tech-lead", "/home/u/sessions/sess_abc.jsonl",
                 12, 340, "2026-10-22T10:04:11Z", "2026-10-22T10:09:51Z",
                 "", "2026-10-22T10:04:12Z", "2026-10-22T10:09:52Z"))
        out = _substance(client, task["id"],
                         headers=auth).json()["sessions"]
        assert out["count"] == 1
        fact = out["items"][0]
        assert fact["session_id"] == "exec-1:sess_abc"
        assert fact["path"] == "/home/u/sessions/sess_abc.jsonl"
        assert fact["specialist"] == "gcw-tech-lead"
        assert fact["reported_age_s"] >= 0


class TestSubstanceMemories:
    def test_linked_ids_no_egress_by_default(self, client, auth, decoy,
                                             make_task):
        """Default answer: board-DB truth only — linked ids served, zero
        network egress (the decoy must stay at zero connections)."""
        task = make_task(title="subst-mem")
        r = client.patch(f"/api/tasks/{task['id']}",
                         json={"memory_ids": ["m-1", "m-2"]}, headers=auth)
        assert r.status_code == 200, r.text
        out = _substance(client, task["id"],
                         headers=auth).json()["memories"]
        assert out["count"] == 2
        assert out["linked"] == ["m-1", "m-2"]
        assert out["items"] == {}
        assert decoy.connections() == 0

    def test_resolve_opt_in_resolves_cards(self, client, auth, fake_server,
                                           make_task):
        fake = fake_server["fake"]
        fake.memory_cards["m-1"] = {
            "id": "m-1", "title": "Промежуточный отчёт — 22.10",
            "excerpt": "что сделано", "created_at": "2026-10-22T10:00:00Z",
        }
        task = make_task(title="subst-mem-resolve")
        r = client.patch(f"/api/tasks/{task['id']}",
                         json={"memory_ids": ["m-1"]}, headers=auth)
        assert r.status_code == 200, r.text
        out = _substance(client, task["id"],
                         headers=auth,
                         resolve_memories=True).json()["memories"]
        assert out["items"]["m-1"]["title"] == \
            "Промежуточный отчёт — 22.10"
        assert out["sources"] == {"m-1": fake_server["name"]}
        assert out["unresolved"] == []

    def test_resolve_opt_in_honest_unresolved(self, client, auth,
                                              fake_server, make_task):
        """A linked id no server resolves stays honestly unresolved —
        never dropped, never stubbed."""
        task = make_task(title="subst-mem-unresolved")
        client.patch(f"/api/tasks/{task['id']}",
                     json={"memory_ids": ["ghost-id"]}, headers=auth)
        out = _substance(client, task["id"],
                         headers=auth,
                         resolve_memories=True).json()["memories"]
        assert out["items"] == {}
        assert any(u["id"] == "ghost-id" for u in out["unresolved"])


class TestSubstanceOpenApi:
    def test_route_references_schema(self, client):
        spec = client.get("/openapi.json").json()
        schema = (spec["paths"]["/api/tasks/{task_id}/substance"]["get"]
                  ["responses"]["200"]["content"]["application/json"]
                  ["schema"])
        assert schema.get("$ref", "").rsplit("/", 1)[-1] == "TaskSubstanceOut"
        components = spec["components"]["schemas"]
        for name in ("TaskSubstanceOut", "SubstanceReportsOut",
                     "SubstanceReportOut", "SubstanceExecutorsOut",
                     "SubstanceAssignmentOut", "SubstanceSessionsOut",
                     "SubstanceMemoriesOut"):
            assert name in components, name
