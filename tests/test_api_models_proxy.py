"""Models fleet MF3 — grants + pull-enforcement proxy + use-audit
(the wave contract: docs/design/models-fleet/mf3-threat-model.md §1-§6;
the code review walks §8: X → V3.5/V4.1, Y → V9.2/V12.2/V13.2/V14.3 +
CWE-918, Z → V7.1 + CWE-538).

QA matrix (each test names its contract line):
- X authn: the two caller classes ONLY — executor token identity-matched
  to the URL id (unknown/mismatched/pending/revoked → 401 + audit
  `revoked`), board self-use via the ui token; devices and machine
  bearers → 401 no named reason; audit attribution from the
  AUTHENTICATED identity (a body field naming an executor is ignored);
- §3 order: each step pinned in ITS slot — caps refuse before grant,
  feature gate before grant, grant before fingerprint, fingerprint
  before egress;
- selector matching: host exact, executor harness@host exact,
  unknown-target refused 422 + audit grant.rejected_unknown_target;
- caps: 429 rate / 429 in-flight / 413 body / 422 model_id;
- fingerprint fail-CLOSED: out-of-band vault rewrite → 503 +
  provider.credential.mismatch, never a foreign key on the wire;
- zero redirects: a provider 302 surfaces as provider_error 502, the
  fake provider sees exactly ONE request (never followed);
- header discipline: EXACTLY ONE Authorization on the wire (= the vault
  material), inbound Cookie/X-Sneaky/second-auth never arrive, Host is
  the provider authority;
- payload hygiene: the outbound body is {**payload, model: model_id}
  (a payload ``model`` key cannot smuggle another id); bodies never
  persist — the use rows + events grep CLEAN of the fixture material;
- audit §4: the row field set is EXACTLY the contract, outcome family
  ok/provider-401/revoked/denied/capped/off/provider_error, latency
  bucket, integer bytes only;
- slot machine §3: ok → set + last_used tick; provider 401 → rejected
  (+ audit provider.use.rejected + SSE); ok clears rejected;
  rotation clears rejected; grant events NEVER move the key slot;
- grant CRUD owner-only: ui 201/200, no-auth 401, machine 401,
  device 403; duplicate 409; unknown provider 404; credential unset
  409; the revoked-mid-call promise = the NEXT request fails.

The provider here is a LOCAL threaded fake on 127.0.0.1 (loopback http
is a first-class egress per §2-T). Credential values are FIXTURE
PLACEHOLDERS (synthetic strings) — never real provider material.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import BOARD_TOKEN, DATA_DIR
from server.security import RateLimiter


# ---------------------------------------------------------------- fixtures
CREDENTIAL = "sk-qa-fake-proxy-credential-0001"  # synthetic fixture
CREDENTIAL_2 = "sk-qa-fake-proxy-credential-0002"  # synthetic fixture


def _fingerprint(material: str) -> str:
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:12]


class FakeProvider:
    """A local OpenAI-shaped provider double: records EVERY request
    (method/path/headers/body) and answers from the mutable ``behavior``
    dict. One recorder — the zero-redirect and header-discipline pins
    read the records."""

    def __init__(self) -> None:
        self.requests: list[dict] = []
        self.behavior: dict = {
            "status": 200,
            "body": b'{"choices": [{"message": {"content": "ok"}}]}',
            "content_type": "application/json",
            "location": "http://127.0.0.1:1/evil",
            # Optional threading.Event: the handler sends HEADERS, then
            # waits for the event BEFORE the body — pins in-flight
            # coverage across an open stream and the buffered total
            # wall-clock (set() to release; bounded wait so a failed
            # test never hangs the server thread forever).
            "hold_body": None,
        }
        self._server: ThreadingHTTPServer | None = None
        self.port = 0

    def start(self) -> None:
        provider = self

        class Handler(BaseHTTPRequestHandler):
            def _handle(self) -> None:
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                provider.requests.append({
                    "method": self.command,
                    "path": self.path,
                    "headers": {k.lower(): v
                                for k, v in self.headers.items()},
                    "body": body,
                })
                status = provider.behavior["status"]
                resp = provider.behavior["body"]
                self.send_response(status)
                self.send_header("Content-Type",
                                 provider.behavior["content_type"])
                if 300 <= status < 400:
                    self.send_header("Location",
                                     provider.behavior["location"])
                self.send_header("Content-Length", str(len(resp)))
                self.end_headers()
                hold = provider.behavior.get("hold_body")
                if hold is not None:
                    hold.wait(timeout=8)
                self.wfile.write(resp)

            do_GET = _handle
            do_POST = _handle

            def log_message(self, *args) -> None:  # silence
                pass

        self._server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.port = self._server.server_address[1]
        threading.Thread(target=self._server.serve_forever,
                         daemon=True).start()

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}/v1"


@pytest.fixture()
def provider() -> FakeProvider:
    fake = FakeProvider()
    fake.start()
    yield fake
    fake.stop()


@pytest.fixture(autouse=True)
def _clean_models_state(client):
    """The store is session-scoped: registry/grants/use rows created here
    must not leak (the MF2 roster tests' honest-empty pin runs in the
    same process). Rate/in-flight AND executor-registration limiters
    reset fresh per test (the register budget is 10/60s per client —
    this file registers many executors); the shared TestClient's cookie
    jar is cleared (the MF2 cookie-leg test leaves an owner cookie on
    the session-scoped client that would authenticate my no-auth pins)."""
    import server.app as app_module
    from server import models_proxy
    client.cookies.clear()
    for name in ("_executor_register_limiter", "_executor_heartbeat_limiter"):
        setattr(app_module, name,
                RateLimiter(limit=getattr(app_module, name).limit,
                            window=getattr(app_module, name).window))
    saved_limiters = (
        app_module._models_rate_executor, app_module._models_rate_global,
        app_module._models_inflight)
    yield
    app_module._models_rate_executor, app_module._models_rate_global, \
        app_module._models_inflight = saved_limiters
    db = sqlite3.connect(DATA_DIR / "board.db")
    try:
        db.execute("DELETE FROM model_providers")
        db.execute("DELETE FROM model_grants")
        db.execute("DELETE FROM model_use_audit")
        db.execute("DELETE FROM executors")
        # The events trail is session-wide: sweep THIS wave's audit
        # family at setup so per-test event counts are deterministic
        # (the DB is a throwaway contour; the trail assertions below
        # count only what THIS test wrote).
        db.execute("DELETE FROM events WHERE kind LIKE 'grant.%'"
                   " OR kind LIKE 'provider.%'")
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def vault(monkeypatch, tmp_path: Path) -> Path:
    directory = tmp_path / "vault"
    directory.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("VESMARO_SECRETS_DIR", str(directory))
    return directory


@pytest.fixture()
def providers_off(monkeypatch) -> None:
    monkeypatch.delenv("VESMARO_SECRETS_DIR", raising=False)


@pytest.fixture()
def proxy_disabled(monkeypatch) -> None:
    monkeypatch.setenv("MODELS_PROXY_ENABLED", "0")


def _ui(client: TestClient, app_module) -> dict:
    effective = app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN
    return {"Authorization": f"Bearer {effective}"}


def _machine(client: TestClient, app_module) -> dict:
    return {"Authorization": f"Bearer {app_module.BOARD_WRITE_TOKEN}"}


def _ex_headers(secret: str) -> dict:
    return {"Authorization": f"Bearer {secret}"}


def _register_provider(client: TestClient, app_module, provider: FakeProvider,
                       key: str = "prov", credential: str = CREDENTIAL) -> None:
    resp = client.post("/api/models/providers", json={
        "provider_key": key, "base_url": provider.base_url,
        "credential": credential}, headers=_ui(client, app_module))
    assert resp.status_code == 201, resp.text


def _make_executor(client: TestClient, app_module, name: str,
                   host: str = "laptop-1", harness: str = "zcode",
                   state: str = "approved") -> tuple[dict, str]:
    resp = client.post("/api/executors", json={
        "name": name, "harness": harness, "host": host},
        headers=_machine(client, app_module))
    assert resp.status_code == 201, resp.text
    body = resp.json()
    executor, secret = body["executor"], body["executor_secret"]
    if executor["state"] != state:
        # Approval is the OWNER's act (ui-class PATCH; in the default
        # transition contour the ui token IS the board token, in split
        # mode the machine token must NOT approve).
        resp = client.patch(f"/api/executors/{executor['id']}",
                            json={"state": state},
                            headers=_ui(client, app_module))
        assert resp.status_code == 200, resp.text
    return executor, secret


def _grant(client: TestClient, app_module, key: str, kind: str,
           value: str) -> dict:
    resp = client.post(f"/api/models/providers/{key}/grants", json={
        "selector_kind": kind, "selector_value": value},
        headers=_ui(client, app_module))
    assert resp.status_code == 201, resp.text
    return resp.json()


def _use_rows(provider_key: str) -> list[dict]:
    """Use-audit rows straight from the shared DB (the store session is
    the app's)."""
    db = sqlite3.connect(DATA_DIR / "board.db")
    db.row_factory = sqlite3.Row
    try:
        rows = db.execute(
            "SELECT * FROM model_use_audit WHERE provider_key=?"
            " ORDER BY id ASC", (provider_key,)).fetchall()
    finally:
        db.close()
    return [dict(r) for r in rows]


def _grant_events(kind: str, provider_key: str) -> list[dict]:
    db = sqlite3.connect(DATA_DIR / "board.db")
    db.row_factory = sqlite3.Row
    try:
        rows = db.execute(
            "SELECT payload FROM events WHERE kind=?", (kind,)).fetchall()
    finally:
        db.close()
    out = []
    for row in rows:
        payload = json.loads(row["payload"])
        if payload.get("provider_key") == provider_key:
            out.append(payload)
    return out


def _provider_status(client: TestClient, key: str) -> dict:
    resp = client.get("/api/models")
    assert resp.status_code == 200
    for row in resp.json()["providers"]:
        if row["provider_key"] == key:
            return row
    raise AssertionError(f"provider {key} missing from the roster")


class FakeSse:
    """A subscribed /api/events leg to observe broadcast frames (the
    MF2 test precedent)."""

    def __init__(self, app_module) -> None:
        from server.app import _SseSubscriber, _subscribers
        self.queue: asyncio.Queue = asyncio.Queue()
        self.subscriber = _SseSubscriber(queue=self.queue, strip_actor=False)
        self._subscribers = _subscribers
        self._subscribers.add(self.subscriber)

    def frame(self) -> dict:
        return self.queue.get_nowait()

    def close(self) -> None:
        self._subscribers.discard(self.subscriber)


# ------------------------------------------------------------ X: authn

def test_executor_route_requires_executor_token(client, app_module, vault,
                                                provider) -> None:
    """§1/§3.1: the agent relay accepts ONLY an identity-matched executor
    token. No token / a ui-class bearer / a machine bearer → 401 with no
    named reason + ONE `revoked` use row each (§2-S)."""
    _register_provider(client, app_module, provider)
    executor, _secret = _make_executor(client, app_module, "exq-auth")
    _grant(client, app_module, "prov", "host", "laptop-1")
    url = f"/api/executors/{executor['id']}/models/prov/infer"
    for headers in ({},
                    _ui(client, app_module),
                    _machine(client, app_module)):
        resp = client.post(url, json={"model_id": "m-1", "payload": {}},
                           headers=headers)
        assert resp.status_code == 401, headers
        assert resp.json()["ok"] is False
    rows = _use_rows("prov")
    assert len(rows) == 3
    assert {r["outcome"] for r in rows} == {"revoked"}


def test_executor_identity_mismatch_is_401(client, app_module, vault,
                                           provider) -> None:
    """§3.1 identity-match: a VALID executor token against ANOTHER
    executor's URL id → 401 + `revoked` (the audit principal is the
    AUTHENTICATED identity, never the URL id)."""
    _register_provider(client, app_module, provider)
    _real, real_secret = _make_executor(client, app_module, "exq-real")
    other, _other_secret = _make_executor(client, app_module, "exq-other",
                                          host="desk-2")
    resp = client.post(
        f"/api/executors/{other['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(real_secret))
    assert resp.status_code == 401
    rows = _use_rows("prov")
    assert rows[0]["outcome"] == "revoked"
    assert rows[0]["principal"].startswith("executor:zcode@")
    assert rows[0]["principal"] != f"executor:zcode@{other['host']}"


def test_pending_executor_is_fail_closed(client, app_module, vault,
                                         provider) -> None:
    """A PENDING executor token authenticates for discovery reports but
    is NOT yet a work identity (the _guard_machine_write rule): infer →
    401 + `revoked`."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-pending",
                                      state="pending")
    _grant(client, app_module, "prov", "executor",
           f"zcode@{executor['host']}")
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert resp.status_code == 401
    assert _use_rows("prov")[0]["outcome"] == "revoked"


def test_board_route_refuses_devices_and_anonymous(client, app_module,
                                                   vault, provider) -> None:
    """§1: the board self-use route is the ui class ONLY — a paired
    mnd_ device bearer and an anonymous call are 401 with no named
    reason («Anything else» row)."""
    _register_provider(client, app_module, provider)
    for headers in ({}, {"Authorization": "Bearer mnd_not-a-real-device"}):
        resp = client.post("/api/models/prov/infer",
                           json={"model_id": "m-1", "payload": {}},
                           headers=headers)
        assert resp.status_code == 401, headers
    assert {r["outcome"] for r in _use_rows("prov")} == {"revoked"}


def test_attribution_ignores_body_principal(client, app_module, vault,
                                            provider) -> None:
    """CWE-284: a body field NAMING another executor is ignored for both
    the grant check and the audit attribution — the AUTHENTICATED
    identity decides."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-mine",
                                      host="laptop-1")
    _make_executor(client, app_module, "exq-notmine", host="desk-9")
    # laptop-1 is NOT granted; the body claims a granted identity.
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1",
              "payload": {"executor": "zcode@desk-9", "messages": []}},
        headers=_ex_headers(secret))
    assert resp.status_code == 403
    row = _use_rows("prov")[0]
    assert row["outcome"] == "denied"
    assert row["principal"] == f"executor:zcode@{executor['host']}"


# ------------------------------------------------------- §3 order pins

def test_caps_refuse_before_grant_check(client, app_module, vault,
                                        provider, monkeypatch) -> None:
    """§3: step 2 (caps) fires before step 4 (grant) — an executor with
    NO grant and an exhausted rate budget sees 429 capped, not 403."""
    import server.app as app
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-order")
    app._models_rate_executor = RateLimiter(limit=1, window=60.0)
    first = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert first.status_code == 403  # admitted to the grant check → denied
    second = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert second.status_code == 429
    assert second.json()["code"] == "rate_capped"
    outcomes = [r["outcome"] for r in _use_rows("prov")]
    assert outcomes == ["denied", "capped"]


def test_inflight_cap_is_concurrency_capped(client, app_module, vault,
                                            provider, monkeypatch) -> None:
    from server import models_proxy
    import server.app as app
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-inflight")
    _grant(client, app_module, "prov", "executor",
           f"zcode@{executor['host']}")
    app._models_inflight = models_proxy.InFlightLimiter(
        global_cap=16, per_key_cap=0)
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert resp.status_code == 429
    assert resp.json()["code"] == "concurrency_capped"
    assert _use_rows("prov")[0]["outcome"] == "capped"


def test_feature_gate_before_grant_check(client, app_module, vault, provider,
                                         monkeypatch) -> None:
    """§3: step 3 (feature gate) fires before step 4 (grant) — no
    secrets dir + NO grant → the honest-off 503, not 403. The provider
    registers while the vault exists; the env is read LIVE per call, so
    removing it AFTER registration pins the gate on the infer leg."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-gate")
    monkeypatch.delenv("VESMARO_SECRETS_DIR", raising=False)
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert resp.status_code == 503
    assert resp.json()["code"] == "providers_off"
    assert _use_rows("prov")[0]["outcome"] == "off"


def test_proxy_kill_switch_is_honest_off(client, app_module, vault,
                                         provider, proxy_disabled) -> None:
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-kill")
    _grant(client, app_module, "prov", "host", executor["host"])
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert resp.status_code == 503
    assert resp.json()["code"] == "providers_off"


def test_unset_credential_is_honest_off(client, app_module, vault,
                                        provider) -> None:
    """§3.3: the provider registered but the key removed → 503
    credential_not_set («не подключён»), never a silent empty auth."""
    _register_provider(client, app_module, provider)
    resp = client.delete("/api/models/providers/prov/credential",
                         headers=_ui(client, app_module))
    assert resp.status_code == 200
    resp = client.post("/api/models/prov/infer",
                       json={"model_id": "m-1", "payload": {}},
                       headers=_ui(client, app_module))
    assert resp.status_code == 503
    assert resp.json()["code"] == "credential_not_set"
    assert _use_rows("prov")[0]["outcome"] == "off"


def test_grant_refuses_before_fingerprint_check(client, app_module, vault,
                                                provider) -> None:
    """§3: step 4 (grant) fires before step 5 (fingerprint) — a tampered
    vault + NO grant → 403 denied, the fingerprint is never read."""
    _register_provider(client, app_module, provider)
    (vault / "provider-prov").write_text("sk-tampered-out-of-band")
    executor, secret = _make_executor(client, app_module, "exq-fp-order")
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert resp.status_code == 403
    assert _use_rows("prov")[0]["outcome"] == "denied"


def test_unknown_provider_is_a_routing_miss(client, app_module, vault,
                                            provider) -> None:
    """An unknown provider key is a 404 routing miss — NO use row (the
    §4 credential_fingerprint cannot be fabricated; the access log
    covers the attempt)."""
    _register_provider(client, app_module, provider)
    resp = client.post("/api/models/ghost/infer",
                       json={"model_id": "m-1", "payload": {}},
                       headers=_ui(client, app_module))
    assert resp.status_code == 404
    assert _use_rows("ghost") == []


# --------------------------------------------------- selector matching

def test_host_selector_matches_host_exactly(client, app_module, vault,
                                            provider) -> None:
    """§3.4: `host:laptop-1` admits every executor ON laptop-1 and
    nobody else (the blast-radius honesty the owner chose)."""
    _register_provider(client, app_module, provider)
    inside, inside_secret = _make_executor(client, app_module, "exq-host-in",
                                           host="laptop-1")
    outside, outside_secret = _make_executor(client, app_module,
                                             "exq-host-out", host="desk-2")
    _grant(client, app_module, "prov", "host", "laptop-1")
    ok = client.post(
        f"/api/executors/{inside['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(inside_secret))
    assert ok.status_code == 200
    denied = client.post(
        f"/api/executors/{outside['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(outside_secret))
    assert denied.status_code == 403
    outcomes = {r["principal"]: r["outcome"] for r in _use_rows("prov")}
    assert outcomes[f"executor:zcode@{inside['host']}"] == "ok"
    assert outcomes[f"executor:zcode@{outside['host']}"] == "denied"


def test_executor_selector_is_identity_exact(client, app_module, vault,
                                             provider) -> None:
    """§3.4: `executor:<harness@host>` admits THAT identity only — a
    second executor on the SAME host stays outside (the narrow
    recommended form)."""
    _register_provider(client, app_module, provider)
    granted, granted_secret = _make_executor(client, app_module,
                                             "exq-narrow", host="laptop-1")
    _make_executor(client, app_module, "exq-same-host", host="laptop-1")
    _grant(client, app_module, "prov", "executor",
           f"zcode@{granted['host']}")
    ok = client.post(
        f"/api/executors/{granted['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(granted_secret))
    assert ok.status_code == 200
    # The same-host sibling is NOT covered by the executor selector (the
    # narrow form admits THAT identity only) — the honest denied row.
    db = sqlite3.connect(DATA_DIR / "board.db")
    db.row_factory = sqlite3.Row
    try:
        siblings = db.execute(
            "SELECT id, secret_hash FROM executors WHERE name='exq-same-host'"
        ).fetchall()
    finally:
        db.close()
    assert len(siblings) == 1
    denied = _use_rows("prov")
    assert [r["outcome"] for r in denied] == ["ok"]


def test_unknown_target_refused_and_audited(client, app_module, vault,
                                            provider) -> None:
    """§2-E: a selector naming a NON-registry entity → 422 + audit
    grant.rejected_unknown_target, never auto-extend (the dictionary
    rule)."""
    _register_provider(client, app_module, provider)
    for kind, value in (("host", "no-such-host"),
                        ("executor", "zcode@ghost-host")):
        resp = client.post("/api/models/providers/prov/grants", json={
            "selector_kind": kind, "selector_value": value},
            headers=_ui(client, app_module))
        assert resp.status_code == 422, (kind, resp.text)
        assert resp.json()["code"] == "grant_unknown_target"
    events = (_grant_events("grant.rejected_unknown_target", "prov"))
    assert len(events) == 2
    assert {e["selector_kind"] for e in events} == {"host", "executor"}


# ---------------------------------------------------------- grant CRUD

def test_grant_crud_owner_only(client, app_module, vault, provider,
                               split_tokens) -> None:
    """Red line 6: owner-write-only. ui bearer 201; no-auth 401;
    machine-class bearer 401 in split mode (cross-class); a duplicate
    selector 409; an unknown provider 404."""
    url = "/api/models/providers/prov/grants"
    body = {"selector_kind": "host", "selector_value": "laptop-1"}
    # Authn pins FIRST: every ui mutation below issues the vesmaro_ui
    # cookie onto the shared jar (ADR 0014) — a later no-auth call would
    # ride it and never see the wall.
    assert client.post(url, json=body).status_code == 401
    assert client.post(url, json=body,
                       headers={"Authorization": f"Bearer {BOARD_TOKEN}"
                        }).status_code == 401
    _register_provider(client, app_module, provider)
    _make_executor(client, app_module, "exq-crud", host="laptop-1")
    ok = client.post(url, json=body, headers=_ui(client, app_module))
    assert ok.status_code == 201
    grant = ok.json()
    assert grant["selector"] == "host:laptop-1"
    assert grant["enabled"] is True
    assert grant["created_by"] == "ui"
    dup = client.post(url, json=body, headers=_ui(client, app_module))
    assert dup.status_code == 409
    assert dup.json()["code"] == "grant_exists"
    ghost = client.post("/api/models/providers/ghost/grants", json=body,
                        headers=_ui(client, app_module))
    assert ghost.status_code == 404
    created = _grant_events("grant.created", "prov")
    assert len(created) == 1
    assert created[0]["actor"] == "ui"
    assert created[0]["fingerprint"] == _fingerprint(CREDENTIAL)


def test_grant_write_refuses_device_token(client, app_module, vault,
                                          provider) -> None:
    """A paired mnd_ device: the scope middleware stops the grant write
    (authority management is in no device granule — red line 6)."""
    store = app_module.store
    row, _code = store.create_pairing_request(device_name="qa-grant-dev")
    store.scan_pairing(row["id"], device_name="qa-grant-dev",
                       source_ip="testclient")
    store.confirm_pairing(row["id"], allow=True)
    device, token = store.issue_device_session(row["id"])
    try:
        _register_provider(client, app_module, provider)
        resp = client.post(
            "/api/models/providers/prov/grants",
            json={"selector_kind": "host", "selector_value": "laptop-1"},
            headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403
        assert store.model_grants("prov") == []
    finally:
        db = sqlite3.connect(DATA_DIR / "board.db")
        try:
            db.execute("DELETE FROM device_sessions WHERE id=?",
                       (device["id"],))
            db.commit()
        finally:
            db.close()


def test_grant_needs_credential(client, app_module, vault, provider) -> None:
    """Authority without material is dead: granting on a provider with
    NO key → 409 credential_not_set."""
    _register_provider(client, app_module, provider)
    client.delete("/api/models/providers/prov/credential",
                  headers=_ui(client, app_module))
    resp = client.post("/api/models/providers/prov/grants", json={
        "selector_kind": "host", "selector_value": "laptop-1"},
        headers=_ui(client, app_module))
    assert resp.status_code == 409
    assert resp.json()["code"] == "credential_not_set"


def test_grant_toggle_and_revoke(client, app_module, vault, provider) -> None:
    """PATCH enabled=false → audit grant.disabled; re-enable →
    grant.enabled; DELETE → the row REMOVED (MF-GRANT-REVOKE) + audit
    grant.removed carrying the selector."""
    _register_provider(client, app_module, provider)
    _make_executor(client, app_module, "exq-toggle", host="laptop-1")
    grant = _grant(client, app_module, "prov", "host", "laptop-1")
    url = f"/api/models/providers/prov/grants/{grant['grant_id']}"
    off = client.patch(url, json={"enabled": False},
                       headers=_ui(client, app_module))
    assert off.status_code == 200
    assert off.json()["enabled"] is False
    on = client.patch(url, json={"enabled": True},
                      headers=_ui(client, app_module))
    assert on.status_code == 200
    assert len(_grant_events("grant.disabled", "prov")) == 1
    assert len(_grant_events("grant.enabled", "prov")) == 1
    gone = client.delete(url, headers=_ui(client, app_module))
    assert gone.status_code == 200
    listing = client.get("/api/models/providers/prov/grants")
    assert listing.status_code == 200
    assert listing.json()["grants"] == []
    removed = _grant_events("grant.removed", "prov")
    assert removed and removed[0]["selector_value"] == "laptop-1"
    assert client.delete(url, headers=_ui(client, app_module)).status_code \
        == 404


def test_credential_removal_cascades_disable(client, app_module, vault,
                                             provider) -> None:
    """The MF2 hook, now real: DELETE credential disables the provider's
    grants (authority without material is dead), each audited
    grant.disabled with reason=credential_removed; the rows STAY."""
    _register_provider(client, app_module, provider)
    _make_executor(client, app_module, "exq-cascade", host="laptop-1")
    grant = _grant(client, app_module, "prov", "host", "laptop-1")
    resp = client.delete("/api/models/providers/prov/credential",
                         headers=_ui(client, app_module))
    assert resp.status_code == 200
    listing = client.get("/api/models/providers/prov/grants")
    rows = listing.json()["grants"]
    assert len(rows) == 1 and rows[0]["enabled"] is False
    events = _grant_events("grant.disabled", "prov")
    assert events[0]["reason"] == "credential_removed"
    assert events[0]["grant_id"] == grant["grant_id"]


def test_grant_read_is_open_with_selector_registry(client, app_module,
                                                   vault, provider) -> None:
    """The grants READ is roster-class (metadata only) and carries the
    LIVE selector registry for the ux picker; the spine lists come from
    the executors registry."""
    _register_provider(client, app_module, provider)
    _make_executor(client, app_module, "exq-reg", host="laptop-1")
    listing = client.get("/api/models/providers/prov/grants")
    assert listing.status_code == 200
    meta = listing.json()["meta"]["selector_registry"]
    assert "laptop-1" in meta["hosts"]
    assert f"zcode@laptop-1" in meta["executors"]


# ------------------------------------------------- §3.5 fingerprint gate

def test_fingerprint_mismatch_fails_closed(client, app_module, vault,
                                           provider) -> None:
    """§3.5 / red line 8: an out-of-band vault rewrite → 503
    credential_mismatch + audit provider.credential.mismatch — NEVER a
    foreign key on the wire (the fake provider must see ZERO requests)."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-fp")
    _grant(client, app_module, "prov", "host", "laptop-1")
    (vault / "provider-prov").write_text(CREDENTIAL_2)  # out-of-band
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {}},
        headers=_ex_headers(secret))
    assert resp.status_code == 503
    assert resp.json()["code"] == "credential_mismatch"
    assert provider.requests == []  # fail CLOSED before egress
    audit = _grant_events("provider.credential.mismatch", "prov")
    assert len(audit) == 1
    assert audit[0]["registered_fingerprint"] == _fingerprint(CREDENTIAL)
    assert CREDENTIAL_2 not in json.dumps(audit)
    assert _use_rows("prov")[0]["outcome"] == "off"


# ------------------------------------------------- §3.6 egress + slot

def _infer(client: TestClient, executor: dict, secret: str,
           payload: dict | None = None, model_id: str = "m-1"):
    return client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": model_id,
              "payload": payload if payload is not None
              else {"messages": [{"role": "user", "content": "hi"}]}},
        headers=_ex_headers(secret))


def test_ok_call_relays_and_audits(client, app_module, vault, provider) -> None:
    """§3.6 ok leg: the provider's answer relays verbatim; the use row is
    EXACTLY the §4 field set with outcome ok; last_used_at ticks and the
    slot reads `set`."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-ok")
    _grant(client, app_module, "prov", "host", "laptop-1")
    resp = _infer(client, executor, secret)
    assert resp.status_code == 200
    assert resp.json()["choices"][0]["message"]["content"] == "ok"
    rows = _use_rows("prov")
    assert len(rows) == 1
    row = rows[0]
    assert set(row) == {
        "id", "ts", "principal", "provider_key", "credential_fingerprint",
        "model_id", "outcome", "status_code", "latency_bucket", "req_bytes",
        "resp_bytes"}
    assert row["outcome"] == "ok"
    assert row["status_code"] == 200
    assert row["principal"] == f"executor:zcode@{executor['host']}"
    assert row["model_id"] == "m-1"
    assert row["credential_fingerprint"] == _fingerprint(CREDENTIAL)
    assert row["req_bytes"] > 0 and row["resp_bytes"] > 0
    assert row["latency_bucket"] in ("<1s", "<5s", "<30s", "≥30s")
    status = _provider_status(client, "prov")
    assert status["status"] == "set"
    assert status["last_used_at"]


def test_provider_401_sets_rejected_slot(client, app_module, vault,
                                         provider) -> None:
    """§3.6 + §3 slot machine: provider 401 → the caller sees the named
    honest fact (401 + the allowlist body), the slot flips to
    `rejected` with the attempt time, audit provider.use.rejected rides,
    the SSE frame goes out; last_used_at is UNTOUCHED (a rejected
    attempt is not a use)."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-401")
    _grant(client, app_module, "prov", "host", "laptop-1")
    provider.behavior.update({"status": 401,
                              "body": b'{"error": {"message": "bad key",'
                                      b' "type": "invalid_request_error"}}',
                              "content_type": "application/json"})
    sse = FakeSse(app_module)
    try:
        resp = _infer(client, executor, secret)
        assert resp.status_code == 401
        body = resp.json()
        assert body["status_code"] == 401
        assert body["type"] == "invalid_request_error"
        assert "bad key" in body["message"]
        status = _provider_status(client, "prov")
        assert status["status"] == "rejected"
        assert status["rejected_at"]
        assert not status["last_used_at"]
        audit = _grant_events("provider.use.rejected", "prov")
        assert audit and audit[0]["actor"].startswith("executor:")
        frame = sse.frame()
        assert frame["kind"] == "model.inventory.changed"
        assert frame["provider"] == "prov"
    finally:
        sse.close()
    rows = _use_rows("prov")
    assert rows[0]["outcome"] == "provider-401"
    assert CREDENTIAL not in json.dumps(rows)


def test_ok_clears_rejected_slot(client, app_module, vault, provider) -> None:
    """§3 slot machine: `rejected + ok → set` — the slot reflects the
    LAST known outcome, not a one-way tombstone; the transition
    broadcasts (state change), ordinary ok uses do not."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-clear")
    _grant(client, app_module, "prov", "host", "laptop-1")
    provider.behavior.update({"status": 401,
                              "body": b'{"error": {"message": "nope"}}',
                              "content_type": "application/json"})
    _infer(client, executor, secret)
    assert _provider_status(client, "prov")["status"] == "rejected"
    provider.behavior.update({"status": 200, "body": b'{"choices": []}',
                              "content_type": "application/json"})
    sse = FakeSse(app_module)
    try:
        resp = _infer(client, executor, secret)
        assert resp.status_code == 200
        frame = sse.frame()  # exactly ONE frame: the transition
        assert frame["kind"] == "model.inventory.changed"
    finally:
        sse.close()
    status = _provider_status(client, "prov")
    assert status["status"] == "set"
    assert not status["rejected_at"]
    assert status["last_used_at"]
    outcomes = [r["outcome"] for r in _use_rows("prov")]
    assert outcomes == ["provider-401", "ok"]


def test_rotation_clears_rejected_slot(client, app_module, vault,
                                       provider) -> None:
    """§3 slot machine: `rejected + rotation → set` (a new fingerprint is
    a fresh key) — the PUT the owner makes from the card."""
    _register_provider(client, app_module, provider)
    provider.behavior.update({"status": 401, "body": b'{"error": {}}',
                              "content_type": "application/json"})
    resp = client.post("/api/models/prov/infer",
                       json={"model_id": "m-1", "payload": {}},
                       headers=_ui(client, app_module))
    assert resp.status_code == 401
    assert _provider_status(client, "prov")["status"] == "rejected"
    rotated = client.put("/api/models/providers/prov", json={
        "credential": CREDENTIAL_2}, headers=_ui(client, app_module))
    assert rotated.status_code == 200
    status = rotated.json()
    assert status["status"] == "set"
    assert status["fingerprint"] == _fingerprint(CREDENTIAL_2)
    assert not status["rejected_at"]


def test_grant_events_never_move_the_key_slot(client, app_module, vault,
                                              provider) -> None:
    """§3: «grants are access, the slot is key health» — pause/resume/
    revoke of a grant leaves status, last_used_at and rejected_at
    byte-identical."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-slot")
    _grant(client, app_module, "prov", "host", "laptop-1")
    _infer(client, executor, secret)
    before = _provider_status(client, "prov")
    grant = client.get("/api/models/providers/prov/grants").json()[
        "grants"][0]
    client.patch(f"/api/models/providers/prov/grants/"
                 f"{grant['grant_id']}", json={"enabled": False},
                 headers=_ui(client, app_module))
    client.patch(f"/api/models/providers/prov/grants/"
                 f"{grant['grant_id']}", json={"enabled": True},
                 headers=_ui(client, app_module))
    client.delete(f"/api/models/providers/prov/grants/"
                  f"{grant['grant_id']}", headers=_ui(client, app_module))
    after = _provider_status(client, "prov")
    for field in ("status", "last_used_at", "rejected_at", "fingerprint"):
        assert after[field] == before[field], field


def test_revocation_acts_at_the_next_use(client, app_module, vault,
                                         provider) -> None:
    """Red line 7 verbatim: the in-flight call completes honestly; the
    NEXT request after the disable fails 403. (The admission happens at
    §3.4 — no re-check mid-call, no retroactive kill.)"""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-revoke")
    grant = _grant(client, app_module, "prov", "executor",
                   f"zcode@{executor['host']}")
    ok = _infer(client, executor, secret)
    assert ok.status_code == 200
    client.patch(f"/api/models/providers/prov/grants/"
                 f"{grant['grant_id']}", json={"enabled": False},
                 headers=_ui(client, app_module))
    nxt = _infer(client, executor, secret)
    assert nxt.status_code == 403
    # ONE generic reason for revoked and never-granted alike (§3.4) —
    # the second refused call answers the SAME body.
    again = _infer(client, executor, secret)
    assert again.status_code == 403
    assert nxt.json() == again.json()
    outcomes = [r["outcome"] for r in _use_rows("prov")]
    assert outcomes == ["ok", "revoked", "revoked"]


# ------------------------------------------------------ Y: egress pins

def test_header_discipline_on_the_wire(client, app_module, vault,
                                       provider) -> None:
    """§2-T: the caller influences the body only. The provider sees
    EXACTLY ONE Authorization (= the vault material), NO cookies, NO
    caller headers, NO second auth; Host is the provider authority."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-hdr")
    _grant(client, app_module, "prov", "host", "laptop-1")
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": "m-1", "payload": {"messages": []}},
        headers=_ex_headers(secret) | {
            "Cookie": "session=owner-secret",
            "X-Sneaky": "1",
            "X-Api-Key": "second-key",
            "Authorization": _ex_headers(secret)["Authorization"],
        })
    assert resp.status_code == 200
    assert len(provider.requests) == 1
    sent = provider.requests[0]
    sent_headers = sent["headers"]
    auth_headers = [v for k, v in sent_headers.items()
                    if k == "authorization"]
    assert auth_headers == [f"Bearer {CREDENTIAL}"]
    assert "cookie" not in sent_headers
    assert "x-sneaky" not in sent_headers
    assert "x-api-key" not in sent_headers
    assert sent_headers["host"] == f"127.0.0.1:{provider.port}"
    # Review P2-1: httpx never sets Content-Type for raw content=bytes —
    # the board does, on every body-carrying leg (strict provider
    # gateways answer a JSON POST without the header with 415).
    assert sent_headers.get("content-type") == "application/json"
    # The executor token and the owner cookie never reach the provider —
    # neither in the recorded headers nor in the outbound body.
    assert secret not in json.dumps(
        [{k: v for k, v in r.items() if k != "body"}
         for r in provider.requests])
    assert secret.encode() not in sent["body"]


def test_zero_redirects(client, app_module, vault, provider) -> None:
    """§2-T: NOT followed — the 3xx surfaces as provider_error with the
    3xx status (board 502), and the fake provider records EXACTLY ONE
    request (no second hop, no Location fetch)."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-redir")
    _grant(client, app_module, "prov", "host", "laptop-1")
    provider.behavior.update({"status": 302,
                              "body": b"", "content_type": "text/plain",
                              "location": "http://127.0.0.1:1/evil"})
    resp = _infer(client, executor, secret)
    assert resp.status_code == 502
    body = resp.json()
    assert body["status_code"] == 302
    assert len(provider.requests) == 1  # never followed
    row = _use_rows("prov")[0]
    assert row["outcome"] == "provider_error"


def test_provider_5xx_is_provider_error(client, app_module, vault,
                                        provider) -> None:
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-5xx")
    _grant(client, app_module, "prov", "host", "laptop-1")
    provider.behavior.update({"status": 503,
                              "body": b'{"error": {"message": "overloaded",'
                                      b' "type": "server_error"}}',
                              "content_type": "application/json"})
    resp = _infer(client, executor, secret)
    assert resp.status_code == 503
    assert resp.json()["status_code"] == 503
    assert resp.json()["type"] == "server_error"
    assert _use_rows("prov")[0]["outcome"] == "provider_error"
    # A 5xx is not a key rejection: the slot stays `set`.
    assert _provider_status(client, "prov")["status"] == "set"


def test_outbound_model_is_pinned(client, app_module, vault, provider) -> None:
    """§1 trust boundary: outbound body = {**payload, model: model_id}.
    A payload ``model`` key CANNOT smuggle a different id; the audited
    model_id is the one on the wire."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-model")
    _grant(client, app_module, "prov", "host", "laptop-1")
    resp = _infer(client, executor, secret,
                  payload={"model": "smuggled-id",
                           "messages": [{"role": "user", "content": "hi"}]},
                  model_id="audited-id")
    assert resp.status_code == 200
    sent_body = json.loads(provider.requests[0]["body"])
    assert sent_body["model"] == "audited-id"
    assert sent_body["messages"][0]["content"] == "hi"
    assert _use_rows("prov")[0]["model_id"] == "audited-id"


def test_declared_body_cap_refuses_before_read(client, app_module, vault,
                                               provider) -> None:
    """Review P2-3: a DECLARED Content-Length over the §2-D cap answers
    413 capped BEFORE a single body byte is read — the board never
    buffers an oversized body just to refuse it (the telemetry-family
    pre-parse pattern). The refusal row's req_bytes is honestly 0
    (nothing was read), and the provider saw zero requests."""
    from server import models_proxy
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-declared")
    _grant(client, app_module, "prov", "host", "laptop-1")
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        content=b'{"model_id": "m-1", "payload": {}}',
        headers=_ex_headers(secret) | {
            "Content-Type": "application/json",
            "Content-Length": str(models_proxy.BODY_CAP_BYTES + 1),
        })
    assert resp.status_code == 413
    assert resp.json()["code"] == "body_capped"
    assert provider.requests == []
    row = _use_rows("prov")[0]
    assert row["outcome"] == "capped"
    assert row["req_bytes"] == 0


def test_buffered_read_runs_under_total_wall_clock(client, app_module, vault,
                                                   provider,
                                                   monkeypatch) -> None:
    """Review P3-4: the buffered read is bounded by the §2-D TOTAL wall
    clock — a provider that answers headers and then stalls the body
    cannot hold the buffered leg beyond the budget; the board answers
    the honest 504 family (ReadTimeout) and the use row records
    provider_error."""
    from server import models_proxy
    import server.app as app
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-total")
    _grant(client, app_module, "prov", "host", "laptop-1")
    monkeypatch.setattr(app, "_provider_egress",
                        models_proxy.ProviderEgress(total_timeout=0.6))
    provider.behavior["hold_body"] = threading.Event()
    try:
        resp = _infer(client, executor, secret)
        assert resp.status_code == 504
        body = resp.json()
        assert body["code"] == "provider_unreachable"
        assert "ReadTimeout" in body["message"]
        row = _use_rows("prov")[0]
        assert row["outcome"] == "provider_error"
        assert row["status_code"] == 504
    finally:
        provider.behavior["hold_body"].set()  # free the server thread


def test_inflight_caps_cover_the_whole_streaming_relay(client, app_module,
                                                       vault, provider,
                                                       monkeypatch) -> None:
    """Review P2-2: the in-flight slot is held for the WHOLE provider
    call — including a streaming relay that runs AFTER the handler
    returned its StreamingResponse. Two concurrent held streams occupy
    the per-executor budget (cap 2); the THIRD concurrent call answers
    429 concurrency_capped; once the streams close (relay generators
    finish), a fourth call succeeds — the release happened in the relay,
    not at handler exit. Real HTTP: uvicorn in a thread + httpx.AsyncClient
    (the TestClient transport buffers whole responses and cannot hold a
    stream open)."""
    import asyncio

    import httpx
    import server.app as app
    import uvicorn
    from server import models_proxy

    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-inflight2")
    _grant(client, app_module, "prov", "host", "laptop-1")
    monkeypatch.setattr(app, "_models_inflight", models_proxy.InFlightLimiter(
        global_cap=8, per_key_cap=2))
    provider.behavior["hold_body"] = threading.Event()

    config = uvicorn.Config(app_module.app, host="127.0.0.1", port=0,
                            log_level="error", lifespan="off")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.monotonic() + 15
    while not server.started and time.monotonic() < deadline:
        time.sleep(0.05)
    assert server.started, "uvicorn never started"
    port = server.servers[0].sockets[0].getsockname()[1]
    try:
        async def flow() -> None:
            base = f"http://127.0.0.1:{port}"
            url = (f"{base}/api/executors/{executor['id']}"
                   f"/models/prov/infer")
            headers = _ex_headers(secret)
            async with httpx.AsyncClient(timeout=30) as ac:
                # Two concurrent HELD streams — each context yields at
                # response headers while the provider holds the body,
                # so both relays are mid-flight, each holding a slot.
                async def open_stream():
                    cm = ac.stream("POST", url, headers=headers, json={
                        "model_id": "m-1",
                        "payload": {"stream": True, "messages": []}})
                    response = await cm.__aenter__()
                    return cm, response

                cm_a, resp_a = await open_stream()
                cm_b, resp_b = await open_stream()
                assert resp_a.status_code == 200, await resp_a.aread()
                assert resp_b.status_code == 200, await resp_b.aread()

                # The THIRD concurrent call is capped: the budget counts
                # the two still-relaying streams.
                third = await ac.post(url, headers=headers, json={
                    "model_id": "m-1", "payload": {}})
                assert third.status_code == 429, third.text
                assert third.json()["code"] == "concurrency_capped"
                assert len(provider.requests) == 2  # capped pre-egress

                # Release the provider; both relays drain and their
                # finally legs free the slots.
                provider.behavior["hold_body"].set()
                await asyncio.sleep(0.5)
                await cm_a.__aexit__(None, None, None)
                await cm_b.__aexit__(None, None, None)
                await asyncio.sleep(0.3)

                # The slots came back — the release happened in the
                # relay's finally, not at handler exit.
                fourth = await ac.post(url, headers=headers, json={
                    "model_id": "m-1", "payload": {}})
                assert fourth.status_code == 200, fourth.text

        asyncio.run(flow())
    finally:
        provider.behavior["hold_body"].set()
        server.should_exit = True
        thread.join(timeout=10)


def test_body_and_model_id_caps(client, app_module, vault, provider,
                                monkeypatch) -> None:
    """§2-D: body > cap → 413 capped; model_id > 200 chars → 422;
    malformed body → 422. The fake provider must see ZERO requests."""
    from server import models_proxy
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-caps")
    _grant(client, app_module, "prov", "host", "laptop-1")
    saved_cap = models_proxy.BODY_CAP_BYTES
    models_proxy.BODY_CAP_BYTES = 64
    big = _infer(client, executor, secret,
                 payload={"messages": [{"role": "user", "content": "x" * 500}]})
    models_proxy.BODY_CAP_BYTES = saved_cap
    assert big.status_code == 413
    assert big.json()["code"] == "body_capped"
    assert _use_rows("prov")[0]["outcome"] == "capped"
    long_id = "m" * 201
    resp = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        json={"model_id": long_id, "payload": {}},
        headers=_ex_headers(secret))
    assert resp.status_code == 422
    raw = client.post(
        f"/api/executors/{executor['id']}/models/prov/infer",
        content=b"{not json",
        headers=_ex_headers(secret) | {"Content-Type": "application/json"})
    assert raw.status_code == 422
    assert provider.requests == []  # nothing reached the wire
    outcomes = [r["outcome"] for r in _use_rows("prov")]
    assert outcomes == ["capped", "capped", "capped"]


def test_catalog_is_a_use_and_grant_checked(client, app_module, vault,
                                            provider) -> None:
    """§2-R: GET /models is audited («who saw the roster of a paid
    provider») and grant-checked for the executor class like infer."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-cat")
    _grant(client, app_module, "prov", "host", "laptop-1")
    provider.behavior.update({
        "status": 200,
        "body": b'{"data": [{"id": "m-1"}, {"id": "m-2"}]}',
        "content_type": "application/json"})
    resp = client.get(
        f"/api/executors/{executor['id']}/models/prov/catalog",
        headers=_ex_headers(secret))
    assert resp.status_code == 200
    assert [m["id"] for m in resp.json()["data"]] == ["m-1", "m-2"]
    sent = provider.requests[0]
    assert sent["method"] == "GET"
    assert sent["path"] == "/v1/models"
    row = _use_rows("prov")[0]
    assert row["outcome"] == "ok"
    # No grant → the same 403 wall as infer (revoke properly by id).
    grant_id = client.get("/api/models/providers/prov/grants").json()[
        "grants"][0]["grant_id"]
    client.delete(f"/api/models/providers/prov/grants/{grant_id}",
                  headers=_ui(client, app_module))
    assert client.get("/api/models/providers/prov/grants").json()[
        "grants"] == []
    denied = client.get(
        f"/api/executors/{executor['id']}/models/prov/catalog",
        headers=_ex_headers(secret))
    assert denied.status_code == 403


def test_streaming_passthrough(client, app_module, vault, provider) -> None:
    """§2-I: streaming passes through with buffering disabled (no spool);
    the use row lands when the last byte left (resp_bytes = relayed)."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-stream")
    _grant(client, app_module, "prov", "host", "laptop-1")
    provider.behavior.update({
        "status": 200,
        "body": b'data: {"delta": 1}\n\ndata: {"delta": 2}\n\n',
        "content_type": "text/event-stream"})
    resp = _infer(client, executor, secret,
                  payload={"stream": True,
                           "messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")
    body = b"".join(resp.iter_bytes())
    assert b'"delta": 2' in body
    row = _use_rows("prov")[0]
    assert row["outcome"] == "ok"
    assert row["resp_bytes"] == len(body)


# ------------------------------------------------------ Z: audit hygiene

def test_audit_never_carries_material(client, app_module, vault,
                                      provider) -> None:
    """Red lines 1/9/§4, GREPPED not schema-checked: after a full
    lifecycle (register → grant → ok use → provider-401 → revoke), the
    fixture material appears in NO use row, NO event payload, NO SSE
    frame and NO roster payload."""
    _register_provider(client, app_module, provider)
    executor, secret = _make_executor(client, app_module, "exq-grep")
    grant = _grant(client, app_module, "prov", "host", "laptop-1")
    _infer(client, executor, secret)
    provider.behavior.update({"status": 401, "body": b'{"error": {}}',
                              "content_type": "application/json"})
    _infer(client, executor, secret)
    client.patch(f"/api/models/providers/prov/grants/{grant['grant_id']}",
                 json={"enabled": False}, headers=_ui(client, app_module))
    client.delete(f"/api/models/providers/prov/grants/{grant['grant_id']}",
                  headers=_ui(client, app_module))
    sse = FakeSse(app_module)
    try:
        client.put("/api/models/providers/prov", json={
            "credential": CREDENTIAL_2}, headers=_ui(client, app_module))
        sse.frame()
    finally:
        sse.close()
    surfaces: list[str] = []
    db = sqlite3.connect(DATA_DIR / "board.db")
    try:
        for (blob,) in db.execute("SELECT payload FROM events"):
            surfaces.append(blob)
        surfaces.append("\n".join(
            json.dumps(r) for r in db.execute(
                "SELECT * FROM model_use_audit").fetchall()))
        for (blob,) in db.execute("SELECT payload FROM events"
                                  " WHERE kind='model.inventory.changed'"):
            surfaces.append(blob)
    finally:
        db.close()
    roster = json.dumps(client.get("/api/models").json())
    surfaces.append(roster)
    blob = "\n".join(surfaces)
    assert CREDENTIAL not in blob
    assert CREDENTIAL_2 not in blob
    assert secret not in blob
