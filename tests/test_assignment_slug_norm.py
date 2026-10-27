"""Loop S-steps 1-2 (verdict card loop-verification-board-agents,
2026-10-22): specialist display-name → slug normalization and the honest
waiting status for pinned ghosts.

Verdict fixtures — the last four display-name nominations:
  id=16 «@GCW: Tech Lead» (pi)    → poller allowlist miss, burned;
  id=17 «@gcw-product-architect»  → poller allowlist miss, burned;
  id=24 «@GCW: Tech Lead» (zcode) → poller allowlist miss, burned;
  id=9  «@GCW: Tech Lead»         → queued ghost pinned to a disabled
                                      executor (laptop-zcode-1).
The three burned names are the normalization fixtures; the fourth is the
ghost the waiting status keeps honest.

Coverage:
- normalize_specialist / specialist_matches unit behavior (pure);
- mint-time normalization: the stored row and the wire payload carry the
  slug; the raw display name survives in the audit event;
- honest miss: a name that does not normalize is stored verbatim AND
  journaled (assignment.specialist_unnormalized) — never silently dropped;
- routing annotation matches display names against slug capabilities;
- waiting: an explicit pin onto an ineligible executor carries the human
  words (downtime dictionary) on the card, and the mint journals
  assignment.pin_waiting.
"""

from __future__ import annotations

import pytest
from conftest import BOARD_TOKEN

MACHINE_HEADERS = {"Authorization": f"Bearer {BOARD_TOKEN}"}

from server.security import RateLimiter
from server.store import normalize_specialist, specialist_matches


@pytest.fixture(autouse=True)
def fresh_routing_env(app_module, monkeypatch):
    """Fresh rate limiters and a wiped executor registry (the routing
    chain scans ALL rows — leftover executors from sibling tests would
    resolve the auto tier before the specialist tier is reached)."""
    for name in ("_executor_register_limiter",
                 "_executor_heartbeat_limiter",
                 "_assignment_heartbeat_limiter",
                 "_assignment_limiter", "_assignment_ui_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
        db.execute("DELETE FROM task_assignments")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
        db.execute("DELETE FROM task_assignments")


def _make_executor(client, ui_auth, name: str, *, caps: list[str] | None = None,
                   enabled: bool = True) -> dict:
    r = client.post("/api/executors",
                    json={"name": name, "harness": "zcode"},
                    headers=MACHINE_HEADERS)
    assert r.status_code == 201, r.text
    executor = r.json()["executor"]
    r = client.patch(f"/api/executors/{executor['id']}",
                     json={"state": "approved", "enabled": enabled,
                           **({"capabilities": caps} if caps else {})},
                     headers=ui_auth)
    assert r.status_code == 200, r.text
    return r.json()["executor"]


def _assignment_item(client, assignment_id: int) -> dict:
    items = client.get("/api/assignments").json()["items"]
    return next(i for i in items if i["id"] == assignment_id)


def _task_events(app_module, task_id: str) -> list[dict]:
    """This task's journal rows only — the session-scoped store accumulates
    events across the whole suite, so both the task scope and a limit past
    the session volume are mandatory (a bare limit=N reads the OLDEST N)."""
    return [e for e in app_module.store.events(limit=100000)
            if e["task_id"] == task_id]


# ------------------------------------------------------- unit: normalizer
@pytest.mark.parametrize("raw,slug", [
    # the verdict fixtures (id=16/24, id=17, id=11 — the one that lived):
    ("@GCW: Tech Lead", "gcw-tech-lead"),
    ("@gcw-product-architect", "gcw-product-architect"),
    ("@GCW: Agent Architect", "gcw-agent-architect"),
    # prefix/case variants:
    ("gcw: tech lead", "gcw-tech-lead"),
    ("Tech Lead", "tech-lead"),
    ("  GCW-TECH-LEAD ", "gcw-tech-lead"),
    # junk that must NOT normalize (honest-miss territory):
    ("Мой агент", ""),
    ("", ""),
    ("   ", ""),
])
def test_normalize_specialist(raw, slug):
    assert normalize_specialist(raw) == slug


@pytest.mark.parametrize("declared,cap,want", [
    ("@GCW: Tech Lead", "gcw-tech-lead", True),
    ("Tech Lead", "gcw-tech-lead", True),          # prefix-insensitive
    ("gcw-tech-lead", "Tech Lead", True),          # symmetric head
    ("GCW-TECH-LEAD", "gcw-tech-lead", True),      # case-insensitive
    ("@gcw-product-architect", "gcw-product-architect", True),
    ("smoke-probe", "gcw-tech-lead", False),
    ("Мой агент", "gcw-tech-lead", False),
    ("Мой агент", "Мой агент", True),              # raw fallback equality
])
def test_specialist_matches(declared, cap, want):
    assert specialist_matches(declared, cap) is want


# ----------------------------------------------- mint-time normalization
def test_create_stores_slug_and_keeps_raw_in_audit(client, ui_auth, make_task,
                                                   app_module):
    """id=16/24 redressed: «@GCW: Tech Lead» is stored (and served) as the
    slug the poller allowlists match on; the raw name rides the audit."""
    task = make_task(title="s1 slug mint")
    r = client.post("/api/assignments",
                    json={"task_id": task["id"],
                          "specialist": "@GCW: Tech Lead"},
                    headers=ui_auth)
    assert r.status_code == 201, r.text
    item = _assignment_item(client, r.json()["assignment"]["id"])
    assert item["specialist"] == "gcw-tech-lead"
    events = _task_events(app_module, task["id"])
    created = next(e for e in events if e["kind"] == "assignment.created")
    assert created["payload"]["specialist"] == "gcw-tech-lead"
    assert created["payload"]["specialist_raw"] == "@GCW: Tech Lead"


def test_unknown_name_journaled_not_dropped(client, ui_auth, make_task,
                                             app_module):
    """S-step 1 honesty clause: a name that does not normalize stays
    verbatim on the card AND lands in the journal with the reason."""
    task = make_task(title="s1 honest miss")
    r = client.post("/api/assignments",
                    json={"task_id": task["id"], "specialist": "Мой агент"},
                    headers=ui_auth)
    assert r.status_code == 201, r.text
    item = _assignment_item(client, r.json()["assignment"]["id"])
    assert item["specialist"] == "Мой агент"
    events = _task_events(app_module, task["id"])
    miss = [e for e in events
            if e["kind"] == "assignment.specialist_unnormalized"]
    assert len(miss) == 1
    assert miss[0]["payload"]["specialist"] == "Мой агент"
    assert miss[0]["payload"]["reason"]


# ------------------------------------------------------- routing matching
def test_routing_matches_display_name_against_slug_capability(
        client, ui_auth, make_task):
    """The verdict's routing half: a display-name nomination resolves to
    the executor whose capability carries the slug form."""
    _make_executor(client, ui_auth, "routed-1", caps=["gcw-tech-lead"])
    task = make_task(title="s1 routing")
    r = client.post("/api/assignments",
                    json={"task_id": task["id"],
                          "specialist": "@GCW: Tech Lead"},
                    headers=ui_auth)
    assert r.status_code == 201, r.text
    item = _assignment_item(client, r.json()["assignment"]["id"])
    assert item["routing"]["reason"] == "specialist"
    assert item["routing"]["resolved"]
    assert item["routing"]["waiting"] is None


# ------------------------------------------------- waiting (S-step 2)
def test_waiting_status_on_disabled_pin(client, ui_auth, make_task):
    """id=9 redressed live: pin onto a disabled executor → the card
    carries the honest waiting block with human words."""
    executor = _make_executor(client, ui_auth, "ghosted-1")
    r = client.patch(f"/api/executors/{executor['id']}",
                     json={"enabled": False}, headers=ui_auth)
    assert r.status_code == 200, r.text
    task = make_task(title="s2 waiting")
    r = client.post("/api/assignments",
                    json={"task_id": task["id"], "specialist": "smoke-probe",
                          "executor_id": executor["id"]},
                    headers=ui_auth)
    assert r.status_code == 201, r.text
    item = _assignment_item(client, r.json()["assignment"]["id"])
    assert item["state"] == "queued"
    assert item["routing"]["reason"] == "explicit"
    waiting = item["waiting"]
    assert waiting["code"] == "executor-disabled"
    assert executor["id"] in waiting["reason"]
    assert "выключен" in waiting["reason"]


def test_eligible_pin_has_no_waiting(client, ui_auth, make_task):
    executor = _make_executor(client, ui_auth, "live-1")
    task = make_task(title="s2 no waiting")
    r = client.post("/api/assignments",
                    json={"task_id": task["id"], "specialist": "smoke-probe",
                          "executor_id": executor["id"]},
                    headers=ui_auth)
    assert r.status_code == 201, r.text
    item = _assignment_item(client, r.json()["assignment"]["id"])
    assert "waiting" not in item
    assert item["routing"]["waiting"] is None


def test_mint_journals_pin_waiting(client, ui_auth, make_task, app_module):
    """Mint-time leg of the rule: a pin onto an executor that is ALREADY
    ineligible is journaled with the reason from the first second."""
    task = make_task(title="s2 pin journal")
    r = client.post("/api/assignments",
                    json={"task_id": task["id"], "specialist": "smoke-probe",
                          "executor_id": "ex-not-in-registry"},
                    headers=ui_auth)
    assert r.status_code == 201, r.text
    aid = r.json()["assignment"]["id"]
    events = _task_events(app_module, task["id"])
    waits = [e for e in events
             if e["kind"] == "assignment.pin_waiting"
             and e["payload"].get("assignment_id") == aid]
    assert len(waits) == 1
    assert waits[0]["payload"]["reason_code"] == "executor-unknown"
    assert "ex-not-in-registry" in waits[0]["payload"]["reason"]


def test_waiting_appears_when_executor_disabled_after_nomination(
        client, ui_auth, make_task):
    """The ghost story in its actual order: nominated while alive,
    switched off a day later — the card turns honest on the next read
    (waiting is computed, never stored stale)."""
    executor = _make_executor(client, ui_auth, "late-off-1")
    task = make_task(title="s2 late off")
    r = client.post("/api/assignments",
                    json={"task_id": task["id"], "specialist": "smoke-probe",
                          "executor_id": executor["id"]},
                    headers=ui_auth)
    assert r.status_code == 201, r.text
    aid = r.json()["assignment"]["id"]
    assert "waiting" not in _assignment_item(client, aid)
    r = client.patch(f"/api/executors/{executor['id']}",
                     json={"enabled": False}, headers=ui_auth)
    assert r.status_code == 200, r.text
    item = _assignment_item(client, aid)
    assert item["waiting"]["code"] == "executor-disabled"
