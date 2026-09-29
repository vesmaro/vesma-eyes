// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MarkdownView } from "../MarkdownView";
import { I18nProvider } from "@/i18n";
import { MermaidDiagram } from "./Mermaid";
import { MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE } from "./mermaidCaps";
import hostileRaw from "@/features/docs/__fixtures__/hostile.md?raw";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

/**
 * ME-013 hostile/diagram corpus — the UNTRUSTED profile (ADR 0020
 * Amendment 1). The curated corpus (features/docs/__fixtures__/hostile.md +
 * Markdown.test.tsx) owns the curated gate; THIS file is its untrusted
 * counterpart:
 *
 * - a VALID diagram in author content renders as a diagram (svg) — the
 *   ratified acceptance criterion («отчёт агента с корректной диаграммой
 *   рендерит её на странице задачи»);
 * - cap overshoot (fence size / fences per surface) = HONEST inert fallback:
 *   the source stays visible as a plain code block, the diagram component —
 *   and the 450 KiB lazy chunk — never mounts;
 * - hostile constructs inside a fence NEVER become markup: the fence source
 *   renders as inert text; mermaid-shaped hostile svg output is rejected by
 *   the same ME-017 strict-XML gates the curated profile uses (the logic is
 *   REUSED whole via the rehomed core/Mermaid.tsx, never forked).
 *
 * mermaid is MOCKED (happy-dom has no SVG layout engine — the recorded
 * deviation in mermaid.render.smoke.test.tsx); the real-browser svg assert
 * lives in scripts/smoke-render.mjs step 7 (flipped in ME-013).
 */

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(),
  },
}));

const mermaidMock = (await import("mermaid")).default as unknown as {
  initialize: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
};

/** Minimal well-formed svg the mock "mermaid" returns for valid fences. */
const OK_SVG =
  '<svg viewBox="0 0 4 4" width="40" height="40">' +
  '<text x="1" y="1">diagram</text></svg>';

const VALID_FENCE = "```mermaid\nflowchart LR\n  A[agent] --> B[board]\n```";

interface Mounted {
  container: HTMLElement;
  root: Root;
}

const mounted: Mounted[] = [];

async function mountView(source: string): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <I18nProvider initialLang="en">
        <MarkdownView source={source} />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

beforeEach(() => {
  mermaidMock.initialize.mockClear();
  mermaidMock.render.mockReset();
  mermaidMock.render.mockResolvedValue({ svg: OK_SVG });
});

afterEach(async () => {
  while (mounted.length > 0) {
    const { root } = mounted.pop()!;
    await act(async () => root.unmount());
  }
  document.body.textContent = "";
});

describe("untrusted mermaid (Amendment 1)", () => {
  it("renders a VALID fence as a diagram: figure + svg, source hidden after ok", async () => {
    const el = await mountView(`Report body.\n\n${VALID_FENCE}\n\ndone.`);
    const figure = el.querySelector("figure");
    expect(figure, "valid diagram must mount the figure").not.toBeNull();
    const svg = figure?.querySelector("svg");
    expect(svg, "mocked mermaid svg must reach the DOM").not.toBeNull();
    expect(figure?.querySelector("pre")).toBeNull(); // source hidden on ok
    expect(mermaidMock.render).toHaveBeenCalledTimes(1);
    // Same strict posture as the curated profile (one component, no fork).
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({ securityLevel: "strict" }),
    );
  });

  it("keeps raw HTML inside a fence INERT: source text only, no elements", async () => {
    const hostileSource =
      "```mermaid\nflowchart LR\n  A[\"<script>alert('fence')</script>\"] --> B[\"<img src=x onerror=alert(1)>\"]\n```";
    const el = await mountView(hostileSource);
    // The fence text must appear ONLY as text (mocked render output carries
    // none of it) — never as markup.
    expect(el.querySelector("script")).toBeNull();
    expect(el.querySelector("img")).toBeNull();
    const withHandlers = [...el.querySelectorAll("*")].filter((element) =>
      [...element.attributes].some((attribute) =>
        attribute.name.startsWith("on"),
      ),
    );
    expect(withHandlers).toEqual([]);
  });

  it("rejects hostile mermaid-SVG output through the ME-017 gates (no fork)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Unclosed <img> inside foreignObject: valid HTML-ish, INVALID XML —
    // exactly the shape the strict parser must keep rejecting.
    const hostile =
      '<svg viewBox="0 0 4 4" xmlns="http://www.w3.org/2000/svg">' +
      '<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">' +
      '<span class="nodeLabel"><p><img src="https://evil.example/pixel"></p></span>' +
      "</div></foreignObject></svg>";
    mermaidMock.render.mockResolvedValue({ svg: hostile });
    const el = await mountView(VALID_FENCE);
    expect(el.querySelector("svg"), "hostile svg must not reach the DOM").toBeNull();
    expect(el.querySelector("img")).toBeNull();
    // Honest fallback: the source stays visible.
    expect(el.querySelector("pre")?.textContent).toContain("A[agent]");
    expect(
      warnSpy.mock.calls.some((call) => String(call[0]).includes("unparsable svg")),
    ).toBe(true);
    warnSpy.mockRestore();
  });

  it("oversized fence (over the char cap) → honest inert fallback, chunk never mounts", async () => {
    // A diagram-shaped body past the cap: the fallback is the PLAIN theme
    // code block — no figure, no mermaid call, source fully visible.
    const edges = Array.from(
      { length: 900 },
      (_, i) => `N${i} --> M${i}`,
    ).join("\n");
    expect(edges.length).toBeGreaterThan(10_000); // sanity: actually over cap
    const el = await mountView(`\`\`\`mermaid\nflowchart TD\n${edges}\n\`\`\``);
    expect(el.querySelector("figure")).toBeNull();
    expect(mermaidMock.render).not.toHaveBeenCalled();
    expect(mermaidMock.initialize).not.toHaveBeenCalled();
    expect(el.querySelector("pre code")?.textContent).toContain("N0 --> M0");
    expect(el.querySelector("pre code")?.textContent).toContain("N899 --> M899");
  });

  it(`more than ${MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE} fences on a surface → EVERY fence inert (honest, deterministic)`, async () => {
    const fence = (i: number) => `\`\`\`mermaid\nA${i}-->B${i}\n\`\`\``;
    const source = Array.from({ length: MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE + 1 }, (_, i) => fence(i)).join("\n\n");
    const el = await mountView(source);
    expect(el.querySelector("figure")).toBeNull();
    expect(el.querySelectorAll("svg").length).toBe(0);
    expect(mermaidMock.render).not.toHaveBeenCalled();
    // All six sources stay visible — nothing dropped silently.
    const codeText = [...el.querySelectorAll("pre code")]
      .map((node) => node.textContent ?? "")
      .join("\n");
    for (let i = 0; i <= MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE; i += 1) {
      expect(codeText).toContain(`A${i}-->B${i}`);
    }
  });

  it("exactly the cap of small fences still renders diagrams", async () => {
    const fence = (i: number) => `\`\`\`mermaid\nA${i}-->B${i}\n\`\`\``;
    const source = Array.from(
      { length: MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE },
      (_, i) => fence(i),
    ).join("\n\n");
    const el = await mountView(source);
    expect(el.querySelectorAll("figure").length).toBe(
      MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE,
    );
    expect(mermaidMock.render).toHaveBeenCalledTimes(
      MERMAID_UNTRUSTED_MAX_FENCES_PER_SURFACE,
    );
  });

  it("the shared hostile corpus through MarkdownView: zero diagrams, giant fence inert (ADR 0020 invariant 2, ME-013 review P2-1)", async () => {
    // The hostile corpus must run through BOTH profiles (invariant 2): the
    // curated gate lives in features/docs/Markdown.test.tsx; THIS is the
    // untrusted counterpart. The corpus's single mermaid fence is 22_413
    // chars — far over the 10_000 cap — so the whole surface must stay
    // diagram-free with the fence source fully visible (honest fallback),
    // and every hostile vector must degrade to inert text exactly as the
    // golden pins for benign corpus shapes.
    const el = await mountView(hostileRaw);
    expect(el.querySelector("figure"), "hostile corpus must mount no diagram").toBeNull();
    expect(el.querySelectorAll("svg").length).toBe(0);
    expect(mermaidMock.render).not.toHaveBeenCalled();
    // The oversized fence source stays visible — auditable, not dropped.
    expect(el.querySelector("pre code")?.textContent).toContain("N0001 --> M0001");
    expect(el.querySelector("pre code")?.textContent).toContain("N1400 --> M1400");
    // And the hostile vectors are as inert as ever on this profile.
    for (const tag of ["script", "iframe", "object", "embed", "form", "style"]) {
      expect(el.querySelector(tag), `<${tag}> became an element`).toBeNull();
    }
  });

  it("a diagram component mount unwraps click-links (shared posture, untrusted too)", async () => {
    // Direct component check: the rehomed module keeps the ADR-0017
    // navigation neutralization on the untrusted path.
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const linked =
      '<svg viewBox="0 0 4 4" width="40" height="40">' +
      '<a href="https://evil.example/"><text x="1" y="1">click</text></a>' +
      "</svg>";
    mermaidMock.render.mockResolvedValue({ svg: linked });
    await act(async () => {
      root.render(
        <I18nProvider initialLang="en">
          <MermaidDiagram code="flowchart LR" />
        </I18nProvider>,
      );
    });
    mounted.push({ container, root });
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(container.querySelector("svg a")).toBeNull();
    expect(svg?.textContent).toContain("click"); // label survives, nav does not
  });
});
