// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { KoraTranscript } from "./KoraTranscript";
import type { KoraTranscriptItem } from "./koraTypes";
import type { KoraTranscriptPages } from "./useKora";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The transcript-ux grammar (owner directive 2026-10-10): the dialog vs
 * raw-walk split (the tool row folds under the answer that spawned it),
 * the scarlet redaction marks at BOTH placements (anchor row + raw row),
 * the query/answer strata washes, and the search force-open (a match
 * inside a collapsed fold would hide the very line the searcher asked
 * for). The wire STATE MACHINE is pinned in useTranscriptWires.test.tsx.
 */

function item(
  partial: Partial<KoraTranscriptItem> &
    Pick<KoraTranscriptItem, "seq" | "role" | "content">,
): KoraTranscriptItem {
  return {
    kind: null,
    ts: "2026-09-24T09:12:20Z",
    redaction_applied: false,
    ...partial,
  };
}

/** user → assistant → its redacted tool row → user → a redacted ANSWER:
 * covers every grouping shape (bare anchors, anchor+fold, scarlet anchor)
 * in five frozen rows. */
const ITEMS: readonly KoraTranscriptItem[] = [
  item({ seq: 1, role: "user", content: "Разведай структуру ридера zcode-стора." }),
  item({
    seq: 2,
    role: "assistant",
    content: "Стор — db.sqlite; ридеру достаточно mode=ro.",
  }),
  item({
    seq: 3,
    role: "tool",
    kind: "file_read",
    ts: "2026-09-24T09:13:40Z",
    content: "read server/kora/zcode_reader.py — [redacted: path]",
    redaction_applied: true,
  }),
  item({ seq: 4, role: "user", ts: "2026-09-24T11:40:10Z", content: "Тесты зелёные?" }),
  item({
    seq: 5,
    role: "assistant",
    ts: "2026-09-24T11:41:00Z",
    content: "Да, 12 passed.",
    redaction_applied: true,
  }),
];

function pages(items: readonly KoraTranscriptItem[]): KoraTranscriptPages {
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
  options: { query?: string; items?: readonly KoraTranscriptItem[] } = {},
): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <KoraTranscript
          sessionId="s"
          pages={pages(options.items ?? ITEMS)}
          follow={false}
          query={options.query ?? ""}
        />
      </I18nProvider>,
    );
  });
  return container;
}

function anchor(container: HTMLElement, seq: number): HTMLElement {
  const found = container.querySelector<HTMLElement>(`#kora-anchor-${seq}`);
  if (found === null) throw new Error(`anchor #kora-anchor-${seq} not rendered`);
  return found;
}

afterEach(async () => {
  while (mountedRoots.length > 0) {
    const root = mountedRoots.pop();
    if (root !== undefined) await actUnmount(root);
  }
  document.body.innerHTML = "";
});

describe("KoraTranscript (transcript-ux grammar)", () => {
  it("folds the raw walk under the answer that spawned it", () => {
    const container = mountTranscript();
    // Four dialog anchors (seq 1/2/4/5), each with its DOM wire id.
    expect(container.querySelectorAll("li[id^='kora-anchor-']")).toHaveLength(4);
    // Exactly ONE fold — the tool row belongs to the seq-2 answer.
    const folds = container.querySelectorAll("details");
    expect(folds).toHaveLength(1);
    const fold = folds[0] as HTMLDetailsElement;
    expect(fold.id).toBe("kora-fold-2");
    expect(fold.hasAttribute("open")).toBe(false); // collapsed by default
    expect(fold.textContent).toContain("Сырой ход");
    expect(fold.textContent).toContain("1"); // the honest count
    // The tool row rides INSIDE the fold, with its kind tag.
    expect(fold.textContent).toContain("zcode_reader.py");
    expect(fold.textContent).toContain("file_read");
  });

  it("marks redaction scarlet at BOTH placements (anchor row + raw row)", () => {
    const container = mountTranscript();
    // Two marks: the seq-3 raw row (inside the fold) + the seq-5 answer.
    const marks = Array.from(container.querySelectorAll("p")).filter((p) =>
      p.textContent?.includes("маскировано"),
    );
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.className).toContain("text-error-text"); // the U7 step
      expect(mark.querySelector("span")?.textContent).toContain("🔒");
    }
    // The scarlet row overrides the role wash on the redacted answer.
    const scarlet = anchor(container, 5).className;
    expect(scarlet).toContain("border-error");
    expect(scarlet).toContain("bg-error-wash");
    expect(scarlet).not.toContain("border-confidence");
  });

  it("distinguishes query from answer by the strata washes + hue accent", () => {
    const container = mountTranscript();
    expect(anchor(container, 1).className).toContain("border-iris");
    expect(anchor(container, 1).className).toContain("bg-strata-memory");
    expect(anchor(container, 2).className).toContain("border-confidence");
    expect(anchor(container, 2).className).toContain("bg-strata-agents");
    expect(anchor(container, 4).className).toContain("bg-strata-memory");
  });

  it("search mode force-opens the fold and never renders a dead jump button", () => {
    // The needle matches ONLY the seq-3 tool row — the anchor lives on the
    // "previous page", so the fold renders standalone and MUST be open.
    const container = mountTranscript({ query: "zcode_reader" });
    const fold = container.querySelector("details");
    if (fold === null) throw new Error("standalone fold not rendered");
    expect(fold.hasAttribute("open")).toBe(true);
    // No anchor on this page → the row is plain text, no dead button.
    expect(fold.querySelectorAll("button")).toHaveLength(0);
  });

  it("keeps the polite spotlight announcement region mounted", () => {
    const container = mountTranscript();
    const live = container.querySelector("p[role='status'][aria-live='polite']");
    if (live === null) throw new Error("announcement region not rendered");
    expect(live.className).toContain("sr-only");
    expect(live.textContent).toBe(""); // quiet until a wire fires
  });
});
