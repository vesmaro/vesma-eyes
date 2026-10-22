import { createContext } from "react";

/**
 * Whether the markdown chunk being rendered lives INSIDE an endpoint
 * section (a «METHOD /path» card). The article theme gates its vocabulary
 * h4 label style (Параметры / Пример запроса / Ответы / Request body…) on
 * this context — review P2 (2026-10-22): applying it page-wide styled
 * h4 «Configuration/Конфигурация» sections of ordinary upstream guides
 * (mnemos architecture overview) with API semantics they do not have. The
 * provider is the convention flow in features/docs/Markdown.tsx, which
 * wraps exactly the endpoint card chunks; rail-less renders (default
 * `false`) keep the factory h4 typography. The api-board presentation
 * keeps its own all-h4 override — the generated corpus is uniformly
 * structured and trusted.
 */
export const EndpointSectionContext = createContext(false);
