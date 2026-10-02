/**
 * ME-078 two-channel task render. The wire carries both channels: the RAW
 * author text (`TaskOut.spec` / `ReportOut.body` — what the model reads
 * verbatim, ADR 0020 untouched) and the derived HUMAN channel
 * (`TaskOut.human_view` / `ReportOut.human_body` — server-normalized
 * markdown, server/textnorm.py). Cards render the human channel; the raw
 * channel stays available behind the card's «исходник» toggle.
 */

/**
 * Pick the human-channel text with the raw fallback. The human column is a
 * derived cache with the wire default "" (pre-backfill rows, mock gateways
 * that predate the field) — empty or missing degrades to the raw channel
 * verbatim: an empty human view must never blank a card («пустой не
 * ломается»).
 */
export function humanOrRaw(
  human: string | null | undefined,
  raw: string | null | undefined,
): string {
  return human !== null && human !== undefined && human.trim().length > 0
    ? human
    : (raw ?? "");
}
