import { z } from 'zod';

export const CanonicalRecordSchema = z.object({
  id: z.string(),
}).passthrough();

export const CanonicalCollectionSchema = z.object({
  name: z.string(),
  records: z.array(CanonicalRecordSchema),
});

export const CanonicalSnapshotSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  source: z.object({
    platform: z.literal('nocobase'),
    version: z.string().min(1),
  }),
  collections: z.array(CanonicalCollectionSchema).min(1),
});

// Derive TS types from Zod schemas (single source of truth)
export type CanonicalRecord = z.infer<typeof CanonicalRecordSchema>;
export type CanonicalCollection = z.infer<typeof CanonicalCollectionSchema>;
export type CanonicalSnapshot = z.infer<typeof CanonicalSnapshotSchema>;
