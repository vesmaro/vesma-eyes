// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  APPEARANCE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  THEME_STORAGE_KEY,
  PRESET_ATTR,
  ThemeProvider,
  useTheme,
} from "./theme-provider";
import { actUnmount } from "@/test/actTools";

/**
 * Theme contract: UI-23 three-state preference (spec §2.1/§4.2, acceptance
 * §8.2/8.3) EXTENDED by the presets registry (themes-presets-wave1, brief
 * §1): five lore-named presets + «Системная» as a mode on top. Storage:
 * `vesmaro.theme` keeps its UI-23 semantics ("dark"/"light" = explicit
 * family, absent = system; legacy key read-only), `vesmaro.appearance`
 * carries the per-family preset SLOTS so the top-bar family toggle never
 * resets the chosen preset to the family default.
 */

type MediaListener = (event: { matches: boolean }) => void;

let lightMatches = false;
let mediaListeners: MediaListener[] = [];

function stubMatchMedia(): void {
  mediaListeners = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("light") ? lightMatches : false,
      addEventListener: (_type: string, listener: MediaListener) => {
        mediaListeners.push(listener);
      },
      removeEventListener: (_type: string, listener: MediaListener) => {
        mediaListeners = mediaListeners.filter((item) => item !== listener);
      },
    })),
  );
}

function emitMediaChange(matches: boolean): void {
  lightMatches = matches;
  for (const listener of [...mediaListeners]) listener({ matches });
}

function Probe() {
  const { theme, presetChoice, resolvedPreset, setPreset, toggleTheme } = useTheme();
  return (
    <div>
      <output
        id="probe-theme"
        data-theme={theme}
        data-choice={presetChoice}
        data-preset={resolvedPreset}
      />
      <button id="set-system" onClick={() => setPreset("system")}>
        system
      </button>
      <button id="set-light" onClick={() => setPreset("light")}>
        light
      </button>
      <button id="set-dark" onClick={() => setPreset("well")}>
        well
      </button>
      <button id="set-zhila" onClick={() => setPreset("zhila")}>
        zhila
      </button>
      <button id="set-sozvezdia" onClick={() => setPreset("sozvezdia")}>
        sozvezdia
      </button>
      <button id="set-prosvet" onClick={() => setPreset("prosvet")}>
        prosvet
      </button>
      <button id="toggle" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

async function mountTheme(): Promise<{ root: Root; container: HTMLElement }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
  });
  return { root, container };
}

function probe(container: HTMLElement): HTMLOutputElement {
  return container.querySelector<HTMLOutputElement>("#probe-theme")!;
}

function click(container: HTMLElement, id: string): void {
  act(() => {
    container.querySelector<HTMLButtonElement>(`#${id}`)!.click();
  });
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  lightMatches = false;
  stubMatchMedia();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
    true;
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("theme provider — «Системная» mode on top (UI-23 §2.1 semantics kept)", () => {
  it("defaults to system, resolves the family against the OS, applies the Колодец preset (no attribute)", async () => {
    const { root, container } = await mountTheme();
    expect(probe(container).dataset.choice).toBe("system");
    expect(probe(container).dataset.theme).toBe("dark");
    expect(probe(container).dataset.preset).toBe("well");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    await actUnmount(root);
  });

  it("an explicit preset writes ONLY the new registry keys (legacy stays read-only)", async () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "light"); // pre-migration pick
    const { root, container } = await mountTheme();
    click(container, "set-zhila");
    expect(probe(container).dataset.choice).toBe("zhila");
    expect(document.documentElement.dataset.theme).toBe("zhila");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark"); // family lock
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)).toEqual({
      lastDark: "zhila",
      lastLight: "light",
    });
    // The legacy record is never written (an old-version tab keeps its pick).
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBe("light");
    await actUnmount(root);
  });

  it("«Системная» removes BOTH theme records, keeps the preset slots, follows the OS live (§8.2)", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "light");
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ lastDark: "sozvezdia", lastLight: "prosvet" }),
    );
    const { root, container } = await mountTheme();
    expect(probe(container).dataset.preset).toBe("prosvet");

    click(container, "set-system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_THEME_STORAGE_KEY)).toBeNull();
    // The slots SURVIVE the mode switch (toggle must land back on them).
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)).toEqual({
      lastDark: "sozvezdia",
      lastLight: "prosvet",
    });
    expect(probe(container).dataset.choice).toBe("system");

    // The unit on the media event: the resolved family flips with the OS —
    // and each family lands on ITS last preset, not the default.
    act(() => emitMediaChange(true));
    expect(probe(container).dataset.preset).toBe("prosvet");
    expect(document.documentElement.dataset.theme).toBe("prosvet");
    act(() => emitMediaChange(false));
    expect(probe(container).dataset.preset).toBe("sozvezdia");
    expect(document.documentElement.dataset.theme).toBe("sozvezdia");
    await actUnmount(root);
  });

  it("the two-position toggle writes the explicit opposite of the resolved family", async () => {
    const { root, container } = await mountTheme();
    click(container, "toggle"); // system/dark → explicit light (Береста)
    expect(probe(container).dataset.theme).toBe("light");
    expect(probe(container).dataset.preset).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    click(container, "toggle"); // light → dark
    expect(probe(container).dataset.preset).toBe("well");
    await actUnmount(root);
  });
});

describe("theme provider — preset slots vs family (brief §1: the toggle never resets the preset)", () => {
  it("toggling away from «Жила» and back returns to «Жила», not the family default", async () => {
    const { root, container } = await mountTheme();
    click(container, "set-zhila"); // explicit dark family, lastDark = zhila
    expect(document.documentElement.dataset.theme).toBe("zhila");

    click(container, "toggle"); // family flip → light, slot lastLight = light
    expect(probe(container).dataset.theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    click(container, "toggle"); // family flip back → «Жила», NOT Колодец
    expect(probe(container).dataset.preset).toBe("zhila");
    expect(document.documentElement.dataset.theme).toBe("zhila");
    await actUnmount(root);
  });

  it("each family remembers its own slot; the other family's choice is untouched", async () => {
    const { root, container } = await mountTheme();
    click(container, "set-zhila");
    click(container, "set-prosvet"); // light family, lastLight = prosvet
    expect(document.documentElement.dataset.theme).toBe("prosvet");
    click(container, "toggle"); // → dark family → «Жила»
    expect(probe(container).dataset.preset).toBe("zhila");
    click(container, "toggle"); // → light family → «Просвет», NOT Береста
    expect(probe(container).dataset.preset).toBe("prosvet");
    expect(JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY)!)).toEqual({
      lastDark: "zhila",
      lastLight: "prosvet",
    });
    await actUnmount(root);
  });

  it("Колодец removes the attribute; every preset maps to its documented [data-theme] value", async () => {
    const { root, container } = await mountTheme();
    for (const [preset, attr] of Object.entries(PRESET_ATTR)) {
      click(container, preset === "well" ? "set-dark" : `set-${preset}`);
      if (attr === null) {
        expect(document.documentElement.dataset.theme, preset).toBeUndefined();
      } else {
        expect(document.documentElement.dataset.theme, preset).toBe(attr);
      }
    }
    await actUnmount(root);
  });
});

describe("theme migration (spec §4.2 / acceptance §8.3 — storage compat intact)", () => {
  it("reads the legacy key when the new one is absent", async () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "light");
    const { root, container } = await mountTheme();
    expect(probe(container).dataset.theme).toBe("light");
    expect(probe(container).dataset.preset).toBe("light"); // Береста, not moved
    await actUnmount(root);
  });

  it("a pre-wave 'light' record lands on Береста with default slots (no migration writes)", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { root, container } = await mountTheme();
    expect(probe(container).dataset.preset).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    // Reading alone must not write the new record (an old-version tab in
    // another window must not lose its pick).
    expect(localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull();
    await actUnmount(root);
  });

  it("the new key wins over the legacy one", async () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "light");
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { root, container } = await mountTheme();
    expect(probe(container).dataset.theme).toBe("dark");
    await actUnmount(root);
  });

  it("a corrupt legacy value falls back to system (no complaints)", async () => {
    localStorage.setItem(LEGACY_THEME_STORAGE_KEY, "sepia");
    const { root, container } = await mountTheme();
    expect(probe(container).dataset.choice).toBe("system");
    await actUnmount(root);
  });

  it("a corrupt slots record falls back to the canonical defaults slot-by-slot", async () => {
    localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ lastDark: "sepia", lastLight: 42, extra: true }),
    );
    const { root, container } = await mountTheme();
    expect(probe(container).dataset.preset).toBe("well"); // dark family default
    await actUnmount(root);
  });
});
