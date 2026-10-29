#!/bin/sh
# Host-side launcher for vesmaro-session-relay.service — starts the
# relay unit inside the distrobox and pins the two things
# distrobox-exec gets wrong for this layout (the poller launcher
# precedent, live-verified 2026-09-21):
#
# 1. the exec env leaks the HOST $HOME — every path is absolute and
#    HOME is re-exported to the container home before anything runs;
# 2. `python3` in the exec PATH resolves to the host ~/.local/bin shim,
#    which re-execs with a SCRUBBED environment — the executor token
#    would never reach the unit. The absolute container interpreter
#    keeps the env.
#
# Install (HOST side): cp relay-unit-launcher.sh ~/.local/bin/ && chmod 700
# Adjust the absolute prefixes if the container/home layout differs
# (CONTAINER_BOX_HOME = the container's $HOME as seen from both sides;
# DISTROBOX_NAME = `distrobox list` name).
DISTROBOX_BIN=/var/home/abyss/.local/bin/distrobox-enter
DISTROBOX_NAME=ubuntu
CONTAINER_BOX_HOME=/var/home/abyss/.distrobox/ubuntu/home
exec "$DISTROBOX_BIN" -n "$DISTROBOX_NAME" -- /bin/sh -c '
  export HOME="'"$CONTAINER_BOX_HOME"'";
  cd "$HOME/.local/share/vesma-eyes/bridge" || exit 1
  set -a; . "$HOME/.config/vesma-eyes/relay.env"; set +a
  exec /usr/bin/python3 scripts/kora/relay_unit.py \
    --config "$HOME/.config/vesma-eyes/relay.yaml"'
