import { useRef } from "react";
import type { ProColumns, ActionType } from "@ant-design/pro-table";
import ProTable from "@ant-design/pro-table";
import { Button, message, Popconfirm } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { CollectionDef, FieldDef } from "./types";
import SchemaForm from "./SchemaForm";

interface PaginatedResponse {
  data: Record<string, unknown>[];
  meta: { total: number; page: number; pageSize: number };
}

function fieldToColumn(field: FieldDef): ProColumns<Record<string, unknown>> {
  const base: ProColumns<Record<string, unknown>> = {
    title: field.label ?? field.name,
    dataIndex: field.name,
    key: field.name,
    hideInSearch: true,
    hideInTable: field.hidden,
  };

  switch (field.type) {
    case "number":
      return { ...base, valueType: "digit" };
    case "boolean":
      return {
        ...base,
        valueType: "select",
        valueEnum: { true: { text: "是" }, false: { text: "否" } },
      };
    case "date":
      return { ...base, valueType: "date" };
    case "datetime":
      return { ...base, valueType: "dateTime" };
    case "email":
      return {
        ...base,
        render: (_, record) => {
          const val = record[field.name] as string | undefined;
          if (typeof val !== "string" || val.length === 0) return "-";
          return <a href={`mailto:${val}`}>{val}</a>;
        },
      };
    case "url":
      return {
        ...base,
        render: (_, record) => {
          const val = record[field.name] as string | undefined;
          if (typeof val !== "string" || val.length === 0) return "-";
          return (
            <a href={val} target="_blank" rel="noopener noreferrer">
              {val}
            </a>
          );
        },
      };
    case "enum":
      return {
        ...base,
        valueType: "select",
        valueEnum: Object.fromEntries((field.enumValues ?? []).map((v) => [v, { text: v }])),
      };
    case "json":
      return {
        ...base,
        render: (_, record) => {
          const val = record[field.name];
          if (val === undefined || val === null) return "-";
          return (
            <code style={{ fontSize: 12 }}>
              {JSON.stringify(val).slice(0, 60)}
              {JSON.stringify(val).length > 60 ? "…" : ""}
            </code>
          );
        },
      };
    case "string":
    case "text":
    default:
      // string, text, or unknown — plain text
      return { ...base, valueType: "text" };
  }
}

interface SchemaTableProps {
  collection: CollectionDef;
  apiPrefix: string;
}

export default function SchemaTable({ collection, apiPrefix }: SchemaTableProps) {
  const actionRef = useRef<ActionType>();
  const { permissions } = collection;
  const canCreate = permissions?.canCreate !== false;
  const canUpdate = permissions?.canUpdate !== false;
  const canDelete = permissions?.canDelete !== false;

  const columns: ProColumns<Record<string, unknown>>[] = [
    ...collection.fields.map(fieldToColumn),
    {
      title: "操作",
      key: "actions",
      valueType: "option",
      hideInSearch: true,
      render: (_, record) =>
        [
          canUpdate ? (
            <SchemaForm
              key="edit"
              collection={collection}
              apiPrefix={apiPrefix}
              mode="edit"
              record={record}
              onFinish={() => {
                void actionRef.current?.reload();
              }}
            />
          ) : null,
          canDelete ? (
            <Popconfirm
              onConfirm={() => {
                void (async () => {
                  try {
                    const res = await fetch(
                      `${apiPrefix}/${collection.name}/${record.id as string}`,
                      {
                        method: "DELETE",
                        headers: {
                          Authorization: `Bearer ${localStorage.getItem("aude_access_token") ?? ""}`,
                        },
                      },
                    );
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
                      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
                      void message.error(err.message ?? "删除失败");
                      return;
                    }
                    void message.success("删除成功");
                    void actionRef.current?.reload();
                  } catch {
                    void message.error("删除失败");
                  }
                })();
              }}
            >
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          ) : null,
        ].filter(Boolean),
    },
  ];

  return (
    <ProTable<Record<string, unknown>>
      actionRef={actionRef}
      columns={columns}
      rowKey="id"
      headerTitle={collection.label ?? collection.name}
      toolBarRender={() => [
        canCreate ? (
          <SchemaForm
            key="create"
            collection={collection}
            apiPrefix={apiPrefix}
            mode="create"
            onFinish={() => {
              void actionRef.current?.reload();
            }}
          >
            <Button type="primary" icon={<PlusOutlined />}>
              新建
            </Button>
          </SchemaForm>
        ) : null,
      ]}
      request={async (params) => {
        const { current, pageSize } = params;
        const page = current ?? 1;
        const size = pageSize ?? 20;

        const res = await fetch(`${apiPrefix}/${collection.name}?page=${page}&pageSize=${size}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem("aude_access_token") ?? ""}` },
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const json = (await res.json()) as PaginatedResponse;
        return {
          data: json.data,
          total: json.meta.total,
          success: true,
        };
      }}
      pagination={{ defaultPageSize: 20, showSizeChanger: true }}
    />
  );
}
