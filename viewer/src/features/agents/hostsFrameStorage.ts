import { readFrameInt, writeFrameValue } from "@/features/kora/koraFrameStorage";

/**
 * Agents-hosts frame storage (agents-redesign A1, blueprint 2026-10-09):
 * the same frame-hardware contract as Kora's (koraFrameStorage.ts — «безопасные
 * геттеры», clamp-on-read, storage failures non-fatal), under its OWN key so
 * the two workspaces never couple their geometry:
 *
 * - `vesmaro.agentsRightW` — the roster panel width, 280..560 px (def 320).
 *
 * The CSS variable counterpart is `--agents-right-w` (set inline on the
 * frame grid, the Kora pattern); the key's value is a plain px int.
 */

const RIGHT_W_KEY = "vesmaro.agentsRightW";

/** A1 seam ranges (blueprint: def 320, range 280-560). */
export const AGENTS_SIDE_MIN = 280;
export const AGENTS_SIDE_MAX = 560;
export const AGENTS_SIDE_DEFAULT = 320;

export const readAgentsRightW = (): number =>
  readFrameInt(RIGHT_W_KEY, AGENTS_SIDE_DEFAULT, AGENTS_SIDE_MIN, AGENTS_SIDE_MAX);
export const writeAgentsRightW = (w: number): void =>
  writeFrameValue(RIGHT_W_KEY, String(w));
