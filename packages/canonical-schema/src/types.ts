/** Single normalized record. `id` is required; all other fields are arbitrary. */
export interface CanonicalRecord {
  id: string;
  [field: string]: unknown;
}

/** A complete collection dataset — ordered list of records with a name. */
export interface CanonicalCollection {
  name: string;
  records: CanonicalRecord[];
}

/** Platform-agnostic data export snapshot.
 *
 * `version` is always '1.0' for Phase 1a.
 * `source.platform` indicates the originating system (e.g., 'nocobase').
 */
export interface CanonicalSnapshot {
  version: '1.0';
  exportedAt: string;                         // ISO 8601
  source: {
    platform: 'nocobase';
    version: string;                          // source platform version
  };
  collections: CanonicalCollection[];
}
