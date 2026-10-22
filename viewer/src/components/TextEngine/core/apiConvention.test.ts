import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  HTTP_METHODS,
  inlineMarkdownToText,
  isParameterSectionHeading,
  parseEndpointHeading,
  splitConventionSections,
} from "./apiConvention";

/**
 * D3 convention detection gates (owner directive 2026-10-22). The rules
 * are CONSERVATIVE — an unstyled block over a false positive — and the
 * guarantee is pinned against the REAL corpus: every endpoint-like heading
 * must live in the upstream API mirrors, none in the curated corpus.
 */

const CORPUS = fileURLToPath(
  new URL("../../../features/docs/content", import.meta.url),
);

function* markdownFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* markdownFiles(path);
    else if (entry.endsWith(".md")) yield path;
  }
}

/** Heading lines of a body (h2/h3, fence-aware — extractHeadings rules). */
function headingLines(body: string): string[] {
  const lines: string[] = [];
  let inFence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^#{2,3}\s/.test(line)) lines.push(line);
  }
  return lines;
}

describe("parseEndpointHeading — unit forms", () => {
  it("parses the corpus heading shapes", () => {
    // board (generated): two code spans
    expect(parseEndpointHeading("`GET` `/api/assignments`")).toEqual({
      method: "get",
      path: "/api/assignments",
    });
    // combined span (mnemos metrics)
    expect(parseEndpointHeading("`GET /api/v1/stats`")).toEqual({
      method: "get",
      path: "/api/v1/stats",
    });
    // enumerated h2 (mnemos a2a-sessions mirror)
    expect(parseEndpointHeading("1. `POST /v1/sessions`")).toEqual({
      method: "post",
      path: "/v1/sessions",
    });
    expect(parseEndpointHeading("2) `DELETE /api/tags`")).toEqual({
      method: "delete",
      path: "/api/tags",
    });
    // plain text
    expect(parseEndpointHeading("GET /api/memories")).toEqual({
      method: "get",
      path: "/api/memories",
    });
  });

  it("rejects non-endpoints and near-misses (conservative)", () => {
    expect(parseEndpointHeading("GroupSpec")).toBeNull();
    expect(parseEndpointHeading("Memory /api/memories")).toBeNull();
    expect(parseEndpointHeading("GET not-a-path")).toBeNull();
    expect(parseEndpointHeading("Get started guide")).toBeNull();
    // a trailing prose word kills the match — path is ONE token
    expect(parseEndpointHeading("PUT /etc/hosts back")).toBeNull();
    expect(parseEndpointHeading("PATCH")).toBeNull();
    expect(parseEndpointHeading("")).toBeNull();
    expect(parseEndpointHeading("TRACE /api/debug")).toBeNull(); // not in the verb set
  });

  it("keeps the verb set exact", () => {
    expect(HTTP_METHODS).toEqual(["get", "put", "post", "patch", "delete"]);
  });
});

describe("isParameterSectionHeading — section label vocabulary", () => {
  it("accepts the corpus labels (RU + EN, qualified forms)", () => {
    for (const label of [
      "Параметры",
      "Parameters",
      "Пример запроса",
      "Example request",
      "Пример ответа",
      "Example response",
      "Ответы",
      "Responses",
      "Ответ — 201",
      "Тело запроса (необязательное)",
      "Request body (optional)",
      "Конфигурация",
      "Configuration",
    ]) {
      expect(isParameterSectionHeading(label), label).toBe(true);
    }
  });

  it("rejects look-alikes (prefix must end on a word boundary)", () => {
    for (const label of [
      "Ответственность",
      "Замечания",
      "MemoryManager",
      "Примерно так",
      "Параметрический анализ",
      "",
    ]) {
      expect(isParameterSectionHeading(label), label).toBe(false);
    }
  });
});

describe("splitConventionSections", () => {
  const BOARD_BODY = [
    "Intro paragraph before any heading.",
    "",
    "## Память",
    "",
    "### `GET` `/api/memories`",
    "",
    "List memories.",
    "",
    "## Теги",
    "",
    "### `GET` `/api/tags`",
    "",
    "#### Параметры",
    "",
    "```text",
    "## not a heading",
    "```",
  ].join("\n");

  it("cards only endpoint sections; headers and preamble stay plain", () => {
    const sections = splitConventionSections(BOARD_BODY);
    expect(sections).not.toBeNull();
    expect(sections!.map((section) => section.endpoint)).toEqual([
      null, // preamble
      null, // ## Память
      { method: "get", path: "/api/memories" },
      null, // ## Теги
      { method: "get", path: "/api/tags" },
    ]);
  });

  it("keeps headings inside fences out of the split", () => {
    const sections = splitConventionSections(BOARD_BODY);
    const tags = sections!.find((section) =>
      section.markdown.startsWith("### `GET` `/api/tags`"),
    );
    expect(tags!.markdown).toContain("## not a heading");
  });

  it("returns null for a body WITHOUT endpoints (single-pass stays)", () => {
    expect(splitConventionSections("# Guide\n\n## Install\n\nRun it.")).toBeNull();
  });
});

describe("REAL corpus calibration — upstream mirrors vs curated silence", () => {
  it("parses every endpoint-shaped heading of the upstream api corpus", () => {
    const apiDir = join(CORPUS, "upstream", "api");
    let endpointHeadings = 0;
    for (const file of markdownFiles(apiDir)) {
      const body = readFileSync(file, "utf-8");
      for (const line of headingLines(body)) {
        const text = line.replace(/^#{2,3}\s+/, "").replace(/\s+#*\s*$/, "");
        if (parseEndpointHeading(text) !== null) endpointHeadings += 1;
      }
    }
    // the whole generated + mirrored API corpus is convention-covered
    expect(endpointHeadings).toBeGreaterThan(200);
  });

  it("finds ZERO endpoint headings in the curated en/ru corpus", () => {
    let matches = 0;
    for (const locale of ["en", "ru"]) {
      for (const file of markdownFiles(join(CORPUS, locale))) {
        const body = readFileSync(file, "utf-8");
        for (const line of headingLines(body)) {
          const text = line.replace(/^#{2,3}\s+/, "").replace(/\s+#*\s*$/, "");
          if (parseEndpointHeading(text) !== null) matches += 1;
        }
      }
    }
    expect(matches).toBe(0);
  });

  it("splits the real mnemos A2A mirror into 5 endpoint cards + plain sections", () => {
    const body = readFileSync(
      join(CORPUS, "upstream", "api", "en", "mnemos", "a2a-sessions.md"),
      "utf-8",
    );
    const sections = splitConventionSections(body);
    expect(sections).not.toBeNull();
    const endpoints = sections!.filter((section) => section.endpoint !== null);
    expect(endpoints.map((section) => section.endpoint!.path)).toEqual([
      "/v1/sessions",
      "/v1/sessions/{session_id}",
      "/v1/sessions/{session_id}/turns",
      "/v1/sessions/{session_id}/turns/{turn_id}",
      "/v1/sessions/{session_id}/turns/range",
    ]);
    // «Endpoints at a glance» + overview sections stay plain
    const glance = sections!.find((section) =>
      section.markdown.startsWith("## Endpoints at a glance"),
    );
    expect(glance!.endpoint).toBeNull();
  });

  it("inlineMarkdownToText agrees with the headingSlug extractor", () => {
    expect(inlineMarkdownToText("`GET` `/api/memories`")).toBe(
      "GET /api/memories",
    );
    expect(inlineMarkdownToText("1. `POST /v1/sessions`")).toBe(
      "1. POST /v1/sessions",
    );
  });

  it("keeps snake_case paths verbatim — raw AND rendered heading text", () => {
    // raw line (code span masked)
    expect(
      inlineMarkdownToText("4. `GET /v1/sessions/{session_id}/turns/{turn_id}`"),
    ).toBe("4. GET /v1/sessions/{session_id}/turns/{turn_id}");
    // rendered text (nodeText — no code spans left to mask); intraword
    // underscores are NOT emphasis in CommonMark and must survive
    expect(
      inlineMarkdownToText("GET /v1/sessions/{session_id}/turns/{turn_id}"),
    ).toBe("GET /v1/sessions/{session_id}/turns/{turn_id}");
    expect(inlineMarkdownToText("Поля session_id и turn_id")).toBe(
      "Поля session_id и turn_id",
    );
    // real emphasis still strips
    expect(inlineMarkdownToText("_em_ word")).toBe("em word");
    expect(inlineMarkdownToText("**bold** word")).toBe("bold word");
    // and the chip gets the true path from rendered heading text
    expect(
      parseEndpointHeading("2. GET /v1/sessions/{session_id}"),
    ).toEqual({ method: "get", path: "/v1/sessions/{session_id}" });
  });
});
