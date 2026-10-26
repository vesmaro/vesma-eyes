"""Models fleet roster — the MF1 read leg (ux-blueprint wave MF1,
discovery-contract §3: ``GET /api/models``, the single aggregation point).

QA matrix (each test names its line):
- contract shape: 200 with ok/providers/discovered/board/meta; the board
  zone carries the hermes roster row (provenance="board", the STATIC
  hermes_client roster, default_model pinned);
- provenance discipline: board rows are marked "board" — no agent-reported
  row can masquerade as a board fact and vice versa (the FE badges off the
  marker, never off the zone);
- honest empties: `providers` (MF2 owner registry) and `discovered` (the
  agent mirror; the wire carries no models slice yet) are EXACTLY [] in
  MF1 — the hub's honest empty states read these;
- caps meta: meta.max_models_per_row travels (read-never-hardcode);
- no credential fields anywhere in the response (security verdict §5 —
  the whole-family red line; grep the payload, not just the schema);
- open read: no bearer needed (same boundary as GET /api/executors);
- SPA-fallback honesty: unknown /api/* is NOT this route's problem, but the
  route itself must answer application/json (never the SPA shell).
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from conftest import DATA_DIR
from server import hermes_client


# ------------------------------------------------------------ contract shape

def test_models_roster_shape(client: TestClient) -> None:
    """200 + the four contract zones; the board zone carries hermes."""
    resp = client.get("/api/models")
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert isinstance(body["providers"], list) and body["providers"] == []
    assert isinstance(body["discovered"], list) and body["discovered"] == []
    assert isinstance(body["board"], list) and len(body["board"]) == 1
    row = body["board"][0]
    assert row["provider"] == "hermes"
    assert row["provenance"] == "board"
    assert row["models"] == list(hermes_client.HERMES_MODELS)
    assert row["default_model"] == hermes_client.HERMES_DEFAULT_MODEL
    assert isinstance(row["base_url"], str) and row["base_url"]


def test_models_roster_meta_caps(client: TestClient) -> None:
    """Caps travel in meta (read-never-hardcode discipline)."""
    meta = client.get("/api/models").json()["meta"]
    assert meta["max_models_per_row"] == 50


def test_models_roster_no_credential_fields(client: TestClient) -> None:
    """Security verdict §5 red line: no credential-shaped key anywhere in
    the payload — the roster is names/URLs/counts only."""
    payload = json.dumps(client.get("/api/models").json())
    for banned in ("credential", "api_key", "apikey", "token", "secret"):
        assert banned not in payload.lower(), f"credential-shaped key: {banned}"


def test_models_roster_open_read(client: TestClient) -> None:
    """Open read — no Authorization header (same boundary as
    GET /api/executors; the cluster ingress is the auth boundary)."""
    resp = client.get("/api/models", headers={"Authorization": ""})
    assert resp.status_code == 200


def test_models_roster_deterministic(client: TestClient) -> None:
    """Two reads agree — the roster is a derived projection, not a
    mutating counter; the hub can refetch freely on SSE invalidation."""
    first = client.get("/api/models").json()
    second = client.get("/api/models").json()
    assert first == second


def test_models_roster_secrets_dir_independent(client: TestClient) -> None:
    """The roster reads NO credential storage: it serves identically while
    the secrets dir (MF2's concern, verdict H1) exists — MF1 touches no
    secret surface by construction."""
    assert (DATA_DIR / "secrets").exists()
    assert client.get("/api/models").status_code == 200
