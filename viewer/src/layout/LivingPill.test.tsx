// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";

import { LivingPill } from "./LivingPill";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import { resetDoneTransits, recordDoneTransit } from "@/features/tasks/doneTransitStore";
import { DEFAULT_LIVE_LAYER, setLiveLayer } from "@/lib/liveLayerStore";

/**
 * ME-071 W3 slice 2: the В1 status-zone pill — honest absence of ▸N at
 * zero, the golden counter after a real transit (SSR renders the store's
 * truth; the flash is a browser-motion concern outside the SSR path).
 */

/** U1 (08 §4): render with the living layer pinned to a level. */
function renderPillAt(layer: "live" | "calm" | "off"): string {
  setLiveLayer(layer);
  return renderPill();
}

function renderPill(): string {
  return renderToString(
    <GatewayContext.Provider value={new MockAdapter({ latency: false })}>
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider initialLang="en">
          <MemoryRouter>
            <LivingPill />
          </MemoryRouter>
        </I18nProvider>
      </QueryClientProvider>
    </GatewayContext.Provider>,
  );
}

afterEach(() => {
  resetDoneTransits();
  setLiveLayer(DEFAULT_LIVE_LAYER);
});

describe("LivingPill (В1, slice 2)", () => {
  it("at zero the counter is absent (honest absence, no fake pill)", () => {
    const html = renderPill();
    expect(html).toContain("b1-pill");
    expect(html).not.toContain("▸");
  });

  it("U1 «Выключен»: the static Ø8 iris stub — no state colour, no flash", () => {
    const html = renderPillAt("off");
    expect(html).toMatch(/data-b1-state="off"/);
    expect(html).toMatch(/class="block size-2 rounded-full bg-iris"/);
    expect(html).not.toContain("b1-flash");
  });

  it("U1 «Полный» (the default): the dot keeps the health-driven state", () => {
    const html = renderPillAt("live");
    expect(html).not.toMatch(/data-b1-state="off"/);
  });

  it("after a recorded transit the golden ▸N renders with the sr-only meaning", () => {
    recordDoneTransit({ taskId: "T-1", title: "A", col: "resolved" });
    recordDoneTransit({ taskId: "T-2", title: "B", col: "done" });
    const html = renderPill();
    expect(html).toContain("▸");
    expect(html).toContain("2");
    expect(html).toContain("resolutions this session");
  });
});
