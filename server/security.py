"""Security helpers for the board API (sprint 1: SEC-1 / SEC-2).

Threat model this module serves:
- POST/PATCH /api/memories/servers must not turn the board into an SSRF
  pivot: the add-time reachability probe must never reach non-approved
  hosts, and must never carry the memory-server token (token exfiltration).
- ``file:`` token_refs must not be able to point at arbitrary files
  (``file:/etc/...``); only pre-provisioned secret directories are legal.
- Secrets must never be echoed into API responses or the server_log.

Egress policy for memory-server hosts (SEC-1):
- If ``VESMARO_ALLOWED_MEMORY_HOSTS`` is set (comma-separated), it IS the
  allowlist: entries may be a hostname (``mnemos.internal``), a wildcard
  (``*.lab.example.com``), an IP, an IP with port (``127.0.0.1:9998``),
  an IPv6 literal in brackets, or a CIDR (``10.0.0.0/8``). Nothing else
  passes, and no probe/connection is attempted for rejected hosts.
- If it is unset, the default policy allows public hosts only: loopback,
  private, link-local (cloud metadata), multicast and reserved ranges are
  denied, as are hosts that do not resolve.
"""

from __future__ import annotations

import binascii
import fnmatch
import hashlib
import hmac
import ipaddress
import math
import os
import re
import socket
import threading
import time
from collections import deque
from pathlib import Path
from urllib.parse import urlparse

ALLOWED_HOSTS_ENV = "VESMARO_ALLOWED_MEMORY_HOSTS"
SECRET_DIRS_ENV = "VESMARO_SECRET_DIRS"
_DEFAULT_SECRET_DIRS = ("/data/secrets",)

_ENV_VAR_RE = re.compile(r"^[A-Z_][A-Z0-9_]{0,127}$")


# ------------------------------------------------------------- passwords
# ME-080 (login+password accounts): password hashing envelope. scrypt is
# the stdlib memory-hard KDF from the same OWASP family as argon2id —
# chosen over adding argon2-cffi/bcrypt because a native dependency for
# one hash is a supply-chain delta with no protection-class gain for a
# single-owner LAN board. The envelope carries the ALGO ID and parameters
# ('scrypt$N$r$p$salthex$hashhex') so a future argon2id migration is a new
# verify branch: old hashes keep verifying, new hashes mint under the new
# prefix. Parameters per stored hash (NOT module constants) — raising the
# cost later cannot orphan existing accounts.
_SCRYPT_N = 2 ** 15          # 32768 — OWASP-listed cost profile
_SCRYPT_R = 8
_SCRYPT_P = 1
_SCRYPT_SALT_BYTES = 16
_SCRYPT_KEY_LEN = 32
# OpenSSL caps scrypt memory at 32 MiB unless maxmem is raised — and
# 128·N·r·p for the profile above lands EXACTLY on that boundary (the
# allocation fails with "memory limit exceeded"). 128 MiB covers the
# profile plus headroom for a future N=2^17 upgrade.
_SCRYPT_MAXMEM = 128 * 1024 * 1024
# Sanity gate for parameters parsed OUT of a stored envelope: the DB row
# is server-side data, but a corrupted/crafted row must fail the VERIFY,
# never mint a multi-GB scrypt allocation at login time.
_SCRYPT_PARAM_BOUNDS = (2 ** 10, 2 ** 22, 1, 32, 1, 8)


def hash_password(password: str, *, n: int = _SCRYPT_N, r: int = _SCRYPT_R,
                  p: int = _SCRYPT_P) -> str:
    """Hash a password into the algo-prefixed envelope (§3.1 of the
    ME-080 design): ``scrypt$N$r$p$<salthex>$<hashhex>``. A fresh random
    salt per call — two accounts with the same password store different
    rows. Never log the arguments or the result."""
    salt = os.urandom(_SCRYPT_SALT_BYTES)
    key = hashlib.scrypt(password.encode("utf-8"), salt=salt,
                         n=n, r=r, p=p, dklen=_SCRYPT_KEY_LEN,
                         maxmem=_SCRYPT_MAXMEM)
    return f"scrypt${n}${r}${p}${salt.hex()}${key.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """Verify a password against a stored envelope. Returns False — never
    raises — on ANY malformed input: unknown algo prefix, out-of-bounds
    parameters, hex garbage. The parameters come FROM the envelope, so
    hashes minted under older costs keep verifying after a cost bump."""
    try:
        algo, n_s, r_s, p_s, salt_hex, key_hex = encoded.split("$")
    except (ValueError, AttributeError):
        return False
    if algo != "scrypt":
        return False
    try:
        n, r, p = int(n_s), int(r_s), int(p_s)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(key_hex)
    except (ValueError, binascii.Error):
        return False
    n_lo, n_hi, r_lo, r_hi, p_lo, p_hi = _SCRYPT_PARAM_BOUNDS
    if not (n_lo <= n <= n_hi and r_lo <= r <= r_hi and p_lo <= p <= p_hi):
        return False
    if not salt or not expected:
        return False
    try:
        candidate = hashlib.scrypt(password.encode("utf-8"), salt=salt,
                                   n=n, r=r, p=p, dklen=len(expected),
                                   maxmem=_SCRYPT_MAXMEM)
    except (ValueError, OverflowError):
        return False
    return hmac.compare_digest(candidate, expected)


class ValidationError(ValueError):
    """Input rejected at the API boundary; must surface as HTTP 422."""


# ----------------------------------------------------------------- token_ref
def secret_dirs() -> tuple[Path, ...]:
    """Directories a ``file:`` token_ref may live under (pre-provisioned)."""
    raw = os.environ.get(SECRET_DIRS_ENV, "").strip()
    parts = [p.strip() for p in raw.split(",") if p.strip()] if raw else []
    if parts:
        return tuple(Path(p).resolve() for p in parts)
    return tuple(Path(d) for d in _DEFAULT_SECRET_DIRS)


def validate_token_ref(token_ref: str) -> str:
    """Validate a token_ref coming from the API. Returns the normalized ref.

    ``plain:`` is rejected outright (SEC-2: it would store the raw secret
    in the registry DB); legacy plain refs that already exist are handled
    by the registry migration, never through this path.
    """
    ref = (token_ref or "").strip()
    if not ref:
        return ""
    if ref.startswith("plain:"):
        raise ValidationError(
            "token_ref scheme 'plain:' is not accepted via the API: it stores "
            "the raw token in the registry DB. Use env:VAR or file:<path> "
            "under a provisioned secrets directory instead."
        )
    if ref.startswith("env:"):
        var = ref[4:]
        if not _ENV_VAR_RE.match(var):
            raise ValidationError(
                "token_ref env: variable name must match [A-Z_][A-Z0-9_]*"
            )
        return ref
    if ref.startswith("file:"):
        raw_path = ref[5:]
        if not raw_path.startswith("/"):
            raise ValidationError("token_ref file: path must be absolute")
        resolved = Path(raw_path).resolve()
        for d in secret_dirs():
            if resolved == d or d in resolved.parents:
                return f"file:{resolved}"
        raise ValidationError(
            "token_ref file: path must be inside a provisioned secrets "
            f"directory ({', '.join(str(d) for d in secret_dirs())}); "
            f"configure via {SECRET_DIRS_ENV}"
        )
    raise ValidationError("token_ref must be empty or one of: env:VAR, file:<path>")


# ---------------------------------------------------------------------- urls
def _allowlist_entries() -> list[str]:
    raw = os.environ.get(ALLOWED_HOSTS_ENV, "").strip()
    if not raw:
        return []
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def _resolve_host_ips(host: str) -> list[ipaddress._BaseAddress]:
    """Resolve a host to its IPs (empty list when it does not resolve)."""
    try:
        infos = socket.getaddrinfo(host, None, proto=socket.IPPROTO_TCP)
    except OSError:
        return []
    ips: list[ipaddress._BaseAddress] = []
    for info in infos:
        try:
            ips.append(ipaddress.ip_address(info[4][0]))
        except ValueError:
            continue
    return ips


def _is_special_ip(ip: ipaddress._BaseAddress) -> bool:
    """IP ranges that must never be probed: loopback/private/metadata/etc."""
    return (
        ip.is_private or ip.is_loopback or ip.is_link_local
        or ip.is_multicast or ip.is_reserved or ip.is_unspecified
    )


def _split_entry(entry: str) -> tuple[str, str]:
    """Allowlist entry → (host_part, port_part or ''), [v6]:port aware."""
    if entry.startswith("["):
        host, _, rest = entry[1:].partition("]")
        if rest.startswith(":"):
            return host, rest[1:]
        return host, ""
    if entry.count(":") == 1:
        host, _, port = entry.partition(":")
        if host and port.isdigit():
            return host, port
    return entry, ""


def _host_allowed(host: str, eff_port: int) -> bool:
    """Egress decision for a host:port (explicit allowlist or default deny)."""
    host = host[:-1] if host.endswith(".") else host
    entries = _allowlist_entries()
    ips = _resolve_host_ips(host)
    if not entries:
        # No explicit policy: public hosts only. Unresolvable names fail too.
        return bool(ips) and not any(_is_special_ip(ip) for ip in ips)
    for entry in entries:
        ehost, eport = _split_entry(entry)
        if eport and eport != str(eff_port):
            continue
        if "/" in ehost:  # CIDR
            try:
                net = ipaddress.ip_network(ehost, strict=False)
            except ValueError:
                continue
            if any(ip in net for ip in ips):
                return True
            continue
        try:
            eip = ipaddress.ip_address(ehost)
        except ValueError:
            eip = None
        if eip is not None:
            if any(ip == eip for ip in ips):
                return True
            continue
        if fnmatch.fnmatch(host, ehost):
            return True
    return False


def validate_memory_url(raw: str) -> str:
    """Normalize + validate a memory-server base URL (SEC-1).

    Returns the URL without a trailing slash. Enforces http(s), rejects
    userinfo/query/fragment and bad ports, and applies the egress policy.
    Raises ValidationError (→ HTTP 422) BEFORE any network activity.
    """
    url = (raw or "").strip()
    if not url:
        raise ValidationError("url is required")
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise ValidationError("url scheme must be http or https")
    if "@" in (parsed.netloc or ""):
        raise ValidationError("url must not contain userinfo (user:pass@host)")
    try:
        port = parsed.port  # raises ValueError on a malformed port
    except ValueError as exc:
        raise ValidationError("url has an invalid port") from exc
    if port is not None and not (1 <= port <= 65535):
        raise ValidationError("url port is out of range")
    if parsed.query or parsed.fragment:
        raise ValidationError("url must be a bare base URL (no query/fragment)")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValidationError("url host is required")
    path = parsed.path or ""
    if path and not path.startswith("/"):
        raise ValidationError("url path must start with '/'")
    if ".." in path:
        raise ValidationError("url path must not contain '..'")
    eff_port = port if port is not None else (443 if scheme == "https" else 80)
    if not _host_allowed(host, eff_port):
        suffix = (
            f"approved hosts are configured via {ALLOWED_HOSTS_ENV}"
            if _allowlist_entries()
            else f"no {ALLOWED_HOSTS_ENV} configured: public hosts only, "
                 "loopback/private/link-local are denied"
        )
        raise ValidationError(f"host '{host}' is not allowed for memory servers: {suffix}")
    return url.rstrip("/")


# ------------------------------------------------------------------- masking
# Patterns scrubbed before any text reaches the server_log (SEC-2).
# mnd_ (device tokens, ADR 0012) is masked from day one — the SEC-2 lesson:
# a secret prefix ships WITH its masking rule, never after the first leak.
# mne_ (enrollment tokens, ADR 0009 Amd 2 §4 supplement) joins the same day.
_SECRET_PATTERNS = (
    (re.compile(r"plain:\S+"), "plain:<redacted>"),
    (re.compile(r"(?i)bearer\s+[a-z0-9._~+/\-]+=*"), "Bearer <redacted>"),
    (re.compile(r"\bmnk_[A-Za-z0-9._\-]+"), "mnk_<redacted>"),
    (re.compile(r"\bmnd_[A-Za-z0-9._\-]+"), "mnd_<redacted>"),
    (re.compile(r"\bmne_[A-Za-z0-9._\-]+"), "mne_<redacted>"),
)


def mask_secrets(text: str) -> str:
    """Mask token-shaped substrings in free-form log/detail text."""
    out = text or ""
    for pattern, replacement in _SECRET_PATTERNS:
        out = pattern.sub(replacement, out)
    return out


# --------------------------------------------------------------- rate limiter
class RateLimiter:
    """Minimal in-memory sliding-window limiter (per key), thread-safe.

    ME-050: ``_events`` is bounded to the keys active within the last
    window — one-shot keys (per-IP limiters => unique IPs) are swept out
    once every one of their events has left the window, instead of
    leaking an emptied deque per key forever."""

    def __init__(self, limit: int, window: float) -> None:
        self.limit = limit
        self.window = window
        self._events: dict[str, deque[float]] = {}
        self._lock = threading.Lock()
        self._last_sweep = 0.0  # monotonic ts of the last expired-key sweep

    def acquire(self, key: str) -> bool:
        """Count one request for key; False when over the limit."""
        now = time.monotonic()
        with self._lock:
            # ME-050: amortized eviction — at most one full sweep per
            # window, so steady-state acquire stays O(window events) and
            # ``_events`` tracks the live working set, not the key history.
            if now - self._last_sweep >= self.window:
                self._last_sweep = now
                self._sweep(now)
            q = self._events.setdefault(key, deque())
            while q and now - q[0] > self.window:
                q.popleft()
            if len(q) >= self.limit:
                return False
            q.append(now)
            return True

    def _sweep(self, now: float) -> None:
        """Drop keys whose EVERY event is outside the window (ME-050).

        Eviction cannot change any observable outcome: a swept key is
        re-created by ``setdefault`` on its next acquire, where the
        popleft loop would have discarded those expired events anyway —
        it behaves exactly like a first-time key."""
        stale = [k for k, q in self._events.items()
                 if not q or now - q[-1] > self.window]
        for k in stale:
            del self._events[k]

    def retry_after(self, key: str) -> int:
        """Seconds until ``acquire(key)`` can succeed again (0 = free now).
        Read AFTER a failed ``acquire`` to feed the Retry-After header
        (ADR 0012 §A.5 device-mutation limiter); advisory only — a
        concurrent consume may free a slot sooner than the hint."""
        now = time.monotonic()
        with self._lock:
            q = self._events.get(key)
            if not q or len(q) < self.limit:
                return 0
            return max(1, math.ceil(q[0] + self.window - now))
