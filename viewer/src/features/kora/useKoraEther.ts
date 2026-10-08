import { useEffect, useState } from "react";
import { useGateway } from "@/gateway/GatewayContext";
import { isTaskEventSource } from "@/gateway/capabilities";
import {
  etherRows,
  pushEtherEvent,
  subscribeEther,
  type KoraEtherRow,
} from "./koraEtherStore";

/**
 * The Kora page's ONE EventStream (U5; the taskEvents.ts pattern — one
 * stream per domain subtree, capability-gated): the bridge OPENS the bus
 * for the workspace and pushes parsed events into the Эфир ring; the
 * reader subscribes components to the ring without owning transport.
 *
 * TWO hooks on purpose: the bridge is called ONCE in KoraWorkspace (a
 * second EventSource per mounted component would be a transport leak),
 * while the empty-scene card and the Пульт wing both read the same ring —
 * one лента, два места посадки, ноль дублей (07j §4.2).
 *
 * Capability-gated: a gateway without events() (vesma mode) never
 * subscribes — the ether honestly shows its empty state.
 */

/** Mount ONCE per Kora workspace: opens the bus, feeds the ring. */
export function useKoraEtherBridge(): void {
  const gateway = useGateway();
  useEffect(() => {
    if (!isTaskEventSource(gateway)) return;
    const stream = gateway.events();
    const unsubscribe = stream.onAny((event) => {
      pushEtherEvent(event);
    });
    return () => {
      unsubscribe();
      stream.close();
    };
  }, [gateway]);
}

/** Read the ring (re-renders on arrivals). Transport-agnostic. */
export function useKoraEtherRows(): readonly KoraEtherRow[] {
  const [rows, setRows] = useState<readonly KoraEtherRow[]>(etherRows);
  useEffect(() => subscribeEther(setRows), []);
  return rows;
}
