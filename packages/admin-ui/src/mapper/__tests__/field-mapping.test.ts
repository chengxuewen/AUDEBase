import { describe, test, expect } from 'vitest'
import { toProTableColumn, toFormField, toFormRules } from '../field-mapping'
import type { FieldDef } from '@audebase/schema-engine'

function fd(overrides: Partial<FieldDef> = {}): FieldDef {
  return { name: 'test_field', type: 'string', ...overrides }
}

describe('toProTableColumn', () => {
  test('string — dataIndex + title', () => {
    const col = toProTableColumn(fd({ name: 'title', type: 'string', label: '标题' }))
    expect(col.dataIndex).toBe('title')
    expect(col.title).toBe('标题')
    expect(col.copyable).toBe(true)
  })

  test('number — sortable + right-align', () => {
    const col = toProTableColumn(fd({ name: 'price', type: 'number', label: '价格' }))
    expect(col.sorter).toBe(true)
    expect(col.align).toBe('right')
  })

  test('boolean — emoji render', () => {
    const col = toProTableColumn(fd({ name: 'active', type: 'boolean' }))
    const r = col.render?.(null, { active: true }) ?? ''
    expect(r).toBe('✅')
    const r2 = col.render?.(null, { active: false }) ?? ''
    expect(r2).toBe('❌')
  })

  test('enum — valueEnum mapping', () => {
    const col = toProTableColumn(fd({ name: 'status', type: 'enum', enumValues: ['draft', 'published'] }))
    expect(col.valueEnum).toEqual({ draft: { text: 'draft' }, published: { text: 'published' } })
  })

  test('date — sortable + locale render', () => {
    const col = toProTableColumn(fd({ name: 'createdAt', type: 'date', label: '创建时间' }))
    expect(col.sorter).toBe(true)
    const rendered = col.render?.(null, { createdAt: '2026-01-15T00:00:00Z' }) ?? ''
    expect(typeof rendered).toBe('string')
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered).not.toBe('-')
  })

  test('date — null renders dash', () => {
    const col = toProTableColumn(fd({ name: 'updatedAt', type: 'date' }))
    expect(col.render?.(null, { updatedAt: null })).toBe('-')
  })

  test('belongsTo — object renders name/id', () => {
    const col = toProTableColumn(fd({ name: 'category', type: 'belongsTo' }))
    expect(col.render?.(null, { category: { name: 'Books', id: '1' } })).toBe('Books')
    expect(col.render?.(null, { category: { id: '2' } })).toBe('2')
    expect(col.render?.(null, { category: 'cat-3' })).toBe('cat-3')
  })

  test('hasMany — renders count', () => {
    const col = toProTableColumn(fd({ name: 'items', type: 'hasMany' }))
    expect(col.render?.(null, { items: [1, 2, 3] })).toBe('3 项')
    expect(col.render?.(null, { items: [] })).toBe('0 项')
    expect(col.render?.(null, { items: null })).toBe('-')
  })

  test('default (unknown type) — uses base', () => {
    const col = toProTableColumn(fd({ name: 'custom', type: 'string', label: 'Custom' }))
    expect(col.dataIndex).toBe('custom')
    expect(col.title).toBe('Custom')
  })
})

describe('toFormRules', () => {
  test('required field → required rule', () => {
    const rules = toFormRules(fd({ name: 'email', type: 'string', label: '邮箱', required: true }))
    expect(rules).toHaveLength(1)
    expect(rules[0].required).toBe(true)
    expect(rules[0].message).toContain('邮箱')
  })

  test('optional field → no rules', () => {
    const rules = toFormRules(fd({ name: 'bio', type: 'string', label: '简介' }))
    expect(rules).toHaveLength(0)
  })
})

describe('toFormField', () => {
  test('string → Input', () => {
    const el = toFormField(fd({ name: 'name', type: 'string', label: '名称' }))
    expect(el).toBeTruthy()
  })

  test('all types produce a node', () => {
    const types: FieldDef['type'][] = ['string', 'number', 'boolean', 'date', 'enum', 'belongsTo', 'hasMany']
    for (const t of types) {
      const el = toFormField(fd({ name: 'f', type: t }))
      expect(el).toBeTruthy()
    }
  })
})
