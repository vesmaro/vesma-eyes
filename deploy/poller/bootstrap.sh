#!/usr/bin/env bash
# vesmaro-eyes executor bootstrap v2 — the ONE-COMMAND onboarding.
#
#   curl -kfsSL https://<board>/api/poller/bootstrap.sh | sudo bash -s -- \
#     --url https://<board> --token mne_… [--name vps-1] [--harness zcode]
#
# v2 (ME-055): the DEFAULT executor is the Go agent **vesmaro-agent**
# (github.com/vesmaro/vesmaro-agent, releases; PROTOCOL §1.1 enroll mode,
# charter v2) — one static binary, no python. The Python poller stays as
# the EXPLICIT legacy fallback (--poller, «legacy executor»); its
# decommission is a separate task (ME-056) — it is NOT removed here.
#
# The OUTER -k is honest and bounded: the installer TEXT is public and
# secret-free, and the lab TLS is self-signed — the shell does not trust
# it yet (that is the chicken-and-egg this script exists to break). The
# content rides TLS to the board it names; EVERYTHING the script does
# afterwards (registration, the verdict read) uses the PINNED lab CA
# fetched through it, with the sha256 fingerprint printed for the
# out-of-band owner check. Paranoid two-step (fetch, READ, then bash) —
# see REMOTE-EXECUTOR.md, Путь 1.
#
# What it does, in order: parse/sanity args → preflight (systemd, curl,
# openssl; the legacy --poller path adds python ≥ 3.10) → fetch the lab
# CA (ONE -k retry for the CA ONLY) → TRUST ANCHOR (AGW-9, АРХКОМ-8 В1):
# the CA fingerprint is verified against --expect-fp / VESMARO_EXPECT_FP
# silently (mismatch = abort, downloaded CA discarded), or printed for an
# out-of-band owner check with a STRICT /dev/tty prompt (stdin is the
# curl pipe); no anchor and no tty = abort. A pre-placed
# /etc/vesmaro/lab-ca.crt short-circuits the -k path (placement IS the
# out-of-band act) but still must match --expect-fp when one is given →
# THEN the executor branch:
#
#   agent (default): download the vesmaro-agent release artifact for
#     this OS/arch from GitHub releases, verify it against the release's
#     own sha256 manifest (digest printed), install the binary under
#     /opt/vesmaro-agent/bin, write /etc/vesmaro/agent.yaml (managed
#     keys + an HONEST fail-closed allowlist seed) and a systemd unit
#     (the vesmaro-assignment-poller.service hardening precedent), then
#     let THE BINARY enroll (PROTOCOL §1.1, ratified M1:
#     VESMARO_ENROLL_TOKEN + --enroll): the registration row's version
#     is the agent's own fact, the executor_secret lands in the 0600 env
#     file (VESMARO_ENV_FILE, default /etc/vesmaro/agent.env — distinct
#     from the legacy poller.env so two executors never share a secret
#     file). bootstrap.sh only delivers the token and the binary.
#
#   --poller (legacy): the v1 flow verbatim — python venv + deps, curl
#     registration, board-packaged artifacts, /etc/vesmaro/poller.{env,
#     yaml}, the poller systemd unit.
#
# Honesty rules (ADR 0009 §9, A3):
# - outbound-only: the script never opens ports, the board never pings in;
# - the enrollment token travels as a CLI ARGUMENT, never in a URL
#   (ADR 0012 §9); it is single-use, TTL 15 min — shell-history exposure
#   is bounded by design;
# - the generated allowlist CANNOT launch anything until the owner edits
#   the command: nomination ≠ execution (the board gate is the dictionary,
#   the launch gate stays the local allowlist);
# - the agent repo is PRIVATE today: the release download then needs
#   VESMARO_GH_TOKEN in the environment (read-only, repo-scoped). The
#   token is used ONLY as a curl Authorization header, never logged,
#   never written anywhere. When the repo goes public the same command
#   works without it (the script tries anonymous first when no token is
#   set — a 404 names the fix honestly).
# - re-run with a SPENT token and an existing install = UPDATE path:
#   re-download artifacts, PRESERVE the user's allowlist and
#   executor_id, restart — the upgrade story (agent exit 5 + the name
#   already ours on the board; PROTOCOL §7.4). Registration is never
#   re-run silently (rotation = revoke + delete on the board, then a
#   fresh run with a new token and the same --name).
#
# Exit codes: 0 registered/updated · 2 bad arguments · 3 environment
# failed (preflight/TLS/download) · 4 registration refused (4xx, no
# idempotent path) · 5 install/systemd failure.

set -euo pipefail

# ----------------------------------------------------------------- config
BOARD_URL="" TOKEN="" EXEC_NAME="" HARNESS="zcode" HOST_NAME=""
EXPECT_FP="${VESMARO_EXPECT_FP:-}"   # --expect-fp wins over the env synonym
# v2: which executor this run installs — "agent" (default) or "poller".
EXECUTOR_MODE="agent"
AGENT_VERSION="${VESMARO_AGENT_VERSION:-latest}"   # latest | v0.6.0 | 0.6.0
# GitHub source of the agent release (private repo today — see header).
# Downloads ride the API asset endpoint, not the browser_download_url.
GH_API="https://api.github.com/repos/vesmaro/vesmaro-agent"
GH_AUTH=()
if [[ -n "${VESMARO_GH_TOKEN:-}" ]]; then
  GH_AUTH=(-H "Authorization: Bearer $VESMARO_GH_TOKEN")
fi

# Legacy poller layout (unchanged from v1; the --poller path only).
BASE_DIR="${VESMARO_BASE_DIR:-/opt/mnemos-eyes}"
VENV_DIR="$BASE_DIR/venv"
POLLER_PY="$BASE_DIR/assignment_poller.py"
ENV_FILE="/etc/vesmaro/poller.env"
YAML_FILE="/etc/vesmaro/poller.yaml"
MARKER_FILE="/etc/vesmaro/poller-bootstrap.json"
UNIT_FILE="/etc/systemd/system/vesmaro-assignment-poller.service"
STATE_DIR="/var/lib/vesmaro-eyes"

# Go-agent layout. The VESMARO_* env knobs keep the test contour off
# /opt//etc//var (the VESMARO_CA_FILE precedent); VESMARO_ENV_FILE is
# the AGENT'S OWN knob (enroll persists the secret there) — honored
# verbatim, defaulted to a name DISTINCT from the legacy poller.env.
AGENT_BIN="${VESMARO_AGENT_BIN:-/opt/vesmaro-agent/bin/vesmaro-agent}"
AGENT_CONF="${VESMARO_AGENT_CONF:-/etc/vesmaro/agent.yaml}"
AGENT_ENV_FILE="${VESMARO_ENV_FILE:-/etc/vesmaro/agent.env}"
AGENT_UNIT_FILE="${VESMARO_AGENT_UNIT:-/etc/systemd/system/vesmaro-agent.service}"
AGENT_STATE="${VESMARO_AGENT_STATE:-/var/lib/vesmaro-agent}"
AGENT_MARKER="${VESMARO_AGENT_MARKER:-/etc/vesmaro/agent-bootstrap.json}"
AGENT_UNIT_NAME="$(basename "$AGENT_UNIT_FILE" .service)"
# Advisory verdict wait (first poll cycles); the test contour zeroes it.
VERDICT_WAIT="${VESMARO_VERDICT_WAIT:-16}"

# VESMARO_CA_FILE: non-standard CA location knob (also keeps the test
# contour off /etc) — the pre-placed path reads the same variable.
CA_FILE="${VESMARO_CA_FILE:-/etc/vesmaro/lab-ca.crt}"

usage() {
  cat <<'USAGE'
Usage: bootstrap.sh --url <board-url> --token mne_… [--name NAME] [--harness NAME]
                    [--host HOST] [--expect-fp SHA256:<fingerprint>]
                    [--agent-version latest|vX.Y.Z] [--poller]

Installs a vesmaro-eyes executor. DEFAULT (v2): the Go agent
vesmaro-agent — the release binary for this OS/arch from
github.com/vesmaro/vesmaro-agent/releases (sha256-verified against the
release manifest), /etc/vesmaro/agent.yaml + a systemd unit, enrollment
by the binary itself (PROTOCOL §1.1: the mne_ token goes to the agent's
VESMARO_ENROLL_TOKEN, the executor_secret lands in the 0600 env file
VESMARO_ENV_FILE, default /etc/vesmaro/agent.env).

  --url      board base URL as seen FROM THIS MACHINE (VPN overlay address
             if that is what resolves here — may differ from the LAN one)
  --token    one-time enrollment token (mne_…, TTL 15 min, single use);
             mint it on the board: Реестр → Добавить исполнителя
  --name     executor name (default: this hostname)
  --harness  harness id from the board's harness dictionary (default: zcode)
  --host     declared host string (default: this hostname). NB: the Go
             agent registers host = executor_name (PROTOCOL §1.1); this
             flag is honored by the legacy --poller path only.
  --expect-fp  TRUST ANCHOR (AGW-9): the expected lab-CA fingerprint in the
             board canon (SHA256:base64, what the enrollment screen shows
             as ca_fingerprint; a bare hex64 or sha256:-prefixed form is
             accepted too). Given → the fetched/pre-placed CA is verified
             SILENTLY; mismatch = abort, downloaded CA discarded.
             Env synonym: VESMARO_EXPECT_FP. Without an anchor the script
             prints the fingerprint and asks you to type the owner-confirmed
             value on /dev/tty (no tty + no anchor = abort).
  --agent-version  pin the agent release instead of «latest»
             (v0.6.0 or 0.6.0 — reproducible installs; default: latest;
             env synonym VESMARO_AGENT_VERSION)
  --poller   LEGACY executor: the Python assignment poller (v1 flow:
             python venv, board-packaged artifacts). Decommission is
             tracked separately (ME-056); new installs want the default.

Private-repo note: while github.com/vesmaro/vesmaro-agent is private the
agent download needs VESMARO_GH_TOKEN in the environment (read-only,
repo-scoped) — e.g. `sudo VESMARO_GH_TOKEN=… bash bootstrap.sh …`. The
token is never logged and never written anywhere.

Re-run behaviour: with an already-spent token and an existing install the
script takes the UPDATE path (fresh artifacts, your allowlist preserved).
Exit codes: 0 ok · 2 args · 3 environment · 4 registration refused ·
5 install/systemd.
USAGE
}

die() { echo "bootstrap: $1" >&2; exit "${2:-1}"; }
step() { echo "== $1"; }

# --------------------------------------------------- fingerprint helpers
# The board canon (server/provisioner.py fingerprint_of_bytes — the
# ssh-keygen standard): 'SHA256:' + UNPADDED base64 of sha256(DER).
# Computed over the DER form, never over the PEM text.
ca_fingerprint() {
  local b64
  b64=$(openssl x509 -in "$1" -outform DER 2>/dev/null \
        | openssl dgst -sha256 -binary \
        | openssl base64 -A) || return 1
  # '=' appears in base64 ONLY as trailing padding — strip at the first.
  printf 'SHA256:%s' "${b64%%=*}"
}

# Canonical form of an owner-supplied fingerprint (provisioner
# normalize_fingerprint parity): SHA256:base64(43), sha256:/SHA256: hex64
# or bare hex64 — the hex digest is re-ENCODED, never re-hashed. Pure
# bash + coreutils: the Go-agent path must not require python (the
# legacy --poller path below still does, for its venv). Parity with the
# board's python canon is cross-checked by tests/test_bootstrap_anchor.py.
normalize_fp() {
  local fp body bin b64 i lower
  fp=$(printf '%s' "$1" | tr -d '[:space:]')
  body="$fp"
  if [[ "$fp" =~ ^[sS][Hh][Aa]256: ]]; then body="${fp:7}"; fi
  if [[ "$body" =~ ^[A-Za-z0-9+/]{43}$ ]]; then
    printf 'SHA256:%s\n' "$body"
    return 0
  fi
  if [[ "$body" =~ ^[a-fA-F0-9]{64}$ ]]; then
    lower="${body,,}"
    bin=""
    for ((i = 0; i < 64; i += 2)); do
      bin+="\\x${lower:i:2}"
    done
    b64=$(printf '%b' "$bin" | base64 | tr -d '\n=')
    printf 'SHA256:%s\n' "$b64"
    return 0
  fi
  return 2
}

# Minimal JSON string escaping for the marker files (names/urls are
# free-form; ids are board-safe). Escapes backslash and double quote —
# enough for a flat ASCII-safe JSON string value.
json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# ------------------------------------------------------------ parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) BOARD_URL="${2:-}"; shift 2 ;;
    --token) TOKEN="${2:-}"; shift 2 ;;
    --name) EXEC_NAME="${2:-}"; shift 2 ;;
    --harness) HARNESS="${2:-}"; shift 2 ;;
    --host) HOST_NAME="${2:-}"; shift 2 ;;
    --expect-fp) EXPECT_FP="${2:-}"; shift 2 ;;
    --agent-version) AGENT_VERSION="${2:-}"; shift 2 ;;
    --poller) EXECUTOR_MODE="poller"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown argument: $1" >&2; usage; exit 2 ;;
  esac
done

[[ -n "$BOARD_URL" ]] || { echo "--url is required" >&2; usage; exit 2; }
[[ -n "$TOKEN" ]] || { echo "--token is required (mne_…, minted on the board)" >&2; usage; exit 2; }
[[ "$TOKEN" =~ ^mne_[A-Za-z0-9_-]+$ ]] || die "--token must look like mne_… (got a different shape) — mint a one-time enrollment token on the board" 2
[[ "$BOARD_URL" =~ ^https:// ]] || die "--url must be https:// (the board is never plain HTTP)" 2
[[ "$AGENT_VERSION" =~ ^(latest|v?[0-9]+\.[0-9]+\.[0-9]+)$ ]] \
  || die "--agent-version must be «latest» or vX.Y.Z (env synonym VESMARO_AGENT_VERSION)" 2
# Shape-check the anchor NOW (before any network): SHA256:base64(43) or a
# hex64, with an optional case-insensitive sha256: prefix. Full
# normalization happens in the TLS section.
if [[ -n "$EXPECT_FP" && ! "$EXPECT_FP" =~ ^([Ss][Hh][Aa]256:)?([A-Za-z0-9+/]{43}|[a-fA-F0-9]{64})[[:space:]]*$ ]]; then
  die "--expect-fp must be SHA256:<base64> or a <hex64> digest (the board's enrollment screen prints the canon form) — got a different shape" 2
fi
HOST_NAME="${HOST_NAME:-$(hostname 2>/dev/null || echo unknown-host)}"
EXEC_NAME="${EXEC_NAME:-$HOST_NAME}"

step "preflight"
command -v curl >/dev/null 2>&1 || die "curl not found — install curl first" 3
command -v openssl >/dev/null 2>&1 || die "openssl not found — install openssl first" 3
command -v systemctl >/dev/null 2>&1 || die "systemd not found — this installer targets a systemd host (the laptop/distrobox path is manual: deploy/poller/README.md)" 3
[[ "$(id -u)" -eq 0 ]] || die "run as root (the curl | sudo bash form, or a root shell)" 3
if [[ "$EXECUTOR_MODE" == "agent" ]]; then
  command -v tar >/dev/null 2>&1 || die "tar not found — the agent release is a tarball" 3
  command -v sha256sum >/dev/null 2>&1 || die "sha256sum not found — the agent artifact is verified, never blindly trusted" 3
fi
echo "   url=$BOARD_URL name=$EXEC_NAME harness=$HARNESS host=$HOST_NAME"
if [[ "$EXECUTOR_MODE" == "agent" ]]; then
  echo "   executor: Go agent vesmaro-agent (--poller selects the legacy python poller)"
  if [[ -n "${VESMARO_GH_TOKEN:-}" ]]; then
    echo "   github auth: VESMARO_GH_TOKEN present (never logged, never written)"
  else
    echo "   github auth: none — the anonymous download works once the agent repo is public"
  fi
  if [[ "$HOST_NAME" != "$EXEC_NAME" ]]; then
    echo "   note: the Go agent registers host = executor_name (PROTOCOL §1.1); --host is honored by the legacy --poller path only"
  fi
else
  echo "   executor: LEGACY python poller (explicit --poller; decommission is tracked as ME-056)"
  command -v python3 >/dev/null 2>&1 || die "python3 not found — the legacy poller path needs python ≥ 3.10 (the default Go-agent path does not)" 3
  PY_MINOR=$(python3 -c 'import sys; print(f"{sys.version_info[0]}{sys.version_info[1]:02d}")')
  [[ "$PY_MINOR" -ge 310 ]] || die "python3 $(python3 -V 2>&1) is too old — the legacy poller needs ≥ 3.10" 3
fi

# ------------------------------------------------------------- lab CA pin
# A pre-placed CA short-circuits the network fetch entirely (the strictest
# path: the owner copied it out-of-band per REMOTE-EXECUTOR.md §3).
mkdir -p "$(dirname "$CA_FILE")"
CA_SRC="pre-placed"
if [[ -s "$CA_FILE" ]]; then
  step "TLS: using the pre-placed CA at $CA_FILE (no -k window at all)"
else
  step "TLS: fetching the lab CA from the board"
  CA_SRC=""
  # First attempt is the honest system-trust one (machines that already
  # trust the lab CA take a zero-(-k) path); --cacert on a not-yet-existing
  # file would fail LOCALLY (exit 77) before any connection, so it is used
  # only from the second attempt on. ONE retry with -k, STRICTLY for the
  # CA fetch — a certificate is public material, and everything AFTER this
  # point (registration, the verdict read) rides the PINNED CA.
  if curl -fsSL "$BOARD_URL/api/poller/artifacts/ca.crt" \
        -o "$CA_FILE" 2>/dev/null; then
    CA_SRC="system-trust"
  else
    echo "   no system trust for the lab cert — one -k retry for the CA ONLY"
    curl -fsSL -k "$BOARD_URL/api/poller/artifacts/ca.crt" -o "$CA_FILE" \
      || die "could not download the CA even with -k — is --url reachable from this machine?" 3
    CA_SRC="-k"
  fi
  # Whatever TLS carried it, this file becomes THE pin — only a real CA
  # gets pinned (a served leaf/EE cert would break every later handshake).
  openssl x509 -in "$CA_FILE" -noout -text 2>/dev/null | grep -q "CA:TRUE" \
    || { rm -f "$CA_FILE"; die "downloaded cert is not a CA (basicConstraints) — refusing to pin it" 3; }
  chmod 0644 "$CA_FILE"
fi

# ------------------------------------------- trust anchor (AGW-9, АРХКОМ-8 В1)
# The pinned CA must BE the board's CA. Fingerprint canon = the board's
# (SHA256:base64 over DER, provisioner parity). Hierarchy, fail-closed:
#   (1) --expect-fp / VESMARO_EXPECT_FP given → SILENT verify; mismatch =
#       abort, a DOWNLOADED CA is discarded (a pre-placed one stays on
#       disk — it is the owner's file — but the install still aborts);
#   (2) no anchor → the fingerprint is printed for the out-of-band owner
#       check and confirmed by TYPING it on /dev/tty (stdin is the curl
#       pipe); empty answer / EOF / mismatch = abort (CA discarded);
#   (3) no anchor and no /dev/tty = abort — an unattended install must
#       carry the anchor explicitly, never skip the check.
# The pre-placed path skips the interactive prompt (placement IS the
# out-of-band act) but never skips an explicit --expect-fp.
if ! CA_FP="$(ca_fingerprint "$CA_FILE")" || [[ -z "$CA_FP" ]]; then
  die "could not compute the fingerprint of $CA_FILE — not a readable certificate (aborting before anything is pinned)" 3
fi
if [[ -n "$EXPECT_FP" ]]; then
  if ! EXPECTED_FP="$(normalize_fp "$EXPECT_FP")"; then
    die "--expect-fp could not be normalized (internal shape check passed, normalization failed) — aborting" 2
  fi
  if [[ "$CA_FP" != "$EXPECTED_FP" ]]; then
    [[ "$CA_SRC" == "pre-placed" ]] || rm -f "$CA_FILE"
    die "CA fingerprint MISMATCH: expected $EXPECTED_FP, got $CA_FP — refusing to pin a CA the anchor does not name ($CA_SRC CA discarded; check --expect-fp or the board's certificate)" 3
  fi
  echo "   CA fingerprint verified against the anchor: $CA_FP"
else
  echo "   CA fingerprint (canon):   $CA_FP"
  echo "   CA fingerprint (openssl): SHA256:$(openssl x509 -in "$CA_FILE" -noout -fingerprint -sha256 2>/dev/null | cut -d= -f2)"
  if [[ "$CA_SRC" == "pre-placed" ]]; then
    echo "   (pre-placed CA — placement was the out-of-band act, no prompt)"
  else
    echo "   >>> VERIFY this fingerprint with the board owner over a personal"
    echo "   >>> channel, then TYPE it below to continue — everything below pins THIS CA."
    # NB: a permission test ([[ -r /dev/tty ]]) LIES in a session without a
    # controlling terminal (the check passes, open() then fails ENXIO) —
    # the honest probe is the open itself. The { } block keeps the error
    # suppression TEMPORARY: a bare `exec 3</dev/tty 2>/dev/null` would
    # silence the shell's stderr FOREVER on success (found by the pty
    # harness — every later die() line would have vanished).
    if ! { exec 3</dev/tty; } 2>/dev/null; then
      rm -f "$CA_FILE"
      die "no --expect-fp and no usable /dev/tty — the CA fingerprint cannot be confirmed out-of-band. Re-run with --expect-fp SHA256:<fp> (env VESMARO_EXPECT_FP; the board's enrollment screen prints it as ca_fingerprint), or pre-place the CA at $CA_FILE (REMOTE-EXECUTOR.md §3)" 3
    fi
    CONFIRM=""
    if ! read -r CONFIRM <&3; then
      exec 3<&-
      rm -f "$CA_FILE"
      die "could not read the fingerprint confirmation from /dev/tty — aborting (downloaded CA discarded)" 3
    fi
    exec 3<&-
    if ! CONFIRM_FP="$(normalize_fp "$CONFIRM")" || [[ "$CONFIRM_FP" != "$CA_FP" ]]; then
      rm -f "$CA_FILE"
      die "fingerprint confirmation does not match — aborting (downloaded CA discarded). Type the fingerprint exactly as the board owner gives it; empty Enter is a refusal" 3
    fi
    echo "   fingerprint confirmed by the operator — pinning THIS CA"
  fi
fi
CURL_CA=(--cacert "$CA_FILE")

# =====================================================================
# Executor branch 1 — the Go agent vesmaro-agent (v2 DEFAULT)
# =====================================================================
agent_install() {
  local goos goarch tag ver asset csfile tmp expect got
  local enroll_rc=0 enroll_id="" exec_json row_state row_enabled row_presence
  local update_mode=0 exec_id="" preserve_awl=""
  local run_user="${SUDO_USER:-root}"

  step "executor: Go agent vesmaro-agent (bootstrap v2 default)"
  case "$(uname -s)" in
    Linux)  goos=linux ;;
    Darwin) goos=darwin ;;
    *) die "unsupported OS '$(uname -s)' — vesmaro-agent release assets exist for linux and darwin only" 3 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64)  goarch=amd64 ;;
    aarch64|arm64) goarch=arm64 ;;
    *) die "unsupported arch '$(uname -m)' — vesmaro-agent release assets exist for amd64 and arm64 only" 3 ;;
  esac

  # ---- release resolution + download + sha256 (fail-closed) ----------
  # Downloads ride the GitHub API asset endpoint (Accept: octet-stream),
  # NOT the browser_download_url: a PRIVATE repo's browser URLs answer
  # 404 to Authorization headers (verified live), while the API endpoint
  # works with the token today and anonymously the day the repo goes
  # public. The redirect leg to the signed CDN URL carries no token
  # (curl strips Authorization cross-host) — exactly the hygiene we want.
  local rel_json="" gh_hint=""
  if [[ -z "${VESMARO_GH_TOKEN:-}" ]]; then
    gh_hint=" — the agent repo is PRIVATE today: export VESMARO_GH_TOKEN (read-only, repo-scoped) and re-run, e.g. sudo VESMARO_GH_TOKEN=… bash bootstrap.sh … (the token is never logged)"
  fi
  if [[ "$AGENT_VERSION" == "latest" ]]; then
    step "resolving the latest vesmaro-agent release"
    rel_json=$(curl -fsSL ${GH_AUTH[@]+"${GH_AUTH[@]}"} \
                 "$GH_API/releases/latest" 2>/dev/null) \
      || die "could not resolve the latest vesmaro-agent release from $GH_API/releases/latest$gh_hint" 3
    tag=$(printf '%s' "$rel_json" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
    [[ -n "$tag" ]] || die "could not parse the release tag out of the $GH_API/releases/latest answer$gh_hint" 3
  else
    tag="$AGENT_VERSION"
    [[ "$tag" == v* ]] || tag="v$tag"
    step "resolving release $tag"
    rel_json=$(curl -fsSL ${GH_AUTH[@]+"${GH_AUTH[@]}"} \
                 "$GH_API/releases/tags/$tag" 2>/dev/null) \
      || die "could not resolve release $tag from $GH_API/releases/tags/$tag (no such tag?)$gh_hint" 3
  fi
  ver="${tag#v}"
  asset="vesmaro-agent_${ver}_${goos}_${goarch}.tar.gz"
  csfile="vesmaro-agent_${ver}_checksums.txt"
  echo "   release: $tag → $asset"

  # The asset id from the release answer (one asset object per tr-split
  # fragment; the fragment that starts at the object's "{" carries
  # url/id/name — an uploader's nested object opens a NEW fragment, and
  # browser_download_url lands in a later one). Compact API JSON and a
  # re-spaced variant both match.
  api_asset_id() {
    local frag
    frag=$(printf '%s' "$rel_json" | tr '{' '\n' \
      | grep -F -e "\"name\":\"$1\"" -e "\"name\": \"$1\"" | head -1 || true)
    printf '%s' "$frag" | sed -n 's/.*"id": *\([0-9]*\).*/\1/p'
  }
  local asset_id cs_id
  asset_id=$(api_asset_id "$asset")
  cs_id=$(api_asset_id "$csfile")
  [[ -n "$asset_id" ]] \
    || die "$asset is not published on release $tag (wrong OS/arch or a broken release?)" 3
  [[ -n "$cs_id" ]] \
    || die "the release checksums file ($csfile) is not published on $tag — an unverified artifact is never installed" 3

  step "downloading the release artifacts (sha256-verified)"
  tmp=$(mktemp -d)
  if ! curl -fL ${GH_AUTH[@]+"${GH_AUTH[@]}"} -H "Accept: application/octet-stream" \
       -o "$tmp/$asset" "$GH_API/releases/assets/$asset_id" 2>/dev/null; then
    rm -rf "$tmp"
    die "could not download $asset from release $tag (asset id $asset_id)$gh_hint" 3
  fi
  curl -fL ${GH_AUTH[@]+"${GH_AUTH[@]}"} -H "Accept: application/octet-stream" \
       -o "$tmp/checksums.txt" "$GH_API/releases/assets/$cs_id" 2>/dev/null \
    || { rm -rf "$tmp"; die "could not download the release checksums ($csfile) from release $tag" 3; }
  # The release's own manifest is the sha256 source (both spellings of the
  # asset name are accepted — goreleaser emits bare and ./-prefixed rows).
  expect=$(awk -v f="$asset" '{name=$2; sub(/^\.\//, "", name)} name == f {print $1}' \
           "$tmp/checksums.txt")
  [[ -n "$expect" ]] \
    || { rm -rf "$tmp"; die "$asset is not listed in the release checksums file — refusing to install an unverified artifact" 3; }
  got=$(sha256sum "$tmp/$asset" | awk '{print $1}')
  [[ "$got" == "$expect" ]] \
    || { rm -rf "$tmp"; die "sha256 MISMATCH for $asset: the release manifest says $expect, got $got — artifact discarded" 3; }
  echo "   $asset sha256 verified: $got"

  tar -xzf "$tmp/$asset" -C "$tmp" \
    || { rm -rf "$tmp"; die "could not extract the release tarball" 3; }
  [[ -f "$tmp/vesmaro-agent" ]] \
    || { rm -rf "$tmp"; die "the release tarball does not contain the vesmaro-agent binary" 3; }
  install -d -m 0755 "$(dirname "$AGENT_BIN")"
  install -m 0755 "$tmp/vesmaro-agent" "$AGENT_BIN" \
    || { rm -rf "$tmp"; die "could not install the binary to $AGENT_BIN" 5; }
  rm -rf "$tmp"
  # The binary must RUN here (arch/OS mismatch is a download-time fact,
  # not a first-boot surprise).
  "$AGENT_BIN" --version || die "the installed agent binary failed --version (OS/arch mismatch for $goos/$goarch?)" 3

  # ---- config + unit (before enroll: the agent loads the config first)
  # The layout dirs are created explicitly (the CA step only guarantees
  # /etc/vesmaro for the DEFAULT layout; knob'd layouts own their dirs).
  install -d -m 0755 "$(dirname "$AGENT_CONF")" \
                     "$(dirname "$AGENT_ENV_FILE")" \
                     "$(dirname "$AGENT_MARKER")" \
                     "$(dirname "$AGENT_UNIT_FILE")"
  if [[ -f "$AGENT_MARKER" && -f "$AGENT_CONF" ]]; then
    local marker_url marker_id
    marker_url=$(sed -n 's/.*"board_url": *"\([^"]*\)".*/\1/p' "$AGENT_MARKER" | head -1)
    marker_id=$(sed -n 's/.*"executor_id": *"\([^"]*\)".*/\1/p' "$AGENT_MARKER" | head -1)
    if [[ -n "$marker_url" && "$marker_url" != "$BOARD_URL" ]]; then
      die "this install was bootstrapped against $marker_url, but --url is $BOARD_URL — keeping the old executor_secret would mean an eternal 401. Rotate instead: revoke + delete the executor on the board, then re-run with a NEW token" 4
    fi
    exec_id="$marker_id"
    # The user-owned tail (allowlist + the agent's MANAGED region) survives
    # re-runs; only the managed keys above are rewritten.
    preserve_awl=$(awk '/^(allowlist|managed_allowlist):/{p=1} p' "$AGENT_CONF" || true)
    update_mode=1
    step "existing install found → UPDATE candidate (fresh artifacts, your config tail preserved)"
  fi

  agent_write_config() {
    local head_yaml
    head_yaml=$(cat <<YAML
# vesmaro-agent config — MANAGED KEYS rewritten by bootstrap.sh;
# everything from 'allowlist:' down is USER-OWNED and survives re-runs
# (the agent's own managed_allowlist region regenerates itself at start).
board_url: "$(json_escape "$BOARD_URL")"
executor_id: "$(json_escape "$EXEC_ID")"
executor_name: "$(json_escape "$EXEC_NAME")"
harness: "$(json_escape "$HARNESS")"
ca_bundle: "$(json_escape "$CA_FILE")"
transport: direct
audit_path: "$(json_escape "$AGENT_STATE/audit.jsonl")"
lock_path: "$(json_escape "$AGENT_STATE/agent.lock")"
dead_letter_path: "$(json_escape "$AGENT_STATE/dead-letter")"
YAML
)
    if [[ "$1" -eq 1 && -n "${PRESERVE_AWL:-}" ]]; then
      printf '%s\n%s\n' "$head_yaml" "$PRESERVE_AWL" > "$AGENT_CONF.new"
    else
      cat > "$AGENT_CONF.new" <<YAML
$head_yaml
# A3 allowlist — THE launch gate. The seed below is an HONEST STUB: the
# command is a placeholder, every assignment is refused (fail-closed,
# one refusal-report per task) until you edit it to a REAL command and
# restart the unit. Nomination on the board does NOT execute here.
allowlist:
  - harness: "$(json_escape "$HARNESS")"
    command:
      - "$(json_escape "$HARNESS")"
    specialists:
      - "*"
YAML
    fi
  }

  EXEC_ID="$exec_id"
  PRESERVE_AWL="$preserve_awl"
  agent_write_config "$update_mode"
  if [[ -f "$AGENT_CONF" ]]; then cp "$AGENT_CONF" "$AGENT_CONF.bak"; fi
  mv "$AGENT_CONF.new" "$AGENT_CONF"
  chmod 0600 "$AGENT_CONF"
  chown "$run_user:" "$AGENT_CONF" 2>/dev/null || true

  # The unit: the vesmaro-assignment-poller.service hardening precedent
  # (the agent repo ships no unit — its deploy story borrows the board's,
  # PROTOCOL §7.4/parity #20). The agent REWRITES its own config (the
  # MANAGED allowlist region) and spawns harness children that live in
  # their homes — ProtectHome would break both, so the boundary here is
  # ProtectSystem=strict + explicit ReadWritePaths, with the user home
  # re-added when it resolves.
  local rwp="$AGENT_STATE"
  local run_home
  run_home=$(getent passwd "$run_user" 2>/dev/null | cut -d: -f6 || true)
  if [[ -n "$run_home" && -d "$run_home" && "$run_home" != "/" ]]; then
    rwp="$AGENT_STATE $run_home"
  fi
  cat > "$AGENT_UNIT_FILE" <<UNIT
# vesmaro-agent — the Go executor of the vesmaro-eyes board (bootstrap v2).
# Token:    EnvironmentFile (written by the agent's --enroll; the secret
#           never lives in this unit file).
# Config:   $AGENT_CONF (managed keys + user-owned allowlist tail)
[Unit]
Description=vesmaro-agent (Go executor: poll, allowlist dispatch, reports)
Documentation=$BOARD_URL/docs
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
User=$run_user
EnvironmentFile=$AGENT_ENV_FILE
ExecStart=$AGENT_BIN --config $AGENT_CONF
Restart=always
RestartSec=5

# The audit log and launch artifacts carry assignment specs — 0600 by
# umask, not by luck (the poller unit precedent, AB-FU-1).
UMask=0077

# Outbound-only executor (ADR 0009 §9): no listening port of its own
# (mesh mode binds loopback only). Harness children need their homes
# writable — no ProtectHome here; the launch boundary is the allowlist.
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$rwp
PrivateTmp=true
ProtectKernelTunables=true
ProtectControlGroups=true
RestrictSUIDSGID=true

[Install]
WantedBy=multi-user.target
UNIT
  chmod 0644 "$AGENT_UNIT_FILE"

  install -d -m 0755 "$AGENT_STATE"
  chown "$run_user:" "$AGENT_STATE" 2>/dev/null || true
  systemctl daemon-reload || die "daemon-reload failed" 5

  # ---- enrollment: THE BINARY registers itself (PROTOCOL §1.1, M1) ----
  # The mne_ token rides the env (never a flag value in ps); the secret
  # lands in the 0600 env file (VESMARO_ENV_FILE). The installer only
  # delivers the token and the binary — the registration row's version
  # is the agent's own fact.
  step "enrolling via the agent binary (vesmaro-agent --enroll)"
  tmp=$(mktemp -d)
  enroll_rc=0
  VESMARO_ENROLL_TOKEN="$TOKEN" VESMARO_ENV_FILE="$AGENT_ENV_FILE" \
    "$AGENT_BIN" --enroll --config "$AGENT_CONF" \
    >"$tmp/enroll.out" 2>"$tmp/enroll.err" || enroll_rc=$?
  cat "$tmp/enroll.out"
  sed 's/^/   agent: /' "$tmp/enroll.err" >&2 || true
  # Captured BEFORE any rm: the die messages below quote it.
  local err_tail name_row=""
  err_tail=$(head -c 300 "$tmp/enroll.err" 2>/dev/null || true)
  # The board's FastAPI renders compact JSON ("name":"x") — but the
  # registry read may be re-spaced by proxies/tools; both spellings match.
  registry_name_row() {
    # grep without a match exits 1 — under pipefail that must not kill
    # the script (an unknown name IS an answer, not a failure).
    printf '%s' "${1:-}" | tr '}' '\n' \
      | grep -F -e "\"name\":\"$(json_escape "$EXEC_NAME")\"" \
                -e "\"name\": \"$(json_escape "$EXEC_NAME")\"" | head -1 \
      || true
  }

  if [[ "$enroll_rc" -eq 0 ]]; then
    enroll_id=$(sed -n 's/^registered: \([^ ]*\) .*/\1/p' "$tmp/enroll.out" | head -1)
    if [[ -z "$enroll_id" ]]; then
      # The agent's own print is the primary source; the open registry
      # read is the robust fallback (name is unique on the board).
      exec_json=$(curl "${CURL_CA[@]}" -fsSL "$BOARD_URL/api/executors" 2>/dev/null || true)
      if [[ -n "$exec_json" ]]; then
        name_row=$(registry_name_row "$exec_json")
        enroll_id=$(printf '%s' "$name_row" | sed -n 's/.*"id": *"\([^"]*\)".*/\1/p')
      fi
    fi
    [[ -n "$enroll_id" ]] \
      || { rm -rf "$tmp"; die "the agent enrolled but its executor_id could not be resolved (stdout + registry both silent) — check Реестр on the board; the secret IS in $AGENT_ENV_FILE" 4; }
    echo "   registered: $enroll_id ($EXEC_NAME) — state pending, awaits owner approval"
  elif [[ "$enroll_rc" -eq 5 ]]; then
    # Registration refused (agent §7.2 exit 5). Spent token + the name is
    # already OURS on the board + an existing install → UPDATE (§7.4);
    # anything else is an honest refusal.
    exec_json=$(curl "${CURL_CA[@]}" -fsSL "$BOARD_URL/api/executors" 2>/dev/null || true)
    if [[ -n "$exec_json" ]]; then
      name_row=$(registry_name_row "$exec_json")
    fi
    if [[ -n "$name_row" && "$update_mode" -eq 1 ]]; then
      step "token already spent + existing install found → UPDATE path"
      [[ -f "$AGENT_ENV_FILE" ]] \
        || echo "   WARNING: $AGENT_ENV_FILE is missing — the unit will fail to start until you re-enroll with a FRESH token (revoke+delete on the board, then re-run)"
    elif [[ -n "$name_row" ]]; then
      rm -rf "$tmp"
      die "name '$EXEC_NAME' is already registered on the board by ANOTHER install — re-run with --name <other> (or rotate: revoke + delete that executor first)" 4
    else
      rm -rf "$tmp"
      die "registration refused (agent exit 5 — token expired/used/invalid?): $err_tail. Mint a NEW one-time token on the board and re-run" 4
    fi
  elif [[ "$enroll_rc" -eq 2 ]]; then
    if grep -q "not in the board dictionary" "$tmp/enroll.err" 2>/dev/null; then
      rm -rf "$tmp"
      die "harness '$HARNESS' is not in the board dictionary — add it in the UI (Реестр → harness combobox) and re-run (the one-time token was NOT spent)" 2
    fi
    rm -rf "$tmp"
    die "the agent refused to load the generated config / could not reach the harness dictionary: $err_tail" 3
  elif [[ "$enroll_rc" -eq 3 ]]; then
    rm -rf "$tmp"
    die "the agent could not establish pinned TLS to the board (CA/config problem): $err_tail" 3
  elif [[ "$enroll_rc" -eq 6 ]]; then
    rm -rf "$tmp"
    die "the agent registered but could NOT persist the secret (env/yaml write failed — the agent said the secret is persisted nowhere): $err_tail" 5
  else
    rm -rf "$tmp"
    die "unexpected agent enroll exit code $enroll_rc: $err_tail" 4
  fi

  # ---- final config (executor_id now known) + marker + service -------
  if [[ "$enroll_rc" -eq 0 ]]; then
    exec_id="$enroll_id"
  fi
  EXEC_ID="$exec_id"
  agent_write_config "$update_mode"
  mv "$AGENT_CONF.new" "$AGENT_CONF"
  chmod 0600 "$AGENT_CONF"
  chown "$run_user:" "$AGENT_CONF" 2>/dev/null || true

  cat > "$AGENT_MARKER" <<JSON
{"executor_id": "$(json_escape "$EXEC_ID")", "board_url": "$(json_escape "$BOARD_URL")", "harness": "$(json_escape "$HARNESS")", "name": "$(json_escape "$EXEC_NAME")", "agent_version": "$(json_escape "$ver")", "agent_release": "$(json_escape "$tag")", "executor": "go-agent", "bootstrap": 2}
JSON
  chmod 0644 "$AGENT_MARKER"
  rm -rf "$tmp"

  step "systemd unit: $AGENT_UNIT_NAME"
  if [[ "$update_mode" -eq 1 ]]; then
    systemctl restart "$AGENT_UNIT_NAME" || die "restart failed — journalctl -u $AGENT_UNIT_NAME" 5
  else
    systemctl enable --now "$AGENT_UNIT_NAME" || die "enable --now failed — journalctl -u $AGENT_UNIT_NAME" 5
  fi

  # ---- verdict: the registry row, honestly read back (§4.1 flat row) --
  step "verdict (waiting ~${VERDICT_WAIT}s for the first poll cycles)"
  sleep "$VERDICT_WAIT"
  local row=""
  row=$(curl "${CURL_CA[@]}" -fsSL "$BOARD_URL/api/executors/$EXEC_ID" 2>/dev/null || true)
  row_state=$(printf '%s' "$row" | sed -n 's/.*"state": *"\([^"]*\)".*/\1/p' | head -1)
  # grep -o with no match ("enabled": false) exits 1 — an answer, not a
  # failure (pipefail would otherwise kill the verdict step).
  row_enabled=$(printf '%s' "$row" | grep -o '"enabled": *true' | head -1 || true)
  row_presence=$(printf '%s' "$row" | sed -n 's/.*"presence": *"\([^"]*\)".*/\1/p' | head -1)
  if [[ "$row_state" == "pending" ]]; then
    echo "READY-ISH: registered and polling — NOW APPROVE IT ON THE BOARD:"
    echo "  Реестр → $EXEC_NAME → Подтвердить (approve) → Включить (enable)."
  elif [[ "$row_state" == "approved" && -z "$row_enabled" ]]; then
    echo "ALMOST: approved but DISABLED — flip the Включить toggle in the registry."
  elif [[ "$row_state" == "approved" && -n "$row_enabled" && "$row_presence" == "online" ]]; then
    echo "DONE: $EXEC_NAME is approved, enabled and ONLINE — ready for assignments."
  elif [[ "$row_state" == "revoked" ]]; then
    echo "WARNING: the executor is REVOKED on the board — it will not poll."
  else
    echo "REGISTERED BUT NOT SEEN YET (state: ${row_state:-unknown}, presence: ${row_presence:-unknown})."
    echo "  Check: --url resolves from THIS machine (VPN overlay?);"
    echo "  journalctl -u $AGENT_UNIT_NAME -f;"
    echo "  executor_id is set in $AGENT_CONF (an empty id never ticks presence)."
  fi
  echo
  echo "NEXT (mandatory): edit $AGENT_CONF → allowlist → put the REAL harness"
  echo "command there (the seed is a stub) → systemctl restart $AGENT_UNIT_NAME."
  echo "Agent release: $tag (sha256 $got — verified against the release manifest)."
  echo "Registry row: $BOARD_URL (Реестр) · re-run this script to UPDATE artifacts."
}

# =====================================================================
# Executor branch 2 — the legacy Python poller (v1 flow, --poller)
# =====================================================================
poller_install() {
  step "executor: LEGACY python poller (--poller; decommission = ME-056, not removed)"

  # ------------------------------------------------------- deps (venv, PEP 668)
  step "python venv + dependencies"
  python3 -m venv "$VENV_DIR" || die "could not create the venv at $VENV_DIR (install python3-venv)" 3
  "$VENV_DIR/bin/pip" install --quiet --no-cache-dir httpx pyyaml \
    || die "pip install failed (httpx, pyyaml)" 3

  # ---------------------------------------------------------------- register
  # Idempotency: a SPENT token (410) with an existing install means UPDATE —
  # registration is skipped, artifacts are refreshed, the user's allowlist
  # and executor_id are preserved below.
  step "registering the executor on the board"
  local update_mode=0 exec_id="" secret="" http_body reg_body http_code
  local preserve_awl=""
  http_body=$(mktemp)
  # The body is built by python3 (validated by the branch preflight): raw
  # shell interpolation would mangle any quote into a misleading 422.
  reg_body=$(python3 -c 'import json, sys
print(json.dumps({"name": sys.argv[1], "harness": sys.argv[2],
                  "host": sys.argv[3], "transport": "local-poll"}))' \
    "$EXEC_NAME" "$HARNESS" "$HOST_NAME")
  http_code=$(curl "${CURL_CA[@]}" -fsS -o "$http_body" -w '%{http_code}' \
    -X POST "$BOARD_URL/api/executors" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "$reg_body" \
    || true)
  if [[ "$http_code" == "201" ]]; then
    exec_id=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["executor"]["id"])' < "$http_body")
    secret=$(python3 -c 'import json,sys; print(json.load(sys.stdin)["executor_secret"])' < "$http_body")
    echo "   registered: $exec_id ($EXEC_NAME) — state pending, awaits owner approval"
  elif [[ "$http_code" == "409" ]]; then
    die "name '$EXEC_NAME' is already registered on the board — re-run with --name <other>" 4
  elif [[ "$http_code" == "422" ]]; then
    die "harness '$HARNESS' is not in the board dictionary — add it in the UI (Реестр → harness combobox) and re-run" 4
  elif [[ "$http_code" == "410" || "$http_code" == "401" ]]; then
    if [[ -f "$MARKER_FILE" && -f "$ENV_FILE" && -f "$YAML_FILE" ]]; then
      step "token already spent + existing install found → UPDATE path"
      update_mode=1
    else
      die "token expired/used and no existing install found — mint a NEW enrollment token on the board and re-run" 4
    fi
  elif [[ "$http_code" == "429" ]]; then
    die "rate limited (10/60 s) or pending-executor cap reached — wait and re-run" 4
  else
    die "registration failed (HTTP ${http_code:-transport-error}): $(head -c 200 "$http_body")" 4
  fi
  rm -f "$http_body"

  if [[ "$update_mode" -eq 1 ]]; then
    local marker_url
    marker_url=$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1])).get("board_url", ""))' "$MARKER_FILE")
    if [[ -n "$marker_url" && "$marker_url" != "$BOARD_URL" ]]; then
      die "this install was bootstrapped against $marker_url, but --url is $BOARD_URL — keeping the old executor_secret would mean an eternal 401. Rotate instead: revoke + delete the executor on the board, then re-run with a NEW token" 4
    fi
    exec_id=$(python3 -c 'import json; print(json.load(open("'"$MARKER_FILE"'"))["executor_id"])')
    preserve_awl=$(awk '/^allowlist:/{p=1} p' "$YAML_FILE" || true)
  fi

  # ------------------------------------------------------------ artifacts
  step "fetching runtime artifacts (pinned TLS)"
  local unit_dl
  curl "${CURL_CA[@]}" -fsSL "$BOARD_URL/api/poller/artifacts/poller.py" -o "$POLLER_PY" \
    || die "could not download poller.py" 3
  chmod 0755 "$POLLER_PY"
  unit_dl=$(mktemp)
  curl "${CURL_CA[@]}" -fsSL "$BOARD_URL/api/poller/artifacts/vesmaro-assignment-poller.service" -o "$unit_dl" \
    || die "could not download the systemd unit" 3
  # Adapt the repo unit to THIS machine: run as the invoking sudo user (not a
  # hardcoded laptop user), config at /etc/vesmaro, state under $STATE_DIR —
  # and the ExecStart poller path to where THIS script put the artifact
  # ($POLLER_PY): the repo unit names the laptop layout
  # (/opt/mnemos-eyes/scripts/...), nobody creates that scripts/ dir here —
  # an unpatched ExecStart is a guaranteed 203/EXEC at first start.
  local run_user="${SUDO_USER:-root}"
  sed -e "s|^User=.*|User=$run_user|" \
      -e "s|--config [^ ]*|--config $YAML_FILE|" \
      -e "s|^ReadWritePaths=.*|ReadWritePaths=$STATE_DIR|" \
      -e "s|/opt/mnemos-eyes/scripts/assignment_poller.py|$POLLER_PY|" \
      "$unit_dl" > "$UNIT_FILE"
  rm -f "$unit_dl"
  chmod 0644 "$UNIT_FILE"
  mkdir -p "$STATE_DIR"
  chown "$run_user:" "$STATE_DIR" 2>/dev/null || true

  # ------------------------------------------------------------ secrets+config
  step "writing $ENV_FILE and $YAML_FILE (0600)"
  if [[ "$update_mode" -ne 1 ]]; then
    install -m 0600 -o root -g root /dev/null "$ENV_FILE"
    # The secret NEVER echoes to stdout and NEVER lands in the yaml.
    printf 'VESMARO_BOARD_TOKEN=%s\n' "$secret" > "$ENV_FILE"
  fi

  if [[ "$update_mode" -eq 1 && -n "$preserve_awl" ]]; then
    # Managed keys are rewritten; the user-owned allowlist block survives.
    { cat <<YAML
# vesmaro-eyes poller config — MANAGED KEYS rewritten by bootstrap.sh;
# everything from 'allowlist:' down is USER-OWNED and survives re-runs.
board_url: $BOARD_URL
executor_id: $exec_id
executor_name: $EXEC_NAME
poll_interval: 10
poll_jitter: 2
heartbeat_interval: 60
max_concurrent: 2
ca_bundle: $CA_FILE
YAML
      printf '%s\n' "$preserve_awl"
    } > "$YAML_FILE.new"
  else
    cat > "$YAML_FILE.new" <<YAML
# vesmaro-eyes poller config — MANAGED KEYS rewritten by bootstrap.sh;
# everything from 'allowlist:' down is USER-OWNED and survives re-runs.
board_url: $BOARD_URL
executor_id: $exec_id
executor_name: $EXEC_NAME
poll_interval: 10
poll_jitter: 2
heartbeat_interval: 60
max_concurrent: 2
ca_bundle: $CA_FILE
# A3 allowlist — THE launch gate. The seed below is an HONEST STUB: the
# command is a placeholder, every assignment is refused (fail-closed,
# one refusal-report per task) until you edit it to a REAL command and
# restart the unit. Nomination on the board does NOT execute here.
allowlist:
  - harness: $HARNESS
    command:
      - $HARNESS
    specialists:
      - "*"
YAML
  fi
  [[ "$update_mode" -eq 1 ]] && cp "$YAML_FILE" "$YAML_FILE.bak"
  mv "$YAML_FILE.new" "$YAML_FILE"
  chmod 0600 "$YAML_FILE"

  python3 -c 'import json,sys; json.dump({"executor_id": sys.argv[1], "board_url": sys.argv[2], "harness": sys.argv[3], "name": sys.argv[4]}, open(sys.argv[5], "w"))' \
    "$exec_id" "$BOARD_URL" "$HARNESS" "$EXEC_NAME" "$MARKER_FILE"

  # ---------------------------------------------------------------- systemd
  step "systemd unit"
  systemctl daemon-reload || die "daemon-reload failed" 5
  if [[ "$update_mode" -eq 1 ]]; then
    systemctl restart vesmaro-assignment-poller || die "restart failed — journalctl -u vesmaro-assignment-poller" 5
  else
    systemctl enable --now vesmaro-assignment-poller || die "enable --now failed — journalctl -u vesmaro-assignment-poller" 5
  fi

  # ---------------------------------------------------------------- verdict
  step "verdict (waiting ~${VERDICT_WAIT}s for the first poll cycles)"
  sleep "$VERDICT_WAIT"
  local state r_state r_enabled r_presence verdict_py
  verdict_py=$(cat <<'PY'
import json, sys
rows = json.load(sys.stdin)["items"]
row = next((r for r in rows if r["id"] == sys.argv[1]), None)
print(f'{row["state"]}|{row["enabled"]}|{row["presence"]}' if row else "unknown|false|offline")
PY
)
  state=$(curl "${CURL_CA[@]}" -fsSL "$BOARD_URL/api/executors" 2>/dev/null \
    | python3 -c "$verdict_py" "$exec_id" 2>/dev/null) || state="unknown|false|offline"
  [[ -n "$state" ]] || state="unknown|false|offline"
  IFS='|' read -r r_state r_enabled r_presence <<<"$state"
  if [[ "$r_state" == "pending" ]]; then
    echo "READY-ISH: registered and polling — NOW APPROVE IT ON THE BOARD:"
    echo "  Реестр → $EXEC_NAME → Подтвердить (approve) → Включить (enable)."
  elif [[ "$r_state" == "approved" && "$r_enabled" != "True" ]]; then
    echo "ALMOST: approved but DISABLED — flip the Включить toggle in the registry."
  elif [[ "$r_state" == "approved" && "$r_enabled" == "True" && "$r_presence" == "online" ]]; then
    echo "DONE: $EXEC_NAME is approved, enabled and ONLINE — ready for assignments."
  elif [[ "$r_state" == "revoked" ]]; then
    echo "WARNING: the executor is REVOKED on the board — it will not poll."
  else
    echo "REGISTERED BUT NOT SEEN YET (presence: $r_presence)."
    echo "  Check: --url resolves from THIS machine (VPN overlay?);"
    echo "  journalctl -u vesmaro-assignment-poller -f;"
    echo "  the empty executor_id is the classic cause — it is set in $YAML_FILE."
  fi
  echo
  echo "NEXT (mandatory): edit $YAML_FILE → allowlist → put the REAL harness"
  echo "command there (the seed is a stub) → systemctl restart vesmaro-assignment-poller."
  echo "Registry row: $BOARD_URL (Реестр) · re-run this script to UPDATE artifacts."
}

# ------------------------------------------------------------------ dispatch
if [[ "$EXECUTOR_MODE" == "agent" ]]; then
  agent_install
else
  poller_install
fi
exit 0
