"""AGW-23/24: the surface-facts mirror — exec-env binding + k8s mirror
(2026-10-20 wave, cards eyes-exec-env-binding + board-k8s-mirror).

The agent v0.9.0 payload carries ``runtime`` (the honest where-does-
this-process-run verdict), ``distrobox_containers`` (per-container
honest verdicts), the k8s leg (``k8s_nodes``/``k8s_pods``/
``k8s_verdicts``, content-free) and — on ``environments[]`` rows — the
``exec_env`` surface badge and the ``found_at`` dedupe trail. Before
this slice pydantic dropped the top-level fields SILENTLY and the
inventory normalizer stripped the row fields; now everything is stored
(the additive ``exec_env_inventory`` snapshot + additive row keys) and
served OPEN on the executor reads.

Coverage map:
- the v0.9.0 payload shape (verbatim fixture, deploy-gate 18.10: 2
  nodes / 27 pods / runtime=pod) stored and served OPEN;
- old agents (no surface fields) leave the mirrors untouched — honest
  absence, never a fabricated zero;
- no-wipe semantics (the P3-1 precedent, per top-level key): a report
  without a key never erases its previous mirror; the k8s subtree
  replaces as ONE unit (a fresh ``denied`` verdict must not sit next
  to a stale pods list);
- identical re-report = silent no-op (no audit churn, updated_at
  frozen); audit ``exec_env.reported`` only on change;
- caps → honest 422s (row counts, per-row bytes, nameless rows,
  wire-type violations); row fields bounded, never trimmed silently
  past the documented bounds;
- the additive ALTER: a legacy ``''`` column reads as ``{}``.
"""

from __future__ import annotations

import pytest

from server.security import RateLimiter


# -- v0.9.0 payload fixtures (the real wire shapes, content-free) --------

V090_RUNTIME = {"kind": "pod",
                "signals": ["/.dockerenv", "kubernetes_service_host"],
                "systemd": "pod-mode: no systemd unit"}

V090_NODES = [
    {"name": "abyss-ai-agent", "ready": True,
     "kubelet_version": "v1.33.4+k3s1"},
    {"name": "abyss-ai1-small", "ready": False},
]

V090_PODS = [
    {"name": "hermes-0", "namespace": "kube-agents", "phase": "Running",
     "node": "abyss-ai-agent", "images": ["ghcr.io/vesmaro/hermes:1.4"],
     "ports": [8080], "restarts": 0, "harness": "hermes",
     "exec_env": "pod:hermes-0"},
    {"name": "vesma-eyes-6d7f", "namespace": "kube-agents",
     "phase": "Running", "node": "abyss-ai-agent",
     "images": ["ghcr.io/vesmaro/vesma-eyes:1.73.1"], "ports": [8140],
     "restarts": 1, "harness": "vesma-eyes",
     "exec_env": "pod:vesma-eyes-6d7f"},
    {"name": "unmatched-pod", "namespace": "kube-agents", "phase": "Pending",
     "restarts": 2, "exec_env": "pod:unmatched-pod"},
]

V090_VERDICTS = {"pods": "denied", "pods_detail": "forbidden"}

V090_ENVIRONMENTS = [
    {"name": "hermes", "kind": "cli", "home_path": "/home/u/.hermes",
     "exec_env": "metal",
     "found_at": ["/home/u/.hermes",
                  "/home/u/.distrobox/dev-box/home/u/.hermes"]},
    {"name": "zcode", "kind": "cli", "home_path": "/home/u/.zcode",
     "exec_env": "distrobox:dev-box",
     "found_at": ["/home/u/.distrobox/dev-box/home/u/.zcode"]},
]

V090_CONTAINERS = [
    {"name": "dev-box", "status": "Up 2 hours", "running": True,
     "scan_verdict": "ok", "agents_found": 2},
    {"name": "stopped-box", "status": "Exited (0)", "running": False,
     "scan_verdict": "not-running"},
]


@pytest.fixture(autouse=True)
def fresh_exec_env_state(app_module, monkeypatch):
    """Per-test isolation (the test_me015 pattern): fresh machine-class
    limiters + a wiped executor registry; audit assertions query the
    events table directly."""
    for name in ("_executor_register_limiter",
                 "_executor_heartbeat_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")


def _register(client, auth) -> tuple[dict, str]:
    r = client.post("/api/executors",
                    json={"name": "abyss-ai-agent", "harness": "zcode",
                          "host": "abyss-ai-agent"},
                    headers=auth)
    assert r.status_code == 201, r.text
    body = r.json()
    return body["executor"], body["executor_secret"]


def _ex_headers(secret: str) -> dict:
    return {"Authorization": f"Bearer {secret}"}


def _post(client, executor_id: str, secret: str, **extra):
    payload = {"harnesses": []} | extra
    return client.post(f"/api/executors/{executor_id}/discovery",
                       json=payload, headers=_ex_headers(secret))


def _row(client, executor_id: str) -> dict:
    r = client.get(f"/api/executors/{executor_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _events(app_module, kind: str, executor_id: str) -> list[dict]:
    with app_module.store._lock, app_module.store._conn() as db:
        rows = db.execute(
            "SELECT payload FROM events WHERE kind=? ORDER BY id ASC",
            (kind,)).fetchall()
    import json as _json
    return [_json.loads(r["payload"]) for r in rows
            if _json.loads(r["payload"]).get("executor_id") == executor_id]


class TestV090PayloadMirror:
    """The full v0.9.0-shaped report lands in the mirror and reads back
    OPEN — the board stops silently dropping the k8s fields."""

    def test_full_payload_stored_and_served_open(self, client, auth):
        executor, secret = _register(client, auth)
        r = _post(client, executor["id"], secret,
                  runtime=V090_RUNTIME, k8s_nodes=V090_NODES,
                  k8s_pods=V090_PODS, k8s_verdicts=V090_VERDICTS,
                  distrobox_containers=V090_CONTAINERS,
                  environments=V090_ENVIRONMENTS)
        assert r.status_code == 200, r.text
        # OPEN read — no auth header on purpose (the roster boundary).
        row = _row(client, executor["id"])
        inv = row["exec_env_inventory"]
        assert inv["runtime"] == {"kind": "pod",
                                  "signals": ["/.dockerenv",
                                              "kubernetes_service_host"],
                                  "systemd": "pod-mode: no systemd unit"}
        k8s = inv["k8s"]
        assert [n["name"] for n in k8s["nodes"]] == \
            ["abyss-ai-agent", "abyss-ai1-small"]
        assert k8s["nodes"][0]["ready"] is True
        assert k8s["nodes"][0]["kubelet_version"] == "v1.33.4+k3s1"
        assert [p["name"] for p in k8s["pods"]] == \
            ["hermes-0", "unmatched-pod", "vesma-eyes-6d7f"]  # sorted
        pod = k8s["pods"][0]
        assert pod["exec_env"] == "pod:hermes-0"
        assert pod["harness"] == "hermes"
        assert pod["images"] == ["ghcr.io/vesmaro/hermes:1.4"]
        assert pod["ports"] == [8080]
        assert k8s["verdicts"] == V090_VERDICTS
        boxes = {c["name"]: c for c in inv["distrobox_containers"]}
        assert boxes["dev-box"]["running"] is True
        assert boxes["dev-box"]["agents_found"] == 2
        assert boxes["stopped-box"]["scan_verdict"] == "not-running"
        assert boxes["stopped-box"]["running"] is False  # an honest fact
        # The environments rows carry the surface badge + the dedupe trail.
        envs = {e["name"]: e for e in row["harness_inventory"]}
        assert envs["hermes"]["exec_env"] == "metal"
        assert envs["hermes"]["found_at"] == \
            ["/home/u/.hermes",
             "/home/u/.distrobox/dev-box/home/u/.hermes"]
        assert envs["zcode"]["exec_env"] == "distrobox:dev-box"
        # The list endpoint rides the SAME projection.
        r = client.get("/api/executors")
        item = next(i for i in r.json()["items"] if i["id"] == executor["id"])
        assert item["exec_env_inventory"]["k8s"]["nodes"] == k8s["nodes"]

    def test_old_agent_without_surface_fields_untouched(self, client, auth):
        """The additive contract: an old agent that posts neither the
        surface fields nor badged environments leaves every mirror at
        its honest empty — absence is an answer, not a fabricated zero."""
        executor, secret = _register(client, auth)
        r = _post(client, executor["id"], secret,
                  harnesses=[{"name": "zcode", "version": "0.4.1"}])
        assert r.status_code == 200, r.text
        row = _row(client, executor["id"])
        assert row["exec_env_inventory"] == {}
        assert all("exec_env" not in e and "found_at" not in e
                   for e in row["harness_inventory"])

    def test_legacy_empty_column_reads_empty_dict(self, client, auth,
                                                  app_module):
        """The additive ALTER: a pre-migration row (``''`` column) reads
        as {} — the harness_inventory legacy precedent."""
        executor, secret = _register(client, auth)
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute("UPDATE executors SET exec_env_inventory='' "
                       "WHERE id=?", (executor["id"],))
        assert _row(client, executor["id"])["exec_env_inventory"] == {}


class TestNoWipeSemantics:
    """P3-1 per top-level key: absence never wipes; the k8s subtree
    replaces as ONE unit."""

    def test_report_without_key_keeps_previous_mirror(self, client, auth):
        executor, secret = _register(client, auth)
        assert _post(client, executor["id"], secret,
                     runtime=V090_RUNTIME, k8s_nodes=V090_NODES,
                     k8s_pods=V090_PODS).status_code == 200
        # A later report without ANY surface key (an environments-only
        # refresh) keeps the k8s mirror — the leg simply did not run.
        assert _post(client, executor["id"], secret,
                     environments=V090_ENVIRONMENTS).status_code == 200
        inv = _row(client, executor["id"])["exec_env_inventory"]
        assert inv["k8s"]["nodes"]  # kept
        assert inv["runtime"]["kind"] == "pod"  # kept

    def test_k8s_subtree_replaces_as_one_unit(self, client, auth):
        """A fresh pass that only managed a ``denied`` verdict must not
        sit next to the stale pods list — the leg's output is one pass's
        truth."""
        executor, secret = _register(client, auth)
        assert _post(client, executor["id"], secret,
                     k8s_nodes=V090_NODES, k8s_pods=V090_PODS,
                    ).status_code == 200
        assert _post(client, executor["id"], secret,
                     k8s_verdicts=V090_VERDICTS).status_code == 200
        k8s = _row(client, executor["id"])["exec_env_inventory"]["k8s"]
        assert k8s == {"verdicts": V090_VERDICTS}

    def test_explicit_empty_list_is_a_real_zero(self, client, auth):
        """None = absent (no wipe); ``[]`` = the leg ran and saw zero —
        the k8s subtree replaces as one unit, so the stored mirror is
        the honest ``{"pods": []}`` (zero-and-ran), not a fabricated
        carry-over of the previous pass's nodes."""
        executor, secret = _register(client, auth)
        assert _post(client, executor["id"], secret,
                     k8s_nodes=V090_NODES, k8s_pods=V090_PODS).status_code == 200
        assert _post(client, executor["id"], secret,
                     k8s_pods=[]).status_code == 200
        k8s = _row(client, executor["id"])["exec_env_inventory"]["k8s"]
        assert k8s == {"pods": []}

    def test_identical_re_report_is_a_noop(self, client, auth, app_module):
        executor, secret = _register(client, auth)
        assert _post(client, executor["id"], secret,
                     runtime=V090_RUNTIME, k8s_nodes=V090_NODES,
                     k8s_pods=V090_PODS).status_code == 200
        before = _row(client, executor["id"])["updated_at"]
        assert _post(client, executor["id"], secret,
                     runtime=V090_RUNTIME, k8s_nodes=V090_NODES,
                     k8s_pods=V090_PODS).status_code == 200
        assert _row(client, executor["id"])["updated_at"] == before
        assert len(_events(app_module, "exec_env.reported",
                           executor["id"])) == 1

    def test_audit_event_on_change(self, client, auth, app_module):
        executor, secret = _register(client, auth)
        assert _post(client, executor["id"], secret,
                     runtime=V090_RUNTIME).status_code == 200
        events = _events(app_module, "exec_env.reported", executor["id"])
        assert events == [{"executor_id": executor["id"],
                           "sections": ["runtime"]}]


class TestCapsAndShapes:
    """Honest 422s — the environments-leg discipline applied to the
    surface facts; a breach means a broken or hostile client."""

    def test_row_count_caps_422(self, client, auth):
        executor, secret = _register(client, auth)
        for label, cap in (("k8s_pods", 128), ("k8s_nodes", 64),
                           ("distrobox_containers", 64)):
            rows = [{"name": f"x{i}", "exec_env": "pod:x"} for i in range(cap + 1)]
            r = _post(client, executor["id"], secret, **{label: rows})
            assert r.status_code == 422, f"{label}: {r.text}"
            assert label in r.json()["detail"]

    def test_oversized_row_422(self, client, auth):
        executor, secret = _register(client, auth)
        r = _post(client, executor["id"], secret,
                  k8s_pods=[{"name": "big", "exec_env": "pod:x",
                             "images": ["i" * 5000]}])
        assert r.status_code == 422
        assert "4 KiB" in r.json()["detail"]

    def test_nameless_rows_422(self, client, auth):
        executor, secret = _register(client, auth)
        for label in ("k8s_nodes", "k8s_pods", "distrobox_containers"):
            r = _post(client, executor["id"], secret, **{label: [{"ready": True}]})
            assert r.status_code == 422, f"{label}: {r.text}"

    def test_wire_type_violation_422(self, client, auth):
        """A string where a list belongs is a WIRE-TYPE violation — the
        model's 422, not a silent drop (the session-facts precedent)."""
        executor, secret = _register(client, auth)
        r = client.post(f"/api/executors/{executor['id']}/discovery",
                        json={"harnesses": [], "k8s_nodes": "two"},
                        headers=_ex_headers(secret))
        assert r.status_code == 422
        r = client.post(f"/api/executors/{executor['id']}/discovery",
                        json={"harnesses": [], "runtime": ["pod"]},
                        headers=_ex_headers(secret))
        assert r.status_code == 422

    def test_environment_row_fields_bounded(self, client, auth):
        """Row normalization bounds: found_at keeps the first 8 paths,
        exec_env cut at 60 — documented bounds, honest truncation."""
        executor, secret = _register(client, auth)
        env = {"name": "hermes", "exec_env": "distrobox:" + "b" * 100,
               "found_at": [f"/path/{i}" for i in range(12)]}
        assert _post(client, executor["id"], secret,
                     environments=[env]).status_code == 200
        row = _row(client, executor["id"])["harness_inventory"][0]
        assert len(row["exec_env"]) == 60
        assert len(row["found_at"]) == 8
        assert row["found_at"][0] == "/path/0"

    def test_unnameable_rows_dropped_not_fatal(self, client, auth):
        """Store-side defensive pass: a non-dict row or a nameless row
        that slipped past the route (direct store call) is dropped —
        never stored, never fatal; the route 422s first (the normalizer
        is the second line of defense, matching report_executor_inventory)."""
        executor, _ = _register(client, auth)
        app_module_store = __import__("server.app", fromlist=["store"]).store
        row = app_module_store.report_executor_exec_env(
            executor["id"], k8s_pods=[{"phase": "Running"}, "junk", None])
        assert row is not None
        with app_module_store._lock, app_module_store._conn() as db:
            raw = db.execute(
                "SELECT exec_env_inventory FROM executors WHERE id=?",
                (executor["id"],)).fetchone()["exec_env_inventory"]
        import json as _json
        assert _json.loads(raw)["k8s"]["pods"] == []
