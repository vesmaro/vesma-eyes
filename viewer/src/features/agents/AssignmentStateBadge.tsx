import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n";
import type { AssignmentLifecycleState } from "@/gateway/boardTypes";
import { assignmentStateStyle } from "./assignmentStatus";

/**
 * The 7-state assignment badge (spec §3.1): colour + text + SHAPE — never
 * colour alone (WCAG 1.4.1). Shape markers are aria-hidden dots: hollow
 * (queued — nothing taken it yet), filled (claimed), solid (running),
 * square (terminal states). The text label stays the primary signal for SRs.
 */

/** Shape marker classes per shape kind (aria-hidden decoration). */
const SHAPE_CLASS: Record<
  ReturnType<typeof assignmentStateStyle>["shape"],
  string
> = {
  // Hollow dot: the ring is the shape, current colour keeps contrast.
  hollow: "size-1.5 rounded-full border border-current",
  filled: "size-1.5 rounded-full bg-current",
  // U6 DOSAGE VERDICT (пульс-бейдж; SPEC-2026-10-07 «Агенты: присутствие-
  // свет» — пульс допустим ТОЛЬКО как реакция на реальное событие, не фон):
  // the running dot is a STATIC solid dot. The state is data (text + shape
  // carry it, 1.4.1); the domain's only living beat is the one-shot
  // presence flash (presenceLight.ts), never a background loop.
  pulse: "size-1.5 rounded-full bg-current",
  square: "size-1.5 rounded-[1px] bg-current",
};

export function AssignmentStateBadge({
  state,
  className = "",
}: {
  state: AssignmentLifecycleState;
  className?: string;
}) {
  const t = useT();
  const style = assignmentStateStyle(state);
  return (
    <Badge variant={style.variant} className={className}>
      <span aria-hidden="true" className={`mr-1 inline-block ${SHAPE_CLASS[style.shape]}`} />
      {t(style.labelKey)}
    </Badge>
  );
}
