import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useI18n, useT } from "@/i18n";
import { isProviderKeyValid, validateProviderBaseUrl } from "@/gateway/providerUrl";
import type { ProviderRow } from "./modelsModel";
import { useProviderMutations } from "./useProviders";
import { useToast } from "@/components/Toast/toastContext";

/**
 * «Подключить провайдера» / «Заменить ключ» — the owner credential form
 * (MF2, ux-blueprint §3.1/§5.3 under security-verdict §5).
 *
 * Red lines implemented HERE, not claimed elsewhere:
 * - The credential material exists ONLY in this component's controlled
 *   input state. On success it is cleared (the slot goes metadata-only:
 *   fingerprint + dates); on unmount it dies with the component. It is
 *   never written to any draft storage (unlike the enrollment conveyor,
 *   this draft carries a secret — so it does NOT persist across reloads).
 * - The reveal toggle covers the UNSAVED typed value ONLY (TL verdict Q3:
 *   a standard typo guard before save). The moment the key is saved, no
 *   show/copy surface exists anywhere in the product — the dialog closes
 *   onto the metadata slot.
 * - The URL refusal is the ONE message family: the inline rejection uses
 *   the byte-identical strings the server 422s with (providerUrl.ts), and
 *   any server error surfaces verbatim (MF-FORM-ERR-SERVER).
 * - The normalized base_url preview shows exactly what will persist —
 *   query/fragment are stripped, the host is never rewritten.
 *
 * A11y: Radix owns the focus trap / Esc / focus restore; every field has
 * a real <label>; rejections are text, never colour-only.
 */

export interface ConnectProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog ROTATES this provider's key: the name is
   * locked, the address is prefilled, the submit verb is «Заменить». */
  rotate?: ProviderRow | null;
}

export function ConnectProviderDialog({
  open,
  onOpenChange,
  rotate = null,
}: ConnectProviderDialogProps) {
  const t = useT();
  const { lang } = useI18n();
  const toast = useToast();
  const { create, rotate: rotateMutation } = useProviderMutations();
  const mutation = rotate ? rotateMutation : create;

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [credential, setCredential] = useState("");
  const [reveal, setReveal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // Initialized INVERTED on purpose: the mount itself counts as the open
  // transition, so an initially-open dialog (the rotate prefills) resets
  // on the very first render too.
  const [prevOpen, setPrevOpen] = useState(!open);

  // A fresh open resets the whole form (a rotation prefill included) —
  // no credential ever survives a close. Adjusting state DURING RENDER
  // (the React-docs pattern, not an effect): the reset is part of the
  // open transition, no cascading render.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(rotate?.providerKey ?? "");
      setBaseUrl(rotate?.baseUrl ?? "");
      setCredential("");
      setReveal(false);
      setSubmitted(false);
    }
  }

  const nameError = submitted && !isProviderKeyValid(name.trim());
  const urlVerdict = baseUrl.trim()
    ? validateProviderBaseUrl(baseUrl)
    : null;
  const urlError =
    submitted && urlVerdict !== null && !urlVerdict.ok ? urlVerdict : null;
  const serverError =
    mutation.isError && mutation.error instanceof Error
      ? mutation.error.message
      : null;
  const canSubmit =
    isProviderKeyValid(name.trim()) &&
    urlVerdict !== null &&
    urlVerdict.ok &&
    credential.length > 0 &&
    !mutation.isPending;

  const close = () => onOpenChange(false);

  const submit = () => {
    setSubmitted(true);
    if (!canSubmit) return;
    // The material rides the mutation argument once and is dropped from
    // this state on success (the close resets the whole form).
    const onSuccess = () => {
      toast.push({
        kind: "ok",
        title: rotate ? t("models.toast.rotated") : t("models.toast.connected"),
      });
      close();
    };
    // On error the dialog STAYS: the server reason renders verbatim and
    // the owner fixes the field and retries. The owner saw the normalized
    // preview — the wire carries EXACTLY that (WYSIWYG; the server
    // normalizes identically anyway).
    const normalizedUrl =
      urlVerdict !== null && urlVerdict.ok ? urlVerdict.normalized : "";
    if (rotate) {
      rotateMutation.mutate(
        {
          providerKey: rotate.providerKey,
          input: {
            credential,
            ...(normalizedUrl !== rotate.baseUrl
              ? { base_url: normalizedUrl }
              : {}),
          },
        },
        { onSuccess },
      );
    } else {
      create.mutate(
        {
          provider_key: name.trim(),
          base_url: normalizedUrl,
          credential,
        },
        { onSuccess },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {rotate ? t("models.form.rotateTitle") : t("models.form.title")}
          </DialogTitle>
          <DialogDescription>{t("models.form.description")}</DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="provider-name" className="text-sm font-medium">
              {t("models.form.name")}
            </label>
            <Input
              id="provider-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={rotate !== null}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={nameError || undefined}
              aria-describedby={nameError ? "provider-name-error" : "provider-name-hint"}
            />
            {nameError ? (
              <p id="provider-name-error" className="text-xs text-error" role="alert">
                {t("models.form.errName")}
              </p>
            ) : (
              <p id="provider-name-hint" className="text-xs text-foreground-muted">
                {t("models.form.nameHint")}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="provider-url" className="text-sm font-medium">
              {t("models.form.baseUrl")}
            </label>
            <Input
              id="provider-url"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={urlError !== null || undefined}
              aria-describedby={
                urlError !== null
                  ? "provider-url-error"
                  : urlVerdict !== null && urlVerdict.ok
                    ? "provider-url-preview"
                    : undefined
              }
            />
            {urlError !== null ? (
              <p id="provider-url-error" className="text-xs text-error" role="alert">
                {urlError.message}
              </p>
            ) : urlVerdict !== null && urlVerdict.ok ? (
              <p id="provider-url-preview" className="text-xs text-foreground-muted">
                {t("models.form.baseUrlPreview", { url: urlVerdict.normalized })}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="provider-key" className="text-sm font-medium">
              {t("models.form.key")}
            </label>
            <div className="flex gap-1.5">
              <Input
                id="provider-key"
                type={reveal ? "text" : "password"}
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                autoComplete="new-password"
                spellCheck={false}
                className="font-mono"
              />
              {/* Reveal covers the UNSAVED typed value only (TL verdict
               * Q3); after save no show surface exists anywhere. */}
              <Button
                type="button"
                variant="outline"
                aria-pressed={reveal}
                aria-label={reveal ? t("models.form.hide") : t("models.form.reveal")}
                onClick={() => setReveal((value) => !value)}
              >
                {reveal ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                <span aria-hidden>{reveal ? t("models.form.hide") : t("models.form.reveal")}</span>
              </Button>
            </div>
            <p className="text-xs text-foreground-muted">{t("models.form.keyHint")}</p>
          </div>

          {serverError ? (
            <p className="rounded-md border border-border-subtle bg-well px-2.5 py-2 text-xs text-error" role="alert">
              {serverError}
            </p>
          ) : null}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={close}>
              {t("models.form.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending
                ? t("models.form.saving")
                : rotate
                  ? t("models.form.rotateSubmit")
                  : t("models.form.submit")}
            </Button>
          </div>
          <p className="sr-only">
            {lang === "ru" ? "Форма подключения провайдера" : "Provider connection form"}
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
