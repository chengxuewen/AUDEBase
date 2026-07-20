import { describe, it, expect } from 'vitest'
import { createProgram } from '../index.js'

describe('CLI program', () => {
  it('creates program with correct name and version', () => {
    // Arrange
    // Act
    const program = createProgram()

    // Assert
    expect(program.name()).toBe('aude')
    expect(program.version()).toBe('0.1.0')
  })

  it('registers all 13 commands', () => {
    // Arrange
    const program = createProgram()

    // Act
    const commands = program.commands.map((cmd) => cmd.name())

    // Assert
    expect(commands).toContain('dev')
    expect(commands).toContain('db:migrate')
    expect(commands).toContain('plugin:create')
    expect(commands).toContain('build')
    expect(commands).toContain('test')
    expect(commands).toContain('lint')
    expect(commands).toContain('plugin:list')
    expect(commands).toContain('plugin:info')
    expect(commands).toContain('plugin:enable')
    expect(commands).toContain('plugin:disable')
    expect(commands).toContain('plugin:upgrade')
    expect(commands).toContain('plugin:scaffold')
    expect(commands).toContain('doctor')
    expect(commands).toHaveLength(13)
  })

  it('outputs help text with AUDEBase description', () => {
    // Arrange
    const program = createProgram()

    // Act
    const helpText = program.helpInformation()

    // Assert
    expect(helpText).toContain('AUDEBase CLI')
    expect(helpText).toContain('Enterprise application platform')
  })

  it('dev command has --port and --inspect options', () => {
    // Arrange
    const program = createProgram()

    // Act
    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev')
    const optionFlags = devCmd?.options.map((opt) => opt.flags) ?? []

    // Assert
    expect(optionFlags).toContain('-p, --port <number>')
    expect(optionFlags).toContain('--inspect')
  })

  it('db:migrate command has --dry-run and --plugin options', () => {
    // Arrange
    const program = createProgram()

    // Act
    const migrateCmd = program.commands.find((cmd) => cmd.name() === 'db:migrate')
    const optionFlags = migrateCmd?.options.map((opt) => opt.flags) ?? []

    // Assert
    expect(optionFlags).toContain('--dry-run')
    expect(optionFlags).toContain('-p, --plugin <name>')
  })

  it('test command has --watch and --coverage options', () => {
    // Arrange
    const program = createProgram()

    // Act
    const testCmd = program.commands.find((cmd) => cmd.name() === 'test')
    const optionFlags = testCmd?.options.map((opt) => opt.flags) ?? []

    // Assert
    expect(optionFlags).toContain('-w, --watch')
    expect(optionFlags).toContain('--coverage')
  })
})
