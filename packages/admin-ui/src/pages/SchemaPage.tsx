import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { Result } from "antd";
import SchemaTable from "../components/SchemaTable";
import type { CollectionDef } from "../components/types";

/**
 * Schema-driven CRUD page for dynamic collections.
 *
 * Phase 1a: uses hard-coded sample collection definitions.
 * Phase 2: fetches CollectionDef from schema-engine registry via API.
 */

// Sample collections for demo — Phase 2: replace with API call
const sampleCollections: CollectionDef[] = [
  {
    name: "orders",
    label: "订单",
    fields: [
      { name: "order_no", type: "string", label: "订单号", required: true },
      { name: "customer", type: "string", label: "客户名称", required: true },
      { name: "amount", type: "number", label: "金额", min: 0 },
      {
        name: "status",
        type: "enum",
        label: "状态",
        enumValues: ["待处理", "进行中", "已完成", "已取消"],
      },
      { name: "paid", type: "boolean", label: "已付款" },
      { name: "created_at", type: "datetime", label: "创建时间", readOnly: true },
    ],
    permissions: { canCreate: true, canUpdate: true, canDelete: true },
  },
  {
    name: "warehouses",
    label: "仓库",
    fields: [
      { name: "name", type: "string", label: "仓库名称", required: true },
      { name: "address", type: "string", label: "地址" },
      { name: "capacity", type: "number", label: "容量", min: 0 },
      { name: "active", type: "boolean", label: "启用" },
    ],
    permissions: { canCreate: true, canUpdate: true, canDelete: false },
  },
];

export default function SchemaPage() {
  const { collectionName } = useParams<{ collectionName: string }>();

  const collection = useMemo(
    () => sampleCollections.find((c) => c.name === collectionName),
    [collectionName],
  );

  if (!collection) {
    return (
      <Result status="404" title="集合未找到" subTitle={`集合 "${collectionName ?? ""}" 不存在`} />
    );
  }

  return <SchemaTable collection={collection} apiPrefix="/api" />;
}
