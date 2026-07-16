/**
 * Manifest validation and YAML parsing
 */
import { parse as parseYaml } from 'yaml'
import { manifestSchema, type Manifest } from './schema.js'
import { resolveDependencyOrder } from './resolver.js'

const PLUGIN_NAME_REGEX = /^@[a-z][a-z0-9-]*\/plugin-[\w-]+$/
const SEMVER_REGEX = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/
const VALID_PARTITIONS = ['SYSTEM', 'oa', 'erp', 'mes', 'isolated'] as const

export function validateManifest(manifest: unknown): Manifest {
  if (manifest === null || typeof manifest !== 'object') {
    throw new Error('VALIDATION_ERROR: input is not an object')
  }

  const obj = manifest as Record<string, unknown>

  // Check name format explicitly (NAME_FORMAT_ERROR)
  if (obj['name'] !== undefined && typeof obj['name'] === 'string' && !PLUGIN_NAME_REGEX.test(obj['name'])) {
    throw new Error(`NAME_FORMAT_ERROR: "${obj['name']}" does not match @scope/plugin-* format`)
  }

  // Check version format explicitly (VERSION_FORMAT_ERROR)
  if (
    obj['version'] !== undefined &&
    typeof obj['version'] === 'string' &&
    !SEMVER_REGEX.test(obj['version'])
  ) {
    throw new Error(`VERSION_FORMAT_ERROR: "${obj['version']}" is not valid SemVer`)
  }

  // Check runtime.mode (MODE_ERROR)
  if (
    obj['runtime'] !== undefined &&
    typeof obj['runtime'] === 'object' &&
    obj['runtime'] !== null
  ) {
    const runtime = obj['runtime'] as Record<string, unknown>
    if (runtime['mode'] !== undefined && runtime['mode'] !== 'inline') {
      throw new Error(`MODE_ERROR: runtime.mode "${String(runtime['mode'])}" is not valid (Phase 1a: inline only)`)
    }

    // Check partition (PARTITION_ERROR)
    if (
      runtime['partition'] !== undefined &&
      typeof runtime['partition'] === 'string' &&
      !VALID_PARTITIONS.includes(runtime['partition'] as (typeof VALID_PARTITIONS)[number])
    ) {
      throw new Error(
        `PARTITION_ERROR: partition "${runtime['partition']}" is not valid (must be one of: ${VALID_PARTITIONS.join(', ')})`,
      )
    }
  }

  // Run full Zod validation (VALIDATION_ERROR)
  const result = manifestSchema.safeParse(manifest)
  if (!result.success) {
    const errorMessages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
    throw new Error(`VALIDATION_ERROR: ${errorMessages}`)
  }

  return result.data
}

export function parseManifestYaml(yamlContent: string): Manifest {
  // Handle empty file
  if (yamlContent.trim() === '') {
    throw new Error('PARSE_ERROR: empty YAML content')
  }

  let parsed: unknown
  try {
    parsed = parseYaml(yamlContent)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`PARSE_ERROR: ${msg}`)
  }

  // null means empty YAML document
  if (parsed === null || parsed === undefined) {
    throw new Error('PARSE_ERROR: empty YAML document')
  }

  return validateManifest(parsed)
}

export function registerManifests(manifests: Manifest[]): Manifest[] {
  // Check for duplicate names
  const seen = new Set<string>()
  for (const m of manifests) {
    if (seen.has(m.name)) {
      throw new Error(`DUPLICATE_NAME: "${m.name}" appears multiple times`)
    }
    seen.add(m.name)
  }

  // Validate each manifest
  for (const m of manifests) {
    validateManifest(m)
  }

  // Resolve dependency order
  return resolveDependencyOrder(manifests)
}
