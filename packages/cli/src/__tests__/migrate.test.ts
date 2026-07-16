import { describe, it, expect } from 'vitest'
import { createProgram } from '../index.js'

describe('aude db:migrate', () => {
  it('completes successfully in normal mode with no migrations', async () => {
    // Arrange
    const program = createProgram()

    // Act & Assert - should not throw, should not call process.exit(1)
    // The mock DB returns empty migration history, so no migrations run
    await expect(
      program.parseAsync(['db:migrate'], { from: 'user' }),
    ).resolves.toBeDefined()
  })

  it('completes successfully in dry-run mode with no migrations', async () => {
    // Arrange
    const program = createProgram()

    // Act & Assert
    await expect(
      program.parseAsync(['db:migrate', '--dry-run'], { from: 'user' }),
    ).resolves.toBeDefined()
  })

  it('accepts --plugin option', async () => {
    // Arrange
    const program = createProgram()

    // Act & Assert
    await expect(
      program.parseAsync(['db:migrate', '--plugin', 'my-plugin'], { from: 'user' }),
    ).resolves.toBeDefined()
  })
})
