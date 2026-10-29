# vesmaro-session-relay — Kora relay transport (ADR 0019 rev.2 #3, line A1)

The executor-side unit that turns board steering into real harness
deliveries: poll → inject → confirm. Board side:
`server/kora/relay_transport.py` (+ pickup/confirm routes in
`server/app.py`); unit side: `scripts/kora/relay_unit.py`.

## What it does

1. **Pickup** — `POST /api/executors/{id}/kora-relay/pickup` pulls the
   steering commands the board parked when the owner hit «отправить».
   Executor-token ONLY (the machine token is refused: prompts are
   ui-class content, and agent children hold the machine token). The
   pickup doubles as the executor presence tick (the scan precedent).
2. **Inject** — the `zcode-stdin` driver spawns the headless harness
   `--resume <native_id> --prompt=- --json --mode <m>` and pipes the
   prompt to its STDIN (never argv — ADR gate 3). «Delivered» = the
   harness accepted the prompt (turn in flight), not «turn finished».
   Per-session writer mutex; a busy session confirms
   failed/retryable «сессия занята» after `lock_wait`.
3. **Confirm** — `POST /api/executors/{id}/kora-relay/confirm` settles
   the honest `queued → delivered/failed` state machine (bounded
   retries; past them the board's in-flight sweep resolves
   failed/retryable «не отчиталось»).

Dead sessions never reach the transport: the board fails them
non-retryable before the handoff. A board restart is a clean slate
(in-memory, honest); a unit restart clears stuck session locks (running
turns are left alone — the harness owns its store, NO-DRIFT).

## Install (owner, 5 lines)

The unit runs where the harness store lives — on the laptop inside the
`ubuntu` distrobox (the assignment-poller layout: repo checkout at
`~/.local/share/vesma-eyes/bridge` in the box).

1. In the box — config + token:
   ```
   cp deploy/relay/relay.example.yaml ~/.config/vesma-eyes/relay.yaml   # edit executor_id/board_url
   printf 'VESMARO_EXECUTOR_TOKEN=<executor secret>\n' > ~/.config/vesma-eyes/relay.env  # chmod 600
   cp deploy/relay/zcode-stdin-headless.sh ~/.local/bin/ && chmod +x ~/.local/bin/zcode-stdin-headless.sh
   ```
2. On the HOST:
   ```
   cp deploy/relay/vesmaro-session-relay.service ~/.config/systemd/user/
   cp deploy/relay/relay-unit-launcher.sh ~/.local/bin/ && chmod 700 ~/.local/bin/relay-unit-launcher.sh
   systemctl --user daemon-reload && systemctl --user enable --now vesmaro-session-relay
   loginctl enable-linger "$USER"    # optional: start before desktop login
   ```
3. Board side — flip the capability on the executor (owner action, the
   ADR default-OFF gate):
   ```
   PATCH /api/executors/{id}  {"capabilities": ["session-relay", ...]}
   ```
   Executors WITHOUT the capability keep the honest
   failed/retryable «не подключён» — the bridge never pretends.

Verify: `journalctl --user -u vesmaro-session-relay -f`; first send
from Kora shows `queued` then `delivered`, and the prompt appears in
the session's transcript (the harness wrote its own store).

## Smoke test without steering

`python3 scripts/kora/relay_unit.py --once` validates the config and
the token and performs nothing (pickup is a board mutation — a dry run
must not move items).
