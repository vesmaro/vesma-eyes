import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { BackToBoardLink } from "./BackToBoardLink";
import { I18nProvider } from "@/i18n";

/**
 * The «На борт» return controller (07h §12): noticeable outline — never the
 * phase's primary; 44px tall (the public page IS the mobile scenario,
 * 2.5.8); the icon is not the only carrier of the name (1.4.1 — the label
 * rides along); the focus ring is the --color-focus canon.
 */

function renderIt(): string {
  return renderToString(
    <I18nProvider initialLang="ru">
      <MemoryRouter initialEntries={["/auth"]}>
        <BackToBoardLink />
      </MemoryRouter>
    </I18nProvider>,
  );
}

describe("BackToBoardLink (07h §12)", () => {
  it("links to the board root with the arrow + label and the worded aria-label", () => {
    const html = renderIt();
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>/);
    expect(html).toMatch(/aria-label="На борт — вернуться на главную"/);
    expect(html).toContain("На борт");
    expect(html).toMatch(/aria-hidden="true"/); // the arrow is decorative
  });

  it("is the 44px primary-OUTLINE twin, never a solid fill", () => {
    const html = renderIt();
    expect(html).toMatch(/h-11/);
    expect(html).toMatch(/border-\[1\.5px\] border-iris/);
    expect(html).not.toMatch(/bg-iris-strong/); // not the primary fill
    expect(html).toMatch(/outline-focus/); // the ONE ring canon
  });
});
