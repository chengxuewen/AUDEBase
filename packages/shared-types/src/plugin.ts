/**
 * 插件类型
 *
 * @audebase/shared-types
 */

/**
 * 插件状态枚举
 */
export type PluginStatus =
  | 'discovered'
  | 'installed'
  | 'loaded'
  | 'enabled'
  | 'disabled'
  | 'migration_failed'

/**
 * 插件运行时模式
 */
export type PluginRuntimeMode = 'inline' | 'process' | 'container'

/**
 * 插件信任分区
 */
export type PluginPartition = 'SYSTEM' | string

/**
 * 插件描述符（modules 表映射）
 */
export interface PluginDescriptor {
  id: string
  name: string // 包名，如 @audebase/plugin-core
  version: string // SemVer
  display_name: string
  state: PluginStatus
  category: string | null
  description: string | null
  author: string | null
  license: string | null
  dependencies: string[]
  runtime_mode: PluginRuntimeMode
  runtime_partition: PluginPartition
  auto_install: boolean
  installed_at: string | null
}

/**
 * Plugin alias for PluginDescriptor
 */
export type Plugin = PluginDescriptor
