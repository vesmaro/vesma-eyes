"""Board-mirror wave: the models fleet discovery legs — ingest of the
additive top-level ``models`` (FC-6) and ``mcp_servers`` (FC-7) fields on
POST /api/executors/{id}/discovery, the per-executor mirror snapshots,
the roster ``discovered`` zone and the SSE delta frame.

Sources: host-intake spec §3.3–§3.5 (FC-6/FC-7 wire, caps, never-
collected), agent-discovery spec §3.10/§3.11 (snapshot/no-wipe, board
ingest duties), security-verdict §4 (the ingest detector, H4:
models.credential_leak_suspected), discovery-contract-draft §2.1/§2.3/
§2.4 (wire/caps/diffs/ingest), ux-blueprint MF1 (roster zones).

Coverage map (each test names its line):
- happy path: both legs accepted + served on the mirror GET (caps in
  meta — read-never-hardcode);
- no-wipe pair: ABSENT field = mirror untouched (an old agent / knob
  off), EXPLICIT EMPTY = real zero-and-ran (mirror wiped); a report
  whose rows were ALL dropped never wipes the last valid snapshot
  (the P3-1 precedent);
- caps → honest 422s (65 installations / 51 models / >16 KiB / 31 mcp
  names / non-integer mcp count / >8 KiB mcp entry / nameless rows /
  over-cap provider / unknown auth+source enums) — never a silent trim;
  over-cap messages stay VALUE-FREE (mask-first);
- dictionary duties: unknown harness / unknown exec_env rows DROPPED +
  audited (discovery.rejected with the leg marker); the four seeded
  model-server probe surfaces (ollama / lmstudio / llama-server / vllm)
  accepted, marked in the dictionary, never auto-extending it;
- the ingest detector: a credential-shaped string in ANY models/mcp
  field drops the ROW (or the notes blob) and writes
  models.credential_leak_suspected — the sentinel value appears in NO
  stored state, roster, mirror, audit payload or SSE frame;
- roster aggregation: dedupe by (provider, base_url), empty-base group
  per provider, merged sorted model union, the honest auth merge (any
  configured → configured, else any unknown → unknown, else anonymous),
  config-wins-over-probe source merge, seen_on from the snapshots,
  revoked executors excluded, deterministic reads;
- SSE: one model.inventory.changed frame on an actual delta (added/
  removed tuples), SILENCE on an identical re-report;
- the additive ALTER: a legacy '' column reads as {} / [].
"""

from __future__ import annotations

import asyncio
import json

import pytest
from server.security import RateLimiter

# Synthetic sentinel — shaped like a real key, never a real credential.
SENTINEL = "sk-sentinel-fake-key-0123456789abcdef"
SENTINEL_HEX = "a3f" * 9 + "1b2c"          # 31 continuous hex chars
SENTINEL_ASSIGN = "api_key=qwJ7x9m2LpQ4vR8tZ6wY"

MODEL_ROW = {"provider": "openrouter",
             "base_url": "https://openrouter.ai/api/v1",
             "auth": "configured",
             "models": ["z-ai/glm-4.6", "anthropic/claude-sonnet-4.5"],
             "harness": "zcode",
             "exec_env": "metal",
             "source": "config",
             "note": "models listed in harness settings"}

MCP_ENTRY = {"harness": "pi", "exec_env": "metal",
             "servers": ["context7", "playwright"], "count": 5}


@pytest.fixture(autouse=True)
def fresh_models_mirror_state(app_module, monkeypatch):
    """Per-test isolation (the test_me015 pattern): fresh machine-class
    limiters + a wiped executor registry. The harness dictionary keeps
    its boot seed (test_api_harnesses reseeds the full set on teardown);
    audit assertions query the events table directly (see _board_events)."""
    for name in ("_executor_register_limiter",
                 "_executor_heartbeat_limiter"):
        limiter = getattr(app_module, name)
        monkeypatch.setattr(
            app_module, name,
            RateLimiter(limit=limiter.limit, window=limiter.window))
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
        db.execute("DELETE FROM events WHERE kind IN "
                   "('models.reported', 'mcp.reported', "
                   "'models.credential_leak_suspected') "
                   "OR payload LIKE '%\"leg\": \"models\"%' "
                   "OR payload LIKE '%\"leg\": \"mcp_servers\"%'")
    yield
    with app_module.store._lock, app_module.store._conn() as db:
        db.execute("DELETE FROM executors")
        db.execute("DELETE FROM events WHERE kind IN "
                   "('models.reported', 'mcp.reported', "
                   "'models.credential_leak_suspected') "
                   "OR payload LIKE '%\"leg\": \"models\"%' "
                   "OR payload LIKE '%\"leg\": \"mcp_servers\"%'")


# ------------------------------------------------------------------ helpers

def _register(client, name: str, harness: str = "zcode") -> tuple[dict, str]:
    r = client.post("/api/executors",
                    json={"name": name, "harness": harness},
                    headers={"Authorization": "Bearer qa-board-token"})
    assert r.status_code == 201, r.text
    body = r.json()
    return body["executor"], body["executor_secret"]


def _post_discovery(client, executor_id: str, secret: str,
                    **fields) -> object:
    payload = {"harnesses": [{"name": "zcode", "version": "1"}]} | fields
    return client.post(f"/api/executors/{executor_id}/discovery",
                       json=payload,
                       headers={"Authorization": f"Bearer {secret}"})


def _mirror(client, executor_id: str) -> dict:
    r = client.get(f"/api/executors/{executor_id}/discovery")
    assert r.status_code == 200, r.text
    return r.json()


def _roster(client) -> dict:
    r = client.get("/api/models")
    assert r.status_code == 200, r.text
    return r.json()


def _board_events(app_module, kind: str, executor_id: str) -> list[dict]:
    """Audit rows for THIS executor (the events table is session-scoped
    shared state — query it directly, the windowed read misses)."""
    with app_module.store._lock, app_module.store._conn() as db:
        rows = db.execute(
            "SELECT id, ts, kind, task_id, payload FROM events "
            "WHERE kind=? ORDER BY id ASC", (kind,)).fetchall()
    out = []
    for r in rows:
        payload = json.loads(r["payload"])
        if payload.get("executor_id") == executor_id:
            out.append({"id": r["id"], "ts": r["ts"], "kind": r["kind"],
                        "task_id": r["task_id"], "payload": payload})
    return out


class FakeSse:
    """A subscribed /api/events leg to observe broadcast frames (the
    test_api_models_proxy precedent)."""

    def __init__(self, app_module) -> None:
        from server.app import _SseSubscriber, _subscribers
        self.queue: asyncio.Queue = asyncio.Queue()
        self.subscriber = _SseSubscriber(queue=self.queue, strip_actor=False)
        self._subscribers = _subscribers
        self._subscribers.add(self.subscriber)

    def drain(self) -> list[dict]:
        frames = []
        while not self.queue.empty():
            frames.append(self.queue.get_nowait())
        return frames

    def inventory_frames(self) -> list[dict]:
        return [f for f in self.drain()
                if f.get("kind") == "model.inventory.changed"]

    def close(self) -> None:
        self._subscribers.discard(self.subscriber)

    def __enter__(self) -> "FakeSse":
        return self

    def __exit__(self, *exc) -> None:
        self.close()


# ------------------------------------------------------------ happy path

class TestHappyPath:
    def test_both_fields_accepted_and_served(self, client, app_module):
        executor, secret = _register(client, "mm-h1")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [MODEL_ROW],
                                    "notes": {"default_model":
                                              "z-ai/glm-4.6"}},
                            mcp_servers=[MCP_ENTRY])
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["models_accepted"] == 1
        assert out["models_dropped"] == 0
        assert out["mcp_accepted"] == 1
        assert out["mcp_dropped"] == 0
        mirror = _mirror(client, executor["id"])
        rows = mirror["models"]["installations"]
        assert len(rows) == 1
        assert rows[0]["provider"] == "openrouter"
        assert rows[0]["harness"] == "zcode"
        assert rows[0]["models"] == sorted(MODEL_ROW["models"])
        assert mirror["models"]["notes"] == {"default_model":
                                             "z-ai/glm-4.6"}
        assert mirror["models"]["reported_at"]
        assert mirror["mcp_servers"] == [
            {"harness": "pi", "exec_env": "metal",
             "servers": ["context7", "playwright"], "count": 5}]

    def test_mirror_get_meta_carries_caps(self, client):
        executor, _secret = _register(client, "mm-h2")
        meta = _mirror(client, executor["id"])["meta"]
        assert meta["max_entries"] == 32
        assert meta["models"]["max_installations"] == 64
        assert meta["models"]["max_models_per_row"] == 50
        assert meta["models"]["max_bytes"] == 16 * 1024
        assert meta["mcp_servers"]["max_entries"] == 32
        assert meta["mcp_servers"]["max_names"] == 30
        assert meta["mcp_servers"]["entry_bytes"] == 8 * 1024

    def test_never_reported_is_honest_absence(self, client):
        executor, _secret = _register(client, "mm-h3")
        mirror = _mirror(client, executor["id"])
        assert mirror["models"] == {}
        assert mirror["mcp_servers"] == []


# -------------------------------------------------- snapshot semantics

class TestSnapshotSemantics:
    def test_absent_field_leaves_mirror_untouched(self, client, app_module):
        """No-wipe pair, first leg: a report WITHOUT the models field (an
        old agent, or knob=off) never touches the mirror — no write, no
        audit, no SSE frame."""
        executor, secret = _register(client, "mm-s1")
        _post_discovery(client, executor["id"], secret,
                        models={"installations": [MODEL_ROW]})
        before = _mirror(client, executor["id"])["models"]
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret)
            assert r.status_code == 200, r.text
            assert r.json()["models_accepted"] == 0
            assert _mirror(client, executor["id"])["models"] == before
            assert sse.inventory_frames() == []
        assert _board_events(app_module, "models.reported",
                             executor["id"]) and True
        assert len(_board_events(app_module, "models.reported",
                                 executor["id"])) == 1  # only the first

    def test_explicit_empty_wipes_mirror(self, client, app_module):
        """No-wipe pair, second leg: models present with an EMPTY
        installations list = real zero-and-ran — the mirror wipes (and
        the delta frame says what was removed)."""
        executor, secret = _register(client, "mm-s2")
        _post_discovery(client, executor["id"], secret,
                        models={"installations": [MODEL_ROW]})
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret,
                                models={"installations": []})
            assert r.status_code == 200, r.text
            assert _mirror(client,
                           executor["id"])["models"]["installations"] == []
            frames = sse.inventory_frames()
        assert len(frames) == 1
        assert frames[0]["removed"] == [
            {"provider": "openrouter",
             "base_url": "https://openrouter.ai/api/v1",
             "harness": "zcode", "exec_env": "metal"}]
        assert frames[0]["added"] == []

    def test_all_dropped_report_never_wipes(self, client, app_module):
        """P3-1: a scan whose rows were ALL rejected (unknown harness)
        refreshes the rejected trail but must not wipe the last valid
        snapshot."""
        executor, secret = _register(client, "mm-s3")
        _post_discovery(client, executor["id"], secret,
                        models={"installations": [MODEL_ROW]})
        before = _mirror(client, executor["id"])["models"]
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [MODEL_ROW | {
                                "harness": "ghost-harness-x"}]})
        assert r.status_code == 200, r.text
        assert r.json()["models_dropped"] == 1
        assert _mirror(client, executor["id"])["models"] == before
        assert len(_board_events(app_module, "models.reported",
                                 executor["id"])) == 1

    def test_identical_re_report_is_silent_noop(self, client, app_module):
        """Hourly cadence, no churn: byte-identical re-report writes
        nothing, audits nothing, emits no frame; reported_at keeps the
        FIRST write time (the P2-1 precedent)."""
        executor, secret = _register(client, "mm-s4")
        _post_discovery(client, executor["id"], secret,
                        models={"installations": [MODEL_ROW]})
        before = _mirror(client, executor["id"])["models"]
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret,
                                models={"installations": [MODEL_ROW]})
            assert r.status_code == 200, r.text
            assert _mirror(client, executor["id"])["models"] == before
            assert sse.inventory_frames() == []
        assert len(_board_events(app_module, "models.reported",
                                 executor["id"])) == 1

    def test_mcp_snapshot_semantics(self, client, app_module):
        """The mcp leg mirrors the models semantics: absent = untouched,
        explicit [] = wiped, identical = silent no-op."""
        executor, secret = _register(client, "mm-s5")
        _post_discovery(client, executor["id"], secret,
                        mcp_servers=[MCP_ENTRY])
        before = _mirror(client, executor["id"])["mcp_servers"]
        _post_discovery(client, executor["id"], secret)  # absent
        assert _mirror(client, executor["id"])["mcp_servers"] == before
        _post_discovery(client, executor["id"], secret,
                        mcp_servers=[MCP_ENTRY])  # identical
        assert _mirror(client, executor["id"])["mcp_servers"] == before
        assert len(_board_events(app_module, "mcp.reported",
                                 executor["id"])) == 1
        _post_discovery(client, executor["id"], secret, mcp_servers=[])
        assert _mirror(client, executor["id"])["mcp_servers"] == []


# ------------------------------------------------------------ caps (422)

class TestCaps:
    def _register_quiet(self, client, name):
        return _register(client, name)

    def test_65_installations_is_422(self, client):
        executor, secret = self._register_quiet(client, "mm-c1")
        rows = [MODEL_ROW | {"provider": f"prov-{i}"} for i in range(65)]
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": rows})
        assert r.status_code == 422, r.text
        assert "cap 64" in r.json()["detail"]

    def test_51_models_in_a_row_is_422(self, client):
        executor, secret = self._register_quiet(client, "mm-c2")
        row = MODEL_ROW | {"models": [f"m-{i:03d}" for i in range(51)]}
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [row]})
        assert r.status_code == 422, r.text
        assert "cap" in r.json()["detail"]

    def test_16kib_object_is_422(self, client):
        executor, secret = self._register_quiet(client, "mm-c3")
        blob = "x" * 17 * 1024
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [],
                                    "notes": {"blob": blob}})
        assert r.status_code == 422, r.text
        assert "16 KiB" in r.json()["detail"]

    def test_31_mcp_names_is_422(self, client):
        executor, secret = self._register_quiet(client, "mm-c4")
        entry = MCP_ENTRY | {"servers": [f"srv-{i:02d}" for i in range(31)]}
        r = _post_discovery(client, executor["id"], secret,
                            mcp_servers=[entry])
        assert r.status_code == 422, r.text
        assert "31 > 30" in r.json()["detail"]

    def test_mcp_count_must_be_integer(self, client):
        executor, secret = self._register_quiet(client, "mm-c5")
        entry = MCP_ENTRY | {"count": "5"}
        r = _post_discovery(client, executor["id"], secret,
                            mcp_servers=[entry])
        assert r.status_code == 422, r.text
        assert "count" in r.json()["detail"]

    def test_mcp_entry_over_8kib_is_422(self, client):
        executor, secret = self._register_quiet(client, "mm-c6")
        entry = MCP_ENTRY | {"servers": ["s" * 9 * 1024]}
        r = _post_discovery(client, executor["id"], secret,
                            mcp_servers=[entry])
        assert r.status_code == 422, r.text
        assert "8 KiB" in r.json()["detail"]

    def test_nameless_rows_never_trim_silently(self, client):
        executor, secret = self._register_quiet(client, "mm-c7")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"provider": ""}]})
        assert r.status_code == 422, r.text
        assert "installation" in r.json()["detail"]
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"harness": ""}]})
        assert r.status_code == 422, r.text
        assert "attribution" in r.json()["detail"]

    def test_provider_over_60_is_422_and_value_free(self, client):
        """The §3.3.5 provider cap; the 422 detail NEVER echoes the
        over-cap value (it may itself be credential-shaped — the
        detector runs downstream, the message stays value-free)."""
        executor, secret = self._register_quiet(client, "mm-c8")
        long_provider = "p" * 61
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"provider": long_provider}]})
        assert r.status_code == 422, r.text
        assert long_provider not in r.json()["detail"]

    def test_unknown_form_enums_are_422(self, client):
        """auth/source are closed FORM enums (§4: unknown enum value =
        honest refusal), unlike the dictionary values (drops)."""
        executor, secret = self._register_quiet(client, "mm-c9")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"auth": "probably"}]})
        assert r.status_code == 422, r.text
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"source": "guessed"}]})
        assert r.status_code == 422, r.text

    def test_mcp_missing_exec_env_never_422s_but_drops(self, client):
        """exec_env is DICTIONARY-class everywhere: a missing/unknown
        surface attribution is a drop + audit (§3.11), never a 422."""
        executor, secret = self._register_quiet(client, "mm-c10")
        r = _post_discovery(client, executor["id"], secret,
                            mcp_servers=[MCP_ENTRY | {"exec_env": "cloud:x"}])
        assert r.status_code == 200, r.text
        assert r.json()["mcp_dropped"] == 1


# --------------------------------------------------- dictionary duties

class TestDictionaryDrops:
    def test_unknown_harness_row_dropped_and_audited(
            self, client, app_module):
        executor, secret = _register(client, "mm-d1")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW,
                                MODEL_ROW | {"provider": "deepseek",
                                             "base_url":
                                             "https://api.deepseek.com/v1",
                                             "harness": "totally-unknown-x"}]})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["models_accepted"] == 1
        assert out["models_dropped"] == 1
        rejected = _board_events(app_module, "discovery.rejected",
                                 executor["id"])
        assert len(rejected) == 1
        assert rejected[0]["payload"]["names"] == ["totally-unknown-x"]
        assert rejected[0]["payload"]["leg"] == "models"
        names = {h["name"] for h in
                 client.get("/api/harnesses").json()["items"]}
        assert "totally-unknown-x" not in names  # never auto-extends

    def test_unknown_exec_env_row_dropped_and_audited(
            self, client, app_module):
        executor, secret = _register(client, "mm-d2")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"exec_env": "galaxy:9"}]})
        assert r.status_code == 200, r.text
        assert r.json()["models_dropped"] == 1
        rejected = _board_events(app_module, "discovery.rejected",
                                 executor["id"])
        assert rejected[0]["payload"]["leg"] == "models"

    def test_seeded_probe_surfaces_accepted(self, client, app_module):
        """The dictionary act: the four model-server probe surfaces are
        conscious dictionary members (marked in the note, added_via
        seed) — probe rows attributed to them are ACCEPTED, not
        dropped. Unknown OTHER names stay out."""
        harnesses = {h["name"]: h for h in
                     client.get("/api/harnesses").json()["items"]}
        for slug in ("ollama", "lmstudio", "llama-server", "vllm"):
            row = harnesses[slug]
            assert row["added_via"] == "seed"
            assert "model-server surface" in row["note"]
        executor, secret = _register(client, "mm-d3")
        rows = [MODEL_ROW | {"provider": slug, "base_url":
                             f"http://127.0.0.1:{port}",
                             "auth": "anonymous", "source": "probe",
                             "harness": slug, "note": ""}
                for slug, port in (("ollama", 11434), ("lmstudio", 1234),
                                   ("llama-server", 8080), ("vllm", 8000))]
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": rows})
        assert r.status_code == 200, r.text
        assert r.json()["models_accepted"] == 4
        assert r.json()["models_dropped"] == 0


# ------------------------------------------------- the ingest detector

class TestCredentialDetector:
    def test_credential_in_note_drops_row_and_audits(
            self, client, app_module):
        executor, secret = _register(client, "mm-x1")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW,
                                MODEL_ROW | {"provider": "leaky",
                                             "note": f"key {SENTINEL}"}]})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["models_accepted"] == 1  # the clean row survives
        assert out["models_dropped"] == 1
        incidents = _board_events(
            app_module, "models.credential_leak_suspected", executor["id"])
        assert len(incidents) == 1
        payload = incidents[0]["payload"]
        assert payload["field"] == "installations[].note"
        assert payload["value_len"] > 0
        assert len(payload["value_sha12"]) == 12
        # the value NEVER rides the audit trail
        assert SENTINEL not in json.dumps(payload)

    def test_credential_in_model_id_and_mcp_server_name(
            self, client, app_module):
        executor, secret = _register(client, "mm-x2")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"models": [SENTINEL_HEX]}]},
                            mcp_servers=[MCP_ENTRY | {"servers":
                                                      [SENTINEL_ASSIGN]}])
        assert r.status_code == 200, r.text
        assert r.json()["models_dropped"] == 1
        assert r.json()["mcp_dropped"] == 1
        incidents = _board_events(
            app_module, "models.credential_leak_suspected", executor["id"])
        assert {i["payload"]["field"] for i in incidents} == {
            "installations[].models[0]", "mcp_servers[].servers[0]"}
        # all rows/entries dropped + it was the FIRST report → the mirror
        # stays honest absence (P3-1: an all-dropped report never wipes
        # or fabricates a zero)
        mirror = _mirror(client, executor["id"])
        assert mirror["models"] == {}
        assert mirror["mcp_servers"] == []

    def test_credential_in_notes_blob_drops_notes_keeps_rows(
            self, client, app_module):
        executor, secret = _register(client, "mm-x3")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [MODEL_ROW],
                                    "notes": {"default_model": SENTINEL}})
        assert r.status_code == 200, r.text
        assert r.json()["models_accepted"] == 1  # the ROW facts stay
        incidents = _board_events(
            app_module, "models.credential_leak_suspected", executor["id"])
        # SEC-4: the offending ENTRY is fingerprinted (field/len/sha12),
        # the blob drops whole — no value, no zero-length stub.
        assert incidents[0]["payload"]["field"] == "notes.default_model"
        assert incidents[0]["payload"]["value_len"] == len(SENTINEL)
        assert len(incidents[0]["payload"]["value_sha12"]) == 12
        assert SENTINEL not in json.dumps(incidents[0]["payload"])
        mirror = _mirror(client, executor["id"])
        assert mirror["models"]["installations"]
        assert "notes" not in mirror["models"]  # the blob never stores

    def test_credential_in_unknown_extra_field_trips_detector(
            self, client, app_module):
        """SEC-6: a key parked in an UNKNOWN row field trips the same
        incident — the scan covers every string value of the raw row."""
        executor, secret = _register(client, "mm-x3b")
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"provider": "extrakey",
                                             "custom_field": SENTINEL}]})
        assert r.status_code == 200, r.text
        assert r.json()["models_accepted"] == 0
        assert r.json()["models_dropped"] == 1
        incidents = _board_events(
            app_module, "models.credential_leak_suspected", executor["id"])
        assert incidents[0]["payload"]["field"] == \
            "installations[].custom_field"

    def test_mcp_exec_env_plant_trips_detector(self, client, app_module):
        """QA-F2: exec_env is a scanned mcp field too."""
        executor, secret = _register(client, "mm-x3c")
        r = _post_discovery(client, executor["id"], secret,
                            mcp_servers=[MCP_ENTRY | {"exec_env": SENTINEL}])
        assert r.status_code == 200, r.text
        assert r.json()["mcp_accepted"] == 0
        incidents = _board_events(
            app_module, "models.credential_leak_suspected", executor["id"])
        assert incidents[0]["payload"]["field"] == "mcp_servers[].exec_env"

    def test_sentinel_sweep_planted_key_appears_nowhere(
            self, client, app_module):
        """A planted fake key in EVERY models/mcp field appears NOWHERE
        in stored state, the roster, the mirror GET, the executor
        projection, the audit trail or SSE — red line 1 (security
        verdict §4)."""
        executor, secret = _register(client, "mm-x4")
        poisoned = [MODEL_ROW | {"provider": SENTINEL},
                    MODEL_ROW | {"base_url": f"https://x.ai/{SENTINEL}"},
                    MODEL_ROW | {"models": [SENTINEL]},
                    MODEL_ROW | {"note": SENTINEL}]
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret,
                                models={"installations": poisoned,
                                        "notes": {"k": SENTINEL}},
                                mcp_servers=[
                                    MCP_ENTRY | {"harness": SENTINEL,
                                                 "servers": [SENTINEL]}])
            assert r.status_code == 200, r.text
            assert r.json()["models_accepted"] == 0
            assert r.json()["mcp_accepted"] == 0
            frames = sse.drain()
        surfaces = {
            "mirror": json.dumps(_mirror(client, executor["id"])),
            "roster": json.dumps(_roster(client)),
            "executor": json.dumps(client.get(
                f"/api/executors/{executor['id']}").json()),
            "events": json.dumps([e["payload"] for e in _board_events(
                app_module, "models.credential_leak_suspected",
                executor["id"])]),
            "sse": json.dumps(frames),
            "columns": json.dumps(_raw_columns(app_module, executor["id"])),
        }
        for where, blob in surfaces.items():
            assert SENTINEL not in blob, f"sentinel leaked into {where}"
            assert SENTINEL_HEX not in blob, f"sentinel leaked into {where}"
            assert SENTINEL_ASSIGN not in blob, \
                f"sentinel leaked into {where}"


def _raw_columns(app_module, executor_id: str) -> dict:
    """The raw mirror columns straight from SQLite — the deepest stored
    state there is."""
    with app_module.store._lock, app_module.store._conn() as db:
        row = db.execute(
            "SELECT models_mirror, mcp_mirror FROM executors WHERE id=?",
            (executor_id,)).fetchone()
    return {"models_mirror": row["models_mirror"],
            "mcp_mirror": row["mcp_mirror"]}


SHORT_SECRET = "hunter2"   # too short for every shape class — SEC-P1


class TestUrlRedaction:
    """SEC-P1 (red line §4.5 board-side): the §3.3.6 grammar applies to
    the mirror ingest — query/fragment/userinfo always stripped; a
    userinfo-bearing or credential-param-bearing URL omits the base_url
    fact entirely. A SHORT secret defeats every shape regex, so the
    structural grammar is the authoritative line."""

    def test_userinfo_and_query_secret_redacted_everywhere(
            self, client, app_module):
        executor, secret = _register(client, "mm-u1")
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret,
                                models={"installations": [
                                    MODEL_ROW | {
                                        "provider": "with-userinfo",
                                        "base_url":
                                        f"https://admin:{SHORT_SECRET}"
                                        f"@host/v1"},
                                    MODEL_ROW | {
                                        "provider": "with-query-key",
                                        "base_url":
                                        f"https://host/v1"
                                        f"?key={SHORT_SECRET}"}]})
            assert r.status_code == 200, r.text
            assert r.json()["models_accepted"] == 2  # row facts survive
            frames = sse.drain()
        surfaces = {
            "mirror": json.dumps(_mirror(client, executor["id"])),
            "roster": json.dumps(_roster(client)),
            "executor": json.dumps(client.get(
                f"/api/executors/{executor['id']}").json()),
            "events": json.dumps(_board_events(
                app_module, "models.reported", executor["id"])),
            "sse": json.dumps(frames),
            "columns": json.dumps(_raw_columns(app_module, executor["id"])),
        }
        for where, blob in surfaces.items():
            assert SHORT_SECRET not in blob, f"short secret leaked into {where}"
            assert "admin:" not in blob, f"userinfo leaked into {where}"
            assert "?key=" not in blob, f"credential query leaked into {where}"
        # the URL FACT omits; the row's other facts stay honest
        rows = _mirror(client, executor["id"])["models"]["installations"]
        by_provider = {r["provider"]: r for r in rows}
        assert "base_url" not in by_provider["with-userinfo"]
        assert "base_url" not in by_provider["with-query-key"]
        # an INNOCENT query is silently stripped, the URL fact stays
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"base_url":
                                             "https://host/v1"
                                             "?api-version=2024"}]})
        assert r.status_code == 200, r.text
        rows = _mirror(client, executor["id"])["models"]["installations"]
        assert any(row.get("base_url") == "https://host/v1"
                   for row in rows)


# ------------------------------------------------------- roster (MF1)

class TestRosterAggregation:
    def _register_report(self, client, name: str,
                         rows: list[dict]) -> tuple[dict, str]:
        executor, secret = _register(client, name)
        r = _post_discovery(client, executor["id"], secret,
                            models={"installations": rows})
        assert r.status_code == 200, r.text
        return executor, secret

    def _report(self, client, name: str, rows: list[dict]) -> dict:
        executor, _secret = self._register_report(client, name, rows)
        return executor

    def test_two_executors_same_provider_dedupe_and_seen_on(
            self, client):
        exec1, _ = self._register_report(client, "mm-r1", [MODEL_ROW])
        exec2, _ = self._register_report(client, "mm-r2",
                                         [MODEL_ROW | {"models":
                                                       ["z-ai/glm-4.6"]}])
        discovered = _roster(client)["discovered"]
        assert len(discovered) == 1
        item = discovered[0]
        assert item["provider"] == "openrouter"
        assert item["base_url"] == "https://openrouter.ai/api/v1"
        assert item["models"] == sorted(set(MODEL_ROW["models"]))
        assert item["provenance"] == "agent"
        assert len(item["seen_on"]) == 2
        assert {s["executor_id"] for s in item["seen_on"]} == \
            {exec1["id"], exec2["id"]}
        for seen in item["seen_on"]:
            assert seen["harness"] == "zcode"
            assert seen["exec_env"] == "metal"
            assert seen["last_reported_at"]

    def test_auth_merge_configured_outranks(self, client):
        self._report(client, "mm-r3", [MODEL_ROW | {"auth": "configured"}])
        self._report(client, "mm-r4", [MODEL_ROW | {"auth": "anonymous"}])
        item = _roster(client)["discovered"][0]
        assert item["auth"] == "configured"

    def test_auth_merge_unknown_outranks_anonymous(self, client):
        self._report(client, "mm-r5", [MODEL_ROW | {"auth": "unknown"}])
        self._report(client, "mm-r6", [MODEL_ROW | {"auth": "anonymous"}])
        item = _roster(client)["discovered"][0]
        assert item["auth"] == "unknown"

    def test_source_config_wins_over_probe(self, client):
        self._report(client, "mm-r7", [MODEL_ROW | {"source": "probe"}])
        self._report(client, "mm-r8", [MODEL_ROW | {"source": "config"}])
        item = _roster(client)["discovered"][0]
        assert item["source"] == "config"

    def test_empty_base_url_dedupes_within_provider(self, client):
        """The contract's None-base rule: frontmatter/pi rows without a
        base_url dedupe per provider inside their own empty-base group —
        they never merge with a BASE_URL'd row of the same provider."""
        self._report(client, "mm-r9", [
            MODEL_ROW | {"base_url": "", "harness": "copilot"},
            MODEL_ROW | {"base_url": "", "harness": "zcode"},
            MODEL_ROW,
        ])
        discovered = _roster(client)["discovered"]
        assert len(discovered) == 2
        by_base = {d["base_url"]: d for d in discovered}
        assert len(by_base[""]["seen_on"]) == 2
        assert len(by_base["https://openrouter.ai/api/v1"]["seen_on"]) == 1

    def test_revoked_executor_facts_excluded(self, client, ui_auth):
        executor = self._report(client, "mm-r10", [MODEL_ROW])
        client.patch(f"/api/executors/{executor['id']}",
                     json={"state": "revoked"}, headers=ui_auth)
        assert _roster(client)["discovered"] == []

    def test_board_zone_untouched_and_deterministic(self, client):
        body = _roster(client)
        assert body["board"][0]["provider"] == "hermes"
        assert body["board"][0]["provenance"] == "board"
        assert body["discovered"] == []
        assert body["meta"]["max_models_per_row"] == 50
        assert body["meta"]["max_installations"] == 64
        self._report(client, "mm-r11", [MODEL_ROW])
        first = _roster(client)
        second = _roster(client)
        assert first == second
        assert first["discovered"][0]["models"] == \
            sorted(set(MODEL_ROW["models"]))

    def test_no_credential_fields_anywhere(self, client):
        self._report(client, "mm-r12", [MODEL_ROW])
        payload = json.dumps(_roster(client)).lower()
        for banned in ("credential", "api_key", "apikey", "token", "secret"):
            assert banned not in payload


# ---------------------------------------------------------------- SSE

class TestSseDelta:
    def test_frame_on_delta_silence_on_identical(self, client, app_module):
        executor, secret = _register(client, "mm-e1")
        with FakeSse(app_module) as sse:
            _post_discovery(client, executor["id"], secret,
                            models={"installations": [MODEL_ROW]})
            frames = sse.inventory_frames()
        assert len(frames) == 1
        frame = frames[0]
        assert frame["kind"] == "model.inventory.changed"
        assert frame["origin"] == "agent"
        assert frame["executor_id"] == executor["id"]
        assert frame["added"] == [
            {"provider": "openrouter",
             "base_url": "https://openrouter.ai/api/v1",
             "harness": "zcode", "exec_env": "metal"}]
        assert frame["removed"] == []
        assert frame["at"]
        with FakeSse(app_module) as sse:
            _post_discovery(client, executor["id"], secret,
                            models={"installations": [MODEL_ROW]})
            assert sse.inventory_frames() == []

    def test_frame_lists_added_and_removed_across_change(
            self, client, app_module):
        executor, secret = _register(client, "mm-e2")
        _post_discovery(client, executor["id"], secret,
                        models={"installations": [MODEL_ROW]})
        with FakeSse(app_module) as sse:
            _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"provider": "deepseek",
                                             "base_url":
                                             "https://api.deepseek.com/v1"}]})
            frames = sse.inventory_frames()
        assert len(frames) == 1
        assert {a["provider"] for a in frames[0]["added"]} == {"deepseek"}
        assert {r["provider"] for r in frames[0]["removed"]} == \
            {"openrouter"}

    def test_content_change_under_stable_identity_writes_and_frames(
            self, client, app_module):
        """QA-BLOCKER F1: a re-report that keeps the identity tuple but
        changes CONTENT (the models list grows) is a WRITE — the mirror
        updates (stale mirror forever was the bug) — and exactly ONE
        frame fires, carrying the updated tuple (added/removed stay
        empty; the `updated` channel is the F1/F7 reconciliation)."""
        executor, secret = _register(client, "mm-e3")
        _post_discovery(client, executor["id"], secret,
                        models={"installations": [MODEL_ROW]})
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret,
                                models={"installations": [
                                    MODEL_ROW | {"models":
                                                 MODEL_ROW["models"]
                                                 + ["z-ai/glm-5.3"]}]})
            assert r.status_code == 200, r.text
            rows = _mirror(
                client, executor["id"])["models"]["installations"]
            assert rows[0]["models"] == \
                sorted(MODEL_ROW["models"] + ["z-ai/glm-5.3"])
            frames = sse.inventory_frames()
        assert len(frames) == 1
        assert frames[0]["added"] == []
        assert frames[0]["removed"] == []
        assert frames[0]["updated"] == [
            {"provider": "openrouter",
             "base_url": "https://openrouter.ai/api/v1",
             "harness": "zcode", "exec_env": "metal"}]
        # an auth flip is content too — same grammar
        with FakeSse(app_module) as sse:
            _post_discovery(client, executor["id"], secret,
                            models={"installations": [
                                MODEL_ROW | {"auth": "anonymous"}]})
            frames = sse.inventory_frames()
        assert len(frames) == 1
        assert frames[0]["updated"] and not frames[0]["added"] \
            and not frames[0]["removed"]

    def test_notes_only_change_writes_without_frame(
            self, client, app_module):
        """QA-F7: a notes-only change is a WRITE (snapshot semantics:
        the report is the whole object) but emits NO frame — a frame
        whose added/removed/updated are all empty says nothing and
        would thrash the FE cache. Absent-vs-absent stays the no-op."""
        executor, secret = _register(client, "mm-e4")
        _post_discovery(client, executor["id"], secret,
                        models={"installations": [MODEL_ROW],
                                "notes": {"default_model": "z-ai/glm-4.6"}})
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret,
                                models={"installations": [MODEL_ROW],
                                        "notes": {"default_model":
                                                  "z-ai/glm-5.3"}})
            assert r.status_code == 200, r.text
            mirror = _mirror(client, executor["id"])["models"]
            assert mirror["notes"] == {"default_model": "z-ai/glm-5.3"}
            assert sse.inventory_frames() == []
        # absent-vs-absent: an identical notes-less re-report is silent,
        # and the notes DROP itself is the last-report-wins semantics
        # (a report without notes after one with notes drops the blob —
        # a write, still no frame)
        with FakeSse(app_module) as sse:
            r = _post_discovery(client, executor["id"], secret,
                                models={"installations": [MODEL_ROW]})
            assert r.status_code == 200, r.text
            assert "notes" not in _mirror(
                client, executor["id"])["models"]
            assert sse.inventory_frames() == []


# -------------------------------------------------------- legacy ALTER

class TestLegacyColumns:
    def test_legacy_empty_columns_read_as_absence(self, client, app_module):
        executor, secret = _register(client, "mm-l1")
        with app_module.store._lock, app_module.store._conn() as db:
            db.execute("UPDATE executors SET models_mirror='', "
                       "mcp_mirror='' WHERE id=?", (executor["id"],))
        mirror = _mirror(client, executor["id"])
        assert mirror["models"] == {}
        assert mirror["mcp_servers"] == []
        assert _roster(client)["discovered"] == []


# ------------------------------------------------- SEC-3 body cap

class TestDiscoveryBodyCap:
    def test_oversize_declared_body_413_before_auth_or_parse(
            self, client, app_module):
        """SEC-3: the pre-parse Content-Length cap (the telemetry
        precedent) extends to the discovery POST — a huge DECLARED body
        gets the contract 413 before a single body byte is read (the
        413 fires before routing, so even an unknown executor id answers
        it — the refusal is not the route's 404)."""
        cap = app_module._DISCOVERY_BODY_MAX_BYTES
        r = client.post("/api/executors/ex-nosuch/discovery",
                        content=b"x" * (cap + 1),
                        headers={"Content-Type": "application/json"})
        assert r.status_code == 413, r.text
        assert "pre-parse" in r.json()["detail"]
        # a legal body sails through the cap (then answers the route's
        # own 401 for a token-less unknown id — proving the cap did not
        # swallow the route)
        r = client.post("/api/executors/ex-nosuch/discovery",
                        json={"harnesses": []},
                        headers={"Content-Type": "application/json"})
        assert r.status_code == 401
