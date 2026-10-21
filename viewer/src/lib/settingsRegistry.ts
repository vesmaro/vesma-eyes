/**
 * Canonical registry of the `vesmaro.*` interface preferences (UI-23, spec
 * 2026-09-23 §1/§4.1): key · values · default · scope · owner file. This is
 * the single descriptive source — every owner module keeps its own storage
 * logic (guarded read/write), and settingsRegistry.test.ts pins the registry
 * rows to the owner modules' exported constants so the two can never drift.
 *
 * Out of the registry ON PURPOSE (spec §1/§2 — workspace state, not
 * preferences): `vesmaro.taskGroups`, `vesmaro.agents.terminalCollapsed`,
 * `vesmaro.agents.feedCollapsed`; credentials (`vesmaro.uiToken`,
 * `vesmaro.boardToken`, gateway auth token) are not preferences at all.
 * `vesmaro.tasksView` is DEPRECATED (route-is-the-contract, 2026-09-22) and
 * kept here only as a documented tombstone — stale browser values are ignored.
 */

/** Scope of a preference per spec §4.1. */
export type SettingsScope = "global" | "domain" | "component";

export interface SettingsRegistryEntry {
  /** localStorage key (the legacy theme key is recorded in `note`). */
  readonly key: string;
  /** Kind of the stored value. `action` = a settings-hub action, not state. */
  readonly kind: "enum" | "flag" | "action";
  /** Allowed enum values (enum entries only). */
  readonly values?: readonly string[];
  /** Documented default (spec §4.1: the default lives next to the key). */
  readonly default: string;
  /** Where the setting applies (spec §4.1 scope table). */
  readonly scope: SettingsScope;
  /** Owning file — the module whose provider/store reads and writes it. */
  readonly owner: string;
  /** v2 status: `deprecated` rows are tombstones, never read. */
  readonly status?: "active" | "deprecated";
  /** Migration / tombstone notes. */
  readonly note?: string;
}

export const SETTINGS_REGISTRY = [
  {
    key: "vesmaro.lang",
    kind: "enum",
    values: ["ru", "en"],
    default: "ru",
    scope: "global",
    owner: "src/i18n/index.ts",
  },
  {
    key: "vesmaro.density",
    kind: "enum",
    values: ["comfortable", "compact"],
    default: "comfortable",
    scope: "global",
    owner: "src/components/density-provider.tsx",
  },
  {
    key: "vesmaro.theme",
    kind: "enum",
    values: ["dark", "light"],
    default: "dark",
    scope: "global",
    owner: "src/components/theme-provider.tsx",
    note: "Only \"dark\"|\"light\" are ever WRITTEN — the explicit family lock (presets brief §1). The effective default is «Системная»: an ABSENT record follows the OS, and the hub's «Системная» mode REMOVES the record instead of writing a value. Legacy read-only fallbacks, in order: vesma-eyes:theme then mnemos-eyes:theme (the REAL pre-rename writer); «Системная» clears all three.",
  },
  {
    key: "vesmaro.appearance",
    kind: "flag",
    default: '{"lastDark":"well","lastLight":"light"}',
    scope: "global",
    owner: "src/components/theme-provider.tsx",
    note: "NEW presets brief §1: a JSON document {lastDark,lastLight} — the last chosen preset PER FAMILY (dark: well|zhila|sozvezdia, light: light|prosvet). Written on every preset change INCLUDING in «Системная» mode, so the top-bar family toggle lands back on the last preset; read with slot-by-slot whitelist validation. The resolved look = slots[family].",
  },
  {
    key: "vesmaro.motion",
    kind: "enum",
    values: ["system", "reduced"],
    default: "system",
    scope: "global",
    owner: "src/lib/motionStore.ts",
    note: "NEW v2 (spec §2.5): «reduced» forces the existing prefers-reduced-motion branches regardless of the OS.",
  },
  {
    key: "vesmaro.boardStyle",
    kind: "enum",
    values: ["groups", "classic"],
    default: "groups",
    scope: "domain",
    owner: "src/lib/boardStyleStore.ts (helpers: src/features/tasks/tasksViewPrefs.ts)",
  },
  {
    key: "vesmaro.sidebarCollapsed",
    kind: "flag",
    values: ["1", "0"],
    default: "0",
    scope: "global",
    owner: "src/lib/sidebarState.ts (consumer: src/layout/Shell.tsx)",
  },
  {
    key: "vesmaro.agents.onboardingDone",
    kind: "flag",
    values: ["1", "0"],
    default: "0",
    scope: "component",
    owner: "src/features/agents/executionPrefs.ts",
    note: "v2 adds the hub action «показать подсказку снова» — resets the flag to «0» (spec §2.5).",
  },
  {
    key: "vesmaro.tasksView",
    kind: "enum",
    values: ["kanban", "list"],
    default: "kanban",
    scope: "domain",
    owner: "(removed 2026-09-22)",
    status: "deprecated",
    note: "Tombstone: the route is the contract (/tasks → kanban, /tasks/list → list); stale stored values are ignored.",
  },
] as const satisfies readonly SettingsRegistryEntry[];

/** The one legacy key the theme migration still READS (never written). */
export const LEGACY_THEME_KEY = "vesma-eyes:theme";
