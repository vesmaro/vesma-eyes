# Agents Workspace IDE — State Matrix

## 1. Center (working field) states

| ID | Condition | Center renders | Transitions |
| -- | --------- | -------------- | ----------- |
| S-EMPTY | roster empty | canonical empty state + connect CTA (exists) | → harnesses?connect=1 |
| S-PENDING | registry read in flight | skeleton, NO numbers (honest) | → any |
| S-ERROR | 5xx/transport | error + retry (gates are NOT the frame) | retry |
| S-NOT-FOUND | URL host projects to nothing | not-found + back to roster (exists) | panel keeps working |
| S-HOST-DEAD | off/disabled/provisioning/revoked | header + lifecycle state block (+ reconnect CTA on revoked) | «Дать задачу» disabled with reason |
| S-HOST-IDLE | host selected, no live sessions | header + harness chips + «Сейчас» + honest idle lines | select session → S-HOST-LIVE path |
| S-HOST-LIVE | live sessions exist, none selected | + live session list (dot, harness, label) | click row → S-SESSION |
| S-SESSION | host + session selected | KoraTranscript + chat pult; session op menu; «открыть в Коре» | Esc/close → S-HOST-LIVE |
| S-OP-* | any overlay | ExecutorMenu / ExecutorSheet drawer / CreateTaskDialog / ExecutorLinkCheck — Radix owns focus | Esc closes the top overlay |

## 2. Right meta-panel blocks (≥xl)

| Block | Content | Collapsed default |
| ----- | ------- | ----------------- |
| Присутствие | roster listbox + filter chips (all/attention/decision/archive) — unchanged | expanded |
| Пульс | 24h hourly strip + freshest activity rows, host-scoped (moved from the field) | expanded |
| Настройки | routing-pair verdict line (useExecutionWarning) + quiet links to the hub sections | collapsed |

## 3. Routing

- /agents/hosts/:host? — unchanged.
- /agents/hosts/:host/sessions/:sessionId — NEW (W3): selection in the URL,
  one frame element, no re-assembly on change (A1 contract).
- /agents/execution, /agents/harnesses, /kora/:sessionId — paths untouched;
  existing links and bookmarks survive.

## 4. Overlays (operations, one posture each)

| Overlay | Component | Entry |
| ------- | --------- | ----- |
| Harness quick ops | ExecutorMenu (controlled) | chip ⋯ / right-click |
| Harness full workbench | ExecutorSheet (drawer) | chip click |
| Give a task | CreateTaskDialog | field header button |
| Link verdict | ExecutorLinkCheck | field header / menu |

## 5. Разрезка на волны реализации (из blueprint, сводка)

| Волна | Что | Размер |
| ----- | --- | ------ |
| W1 «Распустить сплетения» | Убрать аккордеон-секцию; чипы харнесов в центре; операции через ExecutorMenu; полная работа — шторка ExecutorSheet; i18n-чистка лора (ru/en) | M |
| W2 «Мета-панель» | Правая панель: Присутствие + Пульс (перенос «Недавно») + Настройки первой линии; сворачиваемые блоки; md..xl пере-лестница | M |
| W3 «Сессия в центре» | Роут sessions/:sessionId; ленивые KoraTranscript+пульт в поле; контекст-меню операций сессии; deep-link синхронизация с /kora | L |

Порядок W1→W2→W3. Решения по открытым вопросам blueprint (приняты ТЛ по рекомендациям Design Lead, докладываются владельцу):
1. Фильтры ростера в «Присутствии» остаются как есть (рабочие инструменты диспетчера); блоки панели сворачиваемые, дефолт: Присутствие и Пульс развёрнуты, Настройки свёрнут.
2. Единственный лор-акцент — капс «зона коры» над именем хоста + словарь в тултипах; «ядро/путь» (задел Z2/Z3) остаются неканонизированными и не рендерятся.
