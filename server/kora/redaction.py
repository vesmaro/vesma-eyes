"""The single Kora redaction choke-point (ADR 0019 rev.2 #4, week-0 spec
x-kora-redaction: ``choke-point: server/kora/redaction.py``).

Every character of session content leaving the board — list previews AND
transcript bodies — passes through THIS module. No call-site masking
anywhere else; a field that cannot go through the choke-point does not
ship.

Pattern pack (week-0 spec): ghp_, sk-, AKIA, eyJ (JWT), mnd_, bearer.
Extended here with the credential families the board itself already knows
about (server.security mask_secrets parity: mnk_, mne_, plain:) and the
AWS secret-access-key shape — a preview cut at an arbitrary boundary must
never leak the tail of a token that starts beyond the clamp.

Previews are clamped BEFORE redaction (the contract fixes the order:
clamp ≤ 160 chars, then mask); masking can only shorten the string, so
the clamp bound survives.
"""

from __future__ import annotations

import re
from typing import Any

# The preview clamp from the frozen contract (KoraSessionOut.
# last_line_preview maxLength: 160).
PREVIEW_MAX_CHARS = 160

def _build_pattern_pack(*, json_safe: bool) -> tuple[
        tuple[re.Pattern[str], str], ...]:
    """Materialize the pattern pack. Order is irrelevant (patterns are
    disjoint by prefix); each entry is (compiled regex, replacement).
    NOTE: no raw token ever lands in a replacement — only the prefix + a
    <redacted> marker.

    Single source of truth for BOTH serving contexts: the free-text pack
    (``json_safe=False``) and the JSON-string-leaf pack
    (``json_safe=True``) differ EXACTLY in the tails of the two
    credential patterns below — everything else is compiled identical.
    """
    # The tail of the two ``key=value`` credential patterns. Free text:
    # greedy ``\S+`` (a secret runs to whitespace, trailing punctuation
    # is eaten with it). Inside a JSON-encoded string leaf (redact_json)
    # the same greed would swallow the leaf's own closing quote/comma
    # and leave the leaf unparseable, so the tail stops at the first
    # quote, whitespace or backslash escape instead (review P3,
    # 2026-10-29).
    tail = r'[^"\s\\]+' if json_safe else r"\S+"
    return (
        # GitHub PAT (classic + fine-grained) — ghp_/gho_/ghu_/ghs_/ghr_
        (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{16,255}"), "gh*_<redacted>"),
        # OpenAI-style API keys
        (re.compile(r"\bsk-[A-Za-z0-9_\-]{16,255}"), "sk-<redacted>"),
        # Anthropic-style API keys
        (re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{16,255}"), "sk-ant-<redacted>"),
        # AWS access key id + secret access key
        (re.compile(r"\bAKIA[0-9A-Z]{16}"), "AKIA<redacted>"),
        (re.compile(rf"(?i)aws_secret_access_key\s*[=:]\s*{tail}"),
         "aws_secret_access_key=<redacted>"),
        # JWT (header is always eyJ…)
        (re.compile(r"\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}"
                    r"(?:\.[A-Za-z0-9_\-]{10,})?"), "eyJ<redacted>"),
        # Board/device credential families (security.py parity)
        (re.compile(r"\bmnd_[A-Za-z0-9._\-]+"), "mnd_<redacted>"),
        (re.compile(r"\bmnk_[A-Za-z0-9._\-]+"), "mnk_<redacted>"),
        (re.compile(r"\bmne_[A-Za-z0-9._\-]+"), "mne_<redacted>"),
        (re.compile(rf"plain:{tail}"), "plain:<redacted>"),
        # Bearer tokens — last so a quoted "Bearer <x>" in prose still masks
        (re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._~+/=-]{8,}"),
         "Bearer <redacted>"),
        # --- STRADDLE SCRUB (slice-1 review P1) --------------------------
        # The preview clamp can cut a secret mid-token: the surviving
        # tail escapes the {16,} minimums above AND may sit glued to
        # ordinary text with no word boundary (…xxxghp_AbCdEf…). Long
        # specific prefixes (ghp_/AKIA/eyJ/mnd_/mnk_/mne_) anchor the
        # pattern with no \b at all — any occurrence scrubs (a stray
        # "ghp_" in prose is negligible collateral). The SHORT sk-
        # prefix would false-positive on words like "task-1", so it
        # takes a lookbehind: the prefix must not ride inside a longer
        # word. Honest asymmetry: a GLUED sk-/sk-ant- fragment shorter
        # than the {16,} key minimum is indistinguishable from an
        # ordinary hyphenated word ("task-ant-1") and carries no usable
        # secret material — the lookbehind keeps prose intact. A
        # clamp-cut credential tail must never reach a client.
        (re.compile(r"gh[pousr]_[A-Za-z0-9]{1,}"), "gh*_<redacted>"),
        (re.compile(r"(?<![A-Za-z0-9_-])sk-ant-[A-Za-z0-9_\-]{1,}"),
         "sk-ant-<redacted>"),
        (re.compile(r"(?<![A-Za-z0-9_-])sk-[A-Za-z0-9_\-]{1,}"),
         "sk-<redacted>"),
        (re.compile(r"AKIA[0-9A-Z]{1,}"), "AKIA<redacted>"),
        (re.compile(r"eyJ[A-Za-z0-9_\-]{1,}"), "eyJ<redacted>"),
        (re.compile(r"mnd_[A-Za-z0-9._\-]{1,}"), "mnd_<redacted>"),
        (re.compile(r"mnk_[A-Za-z0-9._\-]{1,}"), "mnk_<redacted>"),
        (re.compile(r"mne_[A-Za-z0-9._\-]{1,}"), "mne_<redacted>"),
    )


_PATTERNS = _build_pattern_pack(json_safe=False)
_JSON_SAFE_PATTERNS = _build_pattern_pack(json_safe=True)


def redact(text: str, *, json_safe: bool = False) -> tuple[str, bool]:
    """Mask every credential-shaped substring. Returns (masked, applied).

    ``applied`` is the honest signal the contract requires
    (``redaction_applied`` / preview hygiene): True when at least one
    pattern fired.

    ``json_safe=True`` (the redact_json context — the text will live
    inside a JSON string leaf) swaps the two greedy ``\\S+`` tails
    (aws_secret_access_key=, plain:) for structural-safe ``[^"\\s\\]+``
    tails; every other pattern is byte-identical between the two modes.
    Free-text callers keep the greedy default.
    """
    if not text:
        return "", False
    out = text
    applied = False
    for pattern, replacement in (
            _JSON_SAFE_PATTERNS if json_safe else _PATTERNS):
        masked = pattern.sub(replacement, out)
        if masked != out:
            applied = True
            out = masked
    return out, applied


def redact_preview(text: str | None, *, clamp: int = PREVIEW_MAX_CHARS,
                   max_chars: int | None = None) -> tuple[str | None, bool]:
    """List-preview choke-point: clamp BEFORE redaction (contract order),
    then clamp AGAIN after it (slice-1 review P2 — masking EXPANDS the
    string: a marker is longer than the token it replaces, so a single
    pre-clamp lets a 160-char input grow past the contract bound; the
    honest invariant is len(out) <= clamp on BOTH sides of redaction).

    ``None``/empty in → ``None`` out (the contract's nullable preview).
    ``max_chars`` overrides the clamp cap for tests; production callers
    never pass it.
    """
    if not text:
        return None, False
    limit = max_chars if max_chars is not None else clamp
    clamped = text[:limit]
    masked, applied = redact(clamped)
    return masked[:limit], applied


def redact_body(text: str) -> tuple[str, bool]:
    """Transcript-body choke-point: redact IN FULL, never clamp (slice 2
    serves bodies; the signature keeps the module one serving surface)."""
    return redact(text)


def redact_json(value: Any) -> tuple[Any, bool]:
    """Structured-field choke-point (the hermes ``tool_calls`` passthrough):
    walk a JSON-shaped value and redact every string leaf. Returns
    (masked_copy, applied) — the input is never mutated.

    The honest guarantee, precisely scoped: the OUTER structure survives
    verbatim (dict/list shape, key positions, untouched leaves
    byte-exact), and every string leaf — including a leaf whose content
    is itself JSON-encoded (the ``tool_calls`` ``arguments`` string) —
    still parses as JSON after masking, because the two credential
    patterns with greedy tails run here in their json_safe form
    (``[^"\\s\\]+``: a secret ends at the leaf's own quote, whitespace
    or backslash, never at its structural characters). Inside a leaf
    that masking touched there is NO byte-for-byte promise: markers
    replace token bytes and the aws_secret_access_key separator is
    normalized.

    Why leaf-wise instead of json.dumps → redact_body → json.loads: the
    free-text ``\\S+`` pattern tails would swallow JSON structural
    characters and corrupt the document past parsing. Leaf-wise
    replacement happens strictly inside strings, so it cannot touch the
    outer document. Mapping KEYS are redacted too (a credential can sit
    in a key position) — the documented collateral: two
    credential-shaped keys masking to the same marker merge in the copy,
    which is acceptable garbage-on-garbage, never silent loss of clean
    data.
    """
    applied = False

    def _walk(node: Any) -> Any:
        nonlocal applied
        if isinstance(node, str):
            masked, hit = redact(node, json_safe=True)
            if hit:
                applied = True
            return masked
        if isinstance(node, dict):
            return {_walk(k): _walk(v) for k, v in node.items()}
        if isinstance(node, (list, tuple)):
            walked = [_walk(item) for item in node]
            return walked if isinstance(node, list) else type(node)(walked)
        return node

    return _walk(value), applied
