// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { TaskActivityPage } from "./TaskActivityPage";
import { MockAdapter } from "@/gateway/MockAdapter";
import type {
  ActivityBuckets,
  ActivityPage,
  ActivityParams,
  ActivityBucketParams,
} from "@/gateway/boardTypes";
import { GatewayContext } from "@/gateway/GatewayContext";
import type { MemoryGateway } from "@/gateway/MemoryGateway";
import { parseBoardEvent } from "@/gateway/events";
import { I18nProvider } from "@/i18n";
import {
  pushActivityEvent,
  resetActivityStore,
  setActivityStreamState,
} from "./activityStore";
import { actUnmount, actWaitUntil } from "@/test/actTools";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * UI-28 acceptance walk (spec §8): the state matrix (§5.1), the URL-state
 * rule with direct-open restoration (§8.4), the `?return=` contract on
 * drill-down links (§8.3), the actor grammar render incl. the honest
 * absence (§8.2), the live merge without row shifts (§8.6) and the
 * histogram buttons (§8.10). The mock adapter feeds the wire-shaped corpus
 * (its parity with the HTTP adapter is pinned at gateway level).
 *
 * Every actWaitUntil uses a 2000 ms budget — well under the vitest test
 * timeout — so a failing wait REJECTS (with its assertion) instead of the
 * runner killing the test mid-act and poisoning the rest of the file.
 */
const WAIT = 2000;

const NOW = Date.parse("2026-09-19T09:00:00+00:00");

function adapter(): MockAdapter {
  return new MockAdapter({ latency: false, now: () => NOW });
}

/** A mock twin whose activity reads hang forever — the loading state. */
class PendingActivityAdapter extends MockAdapter {
  override async activity(): Promise<ActivityPage> {
    return new Promise<ActivityPage>(() => {});
  }
  override async activityBuckets(): Promise<ActivityBuckets> {
    return new Promise<ActivityBuckets>(() => {});
  }
}

/** A mock twin whose activity read fails — the error state. */
class FailingActivityAdapter extends MockAdapter {
  override async activity(): Promise<ActivityPage> {
    throw new Error("boom");
  }
  override async activityBuckets(): Promise<ActivityBuckets> {
    throw new Error("boom");
  }
}

/** A mock twin with an EMPTY journal — the honest empty state. */
class EmptyActivityAdapter extends MockAdapter {
  override async activity(): Promise<ActivityPage> {
    return { items: [], has_more: false };
  }
  override async activityBuckets(): Promise<ActivityBuckets> {
    return { buckets: [] };
  }
}

async function mountPage(
  gateway: MemoryGateway,
  initialEntry = "/tasks/activity",
  initialLang: "ru" | "en" = "ru",
): Promise<{ root: Root; router: ReturnType<typeof createMemoryRouter> }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // A real router instance so the tests can read the URL state the page
  // writes (MemoryRouter never touches window.location).
  const router = createMemoryRouter(
    [{ path: "/tasks/activity", element: <TaskActivityPage /> }],
    { initialEntries: [initialEntry] },
  );
  await act(async () => {
    root.render(
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <I18nProvider initialLang={initialLang}>
            <RouterProvider router={router} />
          </I18nProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>,
    );
  });
  return { root, router };
}

function pushWire(payload: unknown, at = NOW): void {
  const parsed = parseBoardEvent(JSON.stringify(payload));
  if (parsed.status !== "event") throw new Error("bad fixture");
  pushActivityEvent(parsed.event, at);
}

function text(): string {
  return document.body.textContent ?? "";
}

/** Feed rows only — the histogram legend renders <li>s of its own. */
function feedRows(): string[] {
  const list = document.querySelector("ul[aria-label='Лента активности']");
  return [...(list?.querySelectorAll("li") ?? [])].map((li) => li.textContent ?? "");
}

function feedList(): Element | null {
  return document.querySelector("ul[aria-label='Лента активности']");
}

function chipByLabel(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll("button[aria-pressed]")].find(
    (button) => (button.textContent ?? "").trim() === label,
  ) as HTMLButtonElement | undefined;
}

afterEach(() => {
  resetActivityStore();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  localStorage.removeItem("vesmaro.motion");
});

describe("UI-28 state matrix (§5.1)", () => {
  it("loading — the skeleton speaks its status and no rows pretend to exist", async () => {
    const { root } = await mountPage(new PendingActivityAdapter());
    const status = document.querySelector("[role='status'][aria-label]");
    expect(status?.getAttribute("aria-label")).toBe("Загружаем активность");
    expect(text()).not.toContain("создана");
    await actUnmount(root);
  });

  it("error — the honest block with «Повторить»", async () => {
    const { root } = await mountPage(new FailingActivityAdapter());
    await actWaitUntil(() => {
      expect(text()).toContain("Не удалось загрузить активность");
    }, WAIT);
    const retry = [...document.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Повторить"),
    );
    expect(retry).toBeDefined();
    await actUnmount(root);
  });

  it("empty — the honest invite without fake rows; with filters — the reset copy", async () => {
    const { root } = await mountPage(new EmptyActivityAdapter());
    await actWaitUntil(() => {
      expect(text()).toContain("Активности пока нет");
      expect(text()).toContain("зашуршат");
    }, WAIT);
    await actUnmount(root);

    const { root: root2 } = await mountPage(
      new EmptyActivityAdapter(),
      "/tasks/activity?task_id=TB-1",
    );
    await actWaitUntil(() => {
      expect(text()).toContain("Под эти фильтры ничего не попало.");
      expect(text()).toContain("Сбросить фильтры");
    }, WAIT);
    await actUnmount(root2);
  });
});

describe("URL state (§8.4) — direct-open restores, filters apply, reset clears", () => {
  it("a bookmarked ?type=report opens the filtered view directly", async () => {
    const { root } = await mountPage(adapter(), "/tasks/activity?type=report");
    await actWaitUntil(() => {
      expect(text()).toContain("финальный отчёт");
    }, WAIT);
    expect(text()).toContain("отчёт (промежуточный)");
    // non-report verbs never render under the filter
    expect(text()).not.toContain("исполнение начато");
    expect(text()).not.toContain("создана");
    await actUnmount(root);
  });

  it("the family chips rewrite the URL (?type=assignment) and toggle off", async () => {
    const { root, router } = await mountPage(adapter());
    await actWaitUntil(() => {
      expect(text()).toContain("исполнение начато");
    }, WAIT);
    const chip = chipByLabel("Исполнение");
    expect(chip).toBeDefined();
    await act(async () => {
      chip?.click();
    });
    await actWaitUntil(() => {
      expect(router.state.location.search).toContain("type=assignment");
    }, WAIT);
    // direct-open parity: the produced URL re-renders the same view
    await actWaitUntil(() => {
      expect(text()).not.toContain("переведена");
    }, WAIT);
    // the navigation re-rendered the bar — re-query the (new) chip node
    const chip2 = chipByLabel("Исполнение");
    expect(chip2).toBeDefined();
    await act(async () => {
      chip2?.click();
    });
    await actWaitUntil(() => {
      expect(router.state.location.search).not.toContain("type=");
    }, WAIT);
    await actUnmount(root);
  });

  it("«Сбросить фильтры» clears every filter param", async () => {
    const { root, router } = await mountPage(
      adapter(),
      "/tasks/activity?type=report&task_id=TB-2&host=laptop",
    );
    await actWaitUntil(() => {
      expect(text()).toContain("Сбросить фильтры");
    }, WAIT);
    const reset = [...document.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Сбросить фильтры"),
    );
    await act(async () => {
      reset?.click();
    });
    await actWaitUntil(() => {
      expect(router.state.location.search).toBe("");
    }, WAIT);
    await actUnmount(root);
  });
});

describe("drill-down links (§8.3) — ?tab= + ?return= roundtrip", () => {
  it("report rows target ?tab=reports, assignment rows ?tab=execution, with the activity URL as return", async () => {
    const { root } = await mountPage(adapter(), "/tasks/activity?type=report");
    await actWaitUntil(() => {
      expect(text()).toContain("финальный отчёт");
    }, WAIT);
    const links = [...document.querySelectorAll("a")];
    const reportLink = links.find((a) => a.getAttribute("href")?.includes("tab=reports"));
    expect(reportLink?.getAttribute("href")).toContain("/tasks/");
    expect(reportLink?.getAttribute("href")).toContain(
      `return=${encodeURIComponent("/tasks/activity?type=report")}`,
    );
    await actUnmount(root);

    const { root: root2 } = await mountPage(adapter(), "/tasks/activity?type=assignment");
    await actWaitUntil(() => {
      expect(text()).toContain("исполнение начато");
    }, WAIT);
    const executionLink = [...document.querySelectorAll("a")].find((a) =>
      a.getAttribute("href")?.includes("tab=execution"),
    );
    expect(executionLink).toBeDefined();
    await actUnmount(root2);
  });
});

describe("actor grammar render (§8.2)", () => {
  it("ui → «владелец»; machine → the registry name; board → «борд»; absent → no badge", async () => {
    const { root } = await mountPage(adapter(), "/tasks/activity?task_id=TB-1");
    await actWaitUntil(() => {
      expect(text()).toContain("владелец");
    }, WAIT);
    // registry join: machine:exec-laptop-zcode renders as the roster NAME
    expect(text()).toContain("zcode@laptop");
    // the machine:board leg carries the board badge
    expect(text()).toContain("борд");
    // the honest gap: the grammar never fabricates «неизвестно»
    expect(text()).not.toContain("неизвестно");
    await actUnmount(root);
  });
});

describe("live merge (§8.6) — prepends, flashes, never shifts or duplicates", () => {
  it("a pushed task.moved lands on top with the flash class and pushes nothing off", async () => {
    const { root } = await mountPage(adapter());
    await actWaitUntil(() => {
      expect(text()).toContain("исполнение начато");
    }, WAIT);
    const before = feedRows();
    expect(before.length).toBeGreaterThan(3);

    pushWire(
      {
        kind: "task.moved",
        task: { id: "TB-2", col: "blocked", updated_at: "2026-09-19T09:00:30+00:00" },
        actor: "machine:board",
      },
      NOW + 30_000,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const after = feedRows();
    expect(after.length).toBe(before.length + 1); // prepend, no shift-out
    expect(after[0]).toContain("борд"); // the machine:board badge
    expect(after[0]).toContain("TB-2");
    for (let index = 1; index < before.length; index += 1) {
      expect(after[index]).toBe(before[index - 1]); // every old row intact, in order
    }
    // the 2 s flash — and its quiet fade (colour only, rows stay)
    expect(feedList()?.querySelector("li.bg-iris\\/10")).not.toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2100));
    });
    expect(feedList()?.querySelector("li.bg-iris\\/10")).toBeNull();
    expect(feedRows()).toEqual(after);
    await actUnmount(root);
  });

  it("a live fact the GET also returns is NOT duplicated (fact-key dedupe)", async () => {
    const { root } = await mountPage(adapter(), "/tasks/activity?task_id=TB-1");
    await actWaitUntil(() => {
      expect(text()).toContain("исполнение начато");
    }, WAIT);
    // The corpus holds assignment.started on TB-1 at 08:xx; a live copy of
    // the SAME fact must not double it in the visible feed.
    pushWire(
      {
        kind: "assignment.started",
        task_id: "TB-1",
        assignment: { id: "501", state: "running", executor_id: "exec-laptop-zcode" },
      },
      Date.parse("2026-09-19T08:11:00+00:00"),
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    const startedRows = feedRows().filter((row) => row.includes("исполнение начато"));
    expect(startedRows.length).toBeGreaterThanOrEqual(1);
    // dedupe unit-level guarantee is pinned in activityUrl.test.ts; here we
    // assert the visible feed stays honest (no duplicate rows rendered)
    const seen = new Set<string>();
    for (const rowText of startedRows) {
      expect(seen.has(rowText)).toBe(false);
      seen.add(rowText);
    }
    await actUnmount(root);
  });
});

describe("the «N новых» plate (§5.2) — rows never move under the reader", () => {
  it("withholds while scrolled away, flushes on return", async () => {
    const { root } = await mountPage(adapter());
    await actWaitUntil(() => {
      expect(text()).toContain("исполнение начато");
    }, WAIT);

    // scroll away (happy-dom: drive the scrollY the page listens to)
    Object.defineProperty(window, "scrollY", { value: 400, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });

    pushWire(
      {
        kind: "report",
        task_id: "TB-9",
        report: { kind: "intermediate", agent: "machine:exec-laptop-zcode", body: "свежий отчёт" },
      },
      NOW + 60_000,
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    const plate = [...document.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Новых событий: 1 — показать"),
    );
    expect(plate).toBeDefined();
    // NOT rendered into the list while withheld
    expect(text()).not.toContain("свежий отчёт");

    // back to the top — the withheld row flushes in
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
    await act(async () => {
      window.dispatchEvent(new Event("scroll"));
    });
    await actWaitUntil(() => {
      expect(text()).toContain("свежий отчёт");
    }, WAIT);
    expect(feedRows()[0]).toContain("TB-9");
    await actUnmount(root);
  });
});

describe("histogram «Суточный пульс» (§8.10)", () => {
  it("renders 24 button bars with the §6 aria template and toggles ?from&to", async () => {
    // the corpus lives at the frozen mock clock — pin the page's «now» to it
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    const { root, router } = await mountPage(adapter());
    await actWaitUntil(() => {
      expect(feedRows().length).toBeGreaterThan(0);
    }, WAIT);
    const bars = [...document.querySelectorAll("button[aria-label]")].filter((button) =>
      (button.getAttribute("aria-label") ?? "").includes("событий:"),
    );
    expect(bars).toHaveLength(24);
    // the aria template carries range + the family split (§6 barAria)
    const withEvents = bars.find(
      (bar) => !(bar.getAttribute("aria-label") ?? "").startsWith("00:00–01:00 — 0"),
    );
    expect(withEvents?.getAttribute("aria-label")).toMatch(
      /\d{2}:\d{2}–\d{2}:\d{2} — \d+ событий: \d+ задач, \d+ исполнений, \d+ отчётов/,
    );

    await act(async () => {
      (withEvents as HTMLElement | undefined)?.click();
    });
    await actWaitUntil(() => {
      expect(router.state.location.search).toContain("from=");
      expect(router.state.location.search).toContain("to=");
    }, WAIT);
    // the clicked bar reads as pressed (toggle state)
    expect(withEvents?.getAttribute("aria-pressed")).toBe("true");

    // toggle off clears the window
    await act(async () => {
      (withEvents as HTMLElement | undefined)?.click();
    });
    await actWaitUntil(() => {
      expect(router.state.location.search).not.toContain("from=");
    }, WAIT);
    await actUnmount(root);
  });

  it("reduced motion (vesmaro.motion=reduced) drops the height transition", async () => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    localStorage.setItem("vesmaro.motion", "reduced");
    const { root } = await mountPage(adapter());
    await actWaitUntil(() => {
      expect(feedRows().length).toBeGreaterThan(0);
    }, WAIT);
    const animated = [...document.querySelectorAll("section button[aria-label] span span")].filter(
      (span) => (span as HTMLElement).className.includes("transition-[height]"),
    );
    expect(animated).toHaveLength(0);
    await actUnmount(root);
  });

  it("an empty day says so instead of rendering ghost bars", async () => {
    const { root } = await mountPage(new EmptyActivityAdapter());
    await actWaitUntil(() => {
      expect(text()).toContain("Событий за сутки не было");
    }, WAIT);
    await actUnmount(root);
  });
});

describe("honest journal end (§8.8)", () => {
  it("the corpus tail ends with «Это вся глубина журнала», never a fake spinner", async () => {
    const { root } = await mountPage(adapter());
    // the corpus (~30 rows) fits one 50-row page: the cursor ends at once —
    // the honest end line instead of a dead «Показать ещё»
    await actWaitUntil(() => {
      expect(feedRows().length).toBeGreaterThan(0);
      expect(text()).toContain("Это вся глубина журнала");
    }, WAIT);
    expect(text()).not.toContain("Показать ещё");
    await actUnmount(root);
  });
});

describe("reconnect refetch (§8.7)", () => {
  it("a recovery bump invalidates the activity queries — the feed refetches", async () => {
    const gateway = adapter();
    const spy = vi.spyOn(gateway, "activity");
    const { root } = await mountPage(gateway);
    await actWaitUntil(() => {
      expect(spy.mock.calls.length).toBeGreaterThan(0);
    }, WAIT);
    const afterMount = spy.mock.calls.length;
    // simulate the bridge: drop + recovery (the counter drives the refetch)
    await act(async () => {
      setActivityStreamState("open", NOW);
      setActivityStreamState("connecting", NOW + 1000);
      setActivityStreamState("open", NOW + 2000);
    });
    await actWaitUntil(() => {
      expect(spy.mock.calls.length).toBeGreaterThan(afterMount);
    }, WAIT);
    await actUnmount(root);
  });
});

describe("hook params (§3.2 wire shape)", () => {
  it("the feed requests the server default page with the URL filters", async () => {
    const gateway = adapter();
    const spy = vi.spyOn(gateway, "activity");
    const { root } = await mountPage(gateway, "/tasks/activity?type=report");
    await actWaitUntil(() => {
      expect(spy.mock.calls.length).toBeGreaterThan(0);
      expect(spy.mock.calls[0][0]?.type).toBe("report");
    }, WAIT);
    const params = spy.mock.calls[0][0] as ActivityParams;
    expect(params.limit).toBe(50);
    expect(params.before_id).toBeUndefined();
    await actUnmount(root);
  });

  it("the buckets view asks for hour buckets over 24 hours", async () => {
    const gateway = adapter();
    const spy = vi.spyOn(gateway, "activityBuckets");
    const { root } = await mountPage(gateway);
    await actWaitUntil(() => {
      expect(spy.mock.calls.length).toBeGreaterThan(0);
      expect(spy.mock.calls[0][0]?.bucket).toBe("hour");
    }, WAIT);
    const params = spy.mock.calls[0][0] as ActivityBucketParams;
    expect(params.hours).toBe(24);
    await actUnmount(root);
  });
});
