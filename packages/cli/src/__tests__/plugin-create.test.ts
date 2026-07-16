import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rm, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { runPluginCreate } from '../commands/plugin-create.js'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'

function makeTempDir(): string {
  return join(tmpdir(), `aude-test-${randomUUID()}`)
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('aude plugin:create', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('creates directory structure with manifest.yaml and package.json', async () => {
    // Arrange
    const pluginName = 'my-plugin'

    // Act
    await runPluginCreate(pluginName, tempDir)

    // Assert
    const pluginDir = join(tempDir, 'plugins', pluginName)
    expect(await pathExists(join(pluginDir, 'manifest.yaml'))).toBe(true)
    expect(await pathExists(join(pluginDir, 'package.json'))).toBe(true)
    expect(await pathExists(join(pluginDir, 'src', 'index.ts'))).toBe(true)
    expect(await pathExists(join(pluginDir, 'migrations'))).toBe(true)
    expect(await pathExists(join(pluginDir, 'locale'))).toBe(true)
  })

  it('writes correct plugin name in manifest.yaml', async () => {
    // Arrange
    const pluginName = 'erp-inventory'

    // Act
    await runPluginCreate(pluginName, tempDir)

    // Assert
    const manifestPath = join(tempDir, 'plugins', pluginName, 'manifest.yaml')
    const manifest = await readFile(manifestPath, 'utf-8')
    expect(manifest).toContain('@audebase/plugin-erp-inventory')
    expect(manifest).toContain('Erp Inventory')
  })

  it('writes correct package.json with workspace dependencies', async () => {
    // Arrange
    const pluginName = 'simple'

    // Act
    await runPluginCreate(pluginName, tempDir)

    // Assert
    const pkgPath = join(tempDir, 'plugins', pluginName, 'package.json')
    const pkgContent = await readFile(pkgPath, 'utf-8')
    const pkg = JSON.parse(pkgContent) as { name: string; dependencies: Record<string, string> }
    expect(pkg.name).toBe('@audebase/plugin-simple')
    expect(pkg.dependencies['@audebase/shared-types']).toBe('workspace:*')
    expect(pkg.dependencies['@audebase/core']).toBe('workspace:*')
  })

  it('writes src/index.ts with Plugin class', async () => {
    // Arrange
    const pluginName = 'hello-world'

    // Act
    await runPluginCreate(pluginName, tempDir)

    // Assert
    const entryPath = join(tempDir, 'plugins', pluginName, 'src', 'index.ts')
    const entry = await readFile(entryPath, 'utf-8')
    expect(entry).toContain('PluginHelloWorld')
    expect(entry).toContain('@audebase/plugin-hello-world')
    expect(entry).toContain('implements Plugin')
  })

  it('throws error for invalid plugin name with uppercase', async () => {
    // Arrange
    const invalidName = 'MyPlugin'

    // Act & Assert
    await expect(runPluginCreate(invalidName, tempDir)).rejects.toThrow('Invalid plugin name')
  })

  it('throws error for invalid plugin name with special chars', async () => {
    // Arrange
    const invalidName = 'my_plugin!'

    // Act & Assert
    await expect(runPluginCreate(invalidName, tempDir)).rejects.toThrow('Invalid plugin name')
  })

  it('throws error when plugin directory already exists', async () => {
    // Arrange
    const pluginName = 'exists'
    await runPluginCreate(pluginName, tempDir)

    // Act & Assert
    await expect(runPluginCreate(pluginName, tempDir)).rejects.toThrow('already exists')
  })
})
