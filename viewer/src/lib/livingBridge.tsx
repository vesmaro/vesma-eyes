import { useEffect } from "react";
import { useGateway } from "@/gateway/GatewayContext";
import { isBoardHealthSource, isTaskEventSource } from "@/gateway/capabilities";
import { useBoardHealth } from "@/hooks/usePulse";
import { useLiveLayer } from "@/lib/liveLayerStore";
import { feedLivingEvent, feedLivingHealth } from "@/lib/livingFeed";

/**
 * The real-data bridge of the living layer (ME-071 W1a) — a LEAF component
 * mounted once in the Shell so the lazy engine is fed on every page from
 * the SAME honest sources the UI already speaks (anti-fake canon §14.6.1
 * inv.3):
 *
 * - BASE tone: GET /api/health per-store detail (servers[].state), polled
 *   every 30s (§14.6.1 §1); `null` until the first answer — honest neutral.
 * - EVENTS: the layer owns ONE EventSource of the board /api/events stream
 *   (the ui-contract §11 dictionary) while it is enabled — closed on
 *   «Выключен». This is deliberately the layer's OWN connection, not a
 *   piggyback on the per-page bridges: the background must hear the bus on
 *   EVERY page, and one owned stream keeps the lifecycle honest.
 *
 * LEAF on purpose: the query state re-renders THIS component only — never
 * the Shell subtree (focused inputs must not be touched by the poll).
 *
 * No demo events exist anywhere on this path: silence is neutral.
 */

const HEALTH_POLL_MS = 30_000;

export function LivingBridge(): null {
  const gateway = useGateway();
  const layer = useLiveLayer();
  const healthCapable = isBoardHealthSource(gateway);
  const eventsCapable = isTaskEventSource(gateway);
  const health = useBoardHealth(
    // Poll only while the layer can be seen at all; «Выключен» sleeps.
    { refetchInterval: layer === "off" || !healthCapable ? false : HEALTH_POLL_MS },
  );

  // Base tone feed: the raw per-store states; the tone engine classifies.
  const states = health.data?.servers.map((s) => s.state ?? (s.ok === false ? "error" : "ok"));
  useEffect(() => {
    feedLivingHealth(health.isError ? ["error"] : (states ?? null));
  }, [health.isError, states]);

  // Event feed: one stream while enabled (capability-gated — vesma mode
  // simply never subscribes, pages keep their refetch-on-mount behaviour).
  useEffect(() => {
    if (layer === "off" || !eventsCapable) return;
    const stream = gateway.events();
    // W2: the parsed event rides along — the Весма keeper reads the
    // notification title from it for the named phrases (zero eager cost).
    const unsubscribe = stream.onAny((event) => feedLivingEvent(event.kind, event));
    return () => {
      unsubscribe();
      stream.close();
    };
  }, [gateway, layer, eventsCapable]);

  return null;
}
