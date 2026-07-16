// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { containsDangerousOperation } from '../index.js'

describe('containsDangerousOperation', () => {
  it('应检测 DROP TABLE', () => {
    // Arrange
    const sql = 'DROP TABLE users;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  it('应检测 TRUNCATE TABLE', () => {
    // Arrange
    const sql = 'TRUNCATE TABLE audit_log;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  it('应检测 DROP DATABASE', () => {
    // Arrange
    const sql = 'DROP DATABASE audebase;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  it('应检测 DROP SCHEMA', () => {
    // Arrange
    const sql = 'DROP SCHEMA public CASCADE;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  it('正常 DDL 应通过: CREATE TABLE, ALTER TABLE, CREATE INDEX', () => {
    // Arrange
    const safeStatements = [
      'CREATE TABLE test (id UUID PRIMARY KEY);',
      'ALTER TABLE users ADD COLUMN phone VARCHAR(20);',
      'CREATE INDEX idx_users_email ON users(email);',
      'INSERT INTO users (name) VALUES (\'test\');',
      'UPDATE users SET active = true WHERE id = 1;',
    ]

    // Act & Assert
    for (const sql of safeStatements) {
      const result = containsDangerousOperation(sql)
      expect(result).toBe(false)
    }
  })

  it('大小写不敏感检测', () => {
    // Arrange
    const sql = 'drop table users;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  it('多语句中检测危险操作', () => {
    // Arrange
    const sql = `
      CREATE TABLE test (id UUID);
      INSERT INTO test VALUES (1);
      DROP TABLE old_table;
    `

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })
})
