"""bootstrap.sh v2 — the Go-agent default path (ME-055), bash harness.

The REAL script runs the FULL agent branch against a fake world: a stub
``curl`` that serves a real openssl-generated CA, a fake GitHub release
(latest JSON + tarball + checksums — the tarball carries a STUB
``vesmaro-agent`` bash binary that mimics ``--version`` and the §1.1
``--enroll`` contract), the board's executor registry reads, stub ``id``
(fake root — CI is not root) and stub ``systemctl``. sha256sum, tar and
openssl stay REAL: the checksum gate and the fingerprint pipeline must
be the production ones.

The stub ``python3`` FAILS LOUDLY if ever called: the Go-agent path is
python-free by design (v2 removed the v1 python dependency; the legacy
--poller contour is covered by test_bootstrap_anchor.py).

Every layout knob (VESMARO_AGENT_*, VESMARO_ENV_FILE, VESMARO_CA_FILE)
keeps the contour off /opt, /etc and /var.

QA matrix:
- fresh install: release resolved + downloaded + sha256-verified, binary
  installed 0755, agent.yaml is VALID YAML with the managed keys and the
  fail-closed allowlist seed, executor_id resolved from the enroll
  answer, unit written with the poller-precedent hardening, secret env
  file written by the AGENT (VESMARO_ENV_FILE), marker recorded, verdict
  read from the §4.1 flat row;
- sha256 MISMATCH / asset missing from the manifest → honest abort 3,
  NOTHING installed;
- UPDATE path (spent token + existing install): the user's allowlist
  tail and executor_id survive, the unit is RESTARTED, not re-enabled;
- name collision (rc 5 + the name is somebody else's) → exit 4;
- bad/expired token (rc 5 + name unknown) → exit 4, «mint a new token»;
- harness not in the board dictionary (agent rc 2) → exit 2;
- --agent-version pin skips the «latest» API lookup;
- the mne_ token reaches the binary via VESMARO_ENROLL_TOKEN (env,
  never a CLI value in ps).
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import ssl
import subprocess
import textwrap
from pathlib import Path

import pytest
import yaml

REPO = Path(__file__).resolve().parents[1]
BOOTSTRAP_SH = REPO / "deploy" / "poller" / "bootstrap.sh"

TAG = "v9.9.9"
VER = "9.9.9"
EXEC_ID = "ex-stub-9"
EXEC_NAME = "vps-stub"

STUB_AGENT = textwrap.dedent("""\
    #!/usr/bin/env bash
    # test stub of vesmaro-agent (built by tests/test_bootstrap_agent.py)
    if [[ "${1:-}" == "--version" ]]; then
      echo "vesmaro-agent 9.9.9 (stub)"
      exit 0
    fi
    if [[ "${1:-}" == "--enroll" ]]; then
      # S1 parity: the mne_ token arrives via the ENV, never a flag value
      # in ps — a wrong shape is a contract break, fail loudly.
      [[ "${VESMARO_ENROLL_TOKEN:-}" =~ ^mne_[A-Za-z0-9_-]+$ ]] \\
        || { echo "stub: VESMARO_ENROLL_TOKEN has a wrong shape" >&2; exit 2; }
      cfg=""; shift
      while [[ $# -gt 0 ]]; do
        [[ "$1" == "--config" ]] && cfg="$2"
        shift
      done
      [[ -n "$cfg" && -f "$cfg" ]] || { echo "stub: config missing: $cfg" >&2; exit 2; }
      grep -q '^board_url: ' "$cfg" || { echo "stub: board_url missing" >&2; exit 2; }
      name=$(sed -n 's/^executor_name: "\\(.*\\)"$/\\1/p' "$cfg")
      [[ -n "$name" ]] || { echo "stub: executor_name missing" >&2; exit 2; }
      if [[ -n "${STUB_ENROLL_DICT_FAIL:-}" ]]; then
        echo "enroll: harness \\"$name\\" is not in the board dictionary (zcode) — the one-time token was NOT spent" >&2
        exit 2
      fi
      if [[ -n "${STUB_ENROLL_REFUSE:-}" ]]; then
        echo "enroll: registration refused (${STUB_ENROLL_REFUSE})" >&2
        echo "hint: ${STUB_ENROLL_HINT:-mint a NEW one-time token}" >&2
        exit 5
      fi
      printf 'VESMARO_BOARD_TOKEN=stub-executor-secret\\n' > "${VESMARO_ENV_FILE:?}"
      echo "registered: ex-stub-9 (${name}) — state pending, awaiting owner approval"
      exit 0
    fi
    echo "stub: unsupported mode: $*" >&2
    exit 2
    """)


def _goarch() -> str:
    m = platform.machine().lower()
    return {"x86_64": "amd64", "amd64": "amd64",
            "aarch64": "arm64", "arm64": "arm64"}.get(m, "amd64")


def _goos() -> str:
    return {"Linux": "linux", "Darwin": "darwin"}.get(platform.system(), "linux")


@pytest.fixture(scope="module")
def lab_ca(tmp_path_factory):
    """A real self-signed CA (CA:TRUE) — the pinning pipeline is real."""
    d = tmp_path_factory.mktemp("v2-ca")
    ca = d / "ca.pem"
    subprocess.run(
        ["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
         "-days", "1", "-subj", "/CN=vesmaro-v2-test-ca",
         "-addext", "basicConstraints=critical,CA:TRUE",
         "-keyout", str(d / "key.pem"), "-out", str(ca)],
        check=True, capture_output=True)
    from server.provisioner import fingerprint_of_bytes
    der = ssl.PEM_cert_to_DER_cert(ca.read_text())
    return {"pem": ca, "der": der, "canon": fingerprint_of_bytes(der)}


@pytest.fixture()
def world(tmp_path, lab_ca):
    """The fake world: release assets, registry answers, PATH stubs, and
    every layout knob pointed into tmp_path."""
    asset = f"vesmaro-agent_{VER}_{_goos()}_{_goarch()}.tar.gz"
    csfile = f"vesmaro-agent_{VER}_checksums.txt"
    dl = f"https://github.com/vesmaro/vesmaro-agent/releases/download/{TAG}"

    # --- the fake release ------------------------------------------------
    rel = tmp_path / "release"
    rel.mkdir()
    payload = rel / "payload"
    payload.mkdir()
    (payload / "vesmaro-agent").write_text(STUB_AGENT)
    (payload / "vesmaro-agent").chmod(0o755)
    (payload / "README.md").write_text("# stub release\n")
    tarball = rel / asset
    subprocess.run(["tar", "czf", str(tarball), "-C", str(payload),
                    "vesmaro-agent", "README.md"], check=True)
    digest = hashlib.sha256(tarball.read_bytes()).hexdigest()
    checksums = rel / csfile
    checksums.write_text(f"{digest}  {asset}\n")
    latest = rel / "latest.json"
    latest.write_text(json.dumps({"tag_name": TAG}))

    # --- the board registry answers --------------------------------------
    row = json.dumps({"id": EXEC_ID, "name": EXEC_NAME, "harness": "zcode",
                      "state": "pending", "enabled": False,
                      "presence": "online"})
    row_file = tmp_path / "row.json"
    row_file.write_text(row)
    list_file = tmp_path / "list.json"
    list_file.write_text(json.dumps({"ok": True, "items": [json.loads(row)]}))

    # --- PATH stubs -------------------------------------------------------
    stubs = tmp_path / "stubs"
    stubs.mkdir()
    log = tmp_path / "curl.log"
    sysctl_log = tmp_path / "systemctl.log"
    ca_target = tmp_path / "lab-ca.crt"

    def sh(name: str, body: str) -> None:
        p = stubs / name
        p.write_text(body)
        p.chmod(0o755)

    sh("curl", textwrap.dedent(f"""\
        #!/usr/bin/env bash
        echo "$*" >> "${{VESMARO_CURL_LOG:-/dev/null}}"
        out=""; skip=0
        for a in "$@"; do
          if [[ $skip -eq 1 ]]; then out="$a"; skip=0; continue; fi
          [[ "$a" == "-o" ]] && skip=1
        done
        serve() {{ if [[ -n "$out" ]]; then cp "$1" "$out"; else cat "$1"; fi; exit 0; }}
        case "$*" in
          *"/api/poller/artifacts/ca.crt"*) serve "{lab_ca['pem']}" ;;
          *"api.github.com/repos/vesmaro/vesmaro-agent/releases/latest"*) serve "{latest}" ;;
          *{dl}/{asset}*) serve "{tarball}" ;;
          *{dl}/{csfile}*) serve "{checksums}" ;;
          *"/api/executors/{EXEC_ID}") serve "{row_file}" ;;
          *"/api/executors"*) serve "{list_file}" ;;
          *) echo "stub curl: no route for $*" >&2; exit 1 ;;
        esac
        """))
    sh("id", "#!/usr/bin/env bash\necho 0\n")
    sh("systemctl", textwrap.dedent(f"""\
        #!/usr/bin/env bash
        echo "$*" >> "{sysctl_log}"
        exit 0
        """))
    # The Go-agent path must be python-free: any python3 call is a bug.
    sh("python3", '#!/usr/bin/env bash\n'
                   'echo "python3 must NOT be called on the agent path" >&2\n'
                   'exit 99\n')

    paths = {
        "bin": tmp_path / "agent" / "bin" / "vesmaro-agent",
        "conf": tmp_path / "etc" / "agent.yaml",
        "env": tmp_path / "etc" / "agent.env",
        "unit": tmp_path / "systemd" / "vesmaro-agent.service",
        "state": tmp_path / "var" / "vesmaro-agent",
        "marker": tmp_path / "etc" / "agent-bootstrap.json",
    }
    return {"tmp": tmp_path, "stubs": stubs, "log": log, "sysctl_log": sysctl_log,
            "ca_target": ca_target, "asset": asset, "digest": digest,
            "checksums": checksums, "tarball": tarball, "dl": dl,
            "paths": paths, "canon": lab_ca["canon"]}


def _run(world, *args, env_extra=None):
    env = {
        "PATH": f"{world['stubs']}:{os.environ['PATH']}",
        "VESMARO_CA_FILE": str(world["ca_target"]),
        "VESMARO_CURL_LOG": str(world["log"]),
        "VESMARO_AGENT_BIN": str(world["paths"]["bin"]),
        "VESMARO_AGENT_CONF": str(world["paths"]["conf"]),
        "VESMARO_ENV_FILE": str(world["paths"]["env"]),
        "VESMARO_AGENT_UNIT": str(world["paths"]["unit"]),
        "VESMARO_AGENT_STATE": str(world["paths"]["state"]),
        "VESMARO_AGENT_MARKER": str(world["paths"]["marker"]),
        "VESMARO_VERDICT_WAIT": "0",
        "HOME": os.environ.get("HOME", "/root"),
    }
    env.update(env_extra or {})
    cmd = ["bash", str(BOOTSTRAP_SH),
           "--url", "https://board.v2.test",
           "--token", "mne_v2_testtoken",
           "--name", EXEC_NAME, *args]
    return subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True,
                          text=True, timeout=60, env=env)


# ------------------------------------------------------------ fresh install
class TestFreshInstall:
    def test_full_happy_path(self, world):
        p = world["paths"]
        r = _run(world, "--expect-fp", world["canon"])
        combined = r.stdout + r.stderr
        assert r.returncode == 0, combined
        # the release channel: latest → v9.9.9 → verified sha256
        assert "releases/latest" in world["log"].read_text()
        assert f"release: {TAG}" in r.stdout
        assert world["digest"] in r.stdout                 # digest printed
        assert "sha256 verified" in r.stdout
        # binary installed and executable
        assert p["bin"].is_file() and (p["bin"].stat().st_mode & 0o111)
        # agent.yaml: VALID yaml, managed keys, the fail-closed seed
        cfg = yaml.safe_load(p["conf"].read_text())
        assert cfg["board_url"] == "https://board.v2.test"
        assert cfg["executor_id"] == EXEC_ID
        assert cfg["executor_name"] == EXEC_NAME
        assert cfg["harness"] == "zcode"
        assert cfg["transport"] == "direct"
        assert cfg["ca_bundle"] == str(world["ca_target"])
        assert cfg["allowlist"] == [{"harness": "zcode", "command": ["zcode"],
                                     "specialists": ["*"]}]
        assert (p["conf"].stat().st_mode & 0o777) == 0o600
        # the unit: poller-precedent hardening, resolved paths
        unit = p["unit"].read_text()
        assert f"ExecStart={p['bin']} --config {p['conf']}" in unit
        assert f"EnvironmentFile={p['env']}" in unit
        assert "Restart=always" in unit
        assert "ProtectSystem=strict" in unit
        assert f"ReadWritePaths={p['state']}" in unit
        assert "UMask=0077" in unit
        # the SECRET was written by the AGENT (the enroll contract)
        assert p["env"].read_text() == "VESMARO_BOARD_TOKEN=stub-executor-secret\n"
        # the marker
        marker = json.loads(p["marker"].read_text())
        assert marker["executor_id"] == EXEC_ID
        assert marker["agent_version"] == VER
        assert marker["executor"] == "go-agent"
        # systemd: enabled once; verdict from the §4.1 flat row
        sysctl = world["sysctl_log"].read_text()
        assert "enable --now vesmaro-agent" in sysctl
        assert "READY-ISH" in r.stdout
        assert "python3 must NOT be called" not in combined

    def test_version_pin_skips_latest_lookup(self, world):
        r = _run(world, "--agent-version", VER, "--expect-fp", world["canon"])
        assert r.returncode == 0, r.stdout + r.stderr
        logged = world["log"].read_text()
        assert "releases/latest" not in logged
        assert f"/download/{TAG}/" in logged


# ------------------------------------------------------- integrity (sha256)
class TestIntegrity:
    def test_sha256_mismatch_installs_nothing(self, world):
        world["checksums"].write_text(f"{'0' * 64}  {world['asset']}\n")
        r = _run(world, "--expect-fp", world["canon"])
        assert r.returncode == 3
        assert "sha256 MISMATCH" in r.stdout + r.stderr
        assert not world["paths"]["bin"].exists()
        assert not world["paths"]["unit"].exists()
        assert not world["paths"]["marker"].exists()

    def test_unlisted_asset_refused(self, world):
        world["checksums"].write_text(
            f"{'b' * 64}  vesmaro-agent_{VER}_other_os.tar.gz\n")
        r = _run(world, "--expect-fp", world["canon"])
        assert r.returncode == 3
        assert "not listed in the release checksums file" in r.stdout + r.stderr
        assert not world["paths"]["bin"].exists()


# ----------------------------------------------------------------- update
class TestUpdatePath:
    def test_spent_token_update_preserves_user_config(self, world):
        p = world["paths"]
        assert _run(world, "--expect-fp", world["canon"]).returncode == 0
        # the owner edits their allowlist tail between runs
        user_cfg = p["conf"].read_text().replace(
            'specialists:\n      - "*"\n',
            'specialists:\n      - "*"\n  - harness: mytool\n'
            '    command:\n      - /usr/local/bin/mytool\n'
            '    specialists:\n      - bathys-researcher\n')
        p["conf"].write_text(user_cfg)
        # re-run with a spent token (agent exit 5 + hint)
        r = _run(world, "--expect-fp", world["canon"],
                 env_extra={"STUB_ENROLL_REFUSE": "token spent",
                            "STUB_ENROLL_HINT": "mint a NEW one-time token"})
        combined = r.stdout + r.stderr
        assert r.returncode == 0, combined
        assert "UPDATE path" in combined
        cfg = yaml.safe_load(p["conf"].read_text())
        assert cfg["executor_id"] == EXEC_ID                  # preserved
        entries = {(e["harness"], tuple(e["command"])) for e in cfg["allowlist"]}
        assert ("mytool", ("/usr/local/bin/mytool",)) in entries
        assert ("zcode", ("zcode",)) in entries               # seed kept too
        sysctl = world["sysctl_log"].read_text()
        assert sysctl.count("enable --now vesmaro-agent") == 1
        assert "restart vesmaro-agent" in sysctl


# --------------------------------------------------------- enroll failures
class TestEnrollRefusals:
    def test_name_collision_from_another_install(self, world):
        # no prior install here, but the registry already has the name
        r = _run(world, "--expect-fp", world["canon"],
                 env_extra={"STUB_ENROLL_REFUSE": "409",
                            "STUB_ENROLL_HINT": "the name is taken"})
        combined = r.stdout + r.stderr
        assert r.returncode == 4
        assert "already registered" in combined
        assert "--name" in combined
        # nothing was enabled — the install is honest, not half-alive
        assert "enable --now" not in world["sysctl_log"].read_text()

    def test_bad_token_mint_hint(self, world):
        # registry does NOT know the name → not a collision, a dead token
        row = {"id": "ex-other", "name": "somebody-else", "state": "approved",
               "enabled": True, "presence": "online"}
        list_file = world["tmp"] / "list.json"
        list_file.write_text(json.dumps({"ok": True, "items": [row]}))
        r = _run(world, "--expect-fp", world["canon"],
                 env_extra={"STUB_ENROLL_REFUSE": "410",
                            "STUB_ENROLL_HINT": "mint a NEW one-time token"})
        combined = r.stdout + r.stderr
        assert r.returncode == 4
        assert "Mint a NEW one-time token" in combined

    def test_harness_not_in_dictionary(self, world):
        r = _run(world, "--harness", "nope", "--expect-fp", world["canon"],
                 env_extra={"STUB_ENROLL_DICT_FAIL": "1"})
        combined = r.stdout + r.stderr
        assert r.returncode == 2
        assert "not in the board dictionary" in combined
