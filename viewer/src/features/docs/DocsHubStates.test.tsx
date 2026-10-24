// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { DocsHubPage } from "./DocsHubPage";
import { I18nProvider } from "@/i18n";
import { Route, MemoryRouter, Routes } from "react-router";
import { actUnmount, actWaitUntil } from "@/test/actTools";

/**
 * The hub's honest loading/error states (blueprint «Честные состояния»,
 * rows D-HUB-SKELETON / D-HUB-ERROR): the manifest load shows the
 * role=status skeleton — a FAILED build shows the explicit «Повторить»
 * EmptyState, never an eternal skeleton. The manifest hooks are mocked at
 * the module seam (the real singleton cannot be driven into failure from a
 * test without corrupting the shared module state for the other files).
 */

const STATE = vi.hoisted(() => ({
  manifest: null as unknown,
  failed: false,
}));

vi.mock("./manifest", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useDocsManifest: () => STATE.manifest,
  useDocsManifestFailed: () => STATE.failed,
}));

async function mountHub(project: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <I18nProvider initialLang="ru">
        <MemoryRouter initialEntries={[`/docs/${project}`]}>
          <Routes>
            {/* A Route context is required — useParams feeds the page. */}
            <Route path="/docs/:project" element={<DocsHubPage />} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>,
    );
  });
  return { root, container };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  document.body.innerHTML = "";
  STATE.manifest = null;
  STATE.failed = false;
});

describe("hub honest states (blueprint D-HUB-*)", () => {
  it("D-HUB-SKELETON: a loading manifest shows role=status aria-busy, no cards", async () => {
    const { root, container } = await mountHub("vesma-eyes");
    const status = container.querySelector("[role='status'][aria-busy='true']");
    expect(status).not.toBeNull();
    expect(container.querySelectorAll("section[aria-label='Хабы']")).toHaveLength(0);
    await actUnmount(root);
  });

  it("D-HUB-ERROR: a FAILED manifest build is the explicit «Повторить» slot", async () => {
    STATE.failed = true;
    const { root, container } = await mountHub("vesma-eyes");
    await actWaitUntil(() => {
      expect(container.textContent).toContain("Каталог документов не собрался");
    });
    const retry = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Повторить"),
    );
    expect(retry).not.toBeNull();
    expect(container.querySelectorAll("section[aria-label='Хабы']")).toHaveLength(0);
    await actUnmount(root);
  });
});
