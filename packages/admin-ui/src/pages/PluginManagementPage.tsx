import { useState, useCallback } from "react";
import ProTable, { type ProColumns } from "@ant-design/pro-table";
import { Badge, Button, Modal, Descriptions, Tag, Space } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import type { PluginDescriptor } from "@audebase/shared-types";

const STATUS_CONFIG: Record<string, { color: string; text: string }> = {
  enabled: { color: "green", text: "运行中" },
  loaded: { color: "blue", text: "已加载" },
  installed: { color: "cyan", text: "已安装" },
  discovered: { color: "geekblue", text: "已发现" },
  disabled: { color: "red", text: "已禁用" },
  migration_failed: { color: "orange", text: "迁移失败" },
};

// ponytail: static mock data — real plugin registry API not built yet
const MOCK_PLUGINS: PluginDescriptor[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "plugin-core",
    version: "0.1.0",
    display_name: "内核插件",
    state: "enabled",
    category: "SYSTEM",
    description: "平台核心引导插件，负责首次运行时创建 admin 用户、默认角色和系统租户",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: [],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "plugin-rbac",
    version: "0.1.0",
    display_name: "RBAC 权限引擎",
    state: "enabled",
    category: "SYSTEM",
    description: "基于角色的访问控制，支持角色管理、权限分配和 Record Rules",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "plugin-audit",
    version: "0.1.0",
    display_name: "审计日志",
    state: "loaded",
    category: "SYSTEM",
    description: "自动记录 API 写操作审计日志，支持按资源类型和时间范围查询",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: false,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "plugin-health-check",
    version: "0.1.0",
    display_name: "健康检查",
    state: "enabled",
    category: "SYSTEM",
    description: "提供 GET /health 和 /health/ready 端点，监控数据库和 Redis 连接状态",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: [],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    name: "plugin-i18n",
    version: "0.1.0",
    display_name: "国际化",
    state: "disabled",
    category: "SYSTEM",
    description: "多语言支持，预加载 zh-CN 和 en 翻译资源",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: false,
    installed_at: null,
  },
];

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
        dataSource={MOCK_PLUGINS}
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
