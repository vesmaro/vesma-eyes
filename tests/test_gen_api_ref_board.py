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
    assert "**Параметры**" in tasks["body"]
    assert "| Параметр | В | Тип | Обяз. | Ограничения |" in tasks["body"]
    assert "**Тело запроса (обязательное)** — схема `TaskBody`" in tasks["body"]
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
    assert "**Parameters**" in tasks["body"]
    assert "| Parameter | In | Type | Required | Constraints |" in tasks["body"]
    assert "**Request body (required)** — schema `TaskBody`" in tasks["body"]
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
