// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { actUnmount } from "@/test/actTools";
import { KoraResizeHandle } from "./KoraResizeHandle";
import { useKoraBandHeight } from "./useKoraBandHeight";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The BAND height mechanics (07l §3.1–3.2) — the ex-Пульт hardware, KW1
 * dissolved the strip but the mechanics SURVIVE here for KW2's «Все ходы»
 * zone (kora-rethink blueprint §6: «механика Пульта переезжает целиком»).
 * The harness mounts the hook THROUGH a real KoraResizeHandle wired to the
 * REAL koraMovesH keepers (the exact wiring the zone ships): auto by
 * content (≤280) vs fixed 160–420, persist ONLY on commit
 * (vesmaro.koraMovesH), the <120 гистерезис collapses, dblclick/Home resets
 * to auto by REMOVING the key.
 */

import { clearKoraMovesH, readKoraMovesH, writeKoraMovesH } from "./koraFrameStorage";

const readers = {
  readH: readKoraMovesH,
  writeH: writeKoraMovesH,
  clearH: clearKoraMovesH,
};

/** The zone stand: strip toggle + a top seam wired to the band hook. */
function BandStand(): React.ReactElement {
  const {
    fixedH,
    expanded,
    seamValue,
    bodyRef,
    toggle,
    collapse,
    onValue,
    onCommit,
    onReset,
  } = useKoraBandHeight(readers);
  return (
    <section>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="band-body"
        onClick={toggle}
      >
        toggle
      </button>
      <KoraResizeHandle
        orientation="horizontal"
        label="Band height"
        tooltip="Drag to resize the height. Double-click to restore"
        min={160}
        max={420}
        value={seamValue}
        valueText={String(seamValue)}
        dragSign={1}
        collapseBelow={120}
        onValue={onValue}
        onCommit={onCommit}
        onReset={onReset}
        onCollapse={collapse}
      />
      {expanded ? (
        <div
          id="band-body"
          ref={bodyRef}
          style={{
            height: fixedH > 0 ? fixedH : undefined,
            maxHeight: fixedH > 0 ? undefined : 280,
          }}
        >
          body
        </div>
      ) : null}
    </section>
  );
}

const mountedRoots: Root[] = [];

function mountBand(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  act(() => {
    root.render(
      <I18nProvider initialLang="ru">
        <BandStand />
      </I18nProvider>,
    );
  });
  return container;
}

async function keyOn(
  element: HTMLElement,
  type: "keydown" | "keyup" | "dblclick" | "focusin",
  keyName?: string,
): Promise<void> {
  await act(async () => {
    if (type === "dblclick") {
      element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    } else if (type === "focusin") {
      element.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    } else {
      element.dispatchEvent(
        new KeyboardEvent(type, {
          key: keyName ?? "",
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  });
}

const seam = (container: HTMLElement): HTMLElement => {
  const found = container.querySelector<HTMLElement>('[role="separator"]');
  if (found === null) throw new Error("band seam not rendered");
  return found;
};
const toggle = (container: HTMLElement): HTMLButtonElement => {
  const found = container.querySelector<HTMLButtonElement>(
    'button[aria-controls="band-body"]',
  );
  if (found === null) throw new Error("band toggle not rendered");
  return found;
};

afterEach(async () => {
  while (mountedRoots.length > 0) {
    await actUnmount(mountedRoots.pop()!);
  }
  document.body.innerHTML = "";
  localStorage.clear();
});

describe("useKoraBandHeight — the ex-Пульт height mechanics (07l §3, KW2 «Все ходы»)", () => {
  it("starts collapsed; a keyboard deploy from the strip persists ONLY on commit", async () => {
    const container = mountBand();
    expect(toggle(container).getAttribute("aria-expanded")).toBe("false");
    expect(seam(container).getAttribute("aria-valuenow")).toBe("40"); // the strip
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull();

    // Deploy via the strip toggle, then a keyboard step to the minimum —
    // the commit (keyup) writes the fixed height.
    await act(async () => {
      toggle(container).click();
    });
    expect(toggle(container).getAttribute("aria-expanded")).toBe("true");
    await keyOn(seam(container), "focusin");
    await keyOn(seam(container), "keydown", "ArrowUp");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull(); // not yet
    await keyOn(seam(container), "keyup", "ArrowUp");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBe("160");
    expect(seam(container).getAttribute("aria-valuenow")).toBe("160");
  });

  it("restores a persisted fixed height on mount; Home/dblclick resets to auto by REMOVING the key", async () => {
    localStorage.setItem("vesmaro.koraMovesH", "240");
    const container = mountBand();
    // The seam honestly mirrors the collapsed strip until deployed; the
    // restored height applies when the band opens.
    expect(seam(container).getAttribute("aria-valuenow")).toBe("40");
    await act(async () => {
      toggle(container).click();
    });
    expect(seam(container).getAttribute("aria-valuenow")).toBe("240");
    expect(
      (document.getElementById("band-body") as HTMLElement).style.height,
    ).toBe("240px");

    await keyOn(seam(container), "focusin");
    await keyOn(seam(container), "keydown", "Home");
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull(); // auto = absent
    expect(seam(container).getAttribute("aria-valuenow")).not.toBe("40"); // stays deployed
    await act(async () => {
      seam(container).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(localStorage.getItem("vesmaro.koraMovesH")).toBeNull();
  });

  it("the collapse гистерезис: a seam move below 120 folds the band; a later move deploys", async () => {
    const container = mountBand();
    await act(async () => {
      toggle(container).click();
    });
    await keyOn(seam(container), "focusin");
    // A keyboard NARROWING step below the minimum is the intent to collapse
    // (the seam's stickiness, mirrored for the keyboard).
    await keyOn(seam(container), "keydown", "ArrowDown");
    expect(toggle(container).getAttribute("aria-expanded")).toBe("false");
    // From the strip, a deliberate move deploys again.
    await keyOn(seam(container), "keydown", "ArrowUp");
    expect(toggle(container).getAttribute("aria-expanded")).toBe("true");
    expect(seam(container).getAttribute("aria-valuenow")).toBe("160");
  });
});
