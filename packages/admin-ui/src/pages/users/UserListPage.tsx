import { useState, type ReactNode } from 'react'
import { Button, Empty, Form, Input, message, Modal, Space, Spin, Switch, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { apiDelete, apiPost, apiPut } from '../../api/client.js'
import { useUsers } from './hooks/useUsers.js'

interface UserItem {
  id: string
  username: string
  is_active: boolean
  tenant_id: string | null
  created_at: string
}

interface PaginatedData<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

interface FormValues {
  username: string
  email: string
  display_name: string
}

export function UserListPage(): ReactNode {
  const { t } = useTranslation('client')
  const { data, isLoading, isError } = useUsers()
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserItem | null>(null)
  const [deletingUser, setDeletingUser] = useState<UserItem | null>(null)
  const [form] = Form.useForm<FormValues>()

  const openCreate = (): void => {
    setEditingUser(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (record: UserItem): void => {
    setEditingUser(record)
    form.setFieldsValue({
      username: record.username,
      email: '',
      display_name: record.username,
    })
    setModalOpen(true)
  }

  const handleDelete = (record: UserItem): void => {
    setDeletingUser(record)
  }

  const confirmDelete = (): void => {
    if (!deletingUser) return
    apiDelete(`/api/users/${deletingUser.id}`)
      .then(() => {
        void message.success('删除成功')
        void queryClient.invalidateQueries({ queryKey: ['@audebase/admin-ui', 'users'] })
        setDeletingUser(null)
      })
      .catch((e: unknown) => {
        void message.error(e instanceof Error ? e.message : '删除失败')
      })
  }

  const handleSubmit = async (): Promise<void> => {
    const values = await form.validateFields()
    try {
      if (editingUser) {
        await apiPut(`/api/users/${editingUser.id}`, values)
        void message.success('更新成功')
      } else {
        await apiPost('/api/users', values)
        void message.success('创建成功')
      }
      setModalOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['@audebase/admin-ui', 'users'] })
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

  const paginated = data as PaginatedData<UserItem> | undefined
  const list = paginated?.data ?? []

  const columns: ColumnsType<UserItem> = [
    { title: t('users.username'), dataIndex: 'username', key: 'username' },
    {
      title: t('users.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => <Switch checked={active} />,
    },
    { title: t('users.tenantId'), dataIndex: 'tenant_id', key: 'tenant_id' },
    {
      title: t('common.actions'),
      key: 'action',
      render: (_: unknown, record: UserItem) => (
        <Space>
          <Button size="small" autoInsertSpace={false} onClick={() => openEdit(record)}>
            {t('common.edit')}
          </Button>
          <Button size="small" autoInsertSpace={false} onClick={() => handleDelete(record)}>
            {t('common.delete')}
          </Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" autoInsertSpace={false} onClick={openCreate}>
          {t('common.createUser')}
        </Button>
      </div>
      {list.length === 0 ? (
        <Empty description={t('users.noData')} />
      ) : (
        <Table<UserItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
      )}
      <Modal
        title={editingUser ? t('common.edit') : t('common.createUser')}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="username" label={t('users.username')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="display_name" label="Display Name">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={t('common.confirm')}
        open={deletingUser !== null}
        onOk={confirmDelete}
        onCancel={() => setDeletingUser(null)}
      >
        <p>{deletingUser ? `${t('common.delete')}: ${deletingUser.username}?` : ''}</p>
      </Modal>
    </div>
  )
}
