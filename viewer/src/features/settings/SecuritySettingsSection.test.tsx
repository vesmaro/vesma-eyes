// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { SecuritySettingsSection } from "./SecuritySettingsSection";
import { AuthContext } from "@/features/auth/AuthContext";
import type { AuthContextValue } from "@/features/auth/AuthContext";
import { UiTokenContext } from "@/features/ui-token/UiTokenContext";
import type { UiTokenContextValue } from "@/features/ui-token/UiTokenContext";
import { PasswordRateLimitedError } from "@/gateway/passwordAuth";
import { ApiError } from "@/lib/errors";
import { I18nProvider } from "@/i18n";
import { ToastProvider } from "@/components/Toast/ToastProvider";
import { ToastContext } from "@/components/Toast/toastContext";
import type { ToastEntry } from "@/components/Toast/toastContext";
import { useContext } from "react";
import { setPasswordUser, clearPasswordUser } from "@/features/auth/passwordSession";
import { actUnmount } from "@/test/actTools";

/**
 * The settings «Безопасность» form (ME-080 follow-up): the leg honesty line
 * (session vs token vs unavailable), the whoami prefill, client validation
 * before the wire, the human verdicts (401 wrong current + focus, 403
 * owner-only recovery, 429 with the server's Retry-After N, 422 detail on
 * the tech line), and the success beat (toast + fields cleared). The wire
 * enters through the AuthContext seam — stubbed here, unit-tested in
 * passwordAuth.test.ts.
 */

const mountedRoots: Root[] = [];

function stubAuth(options: {
  passwordUser?: { username: string; role: "owner" | "member" } | null;
  setPassword?: AuthContextValue["setPassword"];
}): AuthContextValue {
  return {
    passwordUser: options.passwordUser ?? null,
    setPassword: options.setPassword ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthContextValue;
}

function stubUiToken(tokenPresent: boolean): UiTokenContextValue {
  return {
    tokenPresent,
    openLogin: () => undefined,
    runAuthorized: (run: () => Promise<void>) => void run(),
    logout: () => undefined,
    submitToken: () => undefined,
    verifyPending: false,
  } as unknown as UiTokenContextValue;
}

/**
 * Renders the live toast titles into the DOM (the viewport paints them in
 * the Shell; here the probe is the honest source — same pattern as the
 * displaces test).
 */
function ToastProbe() {
  const view = useContext(ToastContext);
  if (!view) throw new Error("no ToastProvider above the probe");
  return (
    <ul data-testid="toast-titles">
      {view.entries.map((entry: ToastEntry) => (
        <li key={entry.key}>{entry.title}</li>
      ))}
    </ul>
  );
}

async function mountSecurity(options: {
  passwordUser?: { username: string; role: "owner" | "member" } | null;
  tokenPresent?: boolean;
  setPassword?: AuthContextValue["setPassword"];
}): Promise<{ container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(
      <I18nProvider initialLang="en">
        <AuthContext.Provider value={stubAuth(options)}>
          <UiTokenContext.Provider value={stubUiToken(options.tokenPresent ?? false)}>
            <ToastProvider>
              <MemoryRouter>
                <SecuritySettingsSection />
                <ToastProbe />
              </MemoryRouter>
            </ToastProvider>
          </UiTokenContext.Provider>
        </AuthContext.Provider>
      </I18nProvider>,
    );
  });
  return { container };
}

function input(container: HTMLElement, testId: string): HTMLInputElement {
  const field = container.querySelector<HTMLInputElement>(`[data-testid="${testId}"]`);
  if (!field) throw new Error(`input "${testId}" not rendered`);
  return field;
}

function setInputValue(inputEl: HTMLInputElement, value: string): void {
  const proto = Object.getPrototypeOf(inputEl) as HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(inputEl, value);
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
}

async function submitValid(
  container: HTMLElement,
  overrides: Partial<{ username: string; current: string; next: string; confirm: string }> = {},
): Promise<void> {
  const username = input(container, "security-username");
  const next = input(container, "security-next");
  const confirm = input(container, "security-confirm");
  act(() => {
    setInputValue(username, overrides.username ?? "abyss");
    setInputValue(next, overrides.next ?? "parol-nadezhnyy-123");
    setInputValue(confirm, overrides.confirm ?? "parol-nadezhnyy-123");
  });
  if (overrides.current !== undefined) {
    const current = input(container, "security-current");
    const value = overrides.current;
    act(() => {
      setInputValue(current, value);
    });
  }
  await act(async () => {
    const save = container.querySelector('[data-testid="security-save"]');
    if (!save) throw new Error("the save button is not rendered");
    (save as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  clearPasswordUser();
});

afterEach(async () => {
  clearPasswordUser();
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("SecuritySettingsSection — leg honesty", () => {
  it("a password person: the session-leg line + the name prefilled from the whoami mirror", async () => {
    setPasswordUser({ username: "abyss", role: "owner" });
    const { container } = await mountSecurity({
      passwordUser: { username: "abyss", role: "owner" },
      tokenPresent: true,
    });
    expect(container.querySelector('[data-testid="security-leg-line"]')?.textContent).toBe(
      "You are signed in with a password: this changes your own account's password — the current password is required.",
    );
    expect(input(container, "security-username").value).toBe("abyss");
  });

  it("a token-only browser: the token-recovery line, the name starts empty", async () => {
    const { container } = await mountSecurity({ tokenPresent: true });
    expect(container.querySelector('[data-testid="security-leg-line"]')?.textContent).toBe(
      "You are signed in with a token: a new password can be set for an account without the current one (recovery).",
    );
    expect(input(container, "security-username").value).toBe("");
  });

  it("anonymous: NO form — the honesty line says why", async () => {
    const { container } = await mountSecurity({});
    expect(container.querySelector('[data-testid="security-leg-line"]')?.textContent).toBe(
      "The form is unavailable: no active sign-in. Sign in with a password or a token and come back.",
    );
    expect(container.querySelector('[data-testid="security-save"]')).toBeNull();
  });
});

describe("SecuritySettingsSection — client validation before the wire", () => {
  it("short password + mismatch + empty name: field issues, setPassword never called", async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    const { container } = await mountSecurity({
      tokenPresent: true,
      setPassword,
    });
    await act(async () => {
      setInputValue(input(container, "security-username"), "");
      setInputValue(input(container, "security-next"), "short");
      setInputValue(input(container, "security-confirm"), "different-long-enough");
      (container.querySelector('[data-testid="security-save"]') as HTMLButtonElement).click();
    });
    expect(container.querySelector('[data-testid="security-username-issue"]')?.textContent).toBe(
      "Enter the name.",
    );
    expect(container.querySelector('[data-testid="security-next-issue"]')?.textContent).toContain(
      "at least 8",
    );
    expect(container.querySelector('[data-testid="security-confirm-issue"]')?.textContent).toContain(
      "do not match",
    );
    expect(setPassword).not.toHaveBeenCalled();
  });
});

describe("SecuritySettingsSection — wire verdicts and the success beat", () => {
  it("success: the wire gets the trimmed name + passwords (current only when typed), toast fires, password fields clear", async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    const { container } = await mountSecurity({
      tokenPresent: true,
      setPassword,
    });
    await submitValid(container, { username: "  abyss  ", current: "staryy-parol-123" });
    expect(setPassword).toHaveBeenCalledWith({
      username: "abyss",
      newPassword: "parol-nadezhnyy-123",
      currentPassword: "staryy-parol-123",
    });
    expect(container.querySelector('[data-testid="toast-titles"]')?.textContent).toContain(
      "Password updated",
    );
    expect(input(container, "security-current").value).toBe("");
    expect(input(container, "security-next").value).toBe("");
    expect(input(container, "security-confirm").value).toBe("");
  });

  it("empty current stays absent from the wire body (the token-recovery shape)", async () => {
    const setPassword = vi.fn().mockResolvedValue(undefined);
    const { container } = await mountSecurity({ tokenPresent: true, setPassword });
    await submitValid(container);
    expect(setPassword).toHaveBeenCalledWith({
      username: "abyss",
      newPassword: "parol-nadezhnyy-123",
    });
  });

  it("401: «The current password does not match.» and focus moves to the current field", async () => {
    const setPassword = vi.fn().mockRejectedValue(
      new ApiError(401, "current password mismatch"),
    );
    const { container } = await mountSecurity({ tokenPresent: true, setPassword });
    await submitValid(container);
    expect(container.querySelector('[data-testid="auth-verdict"]')?.textContent).toContain(
      "The current password does not match.",
    );
    expect(document.activeElement).toBe(input(container, "security-current"));
  });

  it("403: the owner-only recovery verdict (unknown account answers the same — no oracle)", async () => {
    const setPassword = vi.fn().mockRejectedValue(
      new ApiError(403, "password recovery is owner-only"),
    );
    const { container } = await mountSecurity({ tokenPresent: true, setPassword });
    await submitValid(container, { username: "who-is-this" });
    expect(container.querySelector('[data-testid="auth-verdict"]')?.textContent).toContain(
      "Not allowed: password recovery is available to the owner.",
    );
  });

  it("429: the verdict counts down from the server's Retry-After", async () => {
    const setPassword = vi.fn().mockRejectedValue(new PasswordRateLimitedError(30));
    const { container } = await mountSecurity({ tokenPresent: true, setPassword });
    await submitValid(container);
    expect(container.querySelector('[data-testid="auth-verdict"]')?.textContent).toContain(
      "Too many attempts — wait 30 s and try again.",
    );
  });

  it("429 without the header: the default 60 s wait", async () => {
    const setPassword = vi.fn().mockRejectedValue(new PasswordRateLimitedError(null));
    const { container } = await mountSecurity({ tokenPresent: true, setPassword });
    await submitValid(container);
    expect(container.querySelector('[data-testid="auth-verdict"]')?.textContent).toContain(
      "wait 60 s",
    );
  });

  it("422: the honest save-failed line + the server detail on the expandable tech line", async () => {
    const setPassword = vi.fn().mockRejectedValue(
      new ApiError(422, "password is too long (max 512)"),
    );
    const { container } = await mountSecurity({ tokenPresent: true, setPassword });
    await submitValid(container);
    const verdict = container.querySelector('[data-testid="auth-verdict"]');
    expect(verdict?.textContent).toContain("Could not save the password.");
    expect(verdict?.querySelector('[data-testid="auth-verdict-detail"]')?.textContent).toContain(
      "password is too long (max 512)",
    );
  });
});
