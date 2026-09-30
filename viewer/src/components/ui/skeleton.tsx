import { cn } from "@/lib/utils";

/** Loading placeholder (architecture.md §7 loading convention). Static by
 * design (blueprint §6.3 slop-pass): a pulse on every mount breaks the
 * motion frequency gate — placeholders stay quiet bg-elevated shapes. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-md bg-elevated", className)}
      {...props}
    />
  );
}

export { Skeleton };
