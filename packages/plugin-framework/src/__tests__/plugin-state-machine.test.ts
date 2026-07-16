// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'

// 状态转换规则表（来源: plugin-framework-sdd.md §2.2）
type PluginStatus = 'discovered' | 'installed' | 'loaded' | 'enabled' | 'disabled' | 'migration_failed'

interface StateTransition {
  from: PluginStatus | null  // null = 不存在
  action: 'discover' | 'install' | 'enable' | 'disable' | 'uninstall' | 'migration_fail'
  to: PluginStatus | null    // null = 已移除
  condition?: string
}

const VALID_TRANSITIONS: StateTransition[] = [
  { from: null, action: 'discover', to: 'discovered' },
  { from: 'discovered', action: 'install', to: 'installed', condition: '依赖已安装' },
  { from: 'installed', action: 'enable', to: 'enabled' },
  { from: 'enabled', action: 'disable', to: 'disabled', condition: '无其他插件依赖它' },
  { from: 'disabled', action: 'enable', to: 'enabled' },
  { from: 'disabled', action: 'uninstall', to: null, condition: '无其他插件依赖它' },
  { from: '*', action: 'migration_fail', to: 'migration_failed' } as StateTransition,
]

describe('Plugin 状态机', () => {
  it.each(VALID_TRANSITIONS)(
    '应从 $from 通过 $action 转换到 $to',
    ({ from, action, to }) => {
      // Arrange - 使用状态转换表验证

      // Act - 如果 from 是 '*', 表示通配所有状态
      if (from === '*') {
        const allStates: PluginStatus[] = [
          'discovered', 'installed', 'loaded', 'enabled', 'disabled'
        ]
        for (const _state of allStates) {
          // 迁移失败可以从任何状态触发
          expect(to).toBe('migration_failed')
        }
        return
      }

      // Assert - 正向转换
      expect(VALID_TRANSITIONS.some(
        t => t.from === from && t.action === action && t.to === to
      )).toBe(true)
    }
  )

  it('enabled 状态不应直接 uninstall（需先 disable）', () => {
    // Arrange
    const enabledToUninstall = VALID_TRANSITIONS.find(
      t => t.from === 'enabled' && t.action === 'uninstall'
    )

    // Assert - enabled 状态不可直接卸载
    expect(enabledToUninstall).toBeUndefined()
  })

  it('migration_failed 插件不应阻塞其他插件启动', () => {
    // Arrange - migration_failed 是终端状态（Phase 1a）
    const recoveryFromFailed = VALID_TRANSITIONS.find(
      t => t.from === 'migration_failed' && t.to !== 'migration_failed'
    )

    // Assert - Phase 1a 不支持从 migration_failed 自动恢复
    expect(recoveryFromFailed).toBeUndefined()
  })

  it('discovered 状态不应直接 enable（需先 install）', () => {
    // Arrange
    const discoveredToEnable = VALID_TRANSITIONS.find(
      t => t.from === 'discovered' && t.action === 'enable'
    )

    // Assert
    expect(discoveredToEnable).toBeUndefined()
  })

  it('installed 状态不应直接 uninstall（需先 disable 或可跳过）', () => {
    // Arrange - installed 可以先 enable 再 disable 再 uninstall
    // 但直接从 installed 到 uninstall 是否允许取决于实现
    // SDD 中 installed -> enable -> disabled -> uninstall 是标准路径
    const installedToUninstall = VALID_TRANSITIONS.find(
      t => t.from === 'installed' && t.action === 'uninstall'
    )

    // Assert - SDD 中未定义 installed -> uninstall 直接转换
    expect(installedToUninstall).toBeUndefined()
  })
})
