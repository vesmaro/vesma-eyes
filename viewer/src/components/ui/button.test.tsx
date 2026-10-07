import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Button } from "./button";

/**
 * State-matrix locks for the base Button (spec 05 §2.1, wave U0 fills):
 * the loading row (spinner + aria-busy + blocked repeat clicks) and the
 * focus-visible ring token (--color-focus, not iris-bright).
 */
describe("Button state matrix (spec 05 §2.1)", () => {
  it("loading renders the 16px spinner, aria-busy, and blocks repeat clicks", () => {
    const html = renderToString(
      <Button loading>Назначаем…</Button>,
    );
    expect(html).toContain("aria-busy=\"true\"");
    expect(html).toContain("disabled");
    expect(html).toContain("animate-spin"); // lucide Loader2 — spec: spinner 16px
    expect(html).toContain("[&amp;_svg]:size-4"); // base rule pins it to 16px
  });

  it("non-loading buttons carry no aria-busy and stay enabled by default", () => {
    const html = renderToString(<Button>Открыть</Button>);
    expect(html).not.toContain("aria-busy");
    // The attribute, not the `disabled:` utility prefixes in the class list.
    expect(html).not.toContain("disabled=\"\"");
    expect(html).not.toContain("animate-spin");
  });

  it("focus-visible ring resolves through the --color-focus token", () => {
    const html = renderToString(<Button>Открыть</Button>);
    // Spec §2.1: ринг --color-focus 2px/2px on every variant (dark value
    // coincides with iris-bright; light uses the dedicated focus step).
    expect(html).toContain("focus-visible:outline-focus");
    expect(html).not.toContain("focus-visible:outline-iris-bright");
  });
});
