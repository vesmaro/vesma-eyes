import { cn } from "@/lib/utils";
import { MONO } from "./constants";
import { METHOD_CHIP_CLASS } from "./apiConvention";
import type { ApiEndpointHeading } from "./apiConvention";

/**
 * The METHOD chip + mono path of a «METHOD /path» heading — the api-board
 * reference look (docs-api-readability), applied BY CONVENTION on every
 * article page since D3 (owner directive 2026-10-22). The shared inner
 * content of an endpoint heading: articleComponents renders it in its h2/h3
 * convention branches, and the api-board presentation
 * (features/docs/apiPresentation.tsx) mounts the exact same chip — one
 * implementation, zero drift. Own file because react-refresh wants
 * component-only export surfaces.
 *
 * The chip + path KEEP the heading text content — the accessible name is
 * the heading's, with the method word lowercased (the established board
 * form) and any enumeration prefix rendered verbatim before the chip
 * (review P3); colour is never the sole carrier (the method word stays
 * visible, WCAG 1.4.1).
 */
export function EndpointChip({ endpoint }: { endpoint: ApiEndpointHeading }) {
  return (
    <>
      <span
        className={cn(
          "inline-flex items-center rounded-sm border px-1.5 py-px text-xs font-semibold uppercase tracking-wide",
          METHOD_CHIP_CLASS[endpoint.method],
        )}
      >
        {endpoint.method}
      </span>{" "}
      <code
        style={MONO}
        className="text-sm font-medium [overflow-wrap:anywhere] text-foreground"
      >
        {endpoint.path}
      </code>
    </>
  );
}
