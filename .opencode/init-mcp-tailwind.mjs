#!/usr/bin/env node
// License: MIT
// init-mcp-tailwind.mjs — Tailwind CSS MCP startup wrapper (cross-platform)
import { execSync, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const isWin = process.platform === 'win32'

const PKG = '@clarity-contrib/tailwindcss-mcp-server'

// 1. Locate binary
const binName = isWin ? 'tailwindcss-server.cmd' : 'tailwindcss-server'
const bin = join(__dirname, 'node_modules', '.bin', binName)

// 2. Auto-install if missing
if (!existsSync(bin)) {
  console.error(`[tailwind-mcp] Installing ${PKG}...`)
  execSync(`pnpm add -D ${PKG}`, { cwd: __dirname, stdio: 'inherit' })
}

// 3. Start MCP server
const child = spawn(bin, [], { stdio: 'inherit' })
child.on('error', (err) => { console.error(err); process.exit(1) })
child.on('exit', (code) => process.exit(code ?? 1))