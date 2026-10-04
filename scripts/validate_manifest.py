#!/usr/bin/env python3
"""Validate a VESMA component manifest against the component-manifest v1 contract.

Contract source: vesmaro/vesma-specs, specs/component-manifest/v1 (JSON-Schema
2020-12 strict validation) plus the normative rules of spec.md §3 that the
schema alone cannot express (shell-free argv, placeholder allowlist, no
secrets in the manifest, env_file placement).

Usage:
    python3 scripts/validate_manifest.py [MANIFEST] [--schema PATH] [--ref REF]

    MANIFEST   default: contrib/vesma-component.yaml
    --schema   local schema file (skips the network fetch)
    --ref      vesma-specs git ref to fetch the schema from
               (default: VESMA_SPECS_REF env var, else d30e668 =
               component-manifest 1.0.0-draft.2)

Exit codes: 0 = valid; 1 = validation failure; 2 = infrastructure error.

Dependencies: PyYAML + jsonschema (Draft 2020-12 support).
"""

import argparse
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

import yaml
import jsonschema

DEFAULT_MANIFEST = "contrib/vesma-component.yaml"
DEFAULT_REF = "d30e668"  # vesma-specs: component-manifest 1.0.0-draft.2
SCHEMA_URL = ("https://raw.githubusercontent.com/vesmaro/vesma-specs/{ref}/"
              "specs/component-manifest/v1/schema/component-manifest.schema.json")

PLACEHOLDER_ALLOWLIST = {"config_path", "data_dir", "runtime_dir", "venv_bin"}
PLACEHOLDER_RE = re.compile(r"\{[a-z_]+\}")
SHELL_METACHARS = set("|&;<>()`\\\"'*? \t")
SHELL_BASENAMES = {"sh", "bash", "dash", "ash", "zsh", "ksh", "busybox",
                   "cmd", "powershell"}
SECRET_NAME_MARKERS = ("token", "secret", "password", "passwd", "api_key",
                       "apikey", "private_key", "credential")
SECRET_VALUE_PATTERNS = [
    ("openai-style-key", re.compile(r"sk-[A-Za-z0-9]{8,}")),
    ("github-pat", re.compile(r"ghp_[A-Za-z0-9]{20,}")),
    ("pem-private-key", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----")),
    ("long-hex", re.compile(r"^[0-9a-fA-F]{40,}$")),
    ("long-base64", re.compile(r"^[A-Za-z0-9+/]{40,}={0,2}$")),
]
# Spec §6 (no_secret_in_vars) value-scan exclusions: the config subtree
# (schema_inline holds legitimate patterns/defaults), description and
# artifact_sha256 (hex64 by contract), and <...> placeholder values.
VALUE_SCAN_SKIP_KEYS = {"config", "description", "artifact_sha256"}


class InfraError(Exception):
    pass


def load_schema(schema_path, ref):
    if schema_path:
        return json.loads(Path(schema_path).read_text(encoding="utf-8"))
    url = SCHEMA_URL.format(ref=ref)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 — report any fetch failure as infra
        raise InfraError(f"cannot fetch schema from {url}: {exc}") from exc


def iter_strings(node, path=()):
    """Yield (path, value) for every string scalar, skipping exclusion keys."""
    if isinstance(node, dict):
        for key, value in node.items():
            if key in VALUE_SCAN_SKIP_KEYS:
                continue
            yield from iter_strings(value, path + (str(key),))
    elif isinstance(node, list):
        for idx, value in enumerate(node):
            yield from iter_strings(value, path + (str(idx),))
    elif isinstance(node, str):
        yield path, node


def normative_checks(manifest_path, doc):
    """Spec §3 rules beyond the schema. Returns a list of violation strings."""
    errors = []
    argv_lists = []
    launch = doc.get("launch") or {}
    if "argv" in launch:
        argv_lists.append(("launch.argv", launch["argv"]))
    health = doc.get("health") or {}
    if "exec" in health:
        argv_lists.append(("health.exec.argv", health["exec"]["argv"]))

    for where, argv in argv_lists:
        for pos, element in enumerate(argv):
            bad = sorted({ch for ch in element if ch in SHELL_METACHARS})
            if bad:
                errors.append(
                    f"{where}[{pos}]: shell metacharacter(s) "
                    f"{' '.join(repr(c) for c in bad)} in {element!r} (spec §3.5)")
            for match in PLACEHOLDER_RE.findall(element):
                if match.strip("{}") not in PLACEHOLDER_ALLOWLIST:
                    errors.append(
                        f"{where}[{pos}]: placeholder {match} outside allowlist "
                        f"{sorted(PLACEHOLDER_ALLOWLIST)} (spec §3.5)")
        if argv:
            if Path(argv[0]).name in SHELL_BASENAMES:
                errors.append(f"{where}[0]: shell invocation {argv[0]!r} (spec §3.5)")
            if any(arg in ("-c", "-lc") for arg in argv):
                errors.append(f"{where}: -c/-lc shell flag present (spec §3.5)")

    for key in (launch.get("env") or {}).get("vars", {}):
        lowered = key.lower()
        if any(marker in lowered for marker in SECRET_NAME_MARKERS):
            errors.append(
                f"launch.env.vars.{key}: secret-like key name — secrets belong "
                f"in env_file (spec §3.5, SECRET_IN_VARS)")

    for path, value in iter_strings(doc):
        if value.startswith("<") and value.endswith(">"):
            continue  # explicit <...> placeholder, not a secret
        for name, pattern in SECRET_VALUE_PATTERNS:
            if pattern.search(value):
                errors.append(
                    f"{'.'.join(path)}: value looks like a secret "
                    f"({name}) — secrets belong in env_file (spec §3.5)")
                break

    env_file = (launch.get("env") or {}).get("env_file")
    if env_file and "components.d" in Path(env_file).parts:
        errors.append(
            f"launch.env.env_file: {env_file!r} inside the manifests directory "
            f"(spec §3.5, ENV_FILE_UNSAFE)")
    return errors


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("manifest", nargs="?", default=DEFAULT_MANIFEST)
    parser.add_argument("--schema", help="local schema file (skip network fetch)")
    parser.add_argument("--ref", default=os.environ.get("VESMA_SPECS_REF", DEFAULT_REF))
    args = parser.parse_args(argv)

    manifest_path = Path(args.manifest)
    if not manifest_path.is_file():
        print(f"infra: manifest not found: {manifest_path}", file=sys.stderr)
        return 2
    try:
        doc = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
        schema = load_schema(args.schema, args.ref)
    except InfraError as exc:
        print(f"infra: {exc}", file=sys.stderr)
        return 2
    except (yaml.YAMLError, json.JSONDecodeError) as exc:
        print(f"infra: unparsable input: {exc}", file=sys.stderr)
        return 2

    failures = []
    validator = jsonschema.Draft202012Validator(schema)
    for error in sorted(validator.iter_errors(doc), key=lambda e: list(e.absolute_path)):
        location = "/".join(str(p) for p in error.absolute_path) or "<root>"
        failures.append(f"schema: {location}: {error.message}")

    failures.extend(normative_checks(manifest_path, doc))

    if failures:
        print(f"FAIL {manifest_path} ({len(failures)} violation(s)):")
        for failure in failures:
            print(f"  - {failure}")
        return 1
    name = (doc.get("metadata") or {}).get("name", "?")
    print(f"OK {manifest_path}: component {name!r} conforms to "
          f"component-manifest v1 ({schema.get('$id', 'schema')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
