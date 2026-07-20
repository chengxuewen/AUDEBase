import { z } from 'zod'

interface ContractOptions {
  response: z.ZodSchema
  status: number
}

// ponytail: placeholder - will use app.inject when Fastify is set up
export async function validateContract(
  method: string,
  url: string,
  options: ContractOptions,
): Promise<void> {
  throw new Error('validateContract not yet implemented - Phase 1a Week 0')
}

export type { ContractOptions }
