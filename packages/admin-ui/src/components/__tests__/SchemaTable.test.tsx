import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import SchemaTable from "../SchemaTable";
import type { CollectionDef } from "../types";

// Mock global fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch as typeof globalThis.fetch;

const sampleCollection: CollectionDef = {
  name: "products",
  label: "产品",
  fields: [
    { name: "id", type: "string", label: "ID", readOnly: true },
    { name: "name", type: "string", label: "产品名称", required: true, maxLength: 100 },
    { name: "price", type: "number", label: "价格" },
    { name: "active", type: "boolean", label: "启用" },
    { name: "created_at", type: "datetime", label: "创建时间", readOnly: true },
  ],
  permissions: { canCreate: true, canUpdate: true, canDelete: true },
};

const mockApiResponse = {
  data: [
    { id: "p1", name: "产品A", price: 100, active: true, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "p2", name: "产品B", price: 200, active: false, created_at: "2026-01-02T00:00:00.000Z" },
  ],
  meta: { total: 2, page: 1, pageSize: 20 },
};

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  localStorage.setItem("aude_access_token", "test-token");

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/schema/products"]}>
        <SchemaTable collection={sampleCollection} apiPrefix="/api" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SchemaTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockApiResponse,
    } as Response);
  });

  it("renders header title from collection label", async () => {
    // Act
    renderWithProviders();

    // Assert — ProTable headerTitle is rendered in multiple places
    await waitFor(() => {
      expect(screen.getAllByText("产品").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders column headers from field labels", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(screen.getAllByText("产品名称").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("价格").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("启用").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders create button when canCreate is true", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("新建")).toBeDefined();
    });
  });

  it("calls fetch with correct API path", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/products"),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        }),
      );
    });
  });

  it("renders table data after fetch", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("产品A")).toBeDefined();
      expect(screen.getByText("产品B")).toBeDefined();
    });
  });
});
