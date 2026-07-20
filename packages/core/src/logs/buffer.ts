/**
 * In-memory ring buffer for recent log entries.
 *
 * Keeps the last N entries; oldest evicted as new ones arrive.
 * Used by GET /api/logs to surface recent server logs.
 *
 * @audebase/core
 */

export interface LogEntry {
  readonly timestamp: string
  readonly level: string
  readonly msg: string
  readonly requestId?: string
}

export class LogBuffer {
  private readonly capacity: number
  private readonly entries: LogEntry[] = []

  constructor(capacity = 100) {
    this.capacity = capacity
  }

  push(entry: LogEntry): void {
    this.entries.push(entry)
    if (this.entries.length > this.capacity) {
      this.entries.shift()
    }
  }

  /** Returns newest-first snapshot of the buffer. */
  snapshot(): LogEntry[] {
    return this.entries.slice().reverse()
  }

  clear(): void {
    this.entries.length = 0
  }

  get size(): number {
    return this.entries.length
  }
}

/**
 * Module-level singleton shared between logger stream and API route.
 * The other agent wires this into CoreApp via a pino custom stream.
 */
export const globalLogBuffer = new LogBuffer(100)
