import { useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-table";
import ProTable from "@ant-design/pro-table";
import { ModalForm, ProFormText, ProFormSelect, ProFormSwitch } from "@ant-design/pro-form";
import { Button, message, Popconfirm, Badge, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { apiClient } from "../api/client";
import type {
  ApiListResponse,
  User,
  CreateUserRequest,
  UpdateUserRequest,
} from "@audebase/shared-types";

interface UserSearchParams {
  username?: string;
  email?: string;
}

const localeOptions = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en", label: "English" },
];

export default function UserManagementPage() {
  const actionRef = useRef<ActionType>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const columns: ProColumns<User>[] = [
    {
      title: "用户名",
      dataIndex: "username",
      key: "username",
      width: 150,
    },
    {
      title: "显示名称",
      dataIndex: "display_name",
      key: "display_name",
      width: 150,
      ellipsis: true,
    },
    {
      title: "邮箱",
      dataIndex: "email",
      key: "email",
      width: 200,
      ellipsis: true,
    },
    {
      title: "状态",
      dataIndex: "is_active",
      key: "is_active",
      width: 100,
      render: (_, record) => (
        <Badge
          status={record.is_active ? "success" : "error"}
          text={record.is_active ? "启用" : "禁用"}
        />
      ),
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 180,
      valueType: "dateTime",
    },
    {
      title: "操作",
      key: "actions",
      width: 160,
      render: (_, record) => (
        <Space>
          <a
            onClick={() => {
              setCurrentUser(record);
              setEditOpen(true);
            }}
          >
            编辑
          </a>
          <Popconfirm
            title="确定要删除此用户吗？"
            onConfirm={() => void handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <a style={{ color: "#ff4d4f" }}>删除</a>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await apiClient.delete(`/users/${id}`);
      message.success("用户已删除");
      void actionRef.current?.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "删除失败";
      message.error(msg);
    }
  };

  const handleCreate = async (values: Record<string, unknown>): Promise<boolean> => {
    try {
      const body: CreateUserRequest = {
        username: values.username as string,
        password: values.password as string,
        email: (values.email as string) || undefined,
        display_name: (values.display_name as string) || undefined,
        role_ids: [],
      };
      await apiClient.post("/users", body);
      message.success("用户创建成功");
      void actionRef.current?.reload();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "创建失败";
      message.error(msg);
      return false;
    }
  };

  const handleEdit = async (values: Record<string, unknown>): Promise<boolean> => {
    if (currentUser === null) return false;
    try {
      const body: UpdateUserRequest = {
        display_name: (values.display_name as string) || undefined,
        email: (values.email as string) || undefined,
        locale: values.locale as string | undefined,
        is_active: values.is_active as boolean | undefined,
      };
      await apiClient.patch(`/users/${currentUser.id}`, body);
      message.success("用户更新成功");
      void actionRef.current?.reload();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "更新失败";
      message.error(msg);
      return false;
    }
  };

  return (
    <>
      <ProTable<User, UserSearchParams>
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        request={async (params) => {
          const { current, pageSize, username, email } = params;
          const res = await apiClient.get<ApiListResponse<User>>("/users", {
            page: current,
            pageSize,
            username,
            email,
          });
          return {
            data: res.data,
            success: true,
            total: res.meta.count,
          };
        }}
        search={{ labelWidth: "auto" }}
        headerTitle="用户管理"
        toolBarRender={() => [
          <Button
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            新建用户
          </Button>,
        ]}
      />

      <ModalForm
        title="新建用户"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onFinish={handleCreate}
        modalProps={{ destroyOnClose: true }}
      >
        <ProFormText
          name="username"
          label="用户名"
          rules={[{ required: true, message: "请输入用户名" }]}
        />
        <ProFormText
          name="email"
          label="邮箱"
          rules={[{ type: "email", message: "请输入有效的邮箱地址" }]}
        />
        <ProFormText.Password
          name="password"
          label="密码"
          rules={[{ required: true, message: "请输入密码" }]}
        />
        <ProFormText name="display_name" label="显示名称" />
      </ModalForm>

      <ModalForm
        title="编辑用户"
        open={editOpen}
        onOpenChange={setEditOpen}
        onFinish={handleEdit}
        initialValues={currentUser ?? undefined}
        modalProps={{ destroyOnClose: true }}
      >
        <ProFormText name="display_name" label="显示名称" />
        <ProFormText
          name="email"
          label="邮箱"
          rules={[{ type: "email", message: "请输入有效的邮箱地址" }]}
        />
        <ProFormSelect name="locale" label="语言" options={localeOptions} />
        <ProFormSwitch name="is_active" label="启用" />
      </ModalForm>
    </>
  );
}
