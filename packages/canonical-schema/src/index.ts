// Re-export both type-level interfaces and Zod runtime validators
export type {
  CanonicalRecord,
  CanonicalCollection,
  CanonicalSnapshot,
} from './types';

export {
  CanonicalRecordSchema,
  CanonicalCollectionSchema,
  CanonicalSnapshotSchema,
} from './schema';
