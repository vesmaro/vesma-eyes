import { useT } from "@/i18n";
import type { GateDomain } from "./gateDomains";

/**
 * The gate-screen mini-preview (U1, unification spec: «Gate-слой v12 —
 * взять целиком… Доработка: мини-превью раздела в gate-странице»).
 *
 * A STATIC structural sketch of the gated domain — the SHAPE a signed-in
 * visitor will land on (a list, a kanban, a roster, a journal, a stat hub),
 * drawn purely with the token furniture: hairline myelin bars, the domain's
 * strata wash (canon after the 2026-10-07 strata resolution: the wash is an
 * ambient SECTION surface — a preview sketch carries no text, so it can
 * never be a passive text-card background), radius/well surfaces.
 *
 * Honesty rules (07k §0 + красные линии): no content, no blur, no shimmer —
 * a shimmer would promise LOADING, and nothing loads here; the sketch is
 * aria-hidden decoration and the caption below says exactly what it is.
 * Reduced-motion needs no mirror: nothing moves, ever.
 */

const STRATA_WASH: Record<GateDomain["previewKind"], string> = {
  list: "bg-strata-memory",
  board: "bg-strata-tasks",
  roster: "bg-strata-agents",
  // Кора is a leaf domain — no strata wash in the sidebar map; the resting
  // myelin tint is its honest ambient (same rule as its nav rows).
  journal: "bg-myelin-hairline",
  hub: "bg-strata-system",
};

/** One soft bar of the sketch (myelin-strong — decorative, ≥form-level). */
function Bar({ className }: { className: string }) {
  return <span aria-hidden="true" className={`rounded-full bg-myelin-strong ${className}`} />;
}

function SketchList() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2, 3].map((row) => (
        <div
          key={row}
          className="flex items-center gap-2 border-b border-myelin-hairline pb-2 last:border-b-0 last:pb-0"
        >
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-synapse-idle" />
          <Bar className="h-2 flex-1" />
          <Bar className="h-2 w-8" />
        </div>
      ))}
    </div>
  );
}

function SketchBoard() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((col) => (
        <div key={col} className="flex flex-col gap-2">
          <Bar className="h-1.5 w-3/4" />
          <div className="rounded-sm border border-myelin-hairline p-1.5">
            <Bar className="h-2 w-full" />
          </div>
          <div className="rounded-sm border border-myelin-hairline p-1.5">
            <Bar className="h-2 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SketchRoster() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="flex items-center gap-2 rounded-sm border border-myelin-hairline px-2 py-1.5"
        >
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-iris-dim" />
          <Bar className="h-2 w-1/3" />
          <span className="flex-1" />
          <Bar className="h-2 w-10" />
        </div>
      ))}
    </div>
  );
}

function SketchJournal() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1].map((row) => (
        <div key={row} className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className="mt-0.5 h-8 w-0.5 shrink-0 rounded-full bg-myelin-strong"
          />
          <div className="flex flex-1 flex-col gap-1.5">
            <Bar className="h-2 w-1/4" />
            <Bar className="h-2 w-full" />
            <Bar className="h-2 w-5/6" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SketchHub() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[0, 1, 2, 3].map((cell) => (
        <div
          key={cell}
          className="flex flex-col gap-1.5 rounded-sm border border-myelin-hairline p-2"
        >
          <Bar className="h-2 w-1/2" />
          <Bar className="h-2 w-1/3" />
        </div>
      ))}
    </div>
  );
}

const SKETCHES: Record<GateDomain["previewKind"], () => React.ReactElement> = {
  list: SketchList,
  board: SketchBoard,
  roster: SketchRoster,
  journal: SketchJournal,
  hub: SketchHub,
};

export function GatePreview({ domain }: { domain: GateDomain }) {
  const t = useT();
  const Sketch = SKETCHES[domain.previewKind];
  return (
    <figure
      data-testid="gate-preview"
      className="mt-2 w-full max-w-sm rounded-lg border border-border-subtle bg-well p-4 shadow-well"
    >
      <div
        aria-hidden="true"
        className={`rounded-md ${STRATA_WASH[domain.previewKind]} p-3`}
      >
        <Sketch />
      </div>
      <figcaption className="mt-2 text-center text-caps tracking-caps text-foreground-muted">
        {t("auth.gate.previewCaption")}
      </figcaption>
    </figure>
  );
}
