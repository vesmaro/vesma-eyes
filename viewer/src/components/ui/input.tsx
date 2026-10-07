import * as React from "react";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Text input. The "pupil" oval treatment (radius-xl, iris focus glow) is a
 * SearchBar-level composition (TODO T5); this stays a plain token-bound field.
 *
 * State matrix (spec 05 §2.5): default / hover edge / focus pupil / disabled /
 * error (aria-invalid + the message line under the field with the «Ошибка:»
 * prefix — never colour alone) / readonly. The error prop is optional and
 * additive: without it the field renders exactly the pre-matrix bare input.
 */
export interface InputProps extends React.ComponentProps<"input"> {
  /** Validation message; renders the error edge + a described-by message line. */
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, id, "aria-describedby": describedBy, ...props }, ref) => {
    const t = useT();
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const errorId = `${inputId}-error`;
    const hasError = typeof error === "string" && error.length > 0;
    const input = (
      <input
        type={type}
        id={inputId}
        ref={ref}
        aria-invalid={hasError || undefined}
        aria-describedby={
          [hasError ? errorId : undefined, describedBy].filter(Boolean).join(" ") ||
          undefined
        }
        className={cn(
          "flex h-9 w-full rounded-md border border-border bg-well px-3 py-1 text-base transition-colors duration-instant",
          "placeholder:text-foreground-muted focus-visible:placeholder:text-transparent",
          "hover:border-myelin-strong",
          "caret-iris-bright",
          "focus-visible:border-iris-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          "disabled:cursor-not-allowed disabled:opacity-50",
          // Spec §2.5 readonly row: base surface, subtle edge, no hover noise.
          "read-only:cursor-default read-only:border-border-subtle read-only:bg-background",
          hasError && "border-error focus-visible:border-error",
          className,
        )}
        {...props}
      />
    );
    if (!hasError) return input;
    return (
      <div className="flex w-full flex-col gap-1">
        {input}
        {/* Not colour alone: the «Ошибка:» prefix names the state in text. */}
        <p id={errorId} className="text-xs text-error" role="alert">
          {t("field.errorPrefix")} {error}
        </p>
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
