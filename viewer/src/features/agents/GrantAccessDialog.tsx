import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n";
import type { GrantRow, SelectorRegistry } from "./modelsModel";
import { useGrantMutations } from "./useGrants";

/**
 * «Выдать доступ» — the owner grant form (MF3, ux-blueprint §3.3): the
 * kind toggle «Хосты · Исполнители», multi-checkboxes drawn from the
 * LIVE selector registry (existing spine entities only — no wildcard in
 * v1), and a search over the list.
 *
 * Semantics — PULL (security verdict §3 FIXED): a grant means «провайдер
 * доступен с X»; revoke is immediate at the next use; there is NO
 * key-distribution UX anywhere (no «download key», no agent-config
 * instructions — the pattern was cut by design). Each selected entity
 * becomes ONE grant row (one POST per selection, the server validates
 * each against the live registry and answers 409 for a duplicate).
 *
 * A11y: Radix owns the focus trap / Esc / focus restore; every checkbox
 * has a real label with the full target name; the empty registry leaves
 * the controls DISABLED WITH their explanation (never hidden —
 * MF-GRANT-SELECTOR-EMPTY).
 */

const noop = () => {};

export interface GrantAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerKey: string;
  registry: SelectorRegistry;
  existing: readonly GrantRow[];
}

export function GrantAccessDialog({
  open,
  onOpenChange,
  providerKey,
  registry,
  existing,
}: GrantAccessDialogProps) {
  const t = useT();
  const { create } = useGrantMutations(providerKey);
  const [kind, setKind] = useState<"host" | "executor">("host");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(!open);

  // A fresh open resets the form (the ConnectProviderDialog render-phase
  // pattern — no effect, no cascading render).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setKind("host");
      setSearch("");
      setSelected(new Set());
      setError(null);
    }
  }

  const options = useMemo(() => {
    const source = kind === "host" ? registry.hosts : registry.executors;
    const needle = search.trim().toLowerCase();
    return needle
      ? source.filter((value) => value.toLowerCase().includes(needle))
      : [...source];
  }, [kind, registry, search]);

  const grantedValues = useMemo(
    () =>
      new Set(
        existing
          .filter((row) => row.selectorKind === kind)
          .map((row) => row.selectorValue),
      ),
    [existing, kind],
  );

  const emptyRegistry =
    registry.hosts.length === 0 && registry.executors.length === 0;

  const close = () => onOpenChange(false);

  const submit = async () => {
    setError(null);
    if (selected.size === 0) return;
    try {
      for (const value of selected) {
        await create.mutateAsync({ selector_kind: kind, selector_value: value });
      }
      close();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : t("models.grants.dialogError"),
      );
    }
  };

  const toggle = (value: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("models.grants.dialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("models.grants.dialogDescription", { provider: providerKey })}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div role="group" aria-label={t("models.grants.kindGroupLabel")}>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant={kind === "host" ? "default" : "outline"}
                aria-pressed={kind === "host"}
                onClick={() => {
                  setKind("host");
                  setSelected(new Set());
                  setSearch("");
                }}
              >
                {t("models.grants.kindHosts")}
              </Button>
              <Button
                type="button"
                variant={kind === "executor" ? "default" : "outline"}
                aria-pressed={kind === "executor"}
                onClick={() => {
                  setKind("executor");
                  setSelected(new Set());
                  setSearch("");
                }}
              >
                {t("models.grants.kindExecutors")}
              </Button>
            </div>
          </div>

          {emptyRegistry ? (
            <div className="rounded-md border border-border-subtle bg-well px-2.5 py-2 text-xs">
              <p className="text-foreground-secondary">
                {t("models.grants.emptyRegistry")}
              </p>
              <a
                className="mt-1 inline-block underline"
                href="/agents/harnesses"
                onClick={noop}
              >
                {t("models.grants.emptyRegistryLink")}
              </a>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="grant-search" className="text-sm font-medium">
                  {t("models.grants.search")}
                </label>
                <Input
                  id="grant-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <fieldset
                className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle px-2.5 py-2"
                aria-label={t("models.grants.kindGroupLabel")}
              >
                {options.length === 0 ? (
                  <p className="text-xs text-foreground-muted">
                    {t("models.grants.searchEmpty")}
                  </p>
                ) : (
                  options.map((value) => {
                    const alreadyGranted = grantedValues.has(value);
                    const id = `grant-target-${kind}-${value}`;
                    return (
                      <label
                        key={value}
                        htmlFor={id}
                        className="flex min-h-6 items-center gap-2 text-sm"
                      >
                        <input
                          id={id}
                          type="checkbox"
                          checked={selected.has(value)}
                          disabled={alreadyGranted}
                          onChange={(event) =>
                            toggle(value, event.target.checked)
                          }
                          className="accent-iris-bright"
                        />
                        <span className="font-mono text-xs">{value}</span>
                        {alreadyGranted ? (
                          <span className="text-xs text-foreground-muted">
                            {t("models.grants.alreadyGranted")}
                          </span>
                        ) : null}
                      </label>
                    );
                  })
                )}
              </fieldset>
            </>
          )}

          {error ? (
            <p
              className="rounded-md border border-border-subtle bg-well px-2.5 py-2 text-xs text-error"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t("models.form.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={emptyRegistry || selected.size === 0 || create.isPending}
            >
              {create.isPending
                ? t("models.grants.granting")
                : t("models.grants.grantCta")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
