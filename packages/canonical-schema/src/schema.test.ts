import { describe, it, expect } from 'vitest';
import { CanonicalSnapshotSchema } from './schema';

describe('CanonicalSnapshotSchema — Zod validation', () => {
  const validSnapshot = {
    version: '1.0',
    exportedAt: '2026-07-22T10:30:00.000Z',
    source: { platform: 'nocobase', version: '2.1.29' },
    collections: [
      { name: 'devices', records: [{ id: 'd1', name: 'Printer A', serialNumber: 'SN-001' }] },
      { name: 'materials', records: [{ id: 'm1', name: 'PLA Black', type: 'PLA' }] }
    ]
  };

  // T4: valid snapshot passes Zod validation
  it('validates a correct snapshot', () => {
    // Arrange — validSnapshot defined above

    // Act
    const result = CanonicalSnapshotSchema.safeParse(validSnapshot);

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('1.0');
      expect(result.data.collections).toHaveLength(2);
    }
  });

  // T5: invalid snapshot rejected with detailed errors
  it('rejects invalid snapshot with detail errors', () => {
    // Arrange
    const invalid = {
      version: '2.0',                                // invalid — only '1.0' allowed
      exportedAt: 'not-a-date',                       // invalid — not ISO 8601
      source: { platform: 'unknown', version: '' },   // invalid — platform not 'nocobase'
      collections: 'not-an-array'                     // invalid — should be array
    };

    // Act
    const result = CanonicalSnapshotSchema.safeParse(invalid);

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      const pathMessages = result.error.issues.map(
        i => `${i.path.join('.')}: ${i.message}`
      );
      expect(pathMessages).toContainEqual(expect.stringContaining('version'));
      expect(pathMessages).toContainEqual(expect.stringContaining('exportedAt'));
      expect(pathMessages).toContainEqual(expect.stringContaining('source'));
      expect(pathMessages).toContainEqual(expect.stringContaining('collections'));
    }
  });
});
