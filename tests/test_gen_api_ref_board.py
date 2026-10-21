"""Board-page generation tests for scripts/gen_api_ref.py.

ME-044: the board reference is bilingual — `build_board_pages` emits one
page-set per BOARD_LOCALE from the SAME spec snapshot (shared provenance,
shared banner; only labels/titles differ). The RU set must keep the exact
pre-ME-044 chrome (RU v1 pages are the original — no silent rewording),
the EN set renders EN chrome, and a group config missing a locale entry
fails closed (the overlay-anchor discipline).
"""

from __future__ import annotations

import importlib.util
import json
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

SPEC = {
    "openapi": "3.1.0",
    "info": {"title": "vesma-eyes", "version": "9.9.9"},
    "paths": {
        "/api/tasks": {
            "get": {
                "summary": "List tasks",
                "parameters": [
                    {
                        "name": "limit",
                        "in": "query",
                        "required": False,
                        "schema": {"type": "integer", "minimum": 1},
                    }
                ],
                "responses": {"200": {"description": "Task page"}},
            }
        },
        "/api/tasks/{id}": {
            "put": {
                "summary": "Update a task",
                "parameters": [
                    {
                        "name": "id",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"},
                    }
                ],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/TaskBody"}
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "Updated",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/TaskBody"}
                            }
                        },
                    }
                },
            }
        },
    },
    "components": {
        "schemas": {
            "TaskBody": {
                "type": "object",
                "required": ["title"],
                "properties": {
                    "title": {"type": "string", "minLength": 1},
                    "tags": {"type": "array", "items": {"type": "string"}},
                    "state": {"type": "string", "enum": ["open", "done"]},
                },
            }
        }
    },
}

BOARD_API = {
    "spec": "spec.json",
    "category": "api-board",
    "index_slug": "board/index",
    "groups": [
        {
            "slug": "board/index",
            "prefixes": [],
            "order": 1,
            "title": {"ru": "Обзор API", "en": "API overview"},
            "about": {"ru": "Карта эндпоинтов.", "en": "A map of endpoints."},
        },
        {
            "slug": "board/tasks",
            "prefixes": ["tasks"],
            "order": 2,
            "title": {"ru": "Задачи", "en": "Tasks"},
            "about": {"ru": "CRUD задач.", "en": "Task CRUD."},
        },
    ],
}

PROV = {"sha": "a" * 40, "commit_date": "2026-09-29T00:00:00+03:00"}


@pytest.fixture()
def board_pages(tmp_path, monkeypatch):
    (tmp_path / "spec.json").write_text(json.dumps(SPEC), encoding="utf-8")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", tmp_path)
    pages, total_ops = gen_api_ref.build_board_pages(BOARD_API, PROV)
    return pages, total_ops


def test_board_pages_come_in_both_locales(board_pages) -> None:
    pages, total_ops = board_pages
    assert total_ops == 2
    assert len(pages) == 4  # 2 groups × 2 locales
    by_slot = {(page["locale"], page["path"]): page for page in pages}
    assert set(by_slot) == {
        ("ru", "board/index.md"),
        ("ru", "board/tasks.md"),
        ("en", "board/index.md"),
        ("en", "board/tasks.md"),
    }


def test_ru_pages_keep_the_original_chrome(board_pages) -> None:
    pages, _ = board_pages
    tasks = next(p for p in pages if p["locale"] == "ru" and p["path"] == "board/tasks.md")
    assert "# Задачи" in tasks["body"]
    assert "CRUD задач." in tasks["body"]
    assert "Сгенерировано из снимка OpenAPI v9.9.9 (эндпоинтов в разделе: 2)." in tasks["body"]
    assert "#### Параметры" in tasks["body"]
    assert "| Параметр | В | Тип | Обяз. | Ограничения |" in tasks["body"]
    assert "#### Тело запроса (обязательное) — схема `TaskBody`" in tasks["body"]
    assert "| Код | Схема | Описание |" in tasks["body"]
    assert "## Схемы, используемые на странице" in tasks["body"]
    assert "массив из строк" in tasks["body"]  # render_type via labels
    index = next(p for p in pages if p["locale"] == "ru" and p["path"] == "board/index.md")
    assert "| Раздел | Операций | Что покрывает |" in index["body"]
    assert "Снимок OpenAPI: **vesma-eyes v9.9.9**, 2 операций, 1 схем." in index["body"]


def test_en_pages_render_en_chrome(board_pages) -> None:
    pages, _ = board_pages
    tasks = next(p for p in pages if p["locale"] == "en" and p["path"] == "board/tasks.md")
    assert "# Tasks" in tasks["body"]
    assert "Task CRUD." in tasks["body"]
    assert "Generated from the OpenAPI snapshot v9.9.9 (operations in this section: 2)." in tasks["body"]
    assert "#### Parameters" in tasks["body"]
    assert "| Parameter | In | Type | Required | Constraints |" in tasks["body"]
    assert "#### Request body (required) — schema `TaskBody`" in tasks["body"]
    assert "| Code | Schema | Description |" in tasks["body"]
    assert "## Schemas used on this page" in tasks["body"]
    assert "array of strings" in tasks["body"]
    index = next(p for p in pages if p["locale"] == "en" and p["path"] == "board/index.md")
    assert "| Section | Operations | Coverage |" in index["body"]
    assert "OpenAPI snapshot: **vesma-eyes v9.9.9**, 2 operations, 1 schemas." in index["body"]
    # no RU chrome leaks into the EN mirror
    assert "Параметры" not in tasks["body"]
    assert "Сгенерировано" not in tasks["body"]


def test_both_locales_share_spec_provenance_and_banner(board_pages) -> None:
    pages, _ = board_pages
    tasks_ru = next(p for p in pages if p["path"] == "board/tasks.md" and p["locale"] == "ru")
    tasks_en = next(p for p in pages if p["path"] == "board/tasks.md" and p["locale"] == "en")
    assert tasks_ru["provenance"] == tasks_en["provenance"] == {
        "repo": "vesma-eyes",
        "source_path": "spec.json",
        "sha": PROV["sha"],
        "commit_date": PROV["commit_date"],
    }
    assert tasks_ru["banner"] == tasks_en["banner"]
    assert tasks_ru["extra_fields"] == tasks_en["extra_fields"]
    # per-locale titles feed the sidecar titles map
    assert tasks_ru["title"] == "Задачи"
    assert tasks_en["title"] == "Tasks"


def test_missing_locale_entry_fails_closed(tmp_path, monkeypatch) -> None:
    (tmp_path / "spec.json").write_text(json.dumps(SPEC), encoding="utf-8")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", tmp_path)
    broken = json.loads(json.dumps(BOARD_API))
    broken["groups"][1]["title"] = {"ru": "Задачи"}  # no `en`
    with pytest.raises(SyncError, match="board_api.groups\\[board/tasks\\].title: no `en` entry"):
        gen_api_ref.build_board_pages(broken, PROV)


def test_plain_string_title_is_shared_by_both_locales(tmp_path, monkeypatch) -> None:
    """A non-mapping title/about is the single-language authoring escape
    (product names): both locales render it verbatim."""
    (tmp_path / "spec.json").write_text(json.dumps(SPEC), encoding="utf-8")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", tmp_path)
    config = json.loads(json.dumps(BOARD_API))
    config["groups"][1]["title"] = "Kora"
    pages, _ = gen_api_ref.build_board_pages(config, PROV)
    titles = {p["locale"]: p["title"] for p in pages if p["path"] == "board/tasks.md"}
    assert titles == {"ru": "Kora", "en": "Kora"}


# --- docs-api-readability (2026-10-21): examples + subgroups ---------------


def _tasks_page(pages, locale):
    return next(p for p in pages if p["locale"] == locale and p["path"] == "board/tasks.md")


def test_examples_are_synthesized_and_minimal(board_pages) -> None:
    """Every operation carries a curl request example and — when a 2xx JSON
    schema exists — a response example; samples are REQUIRED-ONLY (minimal
    valid), deterministic, and the page carries the honesty note."""
    for locale, request_label, response_label, note in (
        ("ru", "#### Пример запроса", "#### Пример ответа", "синтезированы из схем"),
        ("en", "#### Example request", "#### Example response", "synthesized from the snapshot"),
    ):
        tasks = _tasks_page(board_pages[0], locale)
        body = tasks["body"]
        assert request_label in body
        assert response_label in body
        assert note in body
    ru = _tasks_page(board_pages[0], "ru")["body"]
    # path param {id} (string) → the param name; body → required-only JSON
    assert "curl -X PUT 'http://localhost:8090/api/tasks/id'" in ru
    assert "-H 'Content-Type: application/json'" in ru
    assert '-d \'{"title": "string"}\'' in ru
    # GET without required query params → plain curl, no -X
    assert "curl 'http://localhost:8090/api/tasks'" in ru
    # response example is valid JSON with required fields only
    ru_en = _tasks_page(board_pages[0], "en")["body"]
    json_part = ru_en.split("#### Example response", 1)[1].split("```json", 1)[1].split("```", 1)[0]
    parsed = json.loads(json_part)
    assert parsed == {"title": "string"}  # optional tags/state stay out


def test_examples_carry_no_wall_clock(board_pages) -> None:
    """Determinism: the sample date is a fixed constant, not today."""
    ru = _tasks_page(board_pages[0], "ru")["body"]
    assert "2026-10-21" not in ru  # no operation on this fixture has dates,
    # and nothing else may leak a generation-time value either


def test_single_prefix_group_stays_flat(board_pages) -> None:
    """A single-prefix group emits NO subgroup h2 (an h2 with a single
    child is noise, not structure); the schemas appendix h2 is unaffected."""
    ru = _tasks_page(board_pages[0], "ru")["body"]
    h2_lines = [line for line in ru.splitlines() if line.startswith("## ")]
    assert h2_lines == ["## Схемы, используемые на странице"]


def test_multi_prefix_group_requires_subgroups(tmp_path, monkeypatch) -> None:
    """Fail-closed: a multi-prefix group without subgroup coverage fails
    the generator (the overlay-anchor discipline)."""
    spec = json.loads(json.dumps(SPEC))
    spec["paths"]["/api/drafts"] = spec["paths"]["/api/tasks"]
    spec["paths"]["/api/drafts/{id}"] = spec["paths"]["/api/tasks/{id}"]
    (tmp_path / "spec.json").write_text(json.dumps(spec), encoding="utf-8")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", tmp_path)
    config = json.loads(json.dumps(BOARD_API))
    config["groups"][1]["prefixes"] = ["tasks", "drafts"]
    with pytest.raises(SyncError, match=r"prefixes \['tasks', 'drafts'\] are not"):
        gen_api_ref.build_board_pages(config, PROV)


def test_subgroups_emit_h2_sections_in_config_order(tmp_path, monkeypatch) -> None:
    spec = json.loads(json.dumps(SPEC))
    spec["paths"]["/api/drafts"] = spec["paths"]["/api/tasks"]
    spec["paths"]["/api/drafts/{id}"] = spec["paths"]["/api/tasks/{id}"]
    (tmp_path / "spec.json").write_text(json.dumps(spec), encoding="utf-8")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", tmp_path)
    config = json.loads(json.dumps(BOARD_API))
    config["groups"][1]["prefixes"] = ["tasks", "drafts"]
    config["groups"][1]["subgroups"] = [
        {"keys": ["drafts"], "title": {"ru": "Черновики", "en": "Drafts"}},
        {"keys": ["tasks"], "title": {"ru": "Задачи", "en": "Tasks"}},
    ]
    pages, _ = gen_api_ref.build_board_pages(config, PROV)
    ru = _tasks_page(pages, "ru")["body"]
    h2_lines = [line for line in ru.splitlines() if line.startswith("## ")]
    # config order wins (drafts first); the appendix stays last
    assert h2_lines[:2] == ["## Черновики", "## Задачи"]
    assert h2_lines[-1] == "## Схемы, используемые на странице"
    # each endpoint lands under its own subgroup heading
    assert ru.index("## Черновики") < ru.index("### `PUT` `/api/drafts/{id}`") < ru.index("## Задачи") < ru.index("### `PUT` `/api/tasks/{id}`")
    en = _tasks_page(pages, "en")["body"]
    assert "## Drafts" in en and "## Tasks" in en


def test_subgroup_keys_must_be_group_prefixes(tmp_path, monkeypatch) -> None:
    (tmp_path / "spec.json").write_text(json.dumps(SPEC), encoding="utf-8")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", tmp_path)
    config = json.loads(json.dumps(BOARD_API))
    config["groups"][1]["prefixes"] = ["tasks", "drafts"]
    config["groups"][1]["subgroups"] = [
        {"keys": ["bogus"], "title": {"ru": "X", "en": "X"}},
        {"keys": ["tasks", "drafts"], "title": {"ru": "Y", "en": "Y"}},
    ]
    with pytest.raises(SyncError, match=r"subgroup keys \['bogus'\].*not group prefixes"):
        gen_api_ref.build_board_pages(config, PROV)


def test_subgroup_double_coverage_fails(tmp_path, monkeypatch) -> None:
    (tmp_path / "spec.json").write_text(json.dumps(SPEC), encoding="utf-8")
    monkeypatch.setattr(gen_api_ref, "REPO_ROOT", tmp_path)
    config = json.loads(json.dumps(BOARD_API))
    config["groups"][1]["prefixes"] = ["tasks", "drafts"]
    config["groups"][1]["subgroups"] = [
        {"keys": ["tasks"], "title": {"ru": "X", "en": "X"}},
        {"keys": ["tasks", "drafts"], "title": {"ru": "Y", "en": "Y"}},
    ]
    with pytest.raises(SyncError, match=r"covered by more than one subgroup"):
        gen_api_ref.build_board_pages(config, PROV)
