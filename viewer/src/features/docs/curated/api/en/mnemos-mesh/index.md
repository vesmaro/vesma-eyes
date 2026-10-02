---
title: vesma-mesh — no public HTTP API
---

# vesma-mesh: no public HTTP API

vesma-mesh has no public HTTP API — inventing a reference here would be
dishonest. The mesh is designed as a “dumb transport”: nodes exchange
already-processed records over internal contracts; moderation and storage
stay in mnemos.

## What exists instead of a public API

| Surface | What it is | Where it is defined |
|---|---|---|
| Internal core API | gRPC over a Unix socket between the mesh and mnemos: writing/reading already-redacted envelopes, no shared SQLite | [`proto/mnemos_core_api.proto`](https://github.com/Korrnals/mnemos-mesh/blob/b428ea9b7ec9731fe4d53478702d0667cf3f53de/proto/mnemos_core_api.proto) |
| Peer federation | the node ↔ node contract over mTLS: per-peer ACL, batch sync, mediated pull | [`proto/federation.proto`](https://github.com/Korrnals/mnemos-mesh/blob/b428ea9b7ec9731fe4d53478702d0667cf3f53de/proto/federation.proto) |
| Internal relays | forwarding transport contracts (assignment/relay legs) — an implementation detail, not an external contract | the [`proto/`](https://github.com/Korrnals/mnemos-mesh/tree/b428ea9b7ec9731fe4d53478702d0667cf3f53de/proto) directory |

## The operator surface

A node operator works with configuration and documentation, not an API:

- `mesh.yaml` — every node setting:
  [the configuration reference](mnemos-mesh/user/configuration);
- bringing a node up and checking the channel:
  [getting started](mnemos-mesh/user/getting-started);
- operations and security: [the runbook](mnemos-mesh/admin/runbook),
  [the trust model](mnemos-mesh/admin/security).

The note is verified against the vesma-mesh repository at the pin (the
page badge); contract changes surface in the `gen_api_ref.py check-drift`
report.
