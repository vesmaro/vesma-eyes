import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Spec 05 §2.1: focus-visible ring = --color-focus 2px/2px on EVERY variant
  // (dark value coincides with iris-bright; light uses the dedicated focus step).
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-instant ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-iris-strong text-foreground-inverse hover:bg-iris-strong-hover", // AA in both themes
        confidence: "bg-confidence text-foreground-inverse hover:bg-confidence/90",
        outline:
          "border border-border bg-transparent hover:bg-elevated hover:text-foreground",
        ghost: "hover:bg-elevated hover:text-foreground",
        link: "text-iris-bright underline-offset-4 hover:underline", // iris alone fails AA as text
        destructive: "bg-error text-foreground-inverse hover:bg-error/90",
      },
      size: {
        // U7 mobile pass (SPEC-2026-10-07 «Глубокая проработка» п.4): below
        // md every button is a ≥48px touch target; the md: column keeps the
        // desktop canon untouched. One implementation — the primitive.
        default: "h-12 md:h-9 px-4 py-2",
        sm: "h-12 md:h-8 rounded-sm px-3 text-xs",
        lg: "h-12 md:h-10 rounded-md px-8",
        icon: "size-12 md:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Spec 05 §2.1 loading row: 16px spinner before the label, `aria-busy`
   * for assistive tech, and the button is disabled — repeat clicks are
   * blocked while the action is pending. The error state itself is a
   * composition concern (the Toast is the only action→feedback channel,
   * ui-contract §6); the button simply returns to its default look.
   */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-busy={loading || undefined}
        disabled={loading || disabled}
        {...props}
      >
        {loading && !asChild ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
