import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { Input } from "./input";

/**
 * State-matrix locks for the base field (spec 05 §2.5, wave U0 fills):
 * hover edge, caret, placeholder-disappears-on-focus, readonly styling and
 * the error state (aria-invalid + described-by message with the «Ошибка:»
 * prefix — never colour alone).
 */
describe("Input state matrix (spec 05 §2.5)", () => {
  it("without error it stays the bare input — no wrapper, no aria-invalid", () => {
    const html = renderToString(<Input placeholder="Поиск" />);
    expect(html).toContain("<input");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("role=\"alert\"");
    // Matrix states live in the class list even when dormant.
    expect(html).toContain("hover:border-myelin-strong");
    expect(html).toContain("caret-iris-bright");
    expect(html).toContain("focus-visible:placeholder:text-transparent");
    expect(html).toContain("read-only:border-border-subtle");
  });

  it("error wires aria-invalid + described-by and names the state in text", () => {
    const html = renderToString(<Input error="хост обязателен" />);
    expect(html).toContain("aria-invalid=\"true\"");
    expect(html).toContain("aria-describedby");
    expect(html).toContain("border-error");
    expect(html).toContain("role=\"alert\"");
    // The prefix, not colour alone (§2.5 error row).
    expect(html).toContain("Ошибка:");
    expect(html).toContain("хост обязателен");
    // The described-by id points at the rendered message line.
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(describedBy).not.toBe("");
    expect(html).toContain(`id="${describedBy}"`);
  });

  it("keeps caller-provided ids and merges external aria-describedby", () => {
    const html = renderToString(
      <Input id="prov-host" aria-describedby="hint-host" />,
    );
    expect(html).toContain('id="prov-host"');
    expect(html).toContain('aria-describedby="hint-host"');
  });
});
