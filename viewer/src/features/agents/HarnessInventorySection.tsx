import { useState, useId } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HarnessInventoryEnvironment, ExecutorItem } from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import {
  gcwSpecialistsCount,
  inventoryCategories,
  type InventoryCategory,
} from "./harnessInventoryModel";

/**
 * «Обнаружено на хосте» (ME-064, agents-ui-spec §3.1): the harness
 * inventory dropdowns of the executor card — WHAT is plugged into the
 * host, as the agent's last discovery report mirrored it. Form (owner's
 * own words): a DROPDOWN on the card, not a tab; category counters are
 * visible immediately, names sit behind the disclosure, overflow says
 * «…и ещё N» (the counter is always full, the list is server-capped).
 *
 * Honesty (spec §5, errata Э3): no inventory → «нет данных» with the
 * agent-only explanation — a poller-connected host stays empty until
 * ME-056, and that is an ANSWER, never a «scanning» skeleton. Names,
 * never contents (secret discipline, §3.2) — nothing here renders file
 * bodies, only the agent's own public name facts.
 */

/** The fixed reading order (spec §3.2). */
const CATEGORY_LABELS: ReadonlyMap<InventoryCategory["key"], TranslationKey> = new Map([
  ["specialists", "agents.card.inventorySpecialists"],
  ["skills", "agents.card.inventorySkills"],
  ["plugins", "agents.card.inventoryPlugins"],
  ["instructions", "agents.card.inventoryInstructions"],
]);

export function HarnessInventorySection({ executor }: { executor: ExecutorItem }) {
  const t = useT();
  const environments = executor.harness_inventory ?? [];

  return (
    <section
      aria-label={t("agents.card.sectionInventory")}
      className="flex flex-col gap-2"
    >
      <h3 className="text-xs font-medium text-foreground-secondary">
        {t("agents.card.sectionInventory")}
      </h3>
      {environments.length === 0 ? (
        /* Э3: honest-empty — the discovery inventory is agent-only (Go);
         * poller hosts report nothing until ME-056. No skeletons. */
        <p className="text-xs text-foreground-muted">
          <span className="font-medium text-foreground-secondary">
            {t("agents.card.inventoryNone")}
          </span>{" "}
          {t("agents.card.inventoryNoneNote")}
        </p>
      ) : (
        environments.map((env) => <InventoryEnvironment key={env.name} env={env} />)
      )}
    </section>
  );
}

/** One harness environment: name line + the four category dropdowns. */
function InventoryEnvironment({ env }: { env: HarnessInventoryEnvironment }) {
  const categories = inventoryCategories(env);
  const gcwShare = gcwSpecialistsCount(env);

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border-subtle bg-elevated px-2.5 py-2">
      {/* Environment header: the store id; the host path rides the tooltip
       * (a host fact, secondary to the name — same tier as the card's
       * service facts). */}
      <p
        className="font-mono text-xs text-foreground-secondary"
        title={env.home_path || undefined}
      >
        {env.name}
        {env.kind ? <span className="text-foreground-muted"> · {env.kind}</span> : null}
      </p>
      <ul className="flex flex-col gap-0.5">
        {categories.map((category) => (
          <li key={category.key}>
            <InventoryDropdown
              category={category}
              gcwShare={category.key === "specialists" ? gcwShare : null}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One category dropdown: a disclosure button carrying the label and the
 * FULL counter (both visible collapsed — «счётчики видны сразу»), the
 * names behind it. Keyboard: the tech-details posture (native button,
 * aria-expanded/aria-controls, focus-visible ring).
 */
function InventoryDropdown({
  category,
  gcwShare,
}: {
  category: InventoryCategory;
  gcwShare: number | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const label = t(
    CATEGORY_LABELS.get(category.key) ?? "agents.card.inventorySpecialists",
  );

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate">{label}</span>
        {/* The counter is data, mono — never an i18n-agreement trap. */}
        <span className="ml-auto shrink-0 font-mono text-foreground-muted">
          {category.count}
        </span>
      </button>
      {open ? (
        <div id={listId} className="mt-0.5 pl-4">
          {category.names.length === 0 ? (
            <p className="text-xs text-foreground-muted">
              {t("agents.card.inventoryNoNames")}
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {category.names.map((name) => (
                <li
                  key={name}
                  className="break-all font-mono text-xs text-foreground-secondary"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
          {/* The honest overflow (spec §5): the list is capped, the counter
           * is not — the cut is VISIBLE, never silent. */}
          {category.overflow > 0 ? (
            <p className="mt-0.5 text-xs text-foreground-muted">
              {t("agents.card.inventoryOverflow", { count: category.overflow })}
            </p>
          ) : null}
          {gcwShare !== null && category.key === "specialists" ? (
            <p className="mt-0.5 text-xs text-foreground-muted">
              {t("agents.card.inventoryGcwShare", { count: gcwShare })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
