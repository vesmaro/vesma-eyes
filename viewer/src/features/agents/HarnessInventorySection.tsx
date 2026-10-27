import { useState, useId } from "react";
import { Link } from "react-router";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { HarnessInventoryEnvironment, ExecutorItem } from "@/gateway/boardTypes";
import { useT } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { Badge } from "@/components/ui/badge";
import {
  gcwSpecialistsCount,
  inventoryCategories,
  type InventoryCategory,
  type InventoryCategoryKey,
} from "./harnessInventoryModel";
import {
  execEnvBadgeTitle,
  inventoryRowExecEnv,
  inventoryRowFoundTrail,
} from "./execEnvModel";

/**
 * «Обнаружено на хосте» (ME-064, agents-ui-spec §3.1): the harness
 * inventory dropdowns of the executor card — WHAT is plugged into the
 * host, as the agent's last discovery report mirrored it. Form (owner's
 * own words): a DROPDOWN on the card, not a tab; category counters are
 * visible immediately, names sit behind the disclosure, overflow says
 * «…и ещё N» (the counter is always full, the list is server-capped).
 *
 * Interactive record cards (owner directive 2026-10-21, wave
 * specialists-interactive-cards): a name is a disclosure ROW — opening it
 * renders the record HUMANLY (name / record type / environment facts /
 * the honest no-description line), never raw. Actions ride EXISTING
 * routes only (no new server handles): specialists deep-link the task
 * list's ?agent= filter and the execution page's ?specialist= seed;
 * every other record type gets the task-mention search plus the honest
 * «no other actions» line — a missing action is STATED, never a dead
 * button. The pre-wave raw name list survives under its own collapsed
 * disclosure («сырой ход под катом»).
 *
 * Honesty (spec §5, errata Э3): no inventory → «нет данных» with the
 * agent-only explanation — a poller-connected host stays empty until
 * ME-056, and that is an ANSWER, never a «scanning» skeleton. Names,
 * never contents (secret discipline, §3.2) — nothing here renders file
 * bodies, only the agent's own public name facts; a record carries no
 * description on the wire, and the card says so instead of inventing one.
 */

/** The fixed reading order (spec §3.2) — dropdown labels. */
const CATEGORY_LABELS: ReadonlyMap<InventoryCategoryKey, TranslationKey> = new Map([
  ["specialists", "agents.card.inventorySpecialists"],
  ["skills", "agents.card.inventorySkills"],
  ["plugins", "agents.card.inventoryPlugins"],
  ["instructions", "agents.card.inventoryInstructions"],
]);

/** The singular record-type nouns of the record card («тип записи»). */
const RECORD_TYPE_LABELS: ReadonlyMap<InventoryCategoryKey, TranslationKey> = new Map([
  ["specialists", "agents.card.recordTypeSpecialist"],
  ["skills", "agents.card.recordTypeSkill"],
  ["plugins", "agents.card.recordTypePlugin"],
  ["instructions", "agents.card.recordTypeInstruction"],
]);

/** Task-list drilldowns (existing URL dialect: ?agent= / ?q=). */
const tasksAgentHref = (name: string) => `/tasks/list?agent=${encodeURIComponent(name)}`;
const tasksQueryHref = (name: string) => `/tasks/list?q=${encodeURIComponent(name)}`;
/** The execution page's specialist seed (the ?executor= reading-init contract). */
const executionSpecialistHref = (name: string) =>
  `/agents/execution?specialist=${encodeURIComponent(name)}`;

/**
 * The actions of ONE record, built only from EXISTING routes. Specialists
 * get two (the task ?agent= filter + the execution ?specialist= seed);
 * every other type gets the mention search — and the card states
 * honestly that no dedicated drilldown exists for it.
 */
function recordActions(
  key: InventoryCategoryKey,
  name: string,
): readonly { to: string; labelKey: TranslationKey; titleKey: TranslationKey }[] {
  if (key === "specialists") {
    return [
      {
        to: tasksAgentHref(name),
        labelKey: "agents.card.recordTasksAgent",
        titleKey: "agents.card.recordTasksAgentHint",
      },
      {
        to: executionSpecialistHref(name),
        labelKey: "agents.card.recordAssignments",
        titleKey: "agents.card.recordAssignmentsHint",
      },
    ];
  }
  return [
    {
      to: tasksQueryHref(name),
      labelKey: "agents.card.recordTaskMentions",
      titleKey: "agents.card.recordTaskMentionsHint",
    },
  ];
}

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
        environments.map((env, index) => (
          // The composite key (harness-labels wave, 2026-10-21): a host can
          // carry REAL duplicate installations — name alone collides and
          // React would squash the rows.
          <InventoryEnvironment key={`${env.name}-${index}`} env={env} />
        ))
      )}
    </section>
  );
}

/** One harness environment: name line + the four category dropdowns. */
function InventoryEnvironment({ env }: { env: HarnessInventoryEnvironment }) {
  const t = useT();
  const categories = inventoryCategories(env);
  const gcwShare = gcwSpecialistsCount(env);
  // The harness-labels wave (2026-10-21): the row's own surface badge —
  // the SAME data-driven distinguisher the roster row wears (identical
  // slot/classes; the AGW-23 reserved-slot rule holds: the badge exists
  // only when the agent badged THIS row, absence renders nothing — every
  // row carries it when present, duplicates included, for uniformity).
  const execEnv = inventoryRowExecEnv(env);
  // The dedupe trail rides the badge tooltip (audit data of one fact —
  // the same wording the roster badge uses, the SHARED execEnvBadgeTitle
  // helper, same i18n keys).
  const execEnvTitle = execEnvBadgeTitle(t, inventoryRowFoundTrail(env));

  return (
    <div className="flex flex-col gap-1 rounded-md border border-border-subtle bg-elevated px-2.5 py-2">
      {/* Environment header: the store id; the host path rides the tooltip
       * (a host fact, secondary to the name — same tier as the card's
       * service facts). */}
      <p
        className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-foreground-secondary"
        title={env.home_path || undefined}
      >
        <span className="min-w-0">
          {env.name}
          {env.kind ? <span className="text-foreground-muted"> · {env.kind}</span> : null}
        </span>
        {execEnv ? (
          <Badge
            data-slot="execution-env"
            variant="outline"
            title={execEnvTitle}
            className="shrink-0 whitespace-nowrap font-mono font-normal"
          >
            {execEnv}
          </Badge>
        ) : null}
      </p>
      <ul className="flex flex-col gap-0.5">
        {categories.map((category) => (
          <li key={category.key}>
            <InventoryDropdown
              category={category}
              env={env}
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
 * record cards behind it. Keyboard: the tech-details posture (native
 * button, aria-expanded/aria-controls, focus-visible ring).
 */
function InventoryDropdown({
  category,
  env,
  gcwShare,
}: {
  category: InventoryCategory;
  env: HarnessInventoryEnvironment;
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
            <>
              <ul className="flex flex-col gap-0.5">
                {category.names.map((name) => (
                  <InventoryRecordRow
                    key={name}
                    name={name}
                    env={env}
                    categoryKey={category.key}
                  />
                ))}
              </ul>
              {/* The raw view survives, one cut deeper («сырой ход под
               * катом»): the pre-wave flat name list, collapsed by default. */}
              <InventoryRawNames names={category.names} />
            </>
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

/**
 * One inventory record: the name as a disclosure row; opening it renders
 * the record card — the human structure (name / type / environment facts /
 * honest no-description) plus the actions that EXIST for this record type.
 * Same disclosure posture as every dropdown on this card (native button,
 * aria-expanded/aria-controls, focus ring).
 */
function InventoryRecordRow({
  name,
  env,
  categoryKey,
}: {
  name: string;
  env: HarnessInventoryEnvironment;
  categoryKey: InventoryCategoryKey;
}) {
  const [open, setOpen] = useState(false);
  const cardId = useId();

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={cardId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 rounded-sm px-1 py-0.5 text-left text-xs text-foreground-secondary transition-colors duration-instant hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
        )}
        <span className="min-w-0 truncate font-mono">{name}</span>
      </button>
      {open ? (
        <InventoryRecordCard
          id={cardId}
          name={name}
          env={env}
          categoryKey={categoryKey}
        />
      ) : null}
    </li>
  );
}

/** One labelled fact row of the record card (dt muted / dd data). */
function RecordFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-foreground-muted">{label}</dt>
      <dd className="min-w-0 break-all text-right text-foreground-secondary">
        {children}
      </dd>
    </div>
  );
}

/**
 * The record card itself: the agent reports NAMES only, so the honest
 * structure is the name + the record type + the environment facts the
 * snapshot actually carries (each absent field is absent, never guessed)
 * + the explicit no-description line. Actions deep-link EXISTING routes;
 * non-specialist records state that no dedicated drilldown exists — an
 * honest missing action, not a dead button.
 */
function InventoryRecordCard({
  id,
  name,
  env,
  categoryKey,
}: {
  id: string;
  name: string;
  env: HarnessInventoryEnvironment;
  categoryKey: InventoryCategoryKey;
}) {
  const t = useT();
  // Environment-level extras ride the snapshot verbatim-but-bounded —
  // narrowed defensively like everything agent-reported (a buggy agent
  // degrades to fewer facts, never to a crash).
  const version =
    typeof env.version === "string" && env.version.trim() !== "" ? env.version : null;
  const typeLabel =
    t(RECORD_TYPE_LABELS.get(categoryKey) ?? "agents.card.recordTypeSpecialist");

  return (
    <div
      id={id}
      className="mb-1 mt-0.5 flex flex-col gap-1.5 rounded-md border border-border-subtle bg-background px-2.5 py-2"
    >
      <dl className="flex flex-col gap-1 text-xs">
        <RecordFact label={t("agents.card.recordName")}>
          <span className="font-mono text-foreground">{name}</span>
        </RecordFact>
        <RecordFact label={t("agents.card.recordType")}>{typeLabel}</RecordFact>
        <RecordFact label={t("agents.card.recordEnv")}>
          <span className="font-mono">
            {env.name}
            {env.kind ? <span className="text-foreground-muted"> · {env.kind}</span> : null}
          </span>
        </RecordFact>
        {env.exec_env ? (
          <RecordFact label={t("agents.card.recordSurface")}>
            <span className="font-mono">{env.exec_env}</span>
          </RecordFact>
        ) : null}
        {env.home_path ? (
          <RecordFact label={t("agents.card.recordEnvPath")}>
            <span className="font-mono">{env.home_path}</span>
          </RecordFact>
        ) : null}
        {version !== null ? (
          <RecordFact label={t("agents.card.recordEnvVersion")}>
            <span className="font-mono">{version}</span>
          </RecordFact>
        ) : null}
        {/* The honest absence: the wire carries no description — the card
         * says so instead of inventing one (secret discipline §3.2). */}
        <RecordFact label={t("agents.card.recordDescription")}>
          <span className="text-foreground-muted">
            {t("agents.card.recordNoDescription")}
          </span>
        </RecordFact>
      </dl>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {recordActions(categoryKey, name).map((action) => (
          <Link
            key={action.to}
            to={action.to}
            title={t(action.titleKey)}
            className="text-xs font-medium text-iris-bright underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
          >
            {t(action.labelKey)}
          </Link>
        ))}
      </div>
      {categoryKey !== "specialists" ? (
        <p className="text-xs text-foreground-muted">
          {t("agents.card.recordNoMoreActions")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The pre-wave raw view, kept under its own cut («сырой ход под катом»):
 * the flat mono name list exactly as the dropdown rendered it before the
 * record cards, collapsed by default — copy-paste and diffing stay
 * possible without unstructuring the cards.
 */
function InventoryRawNames({ names }: { names: readonly string[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const listId = useId();

  return (
    <div className="mt-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="rounded-sm px-1 py-0.5 text-left text-xs text-foreground-muted transition-colors duration-instant hover:text-foreground-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright"
      >
        {open ? (
          <ChevronDown className="mr-1 inline size-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="mr-1 inline size-3 shrink-0" aria-hidden="true" />
        )}
        {t("agents.card.inventoryRawList")}
      </button>
      {open ? (
        <ul id={listId} className="mt-0.5 flex flex-col gap-0.5 pl-4">
          {names.map((name) => (
            <li
              key={name}
              className="break-all font-mono text-xs text-foreground-secondary"
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
