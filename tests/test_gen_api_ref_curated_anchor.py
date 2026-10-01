"""Hub-internal curated provenance anchor tests (ME-052).

`curated_provenance` for entries without a `verified_against.source` used
to pin repo HEAD — verified-at restamped on EVERY main commit, so
regeneration between commits was never byte-stable (noisy diff). ME-052
anchors such pages to the last commit that actually CHANGED their curated
sources (either locale file): unrelated commits no longer move the stamp
(ARCHCOM-7 / ADR 0016 §7 — honest freshness follows the source).
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"

# gen_api_ref does `import sync_docs` — make scripts/ importable first.
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

_spec = importlib.util.spec_from_file_location(
    "gen_api_ref_under_test", _SCRIPTS / "gen_api_ref.py"
)
gen_api_ref = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen_api_ref)


def _git(repo: Path, *args: str) -> str:
    proc = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, text=True, check=True
    )
    return proc.stdout.strip()


def _commit_all(repo: Path, message: str) -> str:
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", message)
    return _git(repo, "rev-parse", "HEAD")


def _unrelated_commit(repo: Path, message: str) -> str:
    """A commit that changes NOTHING under curated/ (the ME-052 noise)."""
    roadmap = repo / "docs" / "union" / "roadmap.md"
    roadmap.parent.mkdir(parents=True, exist_ok=True)
    roadmap.write_text(f"# union\n\nnoise {message}\n", encoding="utf-8")
    return _commit_all(repo, message)


def _make_repo(tmp_path: Path) -> tuple[Path, Path]:
    repo = tmp_path / "repo"
    curated = repo / "viewer" / "src" / "features" / "docs" / "curated" / "api"
    curated.mkdir(parents=True)
    (repo / "README.md").write_text("seed\n", encoding="utf-8")
    _git(repo, "init", "-q")
    _git(repo, "config", "user.email", "153223100+Korrnals@users.noreply.github.com")
    _git(repo, "config", "user.name", "Korrnals")
    seed = _commit_all(repo, "seed")
    assert seed
    return repo, curated


def test_anchor_is_the_last_curated_change_not_head(tmp_path: Path) -> None:
    repo, curated = _make_repo(tmp_path)
    (curated / "ru").mkdir()
    (curated / "ru" / "overview.md").write_text("# Обзор\n", encoding="utf-8")
    (curated / "en").mkdir()
    (curated / "en" / "overview.md").write_text("# Overview\n", encoding="utf-8")
    content_commit = _commit_all(repo, "curate api/overview (ru+en)")

    unrelated = _unrelated_commit(repo, "docs(union): roadmap appendix — unrelated to curated sources")

    prov = gen_api_ref.hub_internal_provenance(
        "overview", repo=repo, curated_dir=curated
    )
    assert prov["sha"] == content_commit
    assert prov["sha"] != unrelated
    assert prov["commit_date"] == _git(repo, "log", "-1", "--format=%cI", content_commit)
    assert prov["source_path"] == "curated/api/{ru,en}/overview.md"
    assert prov["repo"] == "vesma-eyes"


def test_anchor_moves_only_on_an_actual_curated_edit(tmp_path: Path) -> None:
    repo, curated = _make_repo(tmp_path)
    (curated / "ru").mkdir()
    (curated / "ru" / "overview.md").write_text("# Обзор v1\n", encoding="utf-8")
    first = _commit_all(repo, "curate overview v1")
    _unrelated_commit(repo, "unrelated noise commit")
    # anchor still on the content change
    assert (
        gen_api_ref.hub_internal_provenance("overview", repo=repo, curated_dir=curated)["sha"]
        == first
    )
    # editing the EN locale file moves it (either file counts)
    (curated / "en").mkdir()
    (curated / "en" / "overview.md").write_text("# Overview\n", encoding="utf-8")
    second = _commit_all(repo, "translate overview to en")
    prov = gen_api_ref.hub_internal_provenance(
        "overview", repo=repo, curated_dir=curated
    )
    assert prov["sha"] == second
    assert prov["sha"] != first


def test_uncommitted_curated_file_falls_back_to_head(tmp_path: Path) -> None:
    repo, curated = _make_repo(tmp_path)
    (curated / "ru").mkdir()
    (curated / "ru" / "overview.md").write_text("# uncommitted\n", encoding="utf-8")
    head = _git(repo, "rev-parse", "HEAD")
    prov = gen_api_ref.hub_internal_provenance(
        "overview", repo=repo, curated_dir=curated
    )
    assert prov["sha"] == head  # nothing committed to anchor to — honest HEAD


def test_no_curated_files_at_all_falls_back_to_head(tmp_path: Path) -> None:
    repo, curated = _make_repo(tmp_path)
    head = _git(repo, "rev-parse", "HEAD")
    prov = gen_api_ref.hub_internal_provenance(
        "ghost", repo=repo, curated_dir=curated
    )
    assert prov["sha"] == head


def test_curated_provenance_routes_hub_internal_entries_to_the_anchor(
    tmp_path: Path, monkeypatch
) -> None:
    """The public entry point: an entry without verified_against.source gets
    the content anchor (not repo HEAD)."""
    repo, curated = _make_repo(tmp_path)
    (curated / "ru").mkdir()
    (curated / "ru" / "overview.md").write_text("# Обзор\n", encoding="utf-8")
    content_commit = _commit_all(repo, "curate overview")
    _unrelated_commit(repo, "later unrelated commit")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", repo)
    monkeypatch.setattr(gen_api_ref, "CURATED_DIR", curated)
    entry = {"slug": "overview", "verified_against": {"path": "docs/api"}}
    prov = gen_api_ref.curated_provenance(entry, pins={})
    assert prov["sha"] == content_commit
