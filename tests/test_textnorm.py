"""ME-078 «Двухканальный рендер задач»: unit tests for server/textnorm.py.

Pinned here:
- markers: bullets of every kind → ``- ``; «1)»/«1.» numbering → «1. »;
  checkbox forms (bracketed, seed-canonical «— [x]», bare glyphs) → GFM
  ``- [ ]`` / ``- [x]``; one nesting level by indentation;
- headings: dictionary labels with inline content split into «### Label»
  + content; a short colon-ending line is a heading candidate; URLs and
  long lines are not;
- glossary: first occurrence only, word boundaries (hyphen-guarded so
  «W1B»/«8W1»/«tl-код» never half-match), case-insensitive for word
  entries, id-patterns exact; code spans (``...``) and fence bodies are
  never touched;
- safety: no HTML is ever introduced — input-borne tags are escaped
  outside code spans (XSS invariant for the human channel);
- determinism: normalize(normalize(x)) == normalize(x).
"""

from __future__ import annotations

import re

import pytest

from server.textnorm import TEXTNORM_VERSION, normalize


class TestMarkers:
    @pytest.mark.parametrize("raw", ["- a", "* a", "• a", "— a", "· a"])
    def test_bullet_markers_unified(self, raw):
        assert normalize(raw) == "- a"

    @pytest.mark.parametrize("raw, out", [
        ("1) первый", "1. первый"),
        ("2. второй", "2. второй"),
        ("10) десятый", "10. десятый"),
    ])
    def test_numbering_unified(self, raw, out):
        assert normalize(raw) == out

    def test_decimal_and_version_not_lists(self):
        assert normalize("1.5 млн строк") == "1.5 млн строк"
        assert normalize("2.3") == "2.3"

    @pytest.mark.parametrize("raw, out", [
        ("- [ ] a", "- [ ] a"),
        ("- [x] a", "- [x] a"),
        ("— [x] задача открывается", "- [x] задача открывается"),  # seed canon
        ("— [ ] фидбек", "- [ ] фидбек"),
        ("* [X] done", "- [x] done"),
        ("[ ] bare", "- [ ] bare"),
        ("[x] bare done", "- [x] bare done"),
        ("☑ filled glyph", "- [x] filled glyph"),
        ("☐ empty glyph", "- [ ] empty glyph"),
        ("✓ check glyph", "- [x] check glyph"),
    ])
    def test_checkboxes_gfm(self, raw, out):
        assert normalize(raw) == out

    def test_bracket_but_not_checkbox_untouched(self):
        assert normalize("[i] не чекбокс") == "[i] не чекбокс"

    def test_nesting_one_level_by_indent(self):
        src = "- верх\n  - низ\n    - глубже"
        assert normalize(src) == "- верх\n    - низ\n    - глубже"

    def test_indent_after_paragraph_is_flattened(self):
        # a stray 4-space indent must never become a markdown code block
        assert normalize("абзац\n\n    с отступом") == "абзац\n\nс отступом"


class TestHeadings:
    def test_label_with_inline_content_splits(self):
        assert normalize("Контекст: владелец подтвердил") == \
            "### Контекст\nвладелец подтвердил"

    def test_bare_dictionary_label(self):
        assert normalize("Acceptance criteria:") == "### Acceptance criteria"
        assert normalize("Блокер:") == "### Блокер"

    @pytest.mark.parametrize("label", ["Статус", "Риск", "Заметки",
                                       "Result", "Status"])
    def test_label_dictionary(self, label):
        assert normalize(f"{label}:") == f"### {label}"

    def test_short_colon_line_is_heading_candidate(self):
        assert normalize("Гейты:") == "### Гейты"

    def test_long_colon_line_is_not_heading(self):
        long_line = "какой-то очень длинный текст с двоеточием в конце " * 2
        assert len(long_line) > 80
        assert normalize(long_line).startswith("какой-то")

    def test_url_colon_not_heading(self):
        assert normalize("см https://a.b/c: путь") == "см https://a.b/c: путь"

    def test_plain_text_single_paragraph(self):
        assert normalize("Просто текст без маркеров") == \
            "Просто текст без маркеров"

    def test_empty_line_is_paragraph_boundary(self):
        assert normalize("раз\n\nдва") == "раз\n\nдва"

    @pytest.mark.parametrize("raw", ["", "   ", " \n \n "])
    def test_empty_variants(self, raw):
        assert normalize(raw) == ""


class TestGlossary:
    def test_first_occurrence_only(self):
        assert normalize("TL смотрит. Ещё TL и TL.") == \
            "техлид (TL) смотрит. Ещё TL и TL."

    def test_word_entries_case_insensitive(self):
        out = normalize("Поллер докладывается. ПОЛЛЕР спит.")
        assert out == "агент (поллер) докладывается. ПОЛЛЕР спит."

    def test_id_patterns_case_sensitive(self):
        assert normalize("adr-1 не раскрывается, ADR-2 да") == \
            "adr-1 не раскрывается, архитектурное решение ADR-2 да"

    def test_hyphen_guard(self):
        assert normalize("W1B не волна") == "W1B не волна"
        assert normalize("8W1 не волна") == "8W1 не волна"
        assert normalize("tl-код не техлид") == "tl-код не техлид"

    def test_me_and_sec_and_phases(self):
        out = normalize("ME-078, SEC-4, Ф1 и W2 в работе")
        assert out == ("волна ME-078, находка безопасности SEC-4, "
                       "фаза Ф1 и волна W2 в работе")

    def test_arhkom_declension(self):
        assert normalize("АРХКОМе решил") == \
            "архитектурный комитет (АРХКОМе) решил"

    def test_preexisting_human_word_not_duplicated(self):
        assert normalize("волна W1 уже названа") == "волна W1 уже названа"

    def test_preexisting_paren_form_not_duplicated(self):
        assert normalize("техлид (TL) уже раскрыт и TL тоже") == \
            "техлид (TL) уже раскрыт и TL тоже"

    def test_code_span_protected(self):
        out = normalize("см. `ADR-0020` и ADR-0020")
        assert out == "см. `ADR-0020` и архитектурное решение ADR-0020"

    def test_code_span_markers_untouched(self):
        assert normalize("`- не список`") == "`- не список`"

    def test_fence_body_verbatim(self):
        src = "```bash\n- не список\nADR-0020 в коде\n```\nпосле фенса TL"
        out = normalize(src)
        assert "- не список\nADR-0020 в коде" in out
        assert out.endswith("после фенса техлид (TL)")


class TestSafety:
    def test_input_html_escaped(self):
        out = normalize("<script>alert(1)</script>")
        assert "<script" not in out
        assert "&lt;script&gt;" in out

    def test_event_handler_escaped(self):
        out = normalize('<img src=x onerror="alert(1)">')
        assert "<img" not in out
        assert "onerror" in out  # visible text, inert markup

    def test_no_html_introduced_for_clean_input(self):
        src = "Контекст: чисто\n\n- [ ] пункт\n1) нумер\nГейты:"
        assert re.search(r"<[a-zA-Z/][^>]*>", normalize(src)) is None

    def test_ampersand_escaped(self):
        assert normalize("R&D и <b>жирный</b>") == \
            "R&amp;D и &lt;b&gt;жирный&lt;/b&gt;"

    def test_code_span_html_left_verbatim(self):
        # code spans are inert in every markdown renderer — verbatim
        assert normalize("`<b>не жирный</b>`") == "`<b>не жирный</b>`"


class TestContract:
    def test_version_is_positive_int(self):
        assert isinstance(TEXTNORM_VERSION, int) and TEXTNORM_VERSION >= 1

    def test_deterministic(self):
        src = "Контекст: TL\n- [ ] a\n1) b\n`ADR-1` ADR-2"
        assert normalize(src) == normalize(src)

    def test_idempotent(self):
        src = "Контекст: TL\n- [ ] a\n  - b\n`ADR-1` ADR-2\nГейты:\n1) c"
        assert normalize(normalize(src)) == normalize(src)

    def test_crlf_normalized(self):
        assert normalize("раз\r\n— [x] два") == "раз\n- [x] два"
