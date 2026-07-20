// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { generateBootstrapData } from '../bootstrap-data.js'

describe('generateBootstrapData', () => {
  it('应生成 admin 用户数据', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.adminUser).toBeDefined()
    expect(data.adminUser.username).toBe('admin')
    expect(data.adminUser.mustChangePassword).toBe(true)
    expect(data.adminUser.isActive).toBe(true)
    expect(data.adminUser.tokenVersion).toBe(0)
  })

  it('admin 密码应经过 bcrypt 哈希', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.adminUser.passwordHash).not.toBe('Admin@123')
    expect(data.adminUser.passwordHash).toMatch(/^\$2[aby]\$\d+\$/)
  })

  it('应生成 2 个系统角色（admin + member）', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.roles).toHaveLength(2)
    const slugs = data.roles.map(r => r.slug)
    expect(slugs).toContain('admin')
    expect(slugs).toContain('member')
    expect(data.roles.every(r => r.isSystem)).toBe(true)
  })

  it('应生成 5 个核心权限项', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.permissions.length).toBeGreaterThanOrEqual(5)
    const permIds = data.permissions.map(p => `${p.action}:${p.resource}`)
    expect(permIds).toContain('manage:plugin')
    expect(permIds).toContain('manage:user')
    expect(permIds).toContain('manage:role')
    expect(permIds).toContain('read:audit_log')
    expect(permIds).toContain('read:health')
  })

  it('admin 角色应拥有全部权限', () => {
    // Arrange & Act
    const data = generateBootstrapData()
    const adminRole = data.roles.find(r => r.slug === 'admin')!

    // Assert
    const adminPerms = data.rolePermissions
      .filter(rp => rp.roleId === adminRole.id)
    expect(adminPerms.length).toBe(data.permissions.length)
  })

  it('member 角色应拥有基础权限', () => {
    // Arrange & Act
    const data = generateBootstrapData()
    const memberRole = data.roles.find(r => r.slug === 'member')!

    // Assert - member 至少应有 read:health 权限
    const memberPerms = data.rolePermissions
      .filter(rp => rp.roleId === memberRole.id)
    expect(memberPerms.length).toBeGreaterThan(0)
  })

  it('admin 用户应关联 admin 角色', () => {
    // Arrange & Act
    const data = generateBootstrapData()
    const adminRole = data.roles.find(r => r.slug === 'admin')!

    // Assert
    const userRole = data.userRoles.find(
      ur => ur.userId === data.adminUser.id && ur.roleId === adminRole.id
    )
    expect(userRole).toBeDefined()
  })

  it('系统租户 tenant_id 应为 NULL（全局数据）', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert - 系统角色和权限应无租户限制
    expect(data.roles.every(r => r.tenantId === null)).toBe(true)
    expect(data.permissions.every(p => p.tenantId === null)).toBe(true)
  })

  it('生成的 UUID 应唯一', () => {
    // Arrange & Act
    const data1 = generateBootstrapData()
    const data2 = generateBootstrapData()

    // Assert - 每次调用生成新的 UUID
    expect(data1.adminUser.id).not.toBe(data2.adminUser.id)
  })

  it('应生成系统租户数据', () => {
    // Arrange & Act
    const data = generateBootstrapData()

    // Assert
    expect(data.systemTenant).toBeDefined()
    expect(data.systemTenant.slug).toBe('system')
    expect(data.systemTenant.status).toBe('active')
  })
})
