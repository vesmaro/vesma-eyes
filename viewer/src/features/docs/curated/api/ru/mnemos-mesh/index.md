---
title: vesma-mesh — публичного HTTP API нет
---

# vesma-mesh: публичного HTTP API нет

У vesma-mesh нет публичного HTTP API — выдумывать референс здесь было бы
нечестно. Меш спроектирован как «глупый транспорт»: узлы обмениваются уже
обработанными записями по внутренним контрактам, модерация и хранилище
остаются в vesma.

## Что существует вместо публичного API

| Поверхность | Что это | Где определено |
|---|---|---|
| Внутренний core-API | gRPC через Unix-сокет между мешом и mnemos: запись/чтение уже обработанных конвертов, без расшаренной SQLite | [`proto/mnemos_core_api.proto`](https://github.com/vesmaro/vesma-mesh/blob/03b570ea1e835b2234d8c4c9c52122219f02d1ef/proto/mnemos_core_api.proto) |
| Пиринговая федерация | контракт «узел ↔ узел» поверх mTLS: per-peer ACL, батч-синк, опосредованная выдача | [`proto/federation.proto`](https://github.com/vesmaro/vesma-mesh/blob/03b570ea1e835b2234d8c4c9c52122219f02d1ef/proto/federation.proto) |
| Внутренние релеи | транспортные контракты пересылки (assignment/relay-ноги) — деталь реализации, не внешний контракт | каталог [`proto/`](https://github.com/vesmaro/vesma-mesh/tree/03b570ea1e835b2234d8c4c9c52122219f02d1ef/proto) |

## Поверхность оператора

Оператор узла работает не с API, а с конфигурацией и документацией:

- `mesh.yaml` — все поля настроек узла:
  [справочник конфигурации](mnemos-mesh/user/configuration);
- запуск и проверка канала: [getting started](mnemos-mesh/user/getting-started);
- эксплуатация и безопасность: [runbook](mnemos-mesh/admin/runbook),
  [модель доверия](mnemos-mesh/admin/security).

Заметка сверена с репозиторием vesma-mesh по пину (бейдж страницы);
изменение контрактов видно драфт-проверкой `gen_api_ref.py check-drift`.
