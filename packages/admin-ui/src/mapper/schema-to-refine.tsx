import type { CollectionDef, FieldDef } from '@audebase/schema-engine'
import { useTable, useForm, useModal } from '@refinedev/antd'
import { useNavigate } from 'react-router-dom'
import type { ProColumns } from '@ant-design/pro-table'
import { ProTable } from '@ant-design/pro-table'
import React from 'react'
import { Button, Modal, Form, Space } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { toProTableColumn, toFormField, toFormRules } from './field-mapping.js'

// ponytail: Row alias avoids shadowing built-in Record<K,V>
type Row = Record<string, unknown>

interface PageComponents {
  List: React.FC
  Create: React.FC
  Edit: React.FC<{ id?: string }>
}

/**
 * Map a CollectionDef (from @audebase/schema-engine) to a Refine-powered
 * CRUD page set: List (ProTable + useTable), Create (Modal + useForm),
 * Edit (Modal + useForm with id).
 */
export function mapCollectionToRefine(collection: CollectionDef): PageComponents {
  const fields: readonly FieldDef[] = collection.fields ?? []
  const resourceName: string = collection.name
  const displayName: string = collection.table ?? collection.name

  const columns: ProColumns<Row>[] = fields.map((f: FieldDef) => ({
    ...toProTableColumn(f),
    key: f.name,
  }))

  // ── List ──────────────────────────────────────────────────────────────

  function List() {
    const navigate = useNavigate()
    const { tableProps } = useTable({
      resource: resourceName,
      pagination: { pageSize: 20 },
    })

    const handleCreate = (): void => {
      navigate(`/${resourceName}/create`)
    }

    return (
      <ProTable<Row>
        {...tableProps}
        rowKey="id"
        columns={columns}
        search={false}
        options={false}
        toolBarRender={() => [
          <Button key="create" type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建{displayName}
          </Button>,
        ]}
        headerTitle={displayName}
        pagination={
          tableProps.pagination !== false
            ? ({ ...tableProps.pagination, showSizeChanger: true })
            : false
        }
      />
    )
  }

  // ── Create ────────────────────────────────────────────────────────────

  function Create() {
    const { show, close, modalProps } = useModal()
    const { onFinish } = useForm({
      resource: resourceName,
      action: 'create' as const,
      redirect: false,
      onMutationSuccess: () => close(),
    })

    return (
      <>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => show()}>
          新建{displayName}
        </Button>
        <Modal {...modalProps} title={`新建${displayName}`} footer={null} destroyOnClose>
          <Form onFinish={onFinish} layout="vertical">
            {fields.map((field: FieldDef) => (
              <Form.Item key={field.name} name={field.name} label={field.label || field.name} rules={toFormRules(field)}>
                {toFormField(field)}
              </Form.Item>
            ))}
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit">
                  保存
                </Button>
                <Button onClick={() => close()}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </>
    )
  }

  // ── Edit ──────────────────────────────────────────────────────────────

  function Edit({ id }: { id?: string }) {
    const { show, close, modalProps } = useModal()
    const formHook = useForm({
      resource: resourceName,
      action: 'edit' as const,
      ...(id !== undefined ? { id } : {}),
      redirect: false,
      onMutationSuccess: () => close(),
    })

    return (
      <>
        <Button onClick={() => show()}>编辑</Button>
        <Modal {...modalProps} title={`编辑${displayName}`} footer={null} destroyOnClose>
          <Form {...formHook.formProps} layout="vertical">
            {fields.map((field: FieldDef) => (
              <Form.Item key={field.name} name={field.name} label={field.label || field.name} rules={toFormRules(field)}>
                {toFormField(field)}
              </Form.Item>
            ))}
            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={formHook.formLoading}>
                  保存
                </Button>
                <Button onClick={() => close()}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Modal>
      </>
    )
  }

  return { List, Create, Edit }
}
