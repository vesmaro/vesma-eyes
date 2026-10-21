import type { Memory } from "@/gateway/types";

/**
 * Shared display helpers for memory surfaces (list card, search hit, scroll).
 * Pure functions — unit-testable without a DOM.
 */

/** Effective content = refined text when present, otherwise the raw content. */
export function memoryEffectiveContent(memory: Memory): string {
  return memory.clean_content ?? memory.content;
}

/**
 * Auto-title per component-inventory §4: the stored title, or the head of the
 * effective content when the memory has none.
 */
export function memoryTitle(memory: Memory): string {
  const title = memory.title?.trim();
  if (title) return title;
  const content = memoryEffectiveContent(memory).trim();
  return content.length > 60 ? `${content.slice(0, 60).trimEnd()}…` : content;
}

// --- human faces for machine-titled records (D7, ux-wd-human-memory) --------
// Session ingests often store the bare speaker word ("User") as the title and
// open the body with a machine dump (audio-file paths, JSON). The list/search/
// pulse faces mine a human headline from the first meaningful body line; the
// dump head goes under the fold (the detail page keeps the full raw scroll).

/** Structural type satisfied by Memory, search hits and pulse items. */
export interface HumanFaceSource {
  title?: string | null;
  content: string;
  clean_content?: string | null;
}

/** Speaker words session ingests use as bare titles — they name the speaker,
 * never the record (the exact defect the user panel verdict quotes). */
const GENERIC_TITLES = new Set(["user", "assistant", "system", "human", "ai"]);

export function isGenericMemoryTitle(title: string | null | undefined): boolean {
  return GENERIC_TITLES.has((title ?? "").trim().toLowerCase());
}

const MD_PREFIX = /^[#>*|•–-]+\s*/; // markdown structure tokens
const ROLE_PREFIX = /^(user|assistant|system|human|ai|me)\s+/i; // transcript speaker labels
const DUMP_PREFIX = /^(\/|~\/|https?:\/\/|\{|\[|"|'|`{3}|\d{4}-\d{2}-\d{2})/; // paths/URLs/JSON/logs
const MIN_HEADLINE_CHARS = 12;
const MAX_HEADLINE_CHARS = 60;
/** Below this share of letters a line is base64/hex/hash output, not prose. */
const MIN_LETTER_RATIO = 0.45;

function meaningfulHeadline(rawLine: string): string | null {
  let line = rawLine.trim().replace(MD_PREFIX, "").replace(ROLE_PREFIX, "").trim();
  if (line.length < MIN_HEADLINE_CHARS) return null;
  if (DUMP_PREFIX.test(line)) return null;
  const letters = (line.match(/\p{L}/gu) ?? []).length;
  if (letters / line.length < MIN_LETTER_RATIO) return null;
  if (line.length > MAX_HEADLINE_CHARS) {
    line = `${line.slice(0, MAX_HEADLINE_CHARS).trimEnd()}…`;
  }
  return line;
}

export interface MemoryHumanFace {
  /** Mined human headline — never null on a non-null face. */
  headline: string;
  /** Body after the headline line, machine-dump head removed (under the fold). */
  preview: string | null;
}

/**
 * The human face of a generically-titled record, or null when the stored
 * title already says something (callers keep the stock title and preview).
 * Fenced content is never mined: a headline lifted from inside a code block
 * would be a lie, and a mid-fence cut would corrupt the markdown preview.
 */
export function memoryHumanFace(memory: HumanFaceSource): MemoryHumanFace | null {
  if (!isGenericMemoryTitle(memory.title)) return null;
  const content = (memory.clean_content ?? memory.content) ?? "";
  const lines = content.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    if (meaningfulHeadline(lines[index])) break;
    // A fence above the headline means the prose (if any) sits inside code —
    // honest absence beats a mined lie.
    if (lines[index].trim().startsWith("```")) return null;
    index += 1;
  }
  if (index >= lines.length) return null;
  const headline = meaningfulHeadline(lines[index]);
  if (!headline) return null;
  const preview = lines
    .slice(index + 1)
    .join("\n")
    .trim();
  return { headline, preview: preview.length > 0 ? preview : null };
}

/** Display title: stored title, content head (memoryTitle), or — for the
 * generic "User"-class titles — the mined human headline. */
export function humanMemoryTitle(memory: HumanFaceSource & { title?: string | null }): string {
  const face = memoryHumanFace(memory);
  if (face) return face.headline;
  const title = memory.title?.trim();
  if (title) return title;
  const content = (memory.clean_content ?? memory.content) ?? "";
  return content.length > 60 ? `${content.slice(0, 60).trimEnd()}…` : content;
}

/** Card preview: effective content, or the face preview (dump head under the
 * fold) for generically-titled records. The full scroll stays on the detail
 * page — including the raw toggle. */
export function memoryCardPreview(memory: HumanFaceSource): string {
  const face = memoryHumanFace(memory);
  if (face) return face.preview ?? "";
  return (memory.clean_content ?? memory.content) ?? "";
}

/** Query for the «Найти похожее» action (D7 P2): the human title's leading
 * words, punctuation stripped — the unified search ranks on them. Capped so
 * the URL stays shareable. */
export function memorySearchQuery(memory: HumanFaceSource, maxChars = 80): string {
  const raw = humanMemoryTitle(memory);
  const words = raw
    .replace(/["'`«»„“”()\[\]{}.,!?;:—–-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let query = "";
  for (const word of words) {
    const next = query ? `${query} ${word}` : word;
    if (next.length > maxChars) break;
    query = next;
  }
  return query;
}

/**
 * Rule/code memories render in mono (D11: frozen — Lora for everything else).
 * The tag contract spells these `type:rule` / `mnemos:rule` / `*:code`; any
 * namespaced tag ending in `:rule` / `:code` qualifies.
 */
export function isMonoMemory(memory: Memory): boolean {
  return (memory.tags ?? []).some((tag) => /:(rule|code)$/i.test(tag));
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Deterministic `14 Sep 2026` formatting (locale-independent for tests/SSR). */
export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()];
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

/** Compact human duration for trace timings: `4m 12s`, `1.4s`, `620ms`. */
export function formatDuration(ms: number | null | undefined): string {
  if (typeof ms !== "number" || Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

/** Score chip text: two decimals, e.g. `0.92`. */
export function formatScore(score: number): string {
  return Number.isFinite(score) ? score.toFixed(2) : "—";
}

/** Confidence label: amber dot + numeric score (inventory §5). */
export function formatConfidence(confidence: number | null | undefined): string {
  return typeof confidence === "number" && Number.isFinite(confidence)
    ? `● ${confidence.toFixed(2)}`
    : "● —";
}

/**
 * Defensive numeric read from the free-form `/metrics` JSON object: tries the
 * candidate keys in order and returns the first finite number.
 */
export function metricNumber(
  metrics: Record<string, unknown> | null | undefined,
  keys: string[],
): number | null {
  if (!metrics) return null;
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
