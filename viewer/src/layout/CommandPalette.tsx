import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useT } from "@/i18n";
import { withReturn } from "@/lib/returnParams";
import { usePaletteOpen, setPaletteOpen } from "@/lib/paletteState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSearch } from "@/hooks/useSearch";
import { useBoardTasks } from "@/features/tasks/useTasks";
import { useExecutors } from "@/features/agents/useAgents";
import { NAV_DOMAINS } from "./navItems";
import {
  clampSelection,
  filterExecutorItems,
  filterTaskItems,
  flattenGroups,
  groupItems,
  memoryHitItems,
  moveSelection,
  type PaletteGroup,
  type PaletteGroupId,
  type PaletteItem,
} from "./commandPaletteModel";

/**
 * The command palette (UX-overhaul §7.3, Ф2): ONE search input answering in
 * four honest sections — Память (the existing `/api/mnemos/search`, the
 * default section: the old «/» promise kept), Задачи (the shared board
 * projection), Агенты (the approved executor registry) and Переход (the
 * client-side route index). No ranking promises — a labelled client-side
 * index (spec self-review §12c); sections with nothing to say do not render.
 *
 * Shell (inside the data router) mounts the dialog; the OPEN state lives in
 * lib/paletteState.ts so the hotkey listener (HotkeysProvider, outside the
 * router) and the TopBar trigger can drive the same dialog.
 *
 * A11y: Radix Dialog (role="dialog" + aria-modal, focus trap, Esc closes,
 * focus returns to the pre-open element); the input is a combobox over one
 * listbox with labelled groups — ↑/↓ walk the flattened rows (wrap-around),
 * Enter activates, `aria-activedescendant` carries the selection. Mobile:
 * the same overlay pattern as the UI-22 sidebar (floating panel + backdrop,
 * focus locked inside — Radix provides both).
 *
 * Details honouring the frozen contracts: task/memory rows navigate to their
 * detail pages WITH `return=` (UI-18, built once at render time); the memory
 * search rides the existing endpoint (debounced, only while open and typed);
 * a hit's hint is its PROVENANCE — the store the memory lives in.
 *
 * Fresh-open state: Radix unmounts the Content subtree when closed, so the
 * body component remounts per open — the query and the selection reset by
 * construction, no reset effect needed.
 */
export function CommandPalette() {
  const t = useT();
  const open = usePaletteOpen();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setPaletteOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay/80" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={
            "fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-elevated shadow-float " +
            "inset-x-2 top-2 max-h-[85dvh] " +
            "sm:inset-x-auto sm:left-1/2 sm:right-auto sm:top-[10vh] sm:w-full sm:max-w-xl sm:-translate-x-1/2"
          }
        >
          <DialogPrimitive.Title className="sr-only">
            {t("cmdk.title")}
          </DialogPrimitive.Title>
          <PaletteBody />
          <div className="hidden shrink-0 items-center gap-4 border-t border-border-subtle px-3 py-2 text-xs text-foreground-muted sm:flex">
            <span>{t("cmdk.hintNavigate")}</span>
            <span>{t("cmdk.hintOpen")}</span>
            <span>{t("cmdk.hintClose")}</span>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The per-open body: input + result list. Remounts on every open (Radix
 * unmounts the Content subtree), so its state starts fresh by construction. */
function PaletteBody() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, PALETTE_DEBOUNCE_MS);
  const trimmed = debouncedQuery.trim();
  const typedQuery = trimmed.toLowerCase();
  const searchReady = trimmed !== "";

  // Shared single-projection reads (the same cache entries the pages use —
  // no new wire calls beyond the memory search itself).
  const board = useBoardTasks();
  const executors = useExecutors();
  const search = useSearch(
    { query: trimmed, limit: PALETTE_MEMORY_LIMIT },
    { enabled: searchReady },
  );
  const searchData = search.data;
  const searchSettled = search.isSuccess;

  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const buildTaskTo = useCallback(
    (taskId: string) =>
      withReturn(
        `/tasks/${encodeURIComponent(taskId)}`,
        location.pathname,
        location.search,
      ),
    [location.pathname, location.search],
  );
  const buildMemoryTo = useCallback(
    (memoryId: string) =>
      withReturn(
        `/memory/${encodeURIComponent(memoryId)}`,
        location.pathname,
        location.search,
      ),
    [location.pathname, location.search],
  );

  const items = useMemo<PaletteItem[]>(() => {
    // Navigation index — the live routes only (soon-slots stay out: the
    // palette never offers a dead surface).
    const nav: PaletteItem[] = [];
    for (const domain of NAV_DOMAINS) {
      if (domain.soonKey !== undefined) continue;
      const to = domain.linkTo ?? domain.to;
      nav.push({
        id: `nav:d${domain.to}`,
        group: "nav",
        label: t(domain.key),
        hint: to,
        to,
      });
      for (const section of domain.sections ?? []) {
        if (section.soonKey !== undefined) continue;
        nav.push({
          id: `nav:s${section.to}`,
          group: "nav",
          label: t(section.key),
          hint: section.to,
          to: section.to,
        });
      }
    }
    const navItems =
      typedQuery === ""
        ? nav
        : nav.filter((item) =>
            `${item.label} ${item.hint ?? ""}`.toLowerCase().includes(typedQuery),
          );

    // Memory — the extended-search escape hatch appears ONLY when the wire
    // answered and found nothing (honest empty, §7.3: the full page stays
    // one row away).
    const memory: PaletteItem[] = searchReady
      ? memoryHitItems(searchData ?? [], buildMemoryTo)
      : [];
    if (searchReady && searchSettled && (searchData ?? []).length === 0) {
      memory.push({
        id: "memory:__extended",
        group: "memory",
        label: t("cmdk.extendedSearch"),
        hint: `/memory/search?q=${trimmed}`,
        to: `/memory/search?q=${encodeURIComponent(trimmed)}`,
      });
    }

    return [
      ...memory,
      ...filterTaskItems(board.data?.tasks ?? [], typedQuery, buildTaskTo),
      ...filterExecutorItems(executors.data?.items ?? [], typedQuery),
      ...navItems,
    ];
  }, [
    t,
    typedQuery,
    trimmed,
    searchReady,
    searchData,
    searchSettled,
    board.data,
    executors.data,
    buildTaskTo,
    buildMemoryTo,
  ]);

  const flat = useMemo(() => flattenGroups(items), [items]);
  const groups = useMemo(() => groupItems(items), [items]);
  const active = clampSelection(activeIndex, flat.length);
  const activeId = flat[active]?.id;

  // Keep the highlighted row visible when the walk moves it out of view.
  // Guarded: engines without scrollIntoView (some test DOMs) just skip it.
  useEffect(() => {
    if (activeId === undefined) return;
    const option = document.getElementById(optionDomId(activeId));
    if (option && typeof option.scrollIntoView === "function") {
      option.scrollIntoView({ block: "nearest" });
    }
  }, [activeId]);

  const choose = useCallback(
    (item: PaletteItem) => {
      setPaletteOpen(false);
      navigate(item.to);
    },
    [navigate],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => moveSelection(index, 1, flat.length));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => moveSelection(index, -1, flat.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = flat[active];
      if (item) choose(item);
    }
  };

  const groupLabel = (group: PaletteGroupId): string => {
    switch (group) {
      case "memory":
        return t("cmdk.groupMemory");
      case "tasks":
        return t("cmdk.groupTasks");
      case "agents":
        return t("cmdk.groupAgents");
      case "nav":
        return t("cmdk.groupNav");
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <Search
          className="size-4 shrink-0 text-foreground-secondary"
          aria-hidden="true"
        />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={LISTBOX_ID}
          aria-activedescendant={
            activeId !== undefined ? optionDomId(activeId) : undefined
          }
          aria-autocomplete="list"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onKeyDown}
          placeholder={t("cmdk.placeholder")}
          aria-label={t("cmdk.title")}
          autoFocus
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-foreground-muted focus-visible:outline-none"
        />
        <kbd className="hidden shrink-0 rounded border border-border-subtle px-1.5 font-mono text-xs text-foreground-muted sm:inline">
          esc
        </kbd>
      </div>
      <div
        ref={listRef}
        id={LISTBOX_ID}
        role="listbox"
        aria-label={t("cmdk.resultsLabel")}
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {flat.length === 0 ? (
          <p
            role="status"
            className="px-2 py-6 text-center text-sm text-foreground-secondary"
          >
            {search.isPending && searchReady ? t("cmdk.searching") : t("cmdk.noResults")}
          </p>
        ) : (
          (() => {
            let offset = 0;
            return groups.map((entry) => {
              const groupOffset = offset;
              offset += entry.items.length;
              return (
                <PaletteGroupBlock
                  key={entry.group}
                  entry={entry}
                  offset={groupOffset}
                  activeId={activeId}
                  label={groupLabel(entry.group)}
                  onChoose={choose}
                  onHover={setActiveIndex}
                />
              );
            });
          })()
        )}
      </div>
    </>
  );
}

const LISTBOX_ID = "command-palette-listbox";
const PALETTE_DEBOUNCE_MS = 200;
const PALETTE_MEMORY_LIMIT = 5;

/** option elements live in DOM ids derived from the item ids — ids carry
 * colons and other chars, so they are namespaced, not used verbatim. */
function optionDomId(itemId: string): string {
  return `cmdk-option-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function PaletteGroupBlock({
  entry,
  offset,
  activeId,
  label,
  onChoose,
  onHover,
}: {
  entry: PaletteGroup;
  offset: number;
  activeId: string | undefined;
  label: string;
  onChoose: (item: PaletteItem) => void;
  onHover: (index: number) => void;
}) {
  const labelId = `${LISTBOX_ID}-label-${entry.group}`;
  return (
    <div role="group" aria-labelledby={labelId} className="mb-1 last:mb-0">
      <div
        id={labelId}
        className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-foreground-muted"
      >
        {label}
      </div>
      <ul>
        {entry.items.map((item, position) => {
          const isActive = item.id === activeId;
          return (
            <li
              key={item.id}
              id={optionDomId(item.id)}
              role="option"
              aria-selected={isActive}
              aria-label={`${label}: ${item.label}`}
            >
              <button
                type="button"
                onClick={() => onChoose(item)}
                // Pointer support: clicking needs the row active — sync the
                // selection on intent only; a stray hover does NOT steal
                // the keyboard highlight while it just passes through.
                onMouseMove={() => {
                  if (!isActive) onHover(offset + position);
                }}
                className={
                  "flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors duration-instant " +
                  (isActive
                    ? "bg-well text-foreground"
                    : "text-foreground-secondary hover:bg-well/60 hover:text-foreground")
                }
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {item.hint ? (
                  <span className="max-w-[45%] shrink-0 truncate font-mono text-xs text-foreground-muted">
                    {item.hint}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
