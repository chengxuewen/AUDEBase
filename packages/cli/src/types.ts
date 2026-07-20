// CLI command option types

export interface DevCommandOptions {
  readonly port?: string
  readonly inspect?: boolean
}

export interface MigrateCommandOptions {
  readonly dryRun?: boolean
  readonly plugin?: string
}

export interface TestCommandOptions {
  readonly watch?: boolean
  readonly coverage?: boolean
}
