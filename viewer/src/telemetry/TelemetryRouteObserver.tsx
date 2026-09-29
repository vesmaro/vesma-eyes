/**
 * `ui.nav` emitter (ME-041, taxonomy §1.2 #2) — a pathless layout route
 * wrapping the whole route table (see app/routes.tsx). Renders nothing
 * but <Outlet/>; its only job is to observe committed location changes
 * and hand them to the telemetry singleton, which stamps the surface
 * slug and the via attribution (route/link/palette).
 *
 * The FIRST observation is silent: the initial load is `ui.visit`, and
 * emitting ui.nav for it would give every visit a phantom "first action"
 * (number 2's numerator is actions AFTER the visit starts).
 */
import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router";
import { trackRouteChange } from "./telemetry";

export function TelemetryRouteObserver() {
  const location = useLocation();
  const firstObservation = useRef(true);

  useEffect(() => {
    if (firstObservation.current) {
      firstObservation.current = false;
      return; // initial load — ui.visit owns it, not ui.nav
    }
    trackRouteChange(location.pathname);
  }, [location.pathname]);

  return <Outlet />;
}
