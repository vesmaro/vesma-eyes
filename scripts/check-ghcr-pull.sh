#!/usr/bin/env bash
# check-ghcr-pull.sh — read-only canary for the cluster's ghcr pull secrets
# (ME-027 preventive slice, after the 2026-09-29 ghcr-403 incident).
#
# Why this exists: ghcr PATs expose NO expiry through any API, so "TTL
# monitoring" can only be a canary that replays EXACTLY what the kubelet
# does and alerts the moment a credential dies — the 2026-09-29 outage
# (~2h, ImagePullBackOff + 403 on the token endpoint) was noticed by users
# instead of an alert. Cron this script; a non-zero exit IS the alert:
#
#   */10 * * * * <repo>/scripts/check-ghcr-pull.sh
#
# Run from a box whose kubectl talks to the cluster (kube-agents); needs
# kubectl + curl + python3 + base64 on PATH. Background: see
# deploy/chart/vesmaro-eyes/RUNBOOK.md §6 (ghcr-403 incident note).
#
# Per secret, READ-ONLY:
#   1. kubectl get secret <name> -o jsonpath — the dockerconfigjson is
#      extracted but NEVER printed (values live only in shell vars and
#      mktemp files 0600, removed by an EXIT trap);
#   2. GET https://ghcr.io/token?scope=repository:<repo>:pull&service=ghcr.io
#      with HTTP Basic auth from the secret — the docker registry token
#      flow the kubelet performs after the 401 WWW-Authenticate challenge
#      (ghcr's token endpoint is GET, not POST). Credentials reach curl
#      via a config file (-K), NEVER the command line (argv is readable
#      via /proc/<pid>/cmdline);
#   3. GET https://ghcr.io/v2/<repo>/manifests/<tag> with the bearer
#      token — the FULL pull path: a live credential AND the chart's
#      current tag actually resolving (200), not just auth.
#
# Exit codes: 0 = every secret passed token + manifest; 1 = any secret
# failed (one-line FAIL verdict on stdout — cron/alert friendly);
# 2 = broken environment (kubectl/curl/python3/base64 missing). All
# diagnostics go to stderr; nothing credential-bearing is ever echoed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------- parameters
# Defaults mirror deploy/chart/vesmaro-eyes (parsed live from the chart so
# the canary follows releases; hardcoded fallbacks match values.yaml).
VALUES_FILE="${GHCR_CHECK_VALUES:-$SCRIPT_DIR/../deploy/chart/vesmaro-eyes/values.yaml}"
CHART_YAML="${GHCR_CHECK_CHART:-$SCRIPT_DIR/../deploy/chart/vesmaro-eyes/Chart.yaml}"
NAMESPACE="${GHCR_CHECK_NAMESPACE:-kube-agents}"
# word-split on purpose: "ghcr-pull ghcr-pull-w26"
# shellcheck disable=SC2206
SECRETS=(${GHCR_CHECK_SECRETS:-ghcr-pull ghcr-pull-w26})
REPO="$(sed -n 's/^  repository: *\([^ #]*\).*/\1/p' "$VALUES_FILE" 2>/dev/null | head -1)"
REPO="${GHCR_CHECK_REPO:-${REPO:-ghcr.io/korrnals/vesmaro-eyes}}"
TAG="$(sed -n 's/^  tag: *"\?\([^"#]*\)"\?.*/\1/p' "$VALUES_FILE" 2>/dev/null | head -1)"
TAG="${GHCR_CHECK_TAG:-${TAG:-$(sed -n 's/^appVersion: *"\?\([^"#]*\)"\?.*/\1/p' "$CHART_YAML" 2>/dev/null | head -1)}}"
TIMEOUT="${GHCR_CHECK_TIMEOUT:-15}"
KUBECTL="${GHCR_CHECK_KUBECTL:-kubectl}"
PY="${GHCR_CHECK_PYTHON:-python3}"

die() { printf 'check-ghcr-pull: %s\n' "$1" >&2; exit "${2:-2}"; }

for bin in "$KUBECTL" curl "$PY" base64; do
  command -v "$bin" >/dev/null 2>&1 \
    || die "required tool not on PATH: $bin (env knobs: GHCR_CHECK_KUBECTL / GHCR_CHECK_PYTHON)" 2
done

# ghcr.io/korrnals/vesmaro-eyes -> korrnals/vesmaro-eyes (scope + v2 path)
REPO_PATH="${REPO#ghcr.io/}"
[[ -n "$REPO_PATH" ]] || die "empty image repository (GHCR_CHECK_REPO / chart values)" 2
if [[ -z "$TAG" ]]; then
  echo "check-ghcr-pull: WARNING — no tag resolved (chart unreachable and GHCR_CHECK_TAG unset); auth-only check, manifest step skipped" >&2
fi

TMP_CHECK="$(mktemp -d)"
trap 'rm -rf -- "$TMP_CHECK"' EXIT

ACCEPT="Accept: application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json"

# ------------------------------------------------- credential extraction
# Prints ONLY the base64 HTTP Basic credential on stdout — never a
# diagnostic, never a key value. Picks the ghcr.io entry, else the single
# other entry (with a key-NAMES-only note on stderr).
extract_basic() {  # $1 = secret name
  local b64
  b64="$("$KUBECTL" get secret "$1" -n "$NAMESPACE" \
      -o jsonpath="{.data['\.dockerconfigjson']}" 2>/dev/null)" || return 1
  if [[ -z "$b64" ]]; then
    # some kubectl builds reject the escaped-dot jsonpath form
    b64="$("$KUBECTL" get secret "$1" -n "$NAMESPACE" -o json 2>/dev/null \
      | "$PY" -c 'import json,sys;print(json.load(sys.stdin).get("data",{}).get(".dockerconfigjson",""),end="")')" || return 1
  fi
  [[ -n "$b64" ]] || return 1
  printf '%s' "$b64" | base64 -d 2>/dev/null | "$PY" -c '
import base64, json, sys
cfg = json.load(sys.stdin)
auths = cfg.get("auths") or {}
ent = auths.get("ghcr.io") or auths.get("https://ghcr.io")
if ent is None and auths:
    print("check-ghcr-pull: no ghcr.io entry in dockerconfigjson, using the first of: "
          + ", ".join(sorted(auths)), file=sys.stderr)  # key names only
    ent = next(iter(auths.values()))
if ent is None:
    print("check-ghcr-pull: dockerconfigjson has no auths", file=sys.stderr)
    sys.exit(1)
raw = ent.get("auth")
if not raw:
    u, p = ent.get("username"), ent.get("password")
    if u is None or p is None:
        print("check-ghcr-pull: auth entry has neither auth nor username/password", file=sys.stderr)
        sys.exit(1)
    raw = base64.b64encode((u + ":" + p).encode()).decode()
print(raw, end="")
'
}

# ------------------------------------------------------------ HTTP probe
# GET with the credential delivered via a curl config FILE (never argv —
# /proc/<pid>/cmdline is world-readable). Prints the HTTP code (000 on
# transport failure); response body goes to $2 for the caller to parse.
http_get() {  # $1 = Authorization header value, $2 = body file, $3 = url, $4 = extra header ("" = none)
  local cfg="$TMP_CHECK/curl.cfg" code
  printf 'header = "Authorization: %s"\n' "$1" > "$cfg"
  if [[ -n "${4:-}" ]]; then
    printf 'header = "%s"\n' "$4" >> "$cfg"
  fi
  code="$(curl -sS --connect-timeout 5 --max-time "$TIMEOUT" \
      -o "$2" -w '%{http_code}' -K "$cfg" "$3")" || code="000"
  printf '%s' "$code"
}

# First ghcr error code from a response body (DENIED / UNAUTHORIZED /
# NOT_FOUND...), "" when unparseable — codes only, never the body.
ghcr_err() {  # $1 = body file
  "$PY" - "$1" <<'PYE' 2>/dev/null
import json, sys
try:
    errs = json.load(open(sys.argv[1])).get("errors") or []
    print(",".join(str(e.get("code", "?")) for e in errs)[:80], end="")
except Exception:
    print("", end="")
PYE
}

# ------------------------------------------------------------------ main
pass=0; fail=0
for secret in "${SECRETS[@]}"; do
  auth=""
  if ! auth="$(extract_basic "$secret")"; then
    echo "FAIL $secret: pull secret unreadable or unparseable (ns $NAMESPACE) — check kubectl access / secret integrity"
    fail=$((fail + 1))
    continue
  fi

  tok_file="$TMP_CHECK/token-$secret.json"
  code="$(http_get "Basic $auth" "$tok_file" \
    "https://ghcr.io/token?scope=repository:${REPO_PATH}:pull&service=ghcr.io" "")"
  tok=""
  if [[ "$code" == "200" ]]; then
    tok="$("$PY" -c 'import json,sys;print(json.load(open(sys.argv[1])).get("token",""),end="")' \
      "$tok_file" 2>/dev/null || true)"
  fi
  if [[ -z "$tok" ]]; then
    if [[ "$code" == "000" ]]; then
      echo "FAIL $secret: token endpoint unreachable (network/timeout) after $TIMEOUT s"
    else
      echo "FAIL $secret: token endpoint HTTP $code ($(ghcr_err "$tok_file")) — kubelet will ImagePullBackOff on this secret; rotate it (ghcr-403 incident 2026-09-29, RUNBOOK §6)"
    fi
    fail=$((fail + 1))
    continue
  fi

  if [[ -z "$TAG" ]]; then
    echo "OK $secret: token 200 (manifest step skipped — no tag resolved)"
    pass=$((pass + 1))
    continue
  fi

  man_file="$TMP_CHECK/manifest-$secret.json"
  mcode="$(http_get "Bearer $tok" "$man_file" \
    "https://ghcr.io/v2/${REPO_PATH}/manifests/${TAG}" "$ACCEPT")"
  if [[ "$mcode" == "200" ]]; then
    echo "OK $secret: token 200, manifest $TAG 200"
    pass=$((pass + 1))
  elif [[ "$mcode" == "000" ]]; then
    echo "FAIL $secret: token 200 but manifest GET unreachable (network/timeout)"
    fail=$((fail + 1))
  else
    echo "FAIL $secret: token 200 but manifest $TAG HTTP $mcode ($(ghcr_err "$man_file")) — auth alive, tag missing or pull path broken"
    fail=$((fail + 1))
  fi
done

total=$((pass + fail))
if [[ "$fail" -gt 0 ]]; then
  echo "check-ghcr-pull: FAIL — $pass/$total pull secrets healthy; rotate/refresh the failing secret(s) (dual secrets exist exactly for this: kubelet falls through imagePullSecrets)"
  exit 1
fi
echo "check-ghcr-pull: PASS — $total/$total pull secrets healthy (token + manifest $TAG against $REPO)"
