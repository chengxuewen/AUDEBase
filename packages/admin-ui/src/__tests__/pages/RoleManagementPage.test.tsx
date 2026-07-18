import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RoleManagementPage from "../../pages/RoleManagementPage";
import { AuthProvider } from "../../auth/AuthContext";
import { apiClient } from "../../api/client";

// --- Mock apiClient ---
vi.mock("../../api/client", () => {
  const getMock = vi.fn();
  const postMock = vi.fn();
  const deleteMock = vi.fn();
  const setTokenMock = vi.fn();
  const getTokenMock = vi.fn(() => "test-token");

  class MockApiClient {
    get = getMock;
    post = postMock;
    delete = deleteMock;
    setToken = setTokenMock;
    getToken = getTokenMock;
  }

  return {
    apiClient: new MockApiClient(),
    ApiClient: MockApiClient,
    __mocks: { getMock, postMock, deleteMock },
  };
});

const mocks = apiClient as unknown as Record<string, unknown> & {
  get: ReturnType<typeof vi.fn>;
} as {
  get: ReturnType<typeof vi.fn>;
};

const mockRoles = [
  {
    id: "role-1",
    tenant_id: null,
    name: "管理员",
    slug: "admin",
    description: "系统管理员角色",
    is_system: true,
    permissions: [],
    user_count: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "role-2",
    tenant_id: "t1",
    name: "编辑者",
    slug: "editor",
    description: "内容编辑角色",
    is_system: false,
    permissions: [],
    user_count: 3,
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
];

const mockApiResponse = {
  data: mockRoles,
  meta: { count: 2, page: 1, pageSize: 20, totalPages: 1 },
};

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  localStorage.setItem("aude_access_token", "test-token");
  localStorage.setItem(
    "aude_user",
    JSON.stringify({
      id: "u1",
      tenant_id: "t1",
      username: "admin",
      display_name: "管理员",
      must_change_password: false,
      roles: ["admin"],
    }),
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/roles"]}>
        <AuthProvider>
          <RoleManagementPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RoleManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(mockApiResponse);
  });

  it("renders the header title", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("角色管理")).toBeDefined();
    });
  });

  it("renders create role button", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("新建角色")).toBeDefined();
    });
  });

  it("calls API to load roles and renders table", async () => {
    // Act
    renderWithProviders();

    // Assert — wait for data to load
    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledWith(
        "/roles",
        expect.objectContaining({ page: expect.any(Number) }),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("管理员")).toBeDefined();
      expect(screen.getByText("编辑者")).toBeDefined();
    });
  });

  it("renders correct table column headers", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(screen.getAllByText("角色名称").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("标识").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("描述").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("类型").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("操作").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows system badge for system roles", async () => {
    // Act
    renderWithProviders();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("系统")).toBeDefined();
    });
  });

  it("does not show delete button for system roles", async () => {
    // Act
    renderWithProviders();

    // Assert — system role (管理员) has no delete button, editor role does
    await waitFor(() => {
      expect(screen.getByText("编辑者")).toBeDefined();
    });

    await waitFor(() => {
      // Only one delete link (for the non-system "编辑者" role)
      const deleteLinks = screen.getAllByText("删除");
      expect(deleteLinks.length).toBe(1);
    });
  });
});
