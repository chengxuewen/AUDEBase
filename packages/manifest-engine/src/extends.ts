/**
 * Plugin data model extension support (D12.1).
 *
 * Plugins declare `extends` in manifest.yaml to add fields to
 * collections defined by other plugins. The ExtendsResolver merges
 * all extension declarations and detects conflicts.
 */

/** A single field addition declared by an extending plugin. */
export interface FieldAddition {
  readonly name: string;
  readonly type: "string" | "number" | "boolean" | "date" | "belongsTo" | "hasMany";
  /** Target collection for relation types (belongsTo, hasMany). */
  readonly target?: string;
  readonly required?: boolean;
  readonly unique?: boolean;
}

/** An extends declaration from one plugin's manifest. */
export interface ExtendsDeclaration {
  /** The collection to extend. */
  readonly collection: string;
  /** Fields to add to the target collection. */
  readonly addFields: readonly FieldAddition[];
}

/** The merged result of extending a single collection. */
export interface MergeResult {
  readonly collection: string;
  /** All fields from all extending plugins. */
  readonly fields: readonly FieldAddition[];
  /** Plugins that contributed fields (for tracing). */
  readonly sources: readonly string[];
}

/** Error thrown on extension conflict. */
export class ExtendsError extends Error {
  constructor(
    message: string,
    public readonly code: "DUPLICATE_FIELD" | "TYPE_CONFLICT",
  ) {
    super(message);
    this.name = "ExtendsError";
  }
}

/**
 * Resolves and merges extends declarations from multiple plugins.
 *
 * Phase 1b: field-level merge with conflict detection.
 * Phase 2: integration with D3 Schema Engine for DB migration.
 */
export class ExtendsResolver {
  /**
   * Merge extends declarations into per-collection MergeResults.
   *
   * @param declarations - all extends declarations from loaded plugins.
   * @param sources - plugin names for each declaration (ordered same as declarations).
   * @throws ExtendsError on DUPLICATE_FIELD or TYPE_CONFLICT.
   */
  resolve(
    declarations: readonly ExtendsDeclaration[],
    sources: readonly string[] = [],
  ): readonly MergeResult[] {
    const merged = new Map<string, { fields: FieldAddition[]; sources: string[] }>();

    declarations.forEach((decl, index) => {
      const source = sources[index] ?? "unknown";
      this.mergeDeclaration(merged, decl, source);
    });

    return Array.from(merged.entries()).map(([collection, result]) => ({
      collection,
      fields: result.fields,
      sources: result.sources,
    }));
  }

  private mergeDeclaration(
    merged: Map<string, { fields: FieldAddition[]; sources: string[] }>,
    decl: ExtendsDeclaration,
    source: string,
  ): void {
    let entry = merged.get(decl.collection);
    if (!entry) {
      entry = { fields: [], sources: [] };
      merged.set(decl.collection, entry);
    }

    // Track source-declared field names to detect same-source duplicates.
    const sourceFields = new Set<string>();

    for (const field of decl.addFields) {
      // Same source declared the same field twice in one declaration.
      if (sourceFields.has(field.name)) {
        throw new ExtendsError(
          `Duplicate field "${field.name}" in collection "${decl.collection}" from plugin "${source}"`,
          "DUPLICATE_FIELD",
        );
      }
      sourceFields.add(field.name);

      const existing = entry.fields.find((f) => f.name === field.name);

      if (existing) {
        if (existing.type !== field.type) {
          throw new ExtendsError(
            `Type conflict for field "${field.name}" in collection "${decl.collection}": ` +
              `${existing.type} (from ${entry.sources.join(",")}) vs ${field.type}`,
            "TYPE_CONFLICT",
          );
        }
        // Same type, different plugin — allowed (deduplicated).
        continue;
      }

      entry.fields.push(field);
    }

    if (!entry.sources.includes(source)) {
      entry.sources.push(source);
    }
  }
}
