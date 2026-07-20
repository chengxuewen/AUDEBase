import { useState, type ReactNode } from 'react'
import { Button, Empty, Form, Input, message, Modal, Space, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiPost, apiPut } from '../../api/client.js'
import { useRoles } from './hooks/useRoles.js'

interface RoleItem {
  id: string
  name: string
  display_name: string
  permissions: unknown[]
  user_count: number
}

interface PaginatedData<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

interface FormValues {
  name: string
  slug: string
  description: string
}

export function RoleListPage(): ReactNode {
  const { t } = useTranslation('client')
  const { data, isLoading, isError } = useRoles()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null)
  const [deletingRole, setDeletingRole] = useState<RoleItem | null>(null)
  const [form] = Form.useForm<FormValues>()

  const openCreate = (): void => {
    setEditingRole(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: RoleItem): void => {
    setEditingRole(record)
    form.setFieldsValue({
      name: record.name,
      slug: record.name,
      description: record.display_name,
    })
    setModalOpen(true)
  }

  const handleDelete = (record: RoleItem): void => {
    setDeletingRole(record)
  }

  const confirmDelete = (): void => {
    if (!deletingRole) return
    apiDelete(`/api/roles/${deletingRole.id}`)
      .then(() => {
        void message.success('删除成功')
        void queryClient.invalidateQueries({ queryKey: ['@audebase/admin-ui', 'roles'] })
        setDeletingRole(null)
      })
      .catch((e: unknown) => {
        void message.error(e instanceof Error ? e.message : '删除失败')
      })
  }

  const handleSubmit = async (): Promise<void> => {
    const values = await form.validateFields()
    try {
      if (editingRole) {
        await apiPut(`/api/roles/${editingRole.id}`, values)
        void message.success('更新成功')
      } else {
        await apiPost('/api/roles', values)
        void message.success('创建成功')
      }
      setModalOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['@audebase/admin-ui', 'roles'] })
    } catch (e: unknown) {
      void message.error(e instanceof Error ? e.message : '操作失败')
    }
  }

  if (isLoading) {
    return <Spin />
  }

  if (isError) {
    return (
      <div>
        <p>{t('common.loadFailed')}</p>
        <Button autoInsertSpace={false}>{t('common.retry')}</Button>
      </div>
    )
  }

  const paginated = data as PaginatedData<RoleItem> | undefined
  const list = paginated?.data ?? []

  const columns: ColumnsType<RoleItem> = [
    { title: t('roles.name'), dataIndex: 'name', key: 'name' },
    { title: t('roles.displayName'), dataIndex: 'display_name', key: 'display_name' },
    { title: t('roles.userCount'), dataIndex: 'user_count', key: 'user_count' },
    {
      title: t('common.actions'),
      key: 'action',
      render: (_: unknown, record: RoleItem) => (
        <Space>
          <Button data-testid={`roles-edit-btn-${record.id}`} size="small" autoInsertSpace={false} onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
          <Button data-testid={`roles-delete-btn-${record.id}`} size="small" autoInsertSpace={false} onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button data-testid="roles-create-btn" type="primary" autoInsertSpace={false} onClick={openCreate}>
          {t('common.createRole')}
        </Button>
      </div>
      {list.length === 0 ? (
        <Empty description={t('roles.noData')} />
      ) : (
        <Table<RoleItem> data-testid="roles-table" rowKey="id" columns={columns} dataSource={list} pagination={false} />
      )}
      <Modal
        title={editingRole ? t('common.edit') : t('common.createRole')}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
        okButtonProps={{ "data-testid": "roles-form-submit" } as any}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label={t('roles.name')} rules={[{ required: true }]}>
            <Input data-testid="roles-form-name" />
          </Form.Item>
          <Form.Item name="slug" label={t('roles.slug')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('roles.description')}>
            <Input.TextArea />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('common.confirm')}
        open={deletingRole !== null}
        onOk={confirmDelete}
        onCancel={() => setDeletingRole(null)}
      >
        <p>{deletingRole ? `${t('common.delete')}: ${deletingRole.name}?` : ''}</p>
      </Modal>
    </div>
  )
}
