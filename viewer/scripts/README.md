# scripts/ (viewer)

Runtime/build-time helpers. `smoke-render.mjs` is the ME-011 browser
render-smoke (ADR 0020 invariant 7): run via `npm run smoke:render` —
local mock-adapter build + `vite preview`, or point
`VESMARO_SMOKE_BASE_URL` at any deployed base. LOCAL GATE ONLY: repo CI
(Actions) is billing-locked and does not run it — run before merge on
any docs/TextEngine-adjacent change and during phase acceptance.
