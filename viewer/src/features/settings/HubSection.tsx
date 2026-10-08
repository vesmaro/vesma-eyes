import type { ReactNode } from "react";

/**
 * The shared settings-hub section well (UI-23): h2 + scroll margin clear of
 * the sticky bars. Extracted from SettingsHubPage so the security section
 * (ME-080 follow-up) renders in the SAME well — one section canon for the
 * whole hub.
 */
export function HubSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-settings-heading`}
      className="scroll-mt-36 space-y-3 rounded-md border border-border-subtle bg-well p-4 shadow-well"
    >
      <h2 id={`${id}-settings-heading`} className="text-sm font-medium">
        {title}
      </h2>
      {children}
    </section>
  );
}
