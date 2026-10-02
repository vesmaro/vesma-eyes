"""ME-078 «Двухканальный рендер задач»: normalizer of agent-facing raw
text into the human markdown view.

Two channels, one source (owner directive, wave ME-078): the model channel
keeps the RAW spec/report text verbatim (``tasks.spec`` → immutable
``spec_snapshot`` at assignment time — the A2 invariant; this module never
touches it); the human channel serves ``tasks.human_view`` /
``task_reports.human_body`` computed by :func:`normalize` at every raw
write path (create_task / update_task / add_report) and backfilled by
``Store.backfill_human_views``.

Contract:

- **Deterministic**: same input → byte-identical output, on every run.
  No clock, no locale, no randomness — ISO dates may be re-cased to their
  absolute form, never to a relative one ("вчера" is never emitted).
- **Additive markdown only**: the output vocabulary is plain text plus
  ``### `` headings, ``- `` bullets and GFM ``- [ ]`` / ``- [x]``
  task-list markers. No HTML tag is ever emitted: ``<``, ``>`` and ``&``
  coming from the raw text are HTML-escaped OUTSIDE code spans (code
  spans stay verbatim — every markdown renderer keeps them inert).
- **Code spans and fences are sacred**: backtick spans (``...``) and
  triple-backtick fence bodies survive verbatim — markers, heading labels
  and the glossary never look inside them.
- **Honest limits**: Russian declensions of glossary tokens are NOT
  expanded (only the base form matches); em-dash dialogue lines («— Он
  сказал…») become bullets — spec/report text in this domain is
  checklist-shaped, so the trade-off is accepted and tested.

Bump :data:`TEXTNORM_VERSION` whenever the transformation changes: the
store's one-shot backfill reruns when the board_meta flag no longer
matches this version.
"""

from __future__ import annotations

import re

__all__ = ["TEXTNORM_VERSION", "normalize"]

# Bump on any transformation change → Store.backfill_human_views reruns
# and recomputes every human_view / human_body row.
TEXTNORM_VERSION = 1

# --------------------------------------------------------------- markers
# Leading checkbox forms: «- [ ]», «— [x]» (seed canon), bare «[ ]», «[X]».
_CHECKBOX = re.compile(r"^(?:[-*•—·]\s*)?\[([ xX✓✔])\]\s*")
# Bare filled/empty checkbox glyphs (no brackets).
_CHECKBOX_GLYPH = re.compile(r"^([☑✔✓☐])\s*")
# Bullet markers per ME-078 spec: dash, asterisk, bullet, em dash, interpunct.
_BULLET = re.compile(r"^[-*•—·]\s+(.*)$", re.DOTALL)
# Numbered items: «1)» and «1.» — a digit run up to 3 long, then a
# separator, then whitespace (so «1.5 млн» and version-like «2.3» never
# become list items).
_NUMBERED = re.compile(r"^(\d{1,3})[.)]\s+(.*)$", re.DOTALL)

# -------------------------------------------------------- heading labels
# Lines that open a section even when the content follows on the same
# line. Sources: the live specs in server/seed.py («Контекст:»,
# «Acceptance criteria:», «Блокер:») + the ME-078 directive set
# («Статус:», «Риск:») + their plain-English mirrors.
_LABELS = (
    "Контекст", "Context",
    "Блокер", "Blocker",
    "Acceptance criteria", "Критерии приёмки",
    "Статус", "Status",
    "Риск", "Risk",
    "План", "Plan",
    "Результат", "Result",
    "Заметки", "Notes",
)
_LABEL = re.compile(
    r"^(" + "|".join(re.escape(l) for l in _LABELS) + r")\s*:\s*(.*)$",
    re.DOTALL,
)
# Generic heading candidate: a short line that ends with a colon. URLs
# («https://…:») are excluded — a scheme colon is not a heading.
_HEADING_MAX_LEN = 80

# -------------------------------------------------------------- glossary
# (pattern, template, flags) — template formats the matched token via
# ``{0}``. Canon: docs/design/07a-DICTIONARY.md §3/§5 (поллер → «агент»,
# харнес — retained term with a first-show explanation) + the ME-078
# starter set from live task lore (TL, GWS, АРХКОМ, ME-xxx, ADR-xxx,
# SEC-xxx, Фx, Wx, джурни). First occurrence ONLY; word boundaries,
# hyphen-guarded so «W1B», «ME-ADR-1», «8W1» never half-match. Word
# entries are case-insensitive (a sentence-initial «Поллер» matches; the
# original spelling is preserved inside the parens); id-patterns stay
# exact — they are canonically uppercase.
_BOUND = r"(?<![\w-]){}(?![\w-])"
_IC = re.IGNORECASE
_GLOSSARY: tuple[tuple[re.Pattern[str], str], ...] = tuple(
    (re.compile(_BOUND.format(pat), flags), tpl)
    for pat, tpl, flags in (
        # — GCW roles (lore)
        (r"TL", "техлид ({0})", _IC),
        (r"GWS", "специалист по git-воркфлоу ({0})", _IC),
        (r"АРХКОМ(?:е|а|у|ом)?", "архитектурный комитет ({0})", _IC),
        # — work ids (live tasks)
        (r"ME-\d+", "волна {0}", 0),
        (r"ADR-\d+", "архитектурное решение {0}", 0),
        (r"SEC-\d+", "находка безопасности {0}", 0),
        (r"Ф\d+", "фаза {0}", 0),
        (r"W\d+", "волна {0}", 0),
        (r"джурни", "пользовательский сценарий (джурни)", _IC),
        # — 07a §3/§5 vocabulary
        (r"поллер", "агент (поллер)", _IC),
        (r"харнес", "харнес (программа, через которую работает агент)", _IC),
    )
)

_CODE_SPAN = re.compile(r"`[^`\n]+`")
_FENCE = "```"
_PH = "\x00{}\x00"  # placeholder for a protected code span


def _escape(text: str) -> str:
    """HTML-escape the markup-significant characters so the human view
    never carries raw HTML (XSS invariant): whatever the renderer does
    with the field, input-borne tags stay visible text, never markup."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _transform_line(line: str, prev_list: bool,
                    indent_depth: int) -> tuple[str, bool]:
    """Transform one fence-free (already code-protected and escaped) line.
    Returns (output line, is-list-item).

    ``prev_list`` says whether the previous emitted line was a list item —
    indentation is honored (one nesting level) only there, so a stray
    4-space indent can never turn a plain paragraph into a code block.
    """
    stripped = line.strip()
    prefix = "    " if (indent_depth and prev_list) else ""

    m = _CHECKBOX.match(stripped)
    if m:
        mark = "x" if m.group(1).lower() in ("x", "✓", "✔") else " "
        return prefix + f"- [{mark}] " + stripped[m.end():].strip(), True
    m = _CHECKBOX_GLYPH.match(stripped)
    if m:
        mark = "x" if m.group(1) != "☐" else " "
        return prefix + f"- [{mark}] " + stripped[m.end():].strip(), True
    m = _NUMBERED.match(stripped)
    if m:
        return prefix + f"{m.group(1)}. {m.group(2).strip()}", True
    m = _BULLET.match(stripped)
    if m:
        return prefix + "- " + m.group(1).strip(), True

    m = _LABEL.match(stripped)
    if m:
        label, rest = m.group(1), m.group(2).strip()
        if rest:
            return f"### {label}\n{rest}", False
        return f"### {label}", False
    if (len(stripped) < _HEADING_MAX_LEN and stripped.endswith(":")
            and "://" not in stripped):
        return f"### {stripped[:-1]}", False

    return prefix + stripped, False


def normalize(raw: str) -> str:
    """Normalize agent-facing raw text into the human markdown view.

    See the module docstring for the full contract. Pure function:
    ``normalize(normalize(x)) == normalize(x)`` for every input.
    """
    if not raw:
        return ""
    text = raw.replace("\r\n", "\n").replace("\r", "\n")

    out_lines: list[str] = []
    protected: list[str] = []
    prev_list = False
    fence_buf: list[str] | None = None
    for line in text.split("\n"):
        if fence_buf is not None:
            # Inside a fence: buffer verbatim until the closing line, then
            # park the whole block as one protected placeholder — fence
            # bodies are code, no marker/label/glossary ever applies.
            fence_buf.append(line.rstrip())
            if line.lstrip().startswith(_FENCE):
                protected.append("\n".join(fence_buf))
                out_lines.append(_PH.format(len(protected) - 1))
                fence_buf = None
                prev_list = False
            continue
        if line.lstrip().startswith(_FENCE):
            fence_buf = [line.rstrip()]
            continue
        # Protect inline code spans from every transformation below.
        def _keep(m: re.Match[str]) -> str:
            protected.append(m.group(0))
            return _PH.format(len(protected) - 1)

        work = _CODE_SPAN.sub(_keep, line.strip())
        work = _escape(work)
        indent_depth = len(line) - len(line.lstrip(" "))
        new_line, is_list = _transform_line(work, prev_list, indent_depth)
        out_lines.append(new_line)
        prev_list = is_list
    if fence_buf is not None:  # unclosed fence — flush verbatim
        protected.append("\n".join(fence_buf))
        out_lines.append(_PH.format(len(protected) - 1))

    result = "\n".join(out_lines)

    # Glossary: FIRST occurrence per entry — «human-readable (jargon)» at
    # the first mention, later mentions stay raw jargon. If the first
    # occurrence already reads human (wrapped as «(token)» by an earlier
    # pass or hand-written, or directly preceded by the template's human
    # word), the entry is satisfied and does nothing — that keeps
    # normalize() idempotent and the "first occurrence" doctrine literal.
    for pattern, template in _GLOSSARY:
        # paren form «human ({0})» → no human-word guard applies;
        # prefix form «волна {0}» → guard = the leading human word
        human_prefix = "" if template.endswith(" ({0})") else template[:-3]
        m = pattern.search(result)
        if m is None:
            continue
        before = result[max(0, m.start() - 1):m.start()]
        if before == "(" and result[m.end():m.end() + 1] == ")":
            continue  # first mention already in the «human (token)» form
        if result[m.end():].startswith(" ("):
            continue  # token-first form «token (explanation…)» already there
        if human_prefix and result[:m.start()].endswith(human_prefix):
            continue  # first mention already carries the human word
        result = (result[:m.start()] + template.format(m.group(0))
                  + result[m.end():])

    # Restore the code spans verbatim.
    for i, span in enumerate(protected):
        result = result.replace(_PH.format(i), span)
    return result.strip()
