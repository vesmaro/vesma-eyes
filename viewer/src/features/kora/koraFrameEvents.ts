/**
 * Kora frame telemetry call points (ME-035 events-taxonomy v0; KW3 «Узкие
 * и полировка»). The SEAM/ZONE facts the frame can name today:
 *
 * - a «Все ходы» zone toggle (the expand/collapse of the secondary zone),
 * - a resize-seam COMMIT (the persisted geometry change of nav / meta /
 *   moves — never per-frame, only the committed fact).
 *
 * MECHANISM, NOT VOCABULARY: the v0 kind registry (events-taxonomy-v0.md
 * §1.2, frozen) has NO seam/zone kind — extending it is a conscious v1
 * revision (doc §0.3), not a client decision. This file is the SAME seam
 * pattern the composer shipped with (koraIntentEvents.ts, the И1
 * precedent): CLEAN call points wired through the components, a no-op
 * client until the vocabulary row arrives — no emission, no fake events.
 * When the v1 revision lands (kora.zone_toggled / kora.seam_committed or
 * their settled names), the client is injected through this interface and
 * nothing inside the zones changes.
 */

/** A resize seam that can report its committed geometry. */
export type KoraSeamName = "nav" | "meta" | "moves";

export interface KoraFrameEventPoints {
  /** The «Все ходы» strip toggled (taxonomy candidate: kora.zone_toggled).
   * `to` is the state AFTER the click. */
  movesZoneToggled(to: "expanded" | "collapsed"): void;
  /** A seam series committed (taxonomy candidate: kora.seam_committed). */
  seamCommitted(seam: KoraSeamName): void;
}

/** The seam without a client — every point is a no-op (И1 precedent). */
export const NOOP_KORA_FRAME_EVENTS: KoraFrameEventPoints = {
  movesZoneToggled: () => undefined,
  seamCommitted: () => undefined,
};
