import { describe, expect, it } from "vitest";
import {
  makeKoraGateway,
  makeMockKoraGateway,
} from "./koraGatewayContext";
import { KoraMockAdapter } from "./KoraMockAdapter";

/**
 * The build-mode seam (U5): mock builds (dev default, dist-smoke) get the
 * week-0 fixtures so the frame/honesty harness run backend-less; board and
 * vesma builds keep the HTTP adapter. The test environment resolves the
 * adapter to "mock" (dev fallback), so makeKoraGateway() must answer the
 * mock — a regression to the unconditional HTTP adapter error-pages every
 * backend-less /kora (the honesty gate would pin an error screen).
 */

describe("koraGatewayContext — the build-mode gateway seam", () => {
  it("makeKoraGateway serves the mock in mock builds (the test env)", () => {
    expect(makeKoraGateway()).toBeInstanceOf(KoraMockAdapter);
  });

  it("the explicit mock factory keeps its latency contract", () => {
    expect(makeMockKoraGateway(false)).toBeInstanceOf(KoraMockAdapter);
  });
});
