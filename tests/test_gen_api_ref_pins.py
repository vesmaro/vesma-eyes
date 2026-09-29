"""Pin-integrity tests for scripts/gen_api_ref.py (ME-046).

gen_api_ref reads bodies from git OBJECTS (`git show sha:path`), never from
the working tree — so a clone HEAD away from the pin is LEGITIMATE here
(shared clones, by design). The integrity contract is fetch-completeness:
the pinned commit must resolve in the clone, and a pin the clone never
fetched must FAIL LOUD with a fetch hint — never fall through to an empty
api hub (incident 2026-09-29 sibling of the sync_docs HEAD guard).
"""

from __future__ import annotations

import importlib.util
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

# gen_api_ref does `import sync_docs` — make scripts/ importable first.
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

_spec = importlib.util.spec_from_file_location(
    "gen_api_ref_under_test", _SCRIPTS / "gen_api_ref.py"
)
gen_api_ref = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen_api_ref)

SyncError = gen_api_ref.SyncError


def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, check=True
    )
    return proc.stdout.strip()


@pytest.fixture()
def clone(tmp_path: Path) -> dict[str, object]:
    """A minimal clone with TWO commits: old (fixture pin) and new."""
    repo = tmp_path / "agent-clone"
    repo.mkdir()
    (repo / "docs").mkdir()
    (repo / "docs" / "PROTOCOL.md").write_text("# Protocol v1\n\nBody.\n", encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "153223100+Korrnals@users.noreply.github.com")
    _git(repo, "config", "user.name", "Korrnals")
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", "protocol v1")
    old = _git(repo, "rev-parse", "HEAD")
    (repo / "docs" / "PROTOCOL.md").write_text("# Protocol v2\n\nBody.\n", encoding="utf-8")
    _git(repo, "commit", "-qam", "protocol v2")
    new = _git(repo, "rev-parse", "HEAD")
    return {"repo": repo, "old": old, "new": new}


def test_pin_source_resolves_a_present_pin(clone: dict[str, object]) -> None:
    pin = gen_api_ref.pin_source(
        "fake-agent", {"repo": str(clone["repo"]), "ref": clone["new"]}
    )
    assert pin["sha"] == clone["new"]
    assert pin["commit_date"]  # git log served the pinned commit's date


def test_pin_source_tolerates_head_away_from_pin(clone: dict[str, object]) -> None:
    """Object reads: the clone may sit checked out elsewhere — content comes
    from `git show sha:path`, so pinning old while HEAD is new must WORK
    (this is the exact configuration where sync_docs fails instead)."""
    _git(clone["repo"], "checkout", "-q", str(clone["old"]))
    pin = gen_api_ref.pin_source(
        "fake-agent", {"repo": str(clone["repo"]), "ref": clone["new"]}
    )
    assert pin["sha"] == clone["new"]
    # and the object read serves the PINNED content, not the checkout's
    body = gen_api_ref.run_git(
        Path(pin["repo_path"]), "show", f"{pin['sha']}:docs/PROTOCOL.md"
    )
    assert "Protocol v2" in body


def test_pin_source_fails_loud_on_absent_pin(clone: dict[str, object]) -> None:
    """Fetch-completeness: a SHA the clone never fetched fails with an
    actionable fetch hint, not git's raw 'Needed a single revision'."""
    absent = "1" * 40
    with pytest.raises(SyncError, match="fetch-incomplete.*fetch --all") as excinfo:
        gen_api_ref.pin_source(
            "fake-agent", {"repo": str(clone["repo"]), "ref": absent}
        )
    message = str(excinfo.value)
    assert "api_hub.sources.fake-agent" in message  # says WHICH source pin
    assert str(clone["repo"]) in message  # says WHICH clone to fetch


def test_pin_source_fails_on_missing_clone(tmp_path: Path) -> None:
    with pytest.raises(SyncError, match="clone not found"):
        gen_api_ref.pin_source(
            "fake-agent", {"repo": str(tmp_path / "nowhere")}
        )
