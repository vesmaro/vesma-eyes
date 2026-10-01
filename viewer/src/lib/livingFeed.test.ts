import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  feedLivingEvent,
  feedLivingHealth,
  feedLivingUpdate,
  isLivingMuted,
  muteLiving,
  subscribeLiving,
  type LivingSignal,
} from "./livingFeed";

describe("livingFeed — the anti-fake gate and the eager signal registry", () => {
  const seen: LivingSignal[] = [];
  let off: (() => void) | null = null;

  beforeEach(() => {
    seen.length = 0;
    off = subscribeLiving((s) => seen.push(s));
  });
  afterEach(() => {
    off?.();
    off = null;
  });

  it("forwards real event kinds and health states to subscribers", () => {
    feedLivingEvent("task.created");
    feedLivingHealth(["ok", "warn"]);
    expect(seen).toEqual([
      { type: "event", kind: "task.created" },
      { type: "health", states: ["ok", "warn"] },
    ]);
  });

  it("drops empty event kinds", () => {
    feedLivingEvent("");
    expect(seen).toEqual([]);
  });

  it("mute: events are dropped, health degrades to honest null, update ignored", () => {
    muteLiving();
    expect(isLivingMuted()).toBe(true);
    feedLivingEvent("task.created");
    feedLivingHealth(["error"]);
    feedLivingUpdate(true);
    // the gate let through only the mute notice and the neutralising health
    expect(seen).toEqual([
      { type: "mute" },
      { type: "health", states: null },
    ]);
    // a later subscriber still observes the muted gate
    const late: LivingSignal[] = [];
    const offLate = subscribeLiving((s) => late.push(s));
    feedLivingHealth(["warn"]);
    feedLivingEvent("report");
    expect(late).toEqual([{ type: "health", states: null }]);
    offLate();
  });

  it("unsubscribe removes the listener", () => {
    off?.();
    off = null;
    feedLivingEvent("report");
    expect(seen).toEqual([]);
  });
});
