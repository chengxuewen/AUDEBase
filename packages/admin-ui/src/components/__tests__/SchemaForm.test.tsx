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

describe("SchemaForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "new-id" }),
    } as Response);
  });

  it("renders trigger button", async () => {
    // Act
    renderCreateForm();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("新 建")).toBeDefined();
    });
  });

  it("opens modal with form fields on trigger click", async () => {
    // Arrange
    renderCreateForm();

    // Act — open modal by clicking trigger
    fireEvent.click(screen.getByText("新 建"));

    // Assert
    await waitFor(() => {
      expect(screen.getByText("产品名称")).toBeDefined();
      expect(screen.getByText("价格")).toBeDefined();
      expect(screen.getByText("启用")).toBeDefined();
      expect(screen.getByText("分类")).toBeDefined();
    });
  });

  it("renders edit modal title for edit mode", async () => {
    // Arrange
    renderEditForm();

    // Act
    fireEvent.click(screen.getByText("编 辑"));

    // Assert
    await waitFor(() => {
      expect(screen.getByText("编辑产品")).toBeDefined();
    });
  });

  it("submits POST for create mode", async () => {
    // Arrange
    const _onFinish = renderCreateForm();

    // Act — open modal
    fireEvent.click(screen.getByText("新 建"));
    await waitFor(() => {
      expect(screen.getByText("产品名称")).toBeDefined();
    });
    // Fill required field to pass validation
    const nameInput = document.querySelector("#name");
    if (nameInput) {
      fireEvent.change(nameInput, { target: { value: "测试产品" } });
    }

    // Submit the form
    const confirmBtn = screen.getByRole("button", { name: "确 认" });
    fireEvent.click(confirmBtn);

    // Assert
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/products",
          expect.objectContaining({ method: "POST" }),
        );
      },
      { timeout: 3000 },
    );
  });

  it("submits PATCH for edit mode", async () => {
    // Arrange
    const _onFinish2 = renderEditForm();

    // Act — open modal
    fireEvent.click(screen.getByText("编 辑"));
    await waitFor(() => {
      expect(screen.getByText("编辑产品")).toBeDefined();
    });

    const confirmBtn = screen.getByRole("button", { name: "确 认" });
    fireEvent.click(confirmBtn);

    // Assert
    await waitFor(
      () => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/products/p1",
          expect.objectContaining({ method: "PATCH" }),
        );
      },
      { timeout: 3000 },
    );
  });
});
