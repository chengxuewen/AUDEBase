#!/usr/bin/env node
// init-mcp-shadcn.mjs — shadcn/ui MCP startup wrapper (cross-platform)
// License: MIT
// Auto-installs and starts @jpisnice/shadcn-ui-mcp-server
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isWin = process.platform === 'win32'

// 1. Locate shadcn/ui MCP binary
const binName = isWin ? 'shadcn-mcp.cmd' : 'shadcn-mcp'
const bin = join(__dirname, 'node_modules', '.bin', binName)

// 2. Auto-install if missing
if (!existsSync(bin)) {
  console.error('[shadcn-mcp] Installing @jpisnice/shadcn-ui-mcp-server...')
  const usePnpm = existsSync(join(__dirname, 'pnpm-lock.yaml'))
  const installCmd = usePnpm
    ? 'pnpm add -D @jpisnice/shadcn-ui-mcp-server'
    : 'npm install -D @jpisnice/shadcn-ui-mcp-server'
  execSync(installCmd, { cwd: __dirname, stdio: 'inherit' })
}

// 3. Start MCP server
const child = spawn(bin, [], { stdio: 'inherit' })
child.on('error', (err) => { console.error(err); process.exit(1) })
child.on('exit', (code) => process.exit(code ?? 1))
