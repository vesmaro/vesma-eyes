// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ToastProvider } from "./ToastProvider";
import { ToastContext } from "./toastContext";
import type { ToastInput } from "./toastContext";
import { useContext } from "react";

/**
 * Displacement groups (fix/kora-auth-honesty, owner complaint on prod
 * 1.63.0): the auth pair — the red «Токен отклонён» and the green «Вход
 * выполнен» — used to STACK on one screen, telling opposite stories. A
 * later verdict in the same `displaces` group must REPLACE the earlier
 * one, in both directions. The probe renders the live entries itself —
 * the provider owns the state, the viewport only paints it.
 */

const mountedRoots: Root[] = [];

function mountToast(addToast: { current: ((input: ToastInput) => void) | null }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  function ToastProbe() {
    const view = useContext(ToastContext);
    if (!view) throw new Error("no ToastProvider above the probe");
    addToast.current = (input: ToastInput) => view.push(input);
    return (
      <div data-testid="live-toasts">
        {view.entries.map((entry) => (
          <p key={entry.key} data-testid={`toast-${entry.key}`}>
            {entry.title}
          </p>
        ))}
      </div>
    );
  }

  act(() => {
    root.render(
      <ToastProvider>
        <ToastProbe />
      </ToastProvider>,
    );
  });
  return {
    push: (input: ToastInput) =>
      act(() => {
        addToast.current?.(input);
      }),
    container,
  };
}

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await act(async () => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

describe("ToastProvider displacement groups", () => {
  it("a later «signed in» displaces the earlier «token rejected» in the same group", () => {
    const addToast: { current: ((input: ToastInput) => void) | null } = { current: null };
    const { push, container } = mountToast(addToast);
    push({ kind: "error", title: "Token rejected", displaces: "auth-session" });
    expect(container.textContent).toContain("Token rejected");
    push({ kind: "ok", title: "Signed in — control available", displaces: "auth-session" });
    expect(container.textContent).toContain("Signed in — control available");
    expect(container.textContent).not.toContain("Token rejected");
  });

  it("the displacement is symmetric — a later refusal displaces a stale success", () => {
    const addToast: { current: ((input: ToastInput) => void) | null } = { current: null };
    const { push, container } = mountToast(addToast);
    push({ kind: "ok", title: "Signed in — control available", displaces: "auth-session" });
    push({ kind: "error", title: "Token rejected", displaces: "auth-session" });
    expect(container.textContent).toContain("Token rejected");
    expect(container.textContent).not.toContain("Signed in — control available");
  });

  it("toasts outside the group are untouched", () => {
    const addToast: { current: ((input: ToastInput) => void) | null } = { current: null };
    const { push, container } = mountToast(addToast);
    push({ kind: "error", title: "Token rejected", displaces: "auth-session" });
    push({ kind: "ok", title: "TB-1: saved" }); // no group
    push({ kind: "ok", title: "Signed in — control available", displaces: "auth-session" });
    expect(container.textContent).toContain("Signed in — control available");
    expect(container.textContent).toContain("TB-1: saved");
    expect(container.textContent).not.toContain("Token rejected");
  });
});
