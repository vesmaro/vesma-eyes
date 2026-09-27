// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";

import { KoraPage } from "./KoraPage";
import { KoraSessionPage } from "./KoraSessionPage";
import type { KoraGateway } from "./koraGateway";
import { KoraGatewayContext } from "./koraGatewayContext";
import { ApiError } from "@/lib/errors";
import { UiTokenContext } from "@/features/ui-token/UiTokenContext";
import { I18nProvider } from "@/i18n";
import { actUnmount, actWaitUntil } from "@/test/actTools";

/**
 * The kora 401 gate (owner-feedback hotfix): when the session reads answer
 * 401 — the https-born cookie withheld on http, or the 6h idle TTL rotted —
 * the screens show the sign-in CTA («Сессия не активна» + «Войти» opening
 * the ONE app login window via the ui-token gate's openLogin) instead of
 * the raw error block, and refetch once a login lands. A 500 keeps the
 * honest retry error state — the CTA is strictly the 401 branch.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** ME-006: unmount in afterEach — query settlements stay inside act. */
const mountedRoots: Root[] = [];

/** Gateway stub: every read rejects with the scripted status, counted. */
function rejectingGateway(status: number): {
  gateway: KoraGateway;
  calls: { sessions: number; transcript: number };
} {
  const calls = { sessions: 0, transcript: 0 };
  const fail = () => Promise.reject(new ApiError(status, "scripted rejection"));
  const gateway = {
    listSessions: vi.fn(() => {
      calls.sessions += 1;
      return fail();
    }),
    getTranscript: vi.fn(() => {
      calls.transcript += 1;
      return fail();
    }),
  };
  return { gateway: gateway as unknown as KoraGateway, calls };
}

function mountAuthGate(
  component: React.ReactNode,
  path: string,
  status: number,
): {
  calls: { sessions: number; transcript: number };
  openLogin: ReturnType<typeof vi.fn>;
  signIn: () => void;
} {
  const { gateway, calls } = rejectingGateway(status);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const root = createRoot(document.body);
  mountedRoots.push(root);
  const openLogin = vi.fn();
  const render = (tokenPresent: boolean) => {
    root.render(
      <KoraGatewayContext.Provider value={gateway}>
        <QueryClientProvider client={client}>
          <UiTokenContext.Provider
            value={{
              tokenPresent,
              openLogin,
              runAuthorized: (run) => void run(),
              logout: () => undefined,
            }}
          >
            <I18nProvider initialLang="ru">
              {/* The route pattern is part of the harness: useParams on the
               * session page only resolves against a declared path. */}
              <MemoryRouter initialEntries={[path]}>
                <Routes>
                  <Route path="/kora" element={component} />
                  <Route path="/kora/:sessionId" element={component} />
                </Routes>
              </MemoryRouter>
            </I18nProvider>
          </UiTokenContext.Provider>
        </QueryClientProvider>
      </KoraGatewayContext.Provider>,
    );
  };
  act(() => {
    render(false);
  });
  // The login beat: the gate flips tokenPresent (a successful login
  // anywhere in the app) and the consumers re-render off the context.
  const signIn = () => {
    act(() => {
      render(true);
    });
  };
  return { calls, openLogin, signIn };
}

const buttonByText = (text: string): HTMLButtonElement => {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.includes(text),
  );
  if (!found) throw new Error(`button "${text}" not rendered`);
  return found;
};

afterEach(async () => {
  for (const root of mountedRoots.splice(0)) {
    await actUnmount(root);
  }
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("kora 401 gate — session list", () => {
  it("renders the sign-in CTA instead of the raw error block on 401", async () => {
    mountAuthGate(<KoraPage />, "/kora", 401);
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain("Сессия не активна");
    });
    expect(document.body.textContent).toContain(
      "Войдите — и сессии хостов появятся здесь",
    );
    // The old story is gone: no failed-load verdict, no Retry button.
    expect(document.body.textContent).not.toContain(
      "Не удалось загрузить список сессий",
    );
    expect(document.body.textContent).not.toContain("Повторить");
  });

  it("«Войти» opens the ONE login window (gate openLogin)", async () => {
    const { openLogin } = mountAuthGate(<KoraPage />, "/kora", 401);
    await actWaitUntil(() => {
      buttonByText("Войти");
    });
    expect(openLogin).not.toHaveBeenCalled();
    await act(async () => {
      buttonByText("Войти").click();
    });
    expect(openLogin).toHaveBeenCalledTimes(1);
  });

  it("refetches the sessions once a login lands (tokenPresent false→true)", async () => {
    const { calls, signIn } = mountAuthGate(<KoraPage />, "/kora", 401);
    await actWaitUntil(() => {
      expect(calls.sessions).toBe(1);
    });
    signIn();
    await actWaitUntil(() => {
      expect(calls.sessions).toBe(2);
    });
  });

  it("keeps the honest retry error block on 500 — no CTA", async () => {
    mountAuthGate(<KoraPage />, "/kora", 500);
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain(
        "Не удалось загрузить список сессий",
      );
    });
    expect(document.body.textContent).toContain("Повторить");
    expect(document.body.textContent).not.toContain("Сессия не активна");
  });
});

describe("kora 401 gate — transcript page", () => {
  it("renders the sign-in CTA instead of the transcript error on 401", async () => {
    mountAuthGate(<KoraSessionPage />, "/kora/sess-1", 401);
    await actWaitUntil(() => {
      expect(document.body.textContent).toContain("Сессия не активна");
    });
    expect(document.body.textContent).toContain(
      "Войдите — и транскрипт этой сессии появится здесь",
    );
    expect(document.body.textContent).not.toContain(
      "Не удалось загрузить транскрипт",
    );
    // The way back to the list stays reachable.
    expect(document.body.textContent).toContain("К списку сессий");
  });

  it("refetches both reads once a login lands", async () => {
    const { calls, signIn } = mountAuthGate(
      <KoraSessionPage />,
      "/kora/sess-1",
      401,
    );
    await actWaitUntil(() => {
      expect(calls.sessions).toBe(1);
      expect(calls.transcript).toBe(1);
    });
    signIn();
    await actWaitUntil(() => {
      expect(calls.sessions).toBe(2);
      expect(calls.transcript).toBe(2);
    });
  });
});
