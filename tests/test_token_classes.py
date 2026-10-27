"""ADR 0009 amendment A1 (phase 1): token-class split of the write guard.

Two bearer classes guard mutations — ui (VESMARO_UI_TOKEN) and machine
(VESMARO_BOARD_TOKEN, legacy env name kept deliberately for the poller
track). The split is CLOSED (transitional closed 2026-10, prod has run
the ui token since the RUNBOOK.md §8 step-2 upgrade): the default
conftest env pins the SPLIT state, and the transitional ui<-machine
fallback is retired server-side — this file pins the post-transition
truth table.

Pinned contract:
- default contour (split): machine token is REJECTED on ui-class routes
  (401, not 503 — the ui class is configured), and vice versa the ui
  token is not machine-class;
- reports POST accepts BOTH classes (agents write reports, ADR 0009
  checkpoint channel);
- ui class unset = fail-closed 503 on ui mutations — NO board-token
  fallback (the transition mode is gone);
- fail-closed: with NO class configured every mutation is 503, even with
  an ad-hoc bearer;
- a class configured but the bearer wrong → 401; a class not configured
  while another requested class IS → 401 for that bearer, never 503.

Constant-time comparison is a code-review property, not tested here.
"""

from __future__ import annotations

import pytest

from conftest import BOARD_TOKEN, UI_TOKEN


# ------------------------------------------------------------------ helpers
@pytest.fixture()
def fresh_report_limiter(app_module, monkeypatch):
    """Isolated report rate limiter: the app-level one is a module global
    keyed on the client IP, and TestClient always shares one IP — earlier
    test files may have exhausted the 30/60s window."""
    from server.security import RateLimiter
    limiter = RateLimiter(limit=app_module._REPORT_RATE_LIMIT,
                          window=app_module._REPORT_RATE_WINDOW)
    monkeypatch.setattr(app_module, "_report_limiter", limiter)
    return limiter


@pytest.fixture()
def no_machine_token(app_module, monkeypatch):
    """Machine class unconfigured while the ui class stays configured
    (simulates a post-migration deploy that dropped the board token)."""
    monkeypatch.setattr(app_module, "BOARD_WRITE_TOKEN", "")


def _make_task(client, headers, title="cls-split"):
    r = client.post("/api/tasks", json={"title": title}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _post_report(client, headers, task_id, body="ok"):
    return client.post(f"/api/tasks/{task_id}/reports",
                       json={"body": body, "kind": "intermediate",
                             "agent": "qa"},
                       headers=headers)


# ------------------------------------------------------------ split mode
class TestSplitMode:
    """Both classes configured with distinct values (the end state of the
    migration): classes no longer overlap on ui-class routes."""

    def test_ui_mutation_with_ui_token_201(self, client, split_tokens,
                                           ui_auth):
        task = _make_task(client, ui_auth)
        assert client.delete(f"/api/tasks/{task['id']}",
                             headers=ui_auth).status_code == 200

    def test_ui_mutation_with_machine_token_401(self, client, split_tokens,
                                                machine_auth):
        r = client.post("/api/tasks", json={"title": "cls-machine"},
                        headers=machine_auth)
        assert r.status_code == 401

    def test_wrong_class_bearer_names_both_classes(self, client,
                                                    split_tokens,
                                                    machine_auth):
        """Owner feedback 2026-09-22: a machine token pasted into a ui
        action must say WHICH class arrived and which one the action
        wants — not a generic "token not accepted"."""
        r = client.post("/api/tasks", json={"title": "cls-mismatch"},
                        headers=machine_auth)
        assert r.status_code == 401
        body = r.json()["detail"]
        assert "machine-class token" in body
        assert "VESMARO_UI_TOKEN" in body
        # an UNKNOWN bearer keeps the neutral message (no class leak)
        r2 = client.post("/api/tasks", json={"title": "cls-unknown"},
                         headers={"Authorization": "Bearer nope"})
        assert r2.json()["detail"] == "board write token required"

    def test_ui_mutation_with_wrong_bearer_401(self, client, split_tokens):
        r = client.post("/api/tasks", json={"title": "cls-wrong"},
                        headers={"Authorization": "Bearer nope"})
        assert r.status_code == 401

    def test_ui_mutation_without_bearer_401(self, client, split_tokens):
        assert client.post("/api/tasks",
                           json={"title": "cls-anon"}).status_code == 401

    def test_board_reflect_machine_token_401(self, client, split_tokens,
                                             machine_auth):
        """board-reflect is ui-class: the machine bearer must not pass.
        The guard fires before the rate limiter, so no fixture reset is
        needed; the body is valid so pydantic lets the handler run."""
        r = client.post("/api/board-reflect",
                        json={"specialist": "qa", "problem": "p",
                              "kind": "agent-refine-request"},
                        headers=machine_auth)
        assert r.status_code == 401

    def test_reports_accept_machine_token_201(self, client, split_tokens,
                                              ui_auth, machine_auth,
                                              fresh_report_limiter):
        task = _make_task(client, ui_auth)
        try:
            assert _post_report(client, machine_auth,
                                task["id"]).status_code == 201
        finally:
            client.delete(f"/api/tasks/{task['id']}", headers=ui_auth)

    def test_reports_accept_ui_token_201(self, client, split_tokens,
                                         ui_auth, fresh_report_limiter):
        task = _make_task(client, ui_auth)
        try:
            assert _post_report(client, ui_auth,
                                task["id"]).status_code == 201
        finally:
            client.delete(f"/api/tasks/{task['id']}", headers=ui_auth)

    def test_reports_wrong_bearer_401(self, client, split_tokens,
                                      ui_auth, fresh_report_limiter):
        task = _make_task(client, ui_auth)
        try:
            r = _post_report(client, {"Authorization": "Bearer nope"},
                             task["id"])
            assert r.status_code == 401
        finally:
            client.delete(f"/api/tasks/{task['id']}", headers=ui_auth)


# -------------------------------------------------- ui class unconfigured
class TestUiClassUnconfigured:
    """VESMARO_UI_TOKEN unset = the fail-closed 503 — the transitional
    ui<-machine fallback is RETIRED, so the machine token can no longer
    stand in for the missing ui class (transitional closed 2026-10)."""

    @pytest.fixture()
    def no_ui_token(self, app_module, monkeypatch):
        monkeypatch.setattr(app_module, "UI_WRITE_TOKEN", "")

    def test_ui_mutation_without_ui_token_503(self, client, no_ui_token,
                                              machine_auth):
        """Fail-closed, NOT a board-token pass-through: even the machine
        bearer gets the 503 (the ui class is unconfigured)."""
        r = client.post("/api/tasks", json={"title": "cls-no-ui"},
                        headers=machine_auth)
        assert r.status_code == 503
        assert "set VESMARO_UI_TOKEN" in r.json()["detail"]

    def test_ui_mutation_anon_without_ui_token_503(self, client,
                                                   no_ui_token):
        assert client.post(
            "/api/tasks", json={"title": "cls-no-ui-anon"}).status_code == 503

    def test_reports_still_accept_machine_token_201(self, client, app_module,
                                                    monkeypatch, auth,
                                                    ui_auth,
                                                    fresh_report_limiter):
        """Poller compatibility (unaffected by the retirement): killing
        the ui class mid-flight does not disable the reports route — it
        503s only when ALL its classes are unconfigured, so the machine
        bearer still writes. Task created while ui is alive, ui unset for
        the report, restored for the ui-class cleanup delete."""
        task = _make_task(client, ui_auth)
        monkeypatch.setattr(app_module, "UI_WRITE_TOKEN", "")
        try:
            assert _post_report(client, auth,
                                task["id"]).status_code == 201
        finally:
            monkeypatch.setattr(app_module, "UI_WRITE_TOKEN", UI_TOKEN)
            client.delete(f"/api/tasks/{task['id']}", headers=ui_auth)


# ------------------------------------------------- machine-class retired
class TestMachineClassUnconfigured:
    """Post-migration end state: ui token only, board token gone. The ui
    class keeps working; machine bearers get 401 (another requested class
    IS configured), never a blanket 503."""

    def test_ui_mutation_with_ui_token_201(self, client, split_tokens,
                                           ui_auth, no_machine_token):
        task = _make_task(client, ui_auth)
        assert client.delete(f"/api/tasks/{task['id']}",
                             headers=ui_auth).status_code == 200

    def test_reports_machine_bearer_401_not_503(self, client, split_tokens,
                                                ui_auth, machine_auth,
                                                no_machine_token,
                                                fresh_report_limiter):
        task = _make_task(client, ui_auth)
        try:
            assert _post_report(client, machine_auth,
                                task["id"]).status_code == 401
            assert _post_report(client, ui_auth,
                                task["id"]).status_code == 201
        finally:
            client.delete(f"/api/tasks/{task['id']}", headers=ui_auth)


# ------------------------------------------------------------ fail-closed
class TestFailClosedBothClasses:
    def test_reports_with_adhoc_bearer_503(self, client, no_board_token):
        """No class configured at all: the both-classes reports route is
        disabled outright — 503 even with a bearer present."""
        r = _post_report(client, {"Authorization": "Bearer surprise"},
                         "any-task")
        assert r.status_code == 503

    def test_reads_stay_open(self, client, no_board_token):
        assert client.get("/api/board").status_code == 200


# ------------------------------------------------------- resolver (unit)
class TestTokenClassesResolver:
    """_token_classes() pins the closed-split truth table directly (values
    are test constants, not secrets). No fallback leg exists anymore."""

    def test_default_contour_is_split(self, app_module):
        assert app_module._token_classes() == {
            "ui": UI_TOKEN, "machine": BOARD_TOKEN}

    def test_ui_unset_never_falls_back(self, app_module, monkeypatch):
        """The retired transitional leg: ui unset must NOT surface the
        machine token as the ui class."""
        monkeypatch.setattr(app_module, "UI_WRITE_TOKEN", "")
        assert app_module._token_classes() == {
            "ui": "", "machine": BOARD_TOKEN}

    def test_split_pin(self, app_module, split_tokens):
        assert app_module._token_classes() == {
            "ui": UI_TOKEN, "machine": BOARD_TOKEN}

    def test_nothing_configured(self, app_module, no_board_token):
        classes = app_module._token_classes()
        assert classes == {"ui": "", "machine": ""}
