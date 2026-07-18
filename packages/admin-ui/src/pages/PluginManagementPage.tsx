import { useState, useCallback } from "react";
import ProTable, { type ProColumns } from "@ant-design/pro-table";
import { Badge, Button, Modal, Descriptions, Tag, Space } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import type { PluginDescriptor, ApiListResponse } from "@audebase/shared-types";
import { apiClient } from "../api/client";

const STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  enabled: { color: "green", text: "运行中" },
  loaded: { color: "blue", text: "已加载" },
  installed: { color: "cyan", text: "已安装" },
  discovered: { color: "geekblue", text: "已发现" },
  disabled: { color: "red", text: "已禁用" },
  migration_failed: { color: "orange", text: "迁移失败" },
};

const CATEGORY_TAG_COLORS: Record<string, string> = {
  SYSTEM: "blue",
  oa: "green",
  erp: "orange",
  mes: "purple",
};

export default function PluginManagementPage() {
  const [selectedPlugin, setSelectedPlugin] = useState<PluginDescriptor | null>(null);

  const handleViewDetails = useCallback((plugin: PluginDescriptor) => {
    setSelectedPlugin(plugin);
  }, []);

  const columns: ProColumns<PluginDescriptor>[] = [
    {
      title: "插件名称",
      dataIndex: "name",
      key: "name",
      width: 200,
    },
    {
      title: "显示名称",
      dataIndex: "display_name",
      key: "display_name",
      width: 160,
    },
    {
      title: "版本",
      dataIndex: "version",
      key: "version",
      width: 100,
      search: false,
    },
    {
      title: "分类",
      dataIndex: "category",
      key: "category",
      width: 100,
      render: (_, record) => {
        const cat = record.category ?? "未知";
        return <Tag color={CATEGORY_TAG_COLORS[cat] ?? "default"}>{cat}</Tag>;
      },
    },
    {
      title: "状态",
      dataIndex: "state",
      key: "state",
      width: 100,
      render: (_, record) => {
        const cfg = STATUS_CONFIG[record.state] ?? {
          color: "default",
          text: record.state,
        };
        return (
          <Badge
            status={cfg.color as "success" | "processing" | "error" | "default" | "warning"}
            text={cfg.text}
          />
        );
      },
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      search: false,
      render: (_, record) => (
        <Button type="link" icon={<EyeOutlined />} onClick={() => handleViewDetails(record)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <ProTable<PluginDescriptor>
        headerTitle="插件管理"
        columns={columns}
        request={async (params) => {
          const { current, pageSize } = params;
          const res = await apiClient.get<ApiListResponse<PluginDescriptor>>("/plugins", {
            page: current,
            pageSize,
          });
          return {
            data: res.data,
            success: true,
            total: res.meta.count,
          };
        }}
        rowKey="id"
        search={{ labelWidth: "auto" }}
        pagination={{ pageSize: 10 }}
        options={false}
      />

      <Modal
        title="插件详情"
        open={selectedPlugin !== null}
        onCancel={() => setSelectedPlugin(null)}
        footer={null}
        width={640}
        destroyOnClose
      >
        {selectedPlugin !== null && (
          <Descriptions column={2} bordered size="small">
            <Descriptions.Item label="包名">{selectedPlugin.name}</Descriptions.Item>
            <Descriptions.Item label="显示名称">{selectedPlugin.display_name}</Descriptions.Item>
            <Descriptions.Item label="版本">{selectedPlugin.version}</Descriptions.Item>
            <Descriptions.Item label="分类">
              <Tag color={CATEGORY_TAG_COLORS[selectedPlugin.category ?? ""]}>
                {selectedPlugin.category ?? "-"}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              <Badge
                status={
                  (STATUS_CONFIG[selectedPlugin.state]?.color as
                    "success" | "processing" | "error" | "default" | "warning") ?? "default"
                }
                text={STATUS_CONFIG[selectedPlugin.state]?.text ?? selectedPlugin.state}
              />
            </Descriptions.Item>
            <Descriptions.Item label="作者">{selectedPlugin.author ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="许可证">{selectedPlugin.license ?? "-"}</Descriptions.Item>
            <Descriptions.Item label="运行模式">{selectedPlugin.runtime_mode}</Descriptions.Item>
            <Descriptions.Item label="信任分区">
              {selectedPlugin.runtime_partition}
            </Descriptions.Item>
            <Descriptions.Item label="自动安装">
              {selectedPlugin.auto_install ? "是" : "否"}
            </Descriptions.Item>
            <Descriptions.Item label="安装时间">
              {selectedPlugin.installed_at ?? "-"}
            </Descriptions.Item>
            <Descriptions.Item label="依赖" span={2}>
              {selectedPlugin.dependencies.length > 0 ? (
                <Space wrap>
                  {selectedPlugin.dependencies.map((dep) => (
                    <Tag key={dep}>{dep}</Tag>
                  ))}
                </Space>
              ) : (
                "无"
              )}
            </Descriptions.Item>
            <Descriptions.Item label="描述" span={2}>
              {selectedPlugin.description ?? "-"}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
