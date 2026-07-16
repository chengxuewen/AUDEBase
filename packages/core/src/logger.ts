import pino from 'pino'
import type { Writable } from 'node:stream'

export interface Logger {
  info(obj: object, msg: string): void
  error(obj: object, msg: string): void
  warn(obj: object, msg: string): void
  debug(obj: object, msg: string): void
  child(bindings: Record<string, unknown>): Logger
}

export interface LoggerOptions {
  level: string
  stream: Writable
}

export function createLogger(options: LoggerOptions): Logger {
  const pinoInstance = pino(
    {
      level: options.level,
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.stream,
  )

  return {
    info: (obj: object, msg: string) => pinoInstance.info(obj, msg),
    error: (obj: object, msg: string) => pinoInstance.error(obj, msg),
    warn: (obj: object, msg: string) => pinoInstance.warn(obj, msg),
    debug: (obj: object, msg: string) => pinoInstance.debug(obj, msg),
    child: (bindings: Record<string, unknown>): Logger => {
      const childInstance = pinoInstance.child(bindings)
      return {
        info: (obj: object, msg: string) => childInstance.info(obj, msg),
        error: (obj: object, msg: string) => childInstance.error(obj, msg),
        warn: (obj: object, msg: string) => childInstance.warn(obj, msg),
        debug: (obj: object, msg: string) => childInstance.debug(obj, msg),
        child: (b: Record<string, unknown>) => {
          const grandchild = childInstance.child(b)
          return wrapLogger(grandchild)
        },
      }
    },
  }
}

function wrapLogger(instance: pino.Logger): Logger {
  return {
    info: (obj: object, msg: string) => instance.info(obj, msg),
    error: (obj: object, msg: string) => instance.error(obj, msg),
    warn: (obj: object, msg: string) => instance.warn(obj, msg),
    debug: (obj: object, msg: string) => instance.debug(obj, msg),
    child: (b: Record<string, unknown>) => wrapLogger(instance.child(b)),
  }
}
