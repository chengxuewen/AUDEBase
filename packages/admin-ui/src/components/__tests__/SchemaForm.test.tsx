import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Button } from "antd";
import SchemaForm from "../SchemaForm";
import type { CollectionDef } from "../types";

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof globalThis.fetch;

const sampleCollection: CollectionDef = {
  name: "products",
  label: "产品",
  fields: [
    { name: "name", type: "string", label: "产品名称", required: true, maxLength: 100 },
    { name: "price", type: "number", label: "价格", min: 0 },
    { name: "active", type: "boolean", label: "启用" },
    { name: "category", type: "enum", label: "分类", enumValues: ["电子产品", "服装", "食品"] },
  ],
  permissions: { canCreate: true },
};

const editRecord = { id: "p1", name: "产品A", price: 100, active: true, category: "电子产品" };

function renderCreateForm(onFinish = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  localStorage.setItem("aude_access_token", "test-token");

  return {
    onFinish,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SchemaForm
            collection={sampleCollection}
            apiPrefix="/api"
            mode="create"
            onFinish={onFinish}
          >
            <Button>新建</Button>
          </SchemaForm>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

function renderEditForm(onFinish = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  localStorage.setItem("aude_access_token", "test-token");

  return {
    onFinish,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <SchemaForm
            collection={sampleCollection}
            apiPrefix="/api"
            mode="edit"
            record={editRecord}
            onFinish={onFinish}
          >
            <Button>编辑</Button>
          </SchemaForm>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe.skip("SchemaForm");
