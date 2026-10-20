// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { HermesTranscript } from "./KoraHermesSource";
import type { HermesMessage } from "./koraTypes";
import type { KoraHermesTranscriptPages } from "./useKora";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The hermes scroll leg of the transcript-ux grammar: the hermes bridge
 * transcript (the surface the owner directive 2026-10-10 names) rides the
 * SAME pieces as the zcode scroll — the dialog/raw-walk grouping, the
 * strata washes, the SCARLET redaction mark (the pre-wave hermes mark was
 * a quiet muted line — a card-level violation, fixed here) and the wire
 * affordances. The hermes passthrough (kind tag, reasoning fold, tool-call
 * names) stays rendered on its own row, outside the raw-walk fold.
 */

function message(
  partial: Partial<HermesMessage> &
    Pick<HermesMessage, "seq" | "role" | "content">,
): HermesMessage {
  return {
    kind: null,
    ts: "2026-10-10T12:00:00Z",
    redaction_applied: false,
    ...partial,
  };
}

/** user → assistant(tool_call: reasoning + 2 calls) → its redacted tool
 * result → the assistant's summary: the fold lands on the tool_call row,
 * the passthrough stays on it, the result rides inside the fold. */
const ITEMS: readonly HermesMessage[] = [
  message({ seq: 1, role: "user", content: "Покажи статус туннеля и журнал." }),
  message({
    seq: 2,
    role: "assistant",
    kind: "tool_call",
    content: "Снимаю статус и хвост журнала одним проходом.",
    reasoning: "Статус и журнал отвечают на разные вопросы — два вызова подряд.",
    tool_calls: [
      { function: { name: "hysteria_status", arguments: "{}" } },
      { function: { name: "journal_tail", arguments: "{}" } },
    ],
  }),
  message({
    seq: 3,
    role: "tool",
    kind: "tool_result",
    content: "journal_tail → …auth token: [REDACTED] upstream=443",
    redaction_applied: true,
  }),
  message({ seq: 4, role: "assistant", content: "Туннель зелёный, ошибок нет." }),
];

function pages(items: readonly HermesMessage[]): KoraHermesTranscriptPages {
  return {
    items: [...items],
    hasMore: false,
    isPending: false,
    isLoadingMore: false,
    error: null,
    loadMore: async () => {},
    refetch: async () => {},
  };
}

const mountedRoots: Root[] = [];

function mountTranscript(
  options: { query?: string; items?: readonly HermesMessage[] } = {},
): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <HermesTranscript
          sessionId="hermes:api-server-main"
          pages={pages(options.items ?? ITEMS)}
          follow={false}
          query={options.query ?? ""}
        />
      </I18nProvider>,
    );
  });
  return container;
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    if (root !== undefined) await actUnmount(root);
  }
  document.body.innerHTML = "";
});

describe("HermesTranscript (transcript-ux grammar, hermes leg)", () => {
  it("folds the raw walk under the tool_call row; the passthrough stays on its own row", () => {
    const container = mountTranscript();
    // Three dialog anchors (seq 1/2/4), ONE fold — the tool result belongs
    // to the seq-2 tool_call row that spawned it.
    expect(container.querySelectorAll("li[id^='kora-anchor-']")).toHaveLength(3);
    const fold = container.querySelector("#kora-fold-2");
    if (fold === null) throw new Error("fold #kora-fold-2 not rendered");
    expect((fold as HTMLDetailsElement).hasAttribute("open")).toBe(false);
    expect(fold.textContent).toContain("Сырой ход");
    expect(fold.textContent).toContain("1"); // the honest count
    expect(fold.textContent).toContain("[REDACTED]");
    // The passthrough beats ride the ANCHOR row (outside the fold).
    const anchor2 = container.querySelector("#kora-anchor-2");
    if (anchor2 === null) throw new Error("anchor #kora-anchor-2 not rendered");
    expect(anchor2.textContent).toContain("Размышления");
    expect(anchor2.textContent).toContain("Вызовы инструментов: 2");
    expect(anchor2.textContent).toContain("hysteria_status");
  });

  it("marks the redacted raw row SCARLET — the loud mark, not the quiet muted line", () => {
    const container = mountTranscript();
    const marks = Array.from(container.querySelectorAll("p")).filter((p) =>
      p.textContent?.includes("маскировано"),
    );
    expect(marks).toHaveLength(1);
    const mark = marks[0] as HTMLElement;
    expect(mark.className).toContain("text-error-text"); // the U7 step
    expect(mark.className).not.toContain("text-foreground-muted");
    expect(mark.querySelector("span")?.textContent).toContain("🔒");
    // Raw rows carry the scarlet MARK (the row wash is the anchors'
    // grammar) — the row itself keeps the neutral raw-walk style.
    const fold = container.querySelector("#kora-fold-2");
    if (fold === null) throw new Error("fold missing");
    const rawRow = fold.querySelector("li");
    expect(rawRow?.className).not.toContain("border-error");
  });

  it("distinguishes query from answer by the strata washes", () => {
    const container = mountTranscript();
    const anchor1 = container.querySelector("#kora-anchor-1");
    const anchor2 = container.querySelector("#kora-anchor-2");
    if (anchor1 === null || anchor2 === null) throw new Error("anchors missing");
    expect(anchor1.className).toContain("bg-strata-memory");
    expect(anchor1.className).toContain("border-iris");
    expect(anchor2.className).toContain("bg-strata-agents");
    expect(anchor2.className).toContain("border-confidence");
  });

  it("a read starting mid-walk renders the standalone fold, open under search, no dead button", () => {
    const head = ITEMS.filter((item) => item.seq === 3); // the redacted result only
    const container = mountTranscript({ items: head, query: "REDACTED" });
    const fold = container.querySelector("details");
    if (fold === null) throw new Error("standalone fold not rendered");
    expect(fold.hasAttribute("open")).toBe(true);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("keeps the polite spotlight announcement region mounted", () => {
    const container = mountTranscript();
    const live = container.querySelector("p[role='status'][aria-live='polite']");
    if (live === null) throw new Error("announcement region not rendered");
    expect(live.className).toContain("sr-only");
    expect(live.textContent).toBe("");
  });
});
