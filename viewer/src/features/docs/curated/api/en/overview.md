---
title: Ecosystem APIs — overview
---

# Ecosystem APIs

This hub maps the programmatic interfaces of the memory ecosystem: the
vesma-eyes board, the vesma memory server, the resident vesmaro-agent,
and the vesma-mesh transport. One section per project; inside a section
you get either a generated reference or a page taken from the project's
repository at an exact pin.

## Project map

| Section | What the API is | How it is produced |
|---|---|---|
| [Board API](api/vesma-eyes/index) | the board's own HTTP API: tasks, memory, assignments, executors, automation, devices | generated from the OpenAPI snapshot (`scripts/gen_api_ref.py`), RU v1 |
| [vesma HTTP API](api/mnemos/http-api) | the memory server surface: entry CRUD, search, pipeline, DLQ, traces; the A2A sessions contract | a curated map + the page from the vesma repository at a pin |
| [vesmaro-agent](api/vesmaro-agent/protocol) | the agent wire protocol (registration, claims, reports, discovery) and the service charter v2 digest | the protocol body from the repository at a pin + a curated digest |
| [vesma-mesh](api/mnemos-mesh/index) | no public HTTP API — an internal protocol | an honest note verified against the repository pin |

## Freshness rule

Pages here are **synchronized from the source**, never hand-written:

- the board API reference is generated from
  `viewer/board-openapi-snapshot.json` — every page's provenance is the
  spec's blob SHA and snapshot date (in the frontmatter and on the page
  badge); a spec change means regeneration, hand edits to bodies are out;
- the vesma and vesmaro-agent pages are synced from their repositories by
  full SHA pins (`scripts/sync-config.yaml`, the `api_hub` section);
- every page carries the badge “from `<repo>`@`<sha>`, synced `<date>`” —
  it names the exact source commit you are reading.

The original language is preserved: the generated board reference is
Russian for now (v1), the agent protocol is English (under the
“original language” badge), the rest is bilingual.

## What is deliberately absent

Cortex, canon, canon-data and vitals are not here: research and internal
repositories without a public API contract — the decisions are on record in
`sync-config.yaml` (`api_hub.excluded_repos`); inclusion needs an owner
directive.
