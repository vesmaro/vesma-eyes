import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { MemoryScroll } from "./MemoryScroll";
import { MOCK_MEMORIES } from "@/gateway/fixtures";
import { I18nProvider } from "@/i18n";
import type { Memory } from "@/gateway/types";

// English copy via initialLang — these tests pin copy, not the ru default.
function render(memory: Memory, showRaw = false): string {
  return renderToString(
    <MemoryRouter>
      <I18nProvider initialLang="en">
        <MemoryScroll memory={memory} showRaw={showRaw} onToggleRaw={() => undefined} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

describe("MemoryScroll (the scroll)", () => {
  it("shows effective content by default and hides the raw toggle when no raw differs", () => {
    // mem-0003 carries no raw_content → no toggle (inventory §5.3).
    const html = render(MOCK_MEMORIES[2]);
    expect(html).toContain("WAL checkpoint starvation under long readers");
    expect(html).not.toContain("switch");
  });

  it("offers the raw toggle only when raw_content exists and differs", () => {
    // mem-0001 has raw_content ≠ effective content.
    const effective = render(MOCK_MEMORIES[0], false);
    expect(effective).toContain(
      "Viewer talks to vesma through the same-origin /api prefix",
    );

    const raw = render(MOCK_MEMORIES[0], true);
    expect(raw).toContain("# ADR: gateway");
  });

  it("renders rule/code memories in mono (D11) and others in the scroll serif", () => {
    const ruleMemory: Memory = {
      ...MOCK_MEMORIES[3],
      tags: ["project:mnemos", "mnemos:decision", "type:rule"],
    };
    const mono = render(ruleMemory);
    expect(mono).toContain("font-family:var(--font-mono)");
    expect(mono).not.toContain("font-family:var(--font-scroll)");

    const serif = render(MOCK_MEMORIES[0]);
    expect(serif).toContain("font-family:var(--font-scroll)");
    expect(serif).not.toContain("font-family:var(--font-mono)");
  });

  it("links related memories only when derived_from is present", () => {
    const related: Memory = { ...MOCK_MEMORIES[1], derived_from: ["mem-0001"] };
    const html = render(related);
    expect(html).toContain("Related memories");
    expect(html).toContain('href="/memory/mem-0001"');

    expect(render(MOCK_MEMORIES[1])).not.toContain("Related memories");
  });

  it("renders the provenance bar and metadata footer", () => {
    const html = render(MOCK_MEMORIES[0]);
    expect(html).toContain("agent:");
    expect(html).toContain("project:");
    expect(html).toContain("● 0.90"); // confidence indicator
    expect(html).toContain("id:");
    expect(html).toContain("manual"); // source
  });

  it("dresses the U4 scroll canon: display title, caps provenance, reading measure", () => {
    // SPEC-2026-10-07 «Память»: Lora display 36–44px for the record title
    // (the ONE display step), 11px caps provenance labels, --measure-scroll
    // reading column. Typography IS the scroll aesthetic — no parchment.
    const html = render(MOCK_MEMORIES[0]);
    expect(html).toContain("text-display"); // 36–44px title step
    expect(html).toContain("font-scroll"); // Lora carries the «word»
    expect(html).toContain("max-w-scroll"); // --measure-scroll rhythm
    expect(html).toContain("text-caps"); // 11px provenance labels
    expect(html).toContain("tracking-caps");
    // No parchment simulation: the surface stays the scroll tokens.
    expect(html).toContain("bg-scroll-bg");
    expect(html).toContain("border-scroll-border");
  });
});
