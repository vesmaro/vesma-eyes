// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { KoraEther } from "./KoraEther";
import { useKoraEtherRows } from "./useKoraEther";
import { etherRows, pushEtherEvent, resetEtherForTests } from "./koraEtherStore";
import type { BoardEvent } from "@/gateway/events";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The Эфир лента (U5): the honest empty on a silent bus, live arrivals with
 * the flash class, restored rows WITHOUT the flash (the flash is a
 * LIVE-arrival beat, not decoration), and the page's ONE host filter. The
 * live test rides the REAL wire (useKoraEtherRows → the ring → the rows
 * prop growing while mounted) — the same path the workspace uses.
 */

function online(host: string): BoardEvent {
  return {
    kind: "executor.online",
    executor: {
      id: "exec-1",
      name: "zcode@box",
      harness: "zcode",
      host,
      transport: "local-poll",
      capabilities: [],
      presence: "online",
    },
    prev_state: null,
    state: "online",
    last_seen_at: "2026-10-08T10:00:00Z",
  } as BoardEvent;
}

const mountedRoots: Root[] = [];

/** The workspace-shaped harness: the ring feeds the rows prop live. */
function EtherHarness({ hostFilter }: { hostFilter?: string | null }): React.ReactElement {
  const rows = useKoraEtherRows();
  return <KoraEther rows={rows} hostFilter={hostFilter} className="flex min-h-0 flex-col" />;
}

function mountEther(
  props: Parameters<typeof KoraEther>[0],
  live = false,
): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        {live ? (
          <EtherHarness hostFilter={props.hostFilter} />
        ) : (
          <KoraEther {...props} />
        )}
      </I18nProvider>,
    );
  });
  return { container, root };
}

beforeEach(() => {
  resetEtherForTests();
});

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  resetEtherForTests();
});

describe("KoraEther", () => {
  it("a silent bus = the honest empty, zero rows, zero movement", () => {
    const { container } = mountEther({ rows: etherRows() });
    expect(container.textContent).toContain("Событий пока нет");
    expect(container.querySelector('[role="log"]')).toBeNull();
  });

  it("renders rows oldest → newest with mono times and the row text", () => {
    pushEtherEvent(online("gpu-box"));
    pushEtherEvent({
      kind: "report",
      task_id: "T-128",
      report: {},
    } as BoardEvent);
    const { container } = mountEther({ rows: etherRows() });
    const log = container.querySelector('[role="log"]');
    expect(log).not.toBeNull();
    expect(log?.getAttribute("aria-live")).toBe("polite");
    expect(container.textContent).toContain("zcode@box на gpu-box — на связи");
    expect(container.textContent).toContain("Доклад по задаче T-128");
    const items = container.querySelectorAll("li");
    expect(items.length).toBe(2);
    // The tone dot mirrors the event class honestly (online=success,
    // report=confidence); the dot itself is aria-hidden decoration.
    expect(items[0]?.querySelector("span[aria-hidden]")?.className).toContain(
      "bg-success",
    );
    expect(items[1]?.querySelector("span[aria-hidden]")?.className).toContain(
      "bg-confidence",
    );
  });

  it("LIVE arrivals get the flash class; restored rows do not", () => {
    pushEtherEvent(online("gpu-box"));
    // Mount THROUGH the ring (the real workspace wire): the first row is a
    // restore — no flash.
    const first = mountEther({ rows: etherRows() }, true);
    expect(first.container.querySelector("li")?.className).not.toContain(
      "kora-ether-flash",
    );
    // A LIVE arrival while mounted: the ring notifies, the row flashes.
    act(() => {
      pushEtherEvent(online("gpu-box"));
    });
    const items = first.container.querySelectorAll("li");
    expect(items.length).toBe(2);
    expect(items[0]?.className).not.toContain("kora-ether-flash");
    expect(items[1]?.className).toContain("kora-ether-flash");
  });

  it("the host filter narrows the feed; the filtered empty names the host", () => {
    pushEtherEvent(online("gpu-box"));
    const { container } = mountEther({ rows: etherRows(), hostFilter: "pi-edge" });
    expect(container.textContent).toContain("Событий по хосту pi-edge пока нет");
    const all = mountEther({ rows: etherRows(), hostFilter: "gpu-box" });
    expect(all.container.textContent).toContain("zcode@box на gpu-box — на связи");
  });
});
