// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ConnectProviderDialog } from "./ConnectProviderDialog";
import { MockAdapter } from "@/gateway/MockAdapter";
import { GatewayContext } from "@/gateway/GatewayContext";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { actUnmount, actWaitUntil } from "@/test/actTools";
import { CREDENTIAL_IN_URL_MESSAGE } from "@/gateway/providerUrl";
import { ApiError } from "@/lib/errors";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * «Подключить провайдера» / «Заменить ключ» — the credential form (MF2,
 * ux-blueprint §3.1/§4.3 under security-verdict §5). QA matrix:
 * - MF-FORM-IDLE: submit disabled until name+URL+key are valid;
 * - the reveal toggle covers the UNSAVED typed value only (TL verdict Q3)
 *   and the field never survives a successful save;
 * - the URL inline rejection is the ONE family — byte-identical strings
 *   with the server's 422 credential_in_url;
 * - the normalized URL preview shows exactly what will persist
 *   (query/fragment stripped);
 * - the server reason surfaces VERBATIM and the dialog stays open
 *   (MF-FORM-ERR-SERVER);
 * - rotate mode: the name locked, the address prefilled, the PUT path.
 *
 * The credential typed into the form is a FIXTURE PLACEHOLDER string.
 */

const FIXTURE_KEY = "sk-qa-fake-credential-placeholder-0001";

interface Harness {
  root: Root;
  container: HTMLElement;
  gateway: MockAdapter;
  onOpenChange: (open: boolean) => void;
}

async function mountDialog(
  rotate: Parameters<typeof ConnectProviderDialog>[0]["rotate"] = null,
): Promise<Harness> {
  const gateway = new MockAdapter({ latency: false });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let open = true;
  const onOpenChange = (next: boolean) => {
    open = next;
  };
  const Rerenderer = () => {
    return (
      <GatewayContext.Provider value={gateway}>
        <QueryClientProvider client={client}>
          <ToastProvider>
            <I18nProvider initialLang="en">
              <ConnectProviderDialog open={open} onOpenChange={onOpenChange} rotate={rotate} />
            </I18nProvider>
          </ToastProvider>
        </QueryClientProvider>
      </GatewayContext.Provider>
    );
  };
  await act(async () => {
    root.render(<Rerenderer />);
  });
  return { root, container, gateway, onOpenChange };
}

function input(_harness: Harness, id: string): HTMLInputElement {
  // Radix portals the dialog to document.body — the surface lives there,
  // not inside the React container.
  const element = document.querySelector(`#${id}`);
  expect(element, `#${id} must render`).not.toBeNull();
  return element as HTMLInputElement;
}

async function type(harness: Harness, id: string, value: string): Promise<void> {
  // React owns the value — the native setter is the honest way in
  // (the EnrollmentDialog.test discipline).
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  await act(async () => {
    const field = input(harness, id);
    setter?.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submitButton(): HTMLButtonElement {
  const button = Array.from(document.body.querySelectorAll("button")).find((b) =>
    (b.getAttribute("type") ?? "").includes("submit"),
  );
  expect(button, "submit button must render").not.toBeNull();
  return button as HTMLButtonElement;
}

/** Fire the form's submit the way happy-dom can: the event itself (a
 * type=submit button click does not implicitly submit here). */
async function submitForm(): Promise<void> {
  const form = document.body.querySelector("form");
  expect(form, "the form must render").not.toBeNull();
  await act(async () => {
    (form as HTMLFormElement).dispatchEvent(
      new Event("submit", { bubbles: true, cancelable: true }),
    );
  });
}

let harness: Harness | null = null;

beforeEach(() => {
  harness = null;
});

afterEach(async () => {
  if (harness) {
    await actUnmount(harness.root);
    harness.container.remove();
    harness = null;
  }
  vi.restoreAllMocks();
});

describe("ConnectProviderDialog — MF-FORM-IDLE", () => {
  it("renders the three labeled fields; submit stays disabled until everything is valid", async () => {
    harness = await mountDialog();
    expect(input(harness, "provider-name")).toBeDefined();
    expect(input(harness, "provider-url")).toBeDefined();
    const keyField = input(harness, "provider-key");
    expect(keyField.getAttribute("type")).toBe("password");
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    await type(harness, "provider-name", "openrouter");
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    await type(harness, "provider-url", "https://openrouter.ai/api/v1");
    expect(submitButton().hasAttribute("disabled")).toBe(true);
    await type(harness, "provider-key", FIXTURE_KEY);
    expect(submitButton().hasAttribute("disabled")).toBe(false);
  });
});

describe("ConnectProviderDialog — the reveal toggle (unsaved value only)", () => {
  it("toggles the masked field while typing; the field dies on success", async () => {
    harness = await mountDialog();
    await type(harness, "provider-name", "openrouter");
    await type(harness, "provider-url", "https://openrouter.ai/api/v1");
    await type(harness, "provider-key", FIXTURE_KEY);
    const toggle = Array.from(document.body.querySelectorAll("button")).find(
      (b) => b.getAttribute("aria-pressed") !== null,
    );
    expect(toggle, "the reveal toggle must render").not.toBeNull();
    expect(input(harness, "provider-key").getAttribute("type")).toBe("password");
    await act(async () => {
      (toggle as HTMLButtonElement).click();
    });
    expect(input(harness, "provider-key").getAttribute("type")).toBe("text");
    await act(async () => {
      (toggle as HTMLButtonElement).click();
    });
    expect(input(harness, "provider-key").getAttribute("type")).toBe("password");
  });
});

describe("ConnectProviderDialog — the URL red-line family", () => {
  it("userinfo in base_url → the inline family refusal (byte-identical with the server)", async () => {
    harness = await mountDialog();
    await type(harness, "provider-name", "openrouter");
    await type(harness, "provider-url", "https://user:pass@openrouter.ai/api/v1");
    await submitForm();
    const text = document.body.textContent ?? "";
    expect(text).toContain(CREDENTIAL_IN_URL_MESSAGE);
  });

  it("a credential-shaped query param gets the SAME family refusal", async () => {
    harness = await mountDialog();
    await type(harness, "provider-name", "openrouter");
    await type(harness, "provider-url", "https://openrouter.ai/api/v1?key=qa-x");
    await submitForm();
    expect(document.body.textContent).toContain(CREDENTIAL_IN_URL_MESSAGE);
  });

  it("an innocent query shows the normalized preview (what will persist)", async () => {
    harness = await mountDialog();
    await type(harness, "provider-name", "openrouter");
    await type(harness, "provider-url", "https://openrouter.ai/api/v1/?utm=1#frag");
    const text = document.body.textContent ?? "";
    expect(text).toContain("will be saved as: https://openrouter.ai/api/v1");
  });
});

describe("ConnectProviderDialog — the write path", () => {
  it("submit calls createModelProvider once with the normalized body and closes", async () => {
    harness = await mountDialog();
    const spy = vi.spyOn(harness.gateway, "createModelProvider");
    await type(harness, "provider-name", "openrouter");
    await type(harness, "provider-url", "https://openrouter.ai/api/v1/");
    await type(harness, "provider-key", FIXTURE_KEY);
    await submitForm();
    await actWaitUntil(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(spy.mock.calls[0][0]).toEqual({
      provider_key: "openrouter",
      base_url: "https://openrouter.ai/api/v1",
      credential: FIXTURE_KEY,
    });
    // Success closes the dialog — the metadata slot replaces the form and
    // the typed material is gone from the surface.
    expect(document.body.textContent).not.toContain(FIXTURE_KEY);
  });

  it("a server 503 surfaces its reason VERBATIM and the dialog stays open", async () => {
    harness = await mountDialog();
    vi.spyOn(harness.gateway, "createModelProvider").mockRejectedValue(
      new ApiError(
        503,
        "Подключение провайдеров выключено: на борде не настроен каталог секретов (VESMARO_SECRETS_DIR).",
      ),
    );
    await type(harness, "provider-name", "openrouter");
    await type(harness, "provider-url", "https://openrouter.ai/api/v1");
    await type(harness, "provider-key", FIXTURE_KEY);
    await submitForm();
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain(
        "Подключение провайдеров выключено",
      );
    });
    // The form is still there — the owner reads the reason and retries.
    expect(input(harness, "provider-name")).toBeDefined();
  });

  it("a 409 duplicate surfaces the server's named reason", async () => {
    harness = await mountDialog();
    vi.spyOn(harness.gateway, "createModelProvider").mockRejectedValue(
      new ApiError(409, "Провайдер с таким именем уже подключён."),
    );
    await type(harness, "provider-name", "openrouter");
    await type(harness, "provider-url", "https://openrouter.ai/api/v1");
    await type(harness, "provider-key", FIXTURE_KEY);
    await submitForm();
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain(
        "Провайдер с таким именем уже подключён",
      );
    });
  });
});

describe("ConnectProviderDialog — rotate mode (MF-CARD-ROTATE)", () => {
  it("the name is locked and prefilled, the address prefilled, the PUT path fires", async () => {
    harness = await mountDialog({
      providerKey: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      fingerprint: "3f9a21c0bde4",
      createdAt: "2026-10-24T00:00:00+00:00",
      rotatedAt: null,
      status: "set",
      lastUsedAt: null,
      rejectedAt: null,
    });
    const nameField = input(harness, "provider-name");
    expect(nameField.value).toBe("openrouter");
    expect(nameField.hasAttribute("disabled")).toBe(true);
    expect(input(harness, "provider-url").value).toBe(
      "https://openrouter.ai/api/v1",
    );
    const spy = vi.spyOn(harness.gateway, "rotateModelProvider");
    await type(harness, "provider-key", "sk-qa-fake-credential-placeholder-0002");
    await submitForm();
    await actWaitUntil(() => {
      expect(spy).toHaveBeenCalledTimes(1);
    });
    expect(spy.mock.calls[0][0]).toBe("openrouter");
    expect(spy.mock.calls[0][1]).toEqual({
      credential: "sk-qa-fake-credential-placeholder-0002",
    });
  });

  it("an address change rides the rotation and passes the same red line", async () => {
    harness = await mountDialog({
      providerKey: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      fingerprint: "3f9a21c0bde4",
      createdAt: null,
      rotatedAt: null,
      status: "set",
      lastUsedAt: null,
      rejectedAt: null,
    });
    const spy = vi.spyOn(harness.gateway, "rotateModelProvider");
    await type(harness, "provider-url", "https://api.deepseek.com/v1?key=1");
    await type(harness, "provider-key", "sk-qa-fake-credential-placeholder-0002");
    await submitForm();
    const text = document.body.textContent ?? "";
    expect(text).toContain(CREDENTIAL_IN_URL_MESSAGE);
    expect(spy).not.toHaveBeenCalled();
  });
});
