import { describe, it, expect } from 'vitest';
import type { CanonicalSnapshot, CanonicalRecord, CanonicalCollection } from './types';

describe('CanonicalSnapshot — type assertions', () => {
  // T1: CanonicalSnapshot structure
  it('has correct snapshot structure', () => {
    // Arrange
    const snap: CanonicalSnapshot = {
      version: '1.0',
      exportedAt: '2026-07-22T00:00:00.000Z',
      source: { platform: 'nocobase', version: '2.1.29' },
      collections: [
        { name: 'test', records: [{ id: '1', foo: 'bar' }] }
      ]
    };

    // Act
    const version = snap.version;
    const platform = snap.source.platform;
    const firstRecordId = snap.collections[0].records[0].id;

    // Assert
    expect(version).toBe('1.0');
    expect(platform).toBe('nocobase');
    expect(firstRecordId).toBe('1');
    expect(snap.collections).toHaveLength(1);
  });

  // T2: CanonicalRecord allows arbitrary fields
  it('allows arbitrary fields on records', () => {
    // Arrange
    const rec: CanonicalRecord = {
      id: 'x',
      extra: 42,
      nested: { a: 1, b: [1, 2, 3] },
      flag: true
    };

    // Act
    const extra = rec.extra;
    const nestedA = (rec.nested as Record<string, unknown>).a;

    // Assert
    expect(extra).toBe(42);
    expect(nestedA).toBe(1);
    expect(rec.id).toBe('x');
    expect(rec.flag).toBe(true);
  });

  // T3: CanonicalCollection empty records array
  it('handles empty records array', () => {
    // Arrange
    const coll: CanonicalCollection = { name: 'foo', records: [] };

    // Act
    const isEmpty = coll.records.length === 0;

    // Assert
    expect(coll.name).toBe('foo');
    expect(isEmpty).toBe(true);
    expect(Array.isArray(coll.records)).toBe(true);
  });
});
