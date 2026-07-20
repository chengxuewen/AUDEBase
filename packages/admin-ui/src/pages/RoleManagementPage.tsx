import { useRef, useState } from "react";
import type { ActionType, ProColumns } from "@ant-design/pro-table";
import ProTable from "@ant-design/pro-table";
import { ModalForm, ProFormText } from "@ant-design/pro-form";
import { Button, message, Popconfirm, Badge } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { apiClient } from "../api/client";
import type { ApiListResponse, Role, CreateRoleRequest } from "@audebase/shared-types";

export default function RoleManagementPage() {
  const actionRef = useRef<ActionType>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const columns: ProColumns<Role>[] = [
    {
      title: "角色名称",
      dataIndex: "name",
      key: "name",
      width: 200,
    },
    {
      title: "标识",
      dataIndex: "slug",
      key: "slug",
      width: 150,
      ellipsis: true,
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      width: 300,
      ellipsis: true,
      render: (_, record) => record.description ?? "-",
    },
    {
      title: "类型",
      dataIndex: "is_system",
      key: "is_system",
      width: 80,
      render: (_, record) => (record.is_system ? <Badge status="processing" text="系统" /> : null),
    },
    {
      title: "操作",
      key: "actions",
      width: 100,
      render: (_, record) =>
        record.is_system ? null : (
          <Popconfirm
            title="确定要删除此角色吗？"
            onConfirm={() => void handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <a data-testid={`roles-delete-btn-${record.id}`} style={{ color: "#ff4d4f" }}>删除</a>
          </Popconfirm>
        ),
    },
  ];

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await apiClient.delete(`/roles/${id}`);
      message.success("角色已删除");
      void actionRef.current?.reload();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "删除失败";
      message.error(msg);
    }
  };

  const handleCreate = async (values: Record<string, unknown>): Promise<boolean> => {
    try {
      const body: CreateRoleRequest = {
        name: values.name as string,
        slug: values.slug as string,
        description: (values.description as string) || undefined,
        permission_ids: [],
      };
      await apiClient.post("/roles", body);
      message.success("角色创建成功");
      void actionRef.current?.reload();
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "创建失败";
      message.error(msg);
      return false;
    }
  };

  return (
    <>
      <ProTable<Role>
        data-testid="roles-table"
        actionRef={actionRef}
        columns={columns}
        rowKey="id"
        request={async (params) => {
          const { current, pageSize } = params;
          const res = await apiClient.get<ApiListResponse<Role>>("/roles", {
            page: current,
            pageSize,
          });
          return {
            data: res.data,
            success: true,
            total: res.meta.count,
          };
        }}
        search={false}
        headerTitle="角色管理"
        toolBarRender={() => [
          <Button
            data-testid="roles-create-btn"
            key="create"
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            新建角色
          </Button>,
        ]}
      />

      <ModalForm
        title="新建角色"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onFinish={handleCreate}
        modalProps={{ destroyOnClose: true }}
        submitter={{ submitButtonProps: { "data-testid": "roles-form-submit" } }}
      >
        <ProFormText
          data-testid="roles-form-name"
          name="name"
          label="角色名称"
          rules={[{ required: true, message: "请输入角色名称" }]}
        />
        <ProFormText
          name="slug"
          label="标识"
          rules={[
            { required: true, message: "请输入标识" },
            {
              pattern: /^[a-z][a-z0-9_]*$/,
              message: "标识必须为 snake_case 格式",
            },
          ]}
        />
        <ProFormText name="description" label="描述" />
      </ModalForm>
    </>
  );
}
