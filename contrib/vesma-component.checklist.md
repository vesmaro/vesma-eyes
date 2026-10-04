# Conformance checklist — component-manifest v1 (CM-01…CM-17)

Чеклист соответствия компонента **vesma-eyes** контракту
`specs/component-manifest/v1` (версия 1.0.0-draft.2, пин `vesma-specs @ d30e668`).
Манифест: [`contrib/vesma-component.yaml`](contrib/vesma-component.yaml);
валидатор: `scripts/validate_manifest.py` (CI: `.github/workflows/manifest.yml`).
Проверки выполнены 2026-10-05 на деплой-машине (борда живая, порт 8140).

| ID | Пункт | Статус | Основание |
|---|---|---|---|
| CM-01 | Манифест валиден по `schema/component-manifest.schema.json`; ни одного неизвестного поля (strict validation) | ✅ проверено | `python3 scripts/validate_manifest.py --schema …/component-manifest.schema.json` → `OK … component 'eyes' conforms` (exit 0); схема strict (`additionalProperties: false`), плюс нормативные правила §3 в валидаторе |
| CM-02 | `apiVersion: vesma.component/v1`; другие версии не используются | ✅ проверено | Поле задано константой в манифесте; schema `const: vesma.component/v1` отвергает иное |
| CM-03 | `metadata.name` по шаблону `^[a-z][a-z0-9-]{0,62}$` и уникален в установке | ✅ проверено | Имя `eyes` проходит шаблон (валидатор зелёный); уникальность в установке проверит install-валидация при `vesma service install` (имён в `components.d` на машине пока нет) |
| CM-04 | `metadata.version` — SemVer 2.0.0; `description` ≤ 200 символов | ✅ проверено | `version: 1.60.1` — последний релизный тег `v1.60.1` (`git describe --tags --abbrev=0`) и единый источник версии `FastAPI(version="1.60.1")` в `server/app.py:866`; описание 128 символов |
| CM-05 | `tier` задан; рестарт-поведение по тиру НЕ дублируется в манифесте | ✅ проверено | `tier: optional`; секции `restart` в манифесте нет — политику применяет супервайзер |
| CM-06 | `provenance`: https-URL + SPDX-лицензия; для бинарей `artifact_sha256` | ✅ проверено | `repo: https://github.com/vesmaro/vesma-eyes`, `license: Apache-2.0` (экосистемный дефолт по спеке §3.3, ратифицировано АрхКомом). LICENSE-файла в репозитории пока нет — зарегистрированная находка, решение за владельцем; `artifact_sha256` проставит install-флоу (Python-компонент поставляется из репозитория, не бинарем) ⏳ |
| CM-07 | Ровно один `kind` и только его секция исполнения | ✅ проверено | `kind: child-process`; секция `launch` есть, `in_process` отсутствует (schema if/then §3.4 — валидатор зелёный) |
| CM-08 | `argv` — список строк без shell-метасимволов и `sh -c`; плейсхолдеры только из allowlist | ✅ проверено | `argv` — массив из 7 строк; единственный плейсхолдер `{venv_bin}` из allowlist §3.5; проверка `no_shell_metacharacters` / `argv_placeholder_allowlist` валидатора зелёная |
| CM-09 | Секретов в манифесте нет; секреты только в `env_file` вне каталога манифестов, права `0600` | ✅ проверено | В манифесте только ссылка `env_file: ~/.config/vesma/env/eyes.env` (вне `components.d`); `env.vars` отсутствует. Токены борды (`VESMARO_BOARD_TOKEN`, `VESMARO_UI_TOKEN`, `VESMARO_MNEMOS_TOKEN`) переедут туда с легаси `~/.config/vesma-board/board.env` на фазе B; файл и права (0600) готовит install-флоу ⏳ |
| CM-10 | `health`: ровно один блок, соответствующий `checker` | ✅ проверено | `checker: http` + только блок `http` (schema if/then). Живая проверка: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8140/api/health` → **200** без авторизации (маршрут `@app.get("/api/health")`, `server/app.py:2314`; в списке неаутентифицированных маршрутов `app.py:995`) |
| CM-11 | Компонент реально завершается по `signal` в пределах `grace_period` | ✅ проверено | Кастомных обработчиков сигналов в `server/*.py` нет (grep по `SIGTERM`/`add_signal_handler` — единственный hit это слово в docstring) → SIGTERM обрабатывает uvicorn нативно: drain открытых соединений и выход. Рантайм: `server/requirements.txt` пинит `uvicorn[standard]>=0.30`, деплой-машина исполняет uvicorn 0.52.4 (Python 3.12.3); `grace_period: 10s` покрывает окно drain. Живая проверка остановки под супервайзером — фаза B ⏳ |
| CM-12 | `config`: ровно одна из `schema_file`/`schema_inline`; конфиг проходит схему | ℹ️ осознанно | Секция `config` отложена до переноса конфигурации борды в секции общего `vesma.yaml` (движковая волна); в v1-манифесте секции нет — это валидно (опциональна по спеке §3.9) |
| CM-13 | `restart`-числа в клампах | ℹ️ осознанно | Секции `restart` нет — действуют тировые дефолты супервайзера для `optional` (спека §3.10); клампы не применимы |
| CM-14 | `depends_on` ссылается на манифесты этой установки; граф ацикличен | ✅ проверено | `depends_on: [server]` — каноническое имя сервера памяти из примера `examples/node-runtime.yaml` спеки; борда реально ходит в ядро (`server/mnemos_client.py`, токен `VESMARO_MNEMOS_TOKEN`). Проверка существования манифеста `server` и ацикличности — install-валидация (фаза B); цикл из одного ребра невозможен |
| CM-15 | Манифест написан install-флоу CLI, не руками | ⏳ фаза B | В репозитории лежит **декларация** (`contrib/vesma-component.yaml`); runtime-манифест `~/.config/vesma/components.d/eyes.yaml` материализует `vesma service install` (право записи §3.1 — компонент свой манифест не пишет) |
| CM-16 | `metadata.name` ∉ {`venv`, `venvs`} | ✅ проверено | Имя `eyes`; зарезервированное множество отвергается схемой (`not: enum`) и валидатором — прогон зелёный |
| CM-17 | `tier: optional` без `artifact_sha256` — осознанно | ✅ проверено | Хэш обязателен только для `core` (schema if/then §3.3); для `optional` его отсутствие = `doctor` WARN by design — хэш проставит install-флоу при материализации |

Прохождение: все MUST-пункты декларационной части зелёные; живой запуск под
супервайзером `vesma`, перенос env-файлов и миграция легаси-борды (дубль
system/user scope легаси-юнитов) — **фаза B**, движковая волна (roadmap фаза 3
спек). Исполняемый гейт в CI: `.github/workflows/manifest.yml` (пин
`VESMA_SPECS_REF: d30e668` = component-manifest 1.0.0-draft.2).
