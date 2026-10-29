import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { KoraSession } from "./koraTypes";
import { useKoraSpecialists } from "./useKora";
import {
  setSpecialistAnnotation,
  useKoraSpecialistAnnotation,
  useKoraSpecialistPersistFailure,
} from "./koraSpecialistStore";

/**
 * The composer's SELECTOR ROW (kora-ide contract §3.2, wave В2 — the
 * Claude Code / zcode input-footer pattern): [харнес · специалист ·
 * модель · режим] under the field, each selector a disclosure (07j §6.1
 * discipline — plain expand/collapse, NO menu roles or arrow mechanics:
 * informational rows carry honest aria markers, real choices are real
 * tabbable buttons).
 *
 * Honesty per contract §7 В2 acceptance (а) — «селекторы рисуются только
 * из реальных данных»:
 *
 * - ХАРНЕС = CONTEXT (ADR: the harness lives in the session context; it
 *   changes in the dock/tree). The trigger DISPLAYS the session's
 *   harness; the disclosure lists the harnesses of execution the loaded
 *   registry actually knows (a derivation — zero new requests), the
 *   current one marked. Other rows are informational, NOT commands: no
 *   invented navigation, the footer names where the context changes.
 * - СПЕЦИАЛИСТ renders ONLY when the В2a roster (GET /api/kora/specialists)
 *   arrived with rows — before that, or on a failed/empty read, the slot
 *   is not drawn at all (§5.3: «до линии селектор специалиста НЕ
 *   рисуется»). A choice is a LOCAL per-session annotation
 *   (vesmaro.koraSpecialist:{sessionId}) — the footer says so; it never
 *   pretends to bind the relay send (K-COMPOSER-RELAY-OFF: sending is
 *   honestly deferred until the transport line). A storage-refused write
 *   raises the honest K-PERSIST-FAIL note below the row (the store's
 *   bit; nothing pretends to persist).
 * - МОДЕЛЬ = Q3 verdict: inherited from the context harness. When the
 *   workspace resolved a REAL model fact (the hermes roster via
 *   /status — `resolvedModel`), the slot shows it; without one the slot
 *   is READ-ONLY honest («модели не сообщаются», K-TREE-MODEL-UNKNOWN —
 *   no invented value). The hermes chat keeps its own real select (the
 *   per-input override where a roster exists).
 * - РЕЖИМ = confirm/yolo (ADR-0019): confirm is the resolver's real
 *   default for every session; yolo is RELAY-origin-only AND needs the
 *   transport line — today both facts hold, so yolo renders as a
 *   disabled row with the visible reason, never a toggle that lies.
 *
 * K-COMPOSER-DEAD: a dead session disables the WHOLE row (the field's
 * own visible reason — the interrupted note — sits right below).
 */

/** One harness of execution the loaded registry knows (a derivation:
 * count = its sessions in the loaded slice; null when the harness fact
 * comes only from the session itself — the count is then honestly
 * unknown, never a fabricated number). */
export interface KoraHarnessOption {
  harness: string;
  count: number | null;
}

export function KoraComposerControls({
  session,
  harnessOptions = [],
  resolvedModel = null,
}: {
  session: KoraSession;
  /** Derivations over the LOADED registry (the workspace owns the
   * items); the current session's harness is unioned in by this
   * component, so the display never contradicts the context. */
  harnessOptions?: readonly KoraHarnessOption[];
  /** The workspace's REAL model fact (the hermes roster's default via
   * /status — the same value the context bar shows). A string replaces
   * the honest «модели не сообщаются» slot (no contradiction between
   * surfaces); null keeps the read-only honest wording. */
  resolvedModel?: string | null;
}) {
  const t = useT();
  const dead = session.state === "dead";
  const [openMenu, setOpenMenu] = useState<
    "harness" | "specialist" | "mode" | null
  >(null);
  // The honest K-PERSIST-FAIL bit (В2 review): the store records a
  // refused annotation write; the note below the row names it.
  const persistFail = useKoraSpecialistPersistFailure(session.id);

  // Click-outside + Escape close whichever menu is open (a11y disclosure:
  // the trigger keeps aria-expanded/controls, focus returns to it).
  useEffect(() => {
    if (openMenu === null) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Element | null;
      if (target?.closest("[data-kora-selector-menu]") === null) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenu]);

  // The harness list: the registry derivations + the session's own
  // harness (a deep link can point past the loaded pages — the context
  // fact is real regardless of the loaded slice; its count is null).
  const harnesses: KoraHarnessOption[] = [
    ...harnessOptions,
    ...(harnessOptions.some((opt) => opt.harness === session.harness)
      ? []
      : [{ harness: session.harness, count: null }]),
  ].sort((a, b) => a.harness.localeCompare(b.harness));

  // The specialist roster: the slot renders ONLY from real rows (§5.3).
  const roster = useKoraSpecialists();
  const rosterItems =
    roster.isSuccess && roster.data.count > 0 ? roster.data.items : [];
  const annotation = useKoraSpecialistAnnotation(session.id);

  // The mode facts (ADR-0019 resolver): confirm is the default for every
  // session; yolo needs BOTH relay origin AND the transport line.
  const yoloLocalOnly = session.origin !== "relay";
  const relayOff = true; // the transport seam is unbuilt (срез 3 verdict)

  return (
    <div
      data-kora-selector-menu
      data-testid="kora-composer-controls"
      className={cn(
        "mt-2 flex flex-wrap items-center gap-x-1 gap-y-1",
        dead && "opacity-50",
      )}
      aria-disabled={dead || undefined}
    >
      {/* ХАРНЕС — context display + the registry's real harnesses. */}
      <SelectorButton
        id="kora-sel-harness"
        label={t("kora.controls.harnessLabel")}
        value={session.harness}
        disabled={dead}
        open={openMenu === "harness"}
        onToggle={() =>
          setOpenMenu((current) =>
            current === "harness" ? null : "harness",
          )
        }
      >
        <p className="border-b border-myelin-hairline px-3 py-2 text-xs text-foreground-muted">
          {t("kora.controls.harnessContextNote")}
        </p>
        {harnesses.map((opt) => {
          const current = opt.harness === session.harness;
          return (
            // Informational row (07j disclosure discipline — no menu
            // roles): aria-disabled marks it honestly as NOT activatable,
            // aria-current marks the context fact.
            <div
              key={opt.harness}
              aria-disabled={!current || undefined}
              aria-current={current || undefined}
              className={cn(
                "flex items-center gap-2 px-3 py-2 font-mono text-xs",
                current
                  ? "text-foreground"
                  : "text-foreground-muted",
              )}
            >
              {current ? (
                <Check aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <span aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 flex-1 truncate">{opt.harness}</span>
              {opt.count !== null ? (
                <span className="shrink-0 tabular-nums text-foreground-muted">
                  {t("kora.controls.harnessCount", { n: opt.count })}
                </span>
              ) : null}
              {current ? (
                <span className="shrink-0 text-foreground-secondary">
                  {t("kora.controls.currentMark")}
                </span>
              ) : null}
            </div>
          );
        })}
      </SelectorButton>

      {/* СПЕЦИАЛИСТ — only with real roster rows (В2a; §5.3). */}
      {rosterItems.length > 0 ? (
        <SelectorButton
          id="kora-sel-specialist"
          label={t("kora.controls.specialistLabel")}
          value={annotation ?? t("kora.controls.specialistNone")}
          disabled={dead}
          open={openMenu === "specialist"}
          onToggle={() =>
            setOpenMenu((current) =>
              current === "specialist" ? null : "specialist",
            )
          }
        >
          {rosterItems.map((item) => {
            const chosen = annotation === item.name;
            return (
              <button
                key={item.slug}
                type="button"
                aria-pressed={chosen}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
                  chosen
                    ? "text-foreground"
                    : "text-foreground-secondary hover:text-foreground",
                )}
                onClick={() => {
                  setSpecialistAnnotation(
                    session.id,
                    chosen ? null : item.name,
                  );
                  setOpenMenu(null);
                }}
              >
                {chosen ? (
                  <Check aria-hidden className="size-3.5 shrink-0" />
                ) : (
                  <span aria-hidden className="size-3.5 shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {chosen ? (
                  <span className="shrink-0 text-foreground-secondary">
                    {t("kora.controls.currentMark")}
                  </span>
                ) : null}
              </button>
            );
          })}
          <p className="border-t border-myelin-hairline px-3 py-2 text-xs text-foreground-muted">
            {t("kora.controls.specialistLocalNote")}
          </p>
        </SelectorButton>
      ) : null}

      {/* МОДЕЛЬ — the workspace's real fact when it resolved one (Q3;
       * the hermes roster's default — never an invented value), the
       * read-only honest slot only when no fact exists. No menu: nothing
       * to choose here. */}
      <span
        data-testid="kora-sel-model"
        className="inline-flex min-h-12 items-center gap-1 px-2 font-mono text-xs text-foreground-muted md:min-h-6"
      >
        <span className="text-foreground-secondary">
          {t("kora.controls.modelLabel")}:
        </span>
        <span title={resolvedModel ?? undefined}>
          {resolvedModel ?? t("kora.controls.modelUnknown")}
        </span>
      </span>

      {/* РЕЖИМ — the resolver's real default, yolo disabled with reason. */}
      <SelectorButton
        id="kora-sel-mode"
        label={t("kora.controls.modeLabel")}
        value={t("kora.controls.modeConfirm")}
        disabled={dead}
        open={openMenu === "mode"}
        onToggle={() =>
          setOpenMenu((current) => (current === "mode" ? null : "mode"))
        }
      >
        <div
          aria-current="true"
          className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-foreground"
        >
          <Check aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            {t("kora.controls.modeConfirm")}
          </span>
          <span className="shrink-0 text-foreground-secondary">
            {t("kora.controls.currentMark")}
          </span>
        </div>
        <div
          aria-disabled="true"
          className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-foreground-muted"
        >
          <span aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t("kora.controls.modeYolo")}</span>
        </div>
        <p className="border-t border-myelin-hairline px-3 py-2 text-xs text-foreground-muted">
          {yoloLocalOnly
            ? t("kora.controls.yoloLocalReason")
            : relayOff
              ? t("kora.controls.yoloRelayOffReason")
              : null}
        </p>
      </SelectorButton>
      {/* K-PERSIST-FAIL (the В1 bit): a refused annotation write is
       * NAMED, visible without opening the disclosure — the choice still
       * works this visit, a reload will lose it (4.1.3 polite status). */}
      {persistFail ? (
        <p
          role="status"
          className="w-full text-xs text-warning"
          data-testid="kora-specialist-persist-fail"
        >
          {t("kora.controls.specialistPersistFail")}
        </p>
      ) : null}
    </div>
  );
}

/** One selector: the trigger chip (label + value + chevron) and, when
 * open, its upward disclosure panel (the composer sits at the bottom of
 * the frame). The trigger carries the disclosure a11y pair (aria-expanded
 * + aria-controls, 07j §6.1); the panel is plain content — no menu roles,
 * no arrow mechanics (the 07j tree precedent: Tab cost is acceptable). */
function SelectorButton({
  id,
  label,
  value,
  disabled,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  value: string;
  disabled: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // Focus returns to the trigger when a menu closes (the disclosure
  // contract: the focus never drops to body).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-haspopup="true"
        disabled={disabled}
        data-testid={`${id}-trigger`}
        onClick={onToggle}
        className={cn(
          "inline-flex min-h-12 items-center gap-1 rounded-md px-2 font-ui text-xs md:min-h-6",
          "text-foreground-secondary transition-colors duration-instant hover:text-foreground",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris-bright",
          "disabled:cursor-not-allowed disabled:text-foreground-muted disabled:hover:text-foreground-muted",
        )}
      >
        <span className="text-foreground-muted">{label}:</span>
        <span className="max-w-40 truncate font-mono" title={value}>
          {value}
        </span>
        <ChevronDown aria-hidden className="size-3 shrink-0" />
      </button>
      {open ? (
        <div
          id={`${id}-menu`}
          aria-labelledby={`${id}-trigger`}
          data-testid={`${id}-menu`}
          className="absolute bottom-full left-0 z-20 mb-1 min-w-56 rounded-md border border-border-subtle bg-background py-1 shadow-lg"
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
