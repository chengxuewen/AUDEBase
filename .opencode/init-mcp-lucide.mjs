#!/usr/bin/env node
// License: MIT
// init-mcp-lucide.mjs — Lucide icons MCP startup wrapper (cross-platform)
// Auto-detects Node.js environment, installs deps, starts lucide-icons-mcp MCP server
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isWin = process.platform === 'win32'

// 1. Locate lucide-icons-mcp binary
const binName = isWin ? 'lucide-icons-mcp.cmd' : 'lucide-icons-mcp'
const bin = join(__dirname, 'node_modules', '.bin', binName)

// 2. Auto-install if missing
if (!existsSync(bin)) {
  console.error('[lucide-mcp] Installing lucide-icons-mcp...')
  execSync('pnpm add -D lucide-icons-mcp', { cwd: __dirname, stdio: 'inherit' })
}

// 3. Start MCP server (stdio inherited, opencode communicates via stdin/stdout)
const child = spawn(bin, ['--stdio'], { stdio: 'inherit' })
child.on('error', (err) => { console.error(err); process.exit(1) })
child.on('exit', (code) => process.exit(code ?? 1))