#!/bin/sh
# Start the assignment poller detached (nohup — laptop vesma precedent;
# systemd alternative: vesmaro-assignment-poller.service).
# Runtime layout: a git-archive snapshot of main in
#   ~/.local/share/vesma-eyes/bridge/  (scripts/ + deploy/poller/)
# Config:  ~/.config/vesma-eyes/poller.yaml   (no secrets)
# Env:     ~/.config/vesma-eyes/poller.env    (0600: board + executor tokens)
cd "$(dirname "$0")/../.." || exit 1   # bridge/ root
set -a; . "$HOME/.config/vesma-eyes/poller.env"; set +a
exec python3 scripts/assignment_poller.py --config "$HOME/.config/vesma-eyes/poller.yaml"
