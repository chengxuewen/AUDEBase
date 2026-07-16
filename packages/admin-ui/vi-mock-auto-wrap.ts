import type { Plugin } from 'vite'

/**
 * Wraps vi.mock factory return values so function properties become vi.fn().
 * In vitest 3.x, factory functions are not auto-wrapped, but tests rely on .mockReturnValue().
 * Strategy: wrap the factory body so its return value is auto-wrapped at call time.
 */
export function viMockAutoWrapPlugin(): Plugin {
  return {
    name: 'vi-mock-auto-wrap',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (!id.endsWith('.test.tsx') && !id.endsWith('.test.ts')) return null
      if (!code.includes('vi.mock(')) return null

      let result = code
      let modified = false

      // Find vi.mock('path', () => ({...})) and wrap the factory return
      // Transform: () => ({ a: () => ... }) into () => globalThis.__wrapMockResult({ a: () => ... })
      // This way __wrapMockResult is called lazily when the factory runs, not at hoist time
      
      const mockCallPattern = /vi\.mock\(/g
      while (true) {
        const match = mockCallPattern.exec(result)
        if (!match) break
        
        const startIdx = match.index
        let i = startIdx + match[0].length
        while (i < result.length && (result[i] === ' ' || result[i] === '\n' || result[i] === '\t')) i++
        
        // Skip the path string literal
        if (result[i] !== '\'' && result[i] !== '"' && result[i] !== '`') continue
        const quote = result[i]!
        i++
        while (i < result.length && result[i] !== quote) {
          if (result[i] === '\\') i++
          i++
        }
        i++
        
        // Skip whitespace + comma
        while (i < result.length && (result[i] === ' ' || result[i] === '\n' || result[i] === '\t')) i++
        if (result[i] !== ',') continue
        i++
        while (i < result.length && (result[i] === ' ' || result[i] === '\n' || result[i] === '\t')) i++
        
        // Check for arrow function factory: () => ({ or () => {
        const rest = result.slice(i)
        const arrowMatch = rest.match(/^\(\s*\)\s*=>\s*/)
        if (!arrowMatch) continue
        
        const arrowEnd = i + arrowMatch[0].length
        const afterArrow = result.slice(arrowEnd)
        
        // Case 1: () => ({...})  - parenthesized object
        if (afterArrow.match(/^\(\s*\{/)) {
          // Find matching ) for the outer paren
          let depth = 0
          let j = arrowEnd
          let inStr: string | null = null
          while (j < result.length) {
            const ch = result[j]!
            if (inStr) {
              if (ch === inStr && result[j - 1] !== '\\') inStr = null
            } else {
              if (ch === '"' || ch === "'" || ch === '`') inStr = ch
              else if (ch === '(' || ch === '{' || ch === '[') depth++
              else if (ch === ')' || ch === '}' || ch === ']') {
                depth--
                if (depth === 0) { j++; break }
              }
            }
            j++
          }
          // Wrap: insert globalThis.__wrapMockResult( after => and ) before the closing
          result = result.slice(0, arrowEnd) + 'globalThis.__wrapMockResult(' + result.slice(arrowEnd, j - 1) + ')' + result.slice(j - 1)
          modified = true
        }
        // Case 2: () => { return {...} }
        else if (afterArrow.match(/^\{/)) {
          // Find the return statement and wrap it
          // Simpler: just wrap the entire factory body
          // () => { return {...} } -> () => { return globalThis.__wrapMockResult({...}) }
          // For now, skip this case as our tests use () => ({...})
        }
        
        mockCallPattern.lastIndex = arrowEnd
      }
      
      if (!modified) return null
      return result
    },
  }
}
