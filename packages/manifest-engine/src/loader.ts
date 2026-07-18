/**
 * ManifestLoader — reads, parses, validates, and caches manifest.yaml files.
 *
 * Minimal inline YAML parser (no js-yaml).
 * ponytail: Phase 1a manifests are simple key-value with nested objects and
 * arrays; add js-yaml when anchors/aliases are needed.
 */
import { readFile } from "node:fs/promises";
import { validateManifest, validateManifestSafe } from "./validator.js";
import type { Manifest, ValidationResult } from "./types.js";

// ── Minimal YAML Parser ─────────────────────────────────────

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

interface ParseResult {
  value: YamlValue;
  nextIndex: number;
}

interface LineInfo {
  line: string;
  indent: number;
  index: number;
}

/** Parse a simple YAML string. Supports key:value, nesting, arrays, comments. */
function parseYaml(content: string): Record<string, unknown> {
  const lines = content.split("\n");
  const result = parseBlock(lines, 0, 0);
  return result.value as Record<string, unknown>;
}

/** Dispatches to array or map parser based on first line. */
function parseBlock(lines: string[], startIndex: number, baseIndent: number): ParseResult {
  const first = peekLine(lines, startIndex, baseIndent);
  if (first === null) {
    return { value: {}, nextIndex: startIndex };
  }
  if (first.line.trim().startsWith("- ")) {
    return parseArrayBlock(lines, startIndex, baseIndent);
  }
  return parseMapBlock(lines, startIndex, baseIndent);
}

/** Parse "- item" array items. Handles scalars, nested objects, nested arrays. */
function parseArrayBlock(lines: string[], startIndex: number, baseIndent: number): ParseResult {
  const result: YamlValue[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const info = peekLine(lines, i, baseIndent);
    if (info === null) break;

    const { line, indent } = info;
    const trimmed = line.trim();

    if (!trimmed.startsWith("- ")) break;

    const afterDash = trimmed.slice(2).trim();

    if (afterDash === "") {
      // `- ` with nothing — value in deeper lines
      const nested = parseBlock(lines, i + 1, indent + 2);
      result.push(nested.value);
      i = nested.nextIndex;
    } else if (isObjectArrayEntry(lines, i, indent)) {
      // `- key: value` followed by deeper key-value lines
      // Rewrite line without `- ` and parse as map at the correct indentation
      const indentStr = " ".repeat(indent);
      const colonPos = afterDash.indexOf(":");
      const key = afterDash.slice(0, colonPos).trim();
      const rest = afterDash.slice(colonPos);
      const synthetic = [indentStr + key + rest, ...lines.slice(i + 1)];
      const nested = parseMapBlock(synthetic, 0, indent);
      // nested.nextIndex is lines consumed from synthetic[0] onward
      result.push(nested.value);
      i = i + nested.nextIndex;
    } else if (afterDash.includes(":")) {
      // `- key: value` on a single line with no deeper fields
      const obj: Record<string, YamlValue> = parseKeyValue(afterDash);
      result.push(obj);
      i++;
    } else {
      // Plain scalar
      result.push(parseScalar(afterDash));
      i++;
    }
  }

  return { value: result, nextIndex: i };
}

/** Parse "key: value" from a string (single-line). */
function parseKeyValue(raw: string): Record<string, YamlValue> {
  const colonPos = raw.indexOf(":");
  const key = raw.slice(0, colonPos).trim();
  const val = raw.slice(colonPos + 1).trim();
  return { [key]: parseScalar(val) };
}

/** Check if a "- key: value" item has deeper nested fields. */
function isObjectArrayEntry(lines: string[], index: number, currentIndent: number): boolean {
  const current = lines[index]!;
  const afterDash = current.trim().slice(2).trim();
  if (!afterDash.includes(":")) return false;

  const next = peekLine(lines, index + 1, currentIndent + 1);
  if (next === null) return false;

  const nextTrimmed = next.line.trim();
  return nextTrimmed.includes(":") && !nextTrimmed.startsWith("- ");
}

/** Parse "key: value" pairs. Stops at array items or lines at shallower indentation. */
function parseMapBlock(lines: string[], startIndex: number, baseIndent: number): ParseResult {
  const result: Record<string, YamlValue> = {};
  let i = startIndex;

  while (i < lines.length) {
    const info = peekLine(lines, i, baseIndent);
    if (info === null) break;

    const { line, indent } = info;
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) break;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    if (key === "") {
      i++;
      continue;
    }

    const valueStr = trimmed.slice(colonIndex + 1).trim();

    if (valueStr === "") {
      const next = peekLine(lines, i + 1, indent + 1);
      if (next !== null) {
        const nested = parseBlock(lines, i + 1, indent + 2);
        result[key] = nested.value;
        i = nested.nextIndex;
        continue;
      }
      result[key] = "";
    } else {
      result[key] = parseScalar(valueStr);
    }
    i++;
  }

  return { value: result, nextIndex: i };
}

/** Get next non-empty, non-comment line at or beyond minIndent. */
function peekLine(lines: string[], index: number, minIndent: number): LineInfo | null {
  for (let j = index; j < lines.length; j++) {
    const raw = lines[j]!;
    const trimmed = raw.trimEnd();
    if (trimmed === "" || /^\s*#/.test(trimmed)) continue;
    const indent = raw.search(/\S/);
    if (indent < minIndent) return null;
    return { line: raw, indent, index: j };
  }
  return null;
}

/** Parse a scalar value: strings, numbers, booleans, null. */
function parseScalar(raw: string): YamlValue {
  let clean = raw;

  if (clean.startsWith('"') && clean.endsWith('"')) {
    return clean.slice(1, -1);
  }
  if (clean.startsWith("'") && clean.endsWith("'")) {
    return clean.slice(1, -1);
  }

  const commentIdx = clean.indexOf(" #");
  if (commentIdx >= 0) {
    clean = clean.slice(0, commentIdx).trim();
  }

  if (clean === "null" || clean === "~") return null;
  if (clean === "true") return true;
  if (clean === "false") return false;

  if (/^-?\d+(\.\d+)?$/.test(clean)) {
    const num = Number(clean);
    if (Number.isSafeInteger(num) || /\./.test(clean)) {
      return num;
    }
  }

  return clean;
}

// ── ManifestLoader ──────────────────────────────────────────

export class ManifestLoader {
  readonly #cache = new Map<string, Manifest>();

  /** Load from a manifest.yaml file path. Results cached by plugin name. */
  async loadFromFile(filePath: string): Promise<Manifest> {
    const content = await readFile(filePath, "utf-8");
    return this.loadFromString(content, filePath);
  }

  /** Parse and validate YAML string. */
  loadFromString(yamlContent: string, sourceHint?: string): Manifest {
    let raw: Record<string, unknown>;
    try {
      raw = parseYaml(yamlContent);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const prefix = sourceHint ? `[${sourceHint}] ` : "";
      throw new Error(`${prefix}YAML 解析失败: ${msg}`);
    }

    try {
      const manifest = validateManifest(raw);
      this.#cache.set(manifest.name, manifest);
      return manifest;
    } catch (err: unknown) {
      if (sourceHint && err instanceof Error) {
        throw new Error(`[${sourceHint}] 验证失败: ${err.message}`, {
          cause: err,
        });
      }
      throw err;
    }
  }

  /** Validate raw data without throwing or caching. */
  validate(raw: unknown): ValidationResult {
    return validateManifestSafe(raw);
  }

  /** Retrieve cached manifest by plugin name. */
  getCached(name: string): Manifest | undefined {
    return this.#cache.get(name);
  }

  /** Clear all cached manifests. */
  clearCache(): void {
    this.#cache.clear();
  }
}
