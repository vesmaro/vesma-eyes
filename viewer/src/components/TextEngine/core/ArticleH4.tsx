import { useContext, type ReactNode } from "react";
import { nodeText } from "./hast";
import type { HastishNode } from "./hast";
import { isParameterSectionHeading } from "./apiConvention";
import { EndpointSectionContext } from "./endpointContext";

/**
 * The h4 of the article theme (review P2, 2026-10-22): a vocabulary
 * section label (Параметры / Пример запроса / Ответы / Request body…) ONLY
 * inside an endpoint section (EndpointSectionContext — provided by the
 * convention flow's card chunks in features/docs/Markdown.tsx); everywhere
 * else the factory look — an unstyled h4 is preferred over API semantics
 * without an API (the mnemos «Configuration» guide sections case). Own
 * file because react-refresh wants component-only export surfaces; the
 * article theme maps `h4` to this component.
 */
export function ArticleH4({
  node,
  children,
}: {
  node?: HastishNode;
  children?: ReactNode;
}) {
  const inEndpointSection = useContext(EndpointSectionContext);
  if (inEndpointSection && isParameterSectionHeading(nodeText(node))) {
    return (
      <h4 className="mt-7 mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground-secondary">
        <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-iris" />
        {children}
      </h4>
    );
  }
  return <h4 className="text-base font-medium text-foreground">{children}</h4>;
}
