"""Models fleet MF2 — the provider credential registry write leg
(ux-blueprint wave MF2 under security-verdict §1 H1 / §4 red lines).

QA matrix (each test names its verdict line):
- H1 honest-off: VESMARO_SECRETS_DIR unset OR unusable ⇒ 503-family
  refusal (code ``providers_off``), NO registry row, NO audit, NEVER a
  DB fallback (red line 8);
- vault discipline: file-per-credential_ref created 0600 via atomic
  temp+rename AT 0600 (never chmod-after), content = material only, no
  temp leftovers;
- metadata-only surfaces: POST/PUT/DELETE responses, the roster and the
  audit payloads carry the fingerprint (SHA-256[:12]) and NEVER the
  material (red lines 1/9 — grep the payloads, not just the schema);
- audit: provider.credential.set / .rotated / .removed in the events
  trail with actor/provider/ref/fingerprint;
- red line 5: userinfo and credential-shaped query params in base_url
  are refused 422 ``credential_in_url`` with the SAME message family the
  FE form speaks inline; innocent query/fragment is silently stripped;
- owner/machine semantics: ui bearer 201; no auth 401; machine-class
  bearer 401 with the pinned cross-class detail; a paired mnd_ device
  403 (the scope middleware — credential writes are in no device
  granule); the roster read stays open;
- rotation (PUT): new fingerprint, rotated_at set, .rotated audit, the
  old vault file replaced atomically;
- DELETE: vault file unlinked, the registry row STAYS (the honest
  «не подключён» slot), .removed audit names the consequence, grants
  cascade hook present (0 in MF2), re-delete 409, unknown 404;
- roster (OQ-1): providers[] served additively next to the untouched
  MF1 zones; the whole payload still greps clean of credential-shaped
  key names;
- SSE: every successful mutation broadcasts the additive
  ``model.inventory.changed`` frame (the MF1 FE mapping consumes it).

Credential values here are FIXTURE PLACEHOLDERS (synthetic strings) —
never real provider material (the secrets-hygiene rule).
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import sqlite3
import stat
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import BOARD_TOKEN, DATA_DIR


# ---------------------------------------------------------------- fixtures
CREDENTIAL = "sk-qa-fake-credential-placeholder-0001"  # synthetic fixture
CREDENTIAL_2 = "sk-qa-fake-credential-placeholder-0002"
FAMILY_MESSAGE = (
    "В URL не должно быть логина или пароля — ключ вводится отдельным полем."
)


def _fingerprint(material: str) -> str:
    return hashlib.sha256(material.encode("utf-8")).hexdigest()[:12]


@pytest.fixture(autouse=True)
def _clean_registry_after_each():
    """The store is session-scoped: registry rows created here must not
    leak into the MF1 roster tests' `providers == []` honest-empty pin
    (they run in the same process). Audit events stay — they are the
    trail; only the registry table is swept."""
    yield
    db = sqlite3.connect(DATA_DIR / "board.db")
    try:
        db.execute("DELETE FROM model_providers")
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def vault(monkeypatch, tmp_path: Path) -> Path:
    """A usable secrets dir pinned via the H1 env (read LIVE per call)."""
    directory = tmp_path / "vault"
    monkeypatch.setenv("VESMARO_SECRETS_DIR", str(directory))
    return directory


@pytest.fixture()
def providers_off(monkeypatch) -> None:
    """H1 honest-off contour: the env is absent (shell leakage swept)."""
    monkeypatch.delenv("VESMARO_SECRETS_DIR", raising=False)


@pytest.fixture()
def vault_ref_path(monkeypatch, tmp_path: Path) -> Path:
    """An UNUSABLE secrets dir: the configured path lives UNDER a regular
    file, so mkdir fails with NotADirectoryError on any account (determin-
    istic where chmod-based denial is not — root ignores file modes)."""
    blocker = tmp_path / "blocker"
    blocker.write_text("not a directory")
    monkeypatch.setenv("VESMARO_SECRETS_DIR", str(blocker / "vault"))
    return blocker


def _post(client: TestClient, key: str, *, base_url: str = "https://openrouter.ai/api/v1",
          credential: str = CREDENTIAL, headers: dict | None = None) -> object:
    return client.post(
        "/api/models/providers",
        json={"provider_key": key, "base_url": base_url, "credential": credential},
        headers=headers if headers is not None else {},
    )


def _ui(client: TestClient, app_module) -> dict:
    effective = app_module.UI_WRITE_TOKEN or app_module.BOARD_WRITE_TOKEN
    return {"Authorization": f"Bearer {effective}"}


def _provider_events_all() -> list[dict]:
    """Every provider-lifecycle audit row (for material greps)."""
    db = sqlite3.connect(DATA_DIR / "board.db")
    db.row_factory = sqlite3.Row
    try:
        rows = db.execute(
            "SELECT payload FROM events WHERE kind LIKE 'provider.%'"
            " ORDER BY id ASC").fetchall()
    finally:
        db.close()
    return [json.loads(row["payload"]) for row in rows]


def _provider_events(kind: str, key: str) -> list[dict]:
    """Audit rows straight from the shared events table (kind-filtered —
    robust against the session-wide event volume; the store.events()
    LIMIT window is not)."""
    db = sqlite3.connect(DATA_DIR / "board.db")
    db.row_factory = sqlite3.Row
    try:
        rows = db.execute(
            "SELECT ts, kind, payload FROM events WHERE kind=? ORDER BY id ASC",
            (kind,)).fetchall()
    finally:
        db.close()
    out = []
    for row in rows:
        payload = json.loads(row["payload"])
        if payload.get("provider_key") == key:
            out.append({"ts": row["ts"], "kind": row["kind"], "payload": payload})
    return out


class FakeSse:
    """A subscribed /api/events leg to observe broadcast frames."""

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


# ------------------------------------------------------- H1 honest-off (503)

def test_post_without_secrets_dir_is_honest_off(client, app_module, providers_off) -> None:
    """Verdict H1/red line 8: no dir ⇒ 503-family refusal, no DB row,
    no audit — the honest-off family, never a silent DB fallback."""
    resp = _post(client, "off-a", headers=_ui(client, app_module))
    assert resp.status_code == 503
    body = resp.json()
    assert body["ok"] is False
    assert body["code"] == "providers_off"
    assert "VESMARO_SECRETS_DIR" in body["message"]
    assert app_module.store.model_provider("off-a") is None
    assert _provider_events("provider.credential.set", "off-a") == []


def test_post_unusable_dir_refuses(client, app_module, vault_ref_path) -> None:
    """A configured but unusable dir degrades to the SAME honest-off —
    a half-written secret is worse than a refusal."""
    resp = _post(client, "off-b", headers=_ui(client, app_module))
    assert resp.status_code == 503
    assert resp.json()["code"] == "providers_off"
    assert app_module.store.model_provider("off-b") is None


def test_put_and_delete_share_the_honest_off_gate(client, app_module, providers_off) -> None:
    resp = client.put("/api/models/providers/ghost",
                      json={"credential": CREDENTIAL},
                      headers=_ui(client, app_module))
    assert resp.status_code == 503
    assert resp.json()["code"] == "providers_off"
    resp = client.delete("/api/models/providers/ghost/credential",
                         headers=_ui(client, app_module))
    assert resp.status_code == 503
    assert resp.json()["code"] == "providers_off"


# ------------------------------------------------------ vault 0600 discipline

def test_vault_file_is_0600_atomic_and_material_only(client, app_module, vault) -> None:
    resp = _post(client, "prov-a", headers=_ui(client, app_module))
    assert resp.status_code == 201, resp.text
    ref = "provider-prov-a"
    path = vault / ref
    assert path.exists()
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert path.read_bytes() == CREDENTIAL.encode("utf-8")  # material ONLY
    leftovers = [p.name for p in vault.iterdir() if p.name != ref]
    assert leftovers == []  # the temp+rename left no droppings


def test_registry_row_carries_metadata_only(client, app_module, vault) -> None:
    assert _post(client, "prov-b", headers=_ui(client, app_module)).status_code == 201
    row = app_module.store.model_provider("prov-b")
    assert row["fingerprint"] == _fingerprint(CREDENTIAL)
    assert row["credential_ref"] == "provider-prov-b"
    assert row["base_url"] == "https://openrouter.ai/api/v1"
    assert CREDENTIAL not in json.dumps(row)  # metadata only, ever


# --------------------------------------------------- metadata-only surfaces

def test_mutations_never_echo_material(client, app_module, vault) -> None:
    created = _post(client, "prov-c", headers=_ui(client, app_module))
    assert created.status_code == 201
    assert CREDENTIAL not in created.text
    rotated = client.put(
        "/api/models/providers/prov-c",
        json={"credential": CREDENTIAL_2},
        headers=_ui(client, app_module),
    )
    assert rotated.status_code == 200
    assert CREDENTIAL not in rotated.text and CREDENTIAL_2 not in rotated.text
    removed = client.delete(
        "/api/models/providers/prov-c/credential", headers=_ui(client, app_module))
    assert removed.status_code == 200
    assert CREDENTIAL not in removed.text
    roster = client.get("/api/models")
    assert CREDENTIAL not in roster.text and CREDENTIAL_2 not in roster.text
    audit = json.dumps(_provider_events_all())
    assert CREDENTIAL not in audit and CREDENTIAL_2 not in audit


def test_roster_payload_stays_credential_word_free(client, app_module, vault) -> None:
    """The OQ-1 additive zone must not break the MF1 family red line: no
    credential-shaped KEY NAME anywhere in the roster payload."""
    assert _post(client, "prov-d", headers=_ui(client, app_module)).status_code == 201
    payload = json.dumps(client.get("/api/models").json()).lower()
    for banned in ("credential", "api_key", "apikey", "token", "secret"):
        assert banned not in payload, f"credential-shaped key: {banned}"


# ---------------------------------------------------------------- audit (H4)

def test_audit_set_rotated_removed_with_fingerprint(client, app_module, vault) -> None:
    _post(client, "prov-e", headers=_ui(client, app_module))
    client.put("/api/models/providers/prov-e", json={"credential": CREDENTIAL_2},
               headers=_ui(client, app_module))
    client.delete("/api/models/providers/prov-e/credential",
                  headers=_ui(client, app_module))
    set_events = _provider_events("provider.credential.set", "prov-e")
    rotated = _provider_events("provider.credential.rotated", "prov-e")
    removed = _provider_events("provider.credential.removed", "prov-e")
    assert len(set_events) == len(rotated) == len(removed) == 1
    assert set_events[0]["payload"]["fingerprint"] == _fingerprint(CREDENTIAL)
    assert rotated[0]["payload"]["fingerprint"] == _fingerprint(CREDENTIAL_2)
    assert rotated[0]["payload"]["actor"] == "ui"
    assert set_events[0]["payload"]["credential_ref"] == "provider-prov-e"
    # .removed names the consequence: which file left + the grants cascade
    # hook ran (0 grants exist in MF2).
    assert removed[0]["payload"]["fingerprint"] == _fingerprint(CREDENTIAL_2)
    assert removed[0]["payload"]["grants_disabled"] == 0
    assert removed[0]["payload"]["file_removed"] is True


# -------------------------------------------------- red line 5 (URL family)

@pytest.mark.parametrize(
    "bad_url",
    [
        "https://user:pass@openrouter.ai/api/v1",   # userinfo
        "https://openrouter.ai/api/v1?key=qa-x",    # credential query
        "https://openrouter.ai/api/v1?token=qa-x",
        "https://openrouter.ai/api/v1?api_key=qa-x",
        "https://openrouter.ai/api/v1?apikey=qa-x",
    ],
)
def test_credential_in_url_refused_with_family_message(
        client, app_module, vault, bad_url) -> None:
    """Red line 5: the refusal speaks the SAME family the FE inline
    validation speaks, the value is never echoed, nothing persists."""
    resp = _post(client, "prov-f", base_url=bad_url, headers=_ui(client, app_module))
    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == "credential_in_url"
    assert body["message"] == FAMILY_MESSAGE
    assert "qa-x" not in resp.text  # the smuggled value is never echoed
    assert app_module.store.model_provider("prov-f") is None
    # The URL gate runs BEFORE the vault: the dir itself is never created.
    assert not vault.exists() or list(vault.iterdir()) == []


def test_innocent_query_and_fragment_stripped(client, app_module, vault) -> None:
    """OQ-4 amendment 2 board-side: query/fragment are ALWAYS stripped;
    what persists is scheme://authority[/base-path]."""
    resp = _post(
        client, "prov-g",
        base_url="https://openrouter.ai/api/v1?utm=1#frag",
        headers=_ui(client, app_module))
    assert resp.status_code == 201
    assert resp.json()["base_url"] == "https://openrouter.ai/api/v1"


def test_trailing_slash_and_scheme_normalized(client, app_module, vault) -> None:
    """Structural normalization only: scheme lowercased, trailing slash
    stripped, query/fragment gone. The host stays EXACTLY as the owner
    typed it — the board never rewrites the address, it trims it."""
    resp = _post(client, "prov-h", base_url="HTTPS://OpenRouter.AI/api/v1/",
                 headers=_ui(client, app_module))
    assert resp.status_code == 201
    assert resp.json()["base_url"] == "https://OpenRouter.AI/api/v1"


@pytest.mark.parametrize(
    "bad_url",
    ["ftp://openrouter.ai", "https://", "openrouter.ai/api/v1",
     "https://host/path/../etc"],
)
def test_structural_url_rejections(client, app_module, vault, bad_url) -> None:
    resp = _post(client, "prov-i", base_url=bad_url, headers=_ui(client, app_module))
    assert resp.status_code == 422
    assert resp.json()["code"] == "validation"


# ------------------------------------------------- owner / machine semantics

def test_owner_bearer_writes(client, app_module, vault, split_tokens) -> None:
    resp = _post(client, "prov-j", headers=_ui(client, app_module))
    assert resp.status_code == 201
    assert resp.json()["status"] == "set"
    assert resp.json()["fingerprint"] == _fingerprint(CREDENTIAL)


def test_missing_auth_is_401(client, app_module, vault) -> None:
    resp = _post(client, "prov-k")
    assert resp.status_code == 401
    assert resp.json()["code"] == "unauthorized"


def test_machine_class_bearer_refused(client, app_module, vault, split_tokens) -> None:
    """Split mode: the machine token does NOT open the owner registry —
    the pinned cross-class 401 (the FE re-login flow keys on it)."""
    resp = _post(client, "prov-l", headers={"Authorization": f"Bearer {BOARD_TOKEN}"})
    assert resp.status_code == 401
    assert "machine-class token" in resp.json()["message"]


def test_device_post_is_403_wall(client, app_module, vault) -> None:
    """A paired mnd_ device: the scope middleware stops the write
    (credential management is in no device granule)."""
    store = app_module.store
    row, _code = store.create_pairing_request(device_name="qa-prov-dev")
    store.scan_pairing(row["id"], device_name="qa-prov-dev", source_ip="testclient")
    store.confirm_pairing(row["id"], allow=True)
    device, token = store.issue_device_session(row["id"])
    resp = client.post(
        "/api/models/providers",
        json={"provider_key": "prov-m", "base_url": "https://x.example/api",
              "credential": CREDENTIAL},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403
    assert app_module.store.model_provider("prov-m") is None


def test_cookie_leg_writes(client, app_module, vault) -> None:
    """The owner session cookie (transition contour: the cookie value IS
    the effective ui token) opens the same owner act."""
    client.cookies.set("vesmaro_ui", BOARD_TOKEN)
    try:
        resp = _post(client, "prov-n")
        assert resp.status_code == 201
    finally:
        client.cookies.clear()


# ------------------------------------------------------------------ rotation

def test_rotation_replaces_material_and_fingerprint(client, app_module, vault) -> None:
    assert _post(client, "prov-o", headers=_ui(client, app_module)).status_code == 201
    vault_file = vault / "provider-prov-o"
    old_fingerprint = _fingerprint(CREDENTIAL)
    resp = client.put("/api/models/providers/prov-o",
                      json={"credential": CREDENTIAL_2},
                      headers=_ui(client, app_module))
    assert resp.status_code == 200
    body = resp.json()
    assert body["fingerprint"] == _fingerprint(CREDENTIAL_2)
    assert body["fingerprint"] != old_fingerprint
    assert body["rotated_at"]
    assert body["status"] == "set"
    assert vault_file.read_bytes() == CREDENTIAL_2.encode("utf-8")
    assert stat.S_IMODE(vault_file.stat().st_mode) == 0o600


def test_rotation_validates_the_new_base_url(client, app_module, vault) -> None:
    """The PUT address change passes the SAME red line 5 gate."""
    _post(client, "prov-p", headers=_ui(client, app_module))
    resp = client.put(
        "/api/models/providers/prov-p",
        json={"credential": CREDENTIAL, "base_url": "https://api.deepseek.com/v1?key=1"},
        headers=_ui(client, app_module))
    assert resp.status_code == 422
    assert resp.json()["code"] == "credential_in_url"


def test_rotation_of_unknown_provider_404(client, app_module, vault) -> None:
    resp = client.put("/api/models/providers/ghost",
                      json={"credential": CREDENTIAL},
                      headers=_ui(client, app_module))
    assert resp.status_code == 404
    assert resp.json()["code"] == "provider_not_found"


# ------------------------------------------------------------- DELETE paths

def test_delete_keeps_row_and_unlinks_file(client, app_module, vault) -> None:
    _post(client, "prov-q", headers=_ui(client, app_module))
    vault_file = vault / "provider-prov-q"
    assert vault_file.exists()
    resp = client.delete("/api/models/providers/prov-q/credential",
                         headers=_ui(client, app_module))
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] is None
    assert body["fingerprint"] is None
    assert body["base_url"] == "https://openrouter.ai/api/v1"  # row STAYS
    assert not vault_file.exists()


def test_delete_without_credential_is_409(client, app_module, vault) -> None:
    _post(client, "prov-r", headers=_ui(client, app_module))
    client.delete("/api/models/providers/prov-r/credential",
                  headers=_ui(client, app_module))
    resp = client.delete("/api/models/providers/prov-r/credential",
                         headers=_ui(client, app_module))
    assert resp.status_code == 409
    assert resp.json()["code"] == "credential_not_set"


def test_delete_unknown_provider_404(client, app_module, vault) -> None:
    resp = client.delete("/api/models/providers/ghost/credential",
                         headers=_ui(client, app_module))
    assert resp.status_code == 404


def test_re_register_after_delete_reuses_the_name(client, app_module, vault) -> None:
    """DELETE leaves the row unset; a fresh POST for the same name is the
    documented re-set path (set_credential), fingerprint restored."""
    _post(client, "prov-s", headers=_ui(client, app_module))
    client.delete("/api/models/providers/prov-s/credential",
                  headers=_ui(client, app_module))
    resp = client.post("/api/models/providers",
                       json={"provider_key": "prov-s",
                             "base_url": "https://openrouter.ai/api/v1",
                             "credential": CREDENTIAL},
                       headers=_ui(client, app_module))
    # The row still exists → the named 409 (rotation is the re-set path).
    assert resp.status_code == 409
    assert resp.json()["code"] == "provider_exists"


# --------------------------------------------------------- roster + SSE

def test_roster_serves_providers_additively(client, app_module, vault) -> None:
    """OQ-1: the MF1 contract zones stay untouched; providers[] carries
    the metadata-only rows with the closed status enum."""
    _post(client, "prov-t", headers=_ui(client, app_module))
    body = client.get("/api/models").json()
    assert body["ok"] is True
    assert len(body["board"]) == 1 and body["board"][0]["provider"] == "hermes"
    assert body["discovered"] == []
    rows = {p["provider_key"]: p for p in body["providers"]}
    row = rows["prov-t"]
    assert row["base_url"] == "https://openrouter.ai/api/v1"
    assert row["fingerprint"] == _fingerprint(CREDENTIAL)
    assert row["status"] == "set"
    assert row["created_at"]


def test_roster_slot_after_delete_is_null(client, app_module, vault) -> None:
    _post(client, "prov-u", headers=_ui(client, app_module))
    client.delete("/api/models/providers/prov-u/credential",
                  headers=_ui(client, app_module))
    rows = {p["provider_key"]: p
            for p in client.get("/api/models").json()["providers"]}
    row = rows["prov-u"]
    assert row["status"] is None
    assert row["fingerprint"] is None


def test_duplicate_name_409_family_message(client, app_module, vault) -> None:
    assert _post(client, "prov-v", headers=_ui(client, app_module)).status_code == 201
    resp = _post(client, "prov-v", headers=_ui(client, app_module))
    assert resp.status_code == 409
    body = resp.json()
    assert body["code"] == "provider_exists"
    assert "уже подключён" in body["message"]


def test_provider_key_charset_enforced(client, app_module, vault) -> None:
    for bad in ("OpenRouter", "has space", "слаг", "x" * 61):
        resp = client.post(
            "/api/models/providers",
            json={"provider_key": bad, "base_url": "https://ok.example",
                  "credential": CREDENTIAL},
            headers=_ui(client, app_module))
        assert resp.status_code == 422
    assert app_module.store.model_provider("prov-w") is None


def test_name_bound_enforced(client, app_module, vault) -> None:
    resp = client.post(
        "/api/models/providers",
        json={"provider_key": "a" * 61, "base_url": "https://ok.example",
              "credential": CREDENTIAL},
        headers=_ui(client, app_module))
    assert resp.status_code == 422


def test_sse_broadcast_on_mutations(client, app_module, vault) -> None:
    sse = FakeSse(app_module)
    try:
        _post(client, "prov-x", headers=_ui(client, app_module))
        assert sse.frame()["kind"] == "model.inventory.changed"
        client.put("/api/models/providers/prov-x", json={"credential": CREDENTIAL_2},
                   headers=_ui(client, app_module))
        assert sse.frame()["kind"] == "model.inventory.changed"
        client.delete("/api/models/providers/prov-x/credential",
                      headers=_ui(client, app_module))
        frame = sse.frame()
        assert frame["kind"] == "model.inventory.changed"
        assert frame["provider"] == "prov-x"
    finally:
        sse.close()


def test_validation_errors_never_touch_the_vault(client, app_module, vault) -> None:
    """Order guarantee: owner wall → dir → URL → dup. A URL rejection
    happens BEFORE the vault write — no file, no partial state."""
    resp = client.post(
        "/api/models/providers",
        json={"provider_key": "prov-y", "base_url": "https://a@b.example",
              "credential": CREDENTIAL},
        headers=_ui(client, app_module))
    assert resp.status_code == 422
    assert not vault.exists() or list(vault.iterdir()) == []
    assert app_module.store.model_provider("prov-y") is None


def test_roster_meta_names_the_off_fact(client, app_module, providers_off) -> None:
    """MF-HUB-OFF honesty: with the env unset the roster meta says
    providers_off=true (the FE renders the disabled CTA WITH its reason);
    with a usable dir the fact flips to false. A read never mkdirs."""
    assert client.get("/api/models").json()["meta"]["providers_off"] is True


def test_roster_meta_off_fact_flips_with_vault(client, app_module, vault) -> None:
    assert client.get("/api/models").json()["meta"]["providers_off"] is False
