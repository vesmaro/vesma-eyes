# Agents Workspace IDE — Blueprint (stages 1–3)

> Status: DRAFT, 2026-10-22, wave agents-workspace-ide. GCW design-lead.
> Sources: owner brief «вкладка "Сплетения зоны" сбивает с толку» + directive 2026-10-21
> (CENTER = working field, RIGHT = meta-panel); code: viewer/src/features/agents/
> HostsWorkspace.tsx, HostHarnesses.tsx, ExecutorMenu.tsx, ExecutionPage.tsx, app/routes.tsx;
> doctrine: docs/design/02-TOKENS.md v2.0, 06-MOTION.md v2.0, 07l-KORA-FRAME.

## 1. Current IA — what lives where

Routes under /agents (routes.tsx §294–313): hosts/:host? (default landing, A1
«каркас-инверсия»: field | seam | roster), execution (presence strip + assignment
list + UI-10 feed), harnesses (connect conveyor + registry). Execution settings
live in the Settings hub (ExecutionSettingsSection); the first-line routing
verdict renders via useExecutionWarning.

The selected-host field (HostField) stacks: zone header (lore caps label «зона
коры» + name + lifecycle badge + stats + actions) → state block → «Сейчас»
(active assignments + live sessions) → «Сплетения зоны» → «Недавно» (24h strip
+ activity feed).

«Сплетения зоны» technically = HostHarnesses: one accordion row per harness
executor (presence, name, harness type, refusal badge, 4 ME-064 inventory
counters, sessions-24h, exec-env badge); the expansion mounts the FULL
ExecutorSheetForm with the freeze/stamp discipline. The owner reads the section
header as a tab and cannot tell it is the harness operations workbench.

## 2. Dissolve map («Сплетения зоны» → where each piece goes)

| Today (inside the accordion section) | Goes to |
| ------------------------------------ | ------- |
| Harness glance rows (presence, name, type, exec-env, refusal) | CENTER: compact harness chip strip under the field header |
| Harness mutations (full ExecutorSheetForm workbench) | Overlay: ExecutorSheet drawer OVER the field (same component as /agents/harnesses — parity by construction) |
| Quick operations (approve/enable/revoke/delete/copy) | ExecutorMenu on each chip (component exists, two mounting modes) |
| «нейронов: N» counter, lore structural labels | DIES from structure; lore dictionary survives in tooltips only |
| zoneEmpty honest line | Stays as the honest line of the harness chip strip |
| «Подключить харнес» entry | Stays contextual on the strip + roster CTA (already duplicated by design) |

Not part of the accordion, moved by the same directive:

- «Недавно» (24h pulse strip + feed, host-scoped) → RIGHT meta-panel, block «Пульс».
- Host roster → RIGHT meta-panel, block «Присутствие» (unchanged listbox + filters).
- First-line settings (routing verdict line + quiet hub links) → RIGHT meta-panel, block «Настройки».

## 3. Direction

CENTER is always the working field: host header → harness chip strip (context
operations) → sessions + embedded chat as the primary content → «Сейчас»
assignments compact. The field never hosts a settings accordion again.
RIGHT is the meta-panel: Присутствие / Пульс / Настройки — one panel scroll,
seam stays KoraResizeHandle. Lore = one caps accent per surface, never structure.
Frame discipline (07l): 100vh, no page scroll ≥xl, internal scrolls only,
«стык без зазора», persist seam width on commit — all already canonical in A1.

## 4. Layout (≥xl wireframe)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Хосты  машин: N · на связи: M · требуют внимания: K          [+ Подключить] │
├───────────────────────────────────────────────┬──────────────────────────┤
│ CENTER (working field, internal scroll)        │ META-PANEL                │
│ ─ header: [зона коры]caps Имя · badge · stats  │ ─ Присутствие             │
│   [Дать задачу] [Проверка связи]               │   roster listbox+фильтры  │
│ ─ Харнесы: ◉ api_server (distrobox) ⋯  ◉ …     │ ─ Пульс                   │
│   chips: dot·name·env·refusal; ⋯ = menu,       │   24h strip + fresh feed  │
│   click = settings drawer (ExecutorSheet)      │   (host-scoped)           │
│ ─ Сессии: live sessions → selected =           │ ─ Настройки (свёрнут)     │
│   readonly transcript preview + mini-meta      │   routing verdict + links │
│   [Открыть в Корe] · session op context menu   │                           │
│ ─ Сейчас: active assignments (compact rows)    │ ← KoraResizeHandle seam → │
└───────────────────────────────────────────────┴──────────────────────────┘
```

## 5. Reuse map (nothing re-implemented)

- ExecutorMenu (context menu, controlled + trigger modes) — chip operations.
- ExecutorSheet / ExecutorSheetForm — the harness drawer (same freeze/stamp).
- KoraTranscript + useTranscriptWires — the embedded session preview, READ-ONLY
  (the chat surface lives ONLY in Kora — coordination §9, docs/design/kora/blueprint.md).
- CreateTaskDialog — «Дать задачу» wizard (pre-pointed at primary executor).
- ExecutorLinkCheck — the link verdict action.
- useActivityFeed/useActivityBuckets/buildPulseAxis — the Пульс block.
- HostsRosterList (listbox), HostFilterChips, HostRibbon, presenceLight,
  KoraResizeHandle, kora-scroll, rosterModel — unchanged carriers.

## 6. Responsive (A2 ladder preserved)

- ≥xl: the A1 frame; meta-panel right of the seam.
- md..xl: honest page scroll; host ribbon stays the quick selector; «Пульс»
  collapses into a section under the field; roster stays in the sheet;
  settings live in the hub only.
- <768: single column; roster sheet fullscreen (exists); the embedded chat
  goes fullscreen below sm (Kora precedent); meta accessible via the sheet.

## 7. Motion & perf risks

- NO ambient in the working field: the honest-light canon holds — only
  presenceLight one-shot flares + duration-instant tints; no breathing, no
  glow sources in the center (glow budget ≤2 per viewport is spent elsewhere).
- Two SSE streams in one frame (agents bridge + kora session): mount the
  kora gateway/transcript ONLY while a session is selected; unmount on switch.
  The 1 Hz ticker stays the single shared one.
- ExecutorSheetForm is heavy (7 sections): mount on drawer open, never in chips.
- All new transitions: duration-fast/normal, enter/exit pair, reduced-motion
  table 06 §7 applies; the 24h strip stays static divs, never canvas.

## 8. Acceptance criteria (worker gates)

1. agents.hosts.zoneStructureTitle renders NOWHERE; «сплетение»/«нейрон» absent
   from structural labels; exactly ONE lore accent per surface; i18n ru+en synced.
2. Every harness mutation reachable in ≤2 interactions from the center;
   parity with /agents/harnesses (same form, freeze/stamp, useExecutorMutations
   gate, server-text toasts).
3. The state matrix (states.md) covered by tests: snapshots + a11y (roster
   listbox, h2 focus on host change, Radix overlay focus, ≥48px touch <768).
4. ≥xl page never scrolls; A2 ribbon/sheet tests keep passing; the session
   route is deep-linkable; /kora/:sessionId keeps working.
5. No ambient motion in the center; reduced-motion honoured; glow budget kept.
6. Kora stream mounted only with a selected session; no per-frame allocations
   beyond the existing ticker pattern.

## 9. Coordination with kora-rethink (2026-10-22, binding)

The chat surface lives ONLY in Kora (docs/design/kora/blueprint.md §9).
W3 «Session in the center» is a READ-ONLY preview: transcript + mini-meta +
[Открыть в Корe] primary CTA; no composer, no pult, no model picker in the
Agents field — ever, regardless of wave order. W3 runs AFTER Kora KW1
(the «Открыть в Корe» target is the new three-zone Kora frame). Shared
components: KoraTranscript/HermesTranscript, useTranscriptWires,
KoraResizeHandle, koraFrameStorage, KoraGatewayContext, EmptyState/HonestLine.
Routes /kora/:sessionId and /agents/hosts/:host/sessions/:sessionId coexist,
both deep-linkable; Kora is canonical for chat.
