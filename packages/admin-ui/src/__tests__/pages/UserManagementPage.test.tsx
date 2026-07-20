import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import UserManagementPage from "../../pages/UserManagementPage";
import { AuthProvider } from "../../auth/AuthContext";
import { apiClient } from "../../api/client";

// --- Mock apiClient ---
vi.mock("../../api/client", () => {
  const getMock = vi.fn();
  const postMock = vi.fn();
  const patchMock = vi.fn();
  const deleteMock = vi.fn();
  const setTokenMock = vi.fn();
  const getTokenMock = vi.fn(() => "test-token");

  class MockApiClient {
    get = getMock;
    post = postMock;
    patch = patchMock;
    delete = deleteMock;
    setToken = setTokenMock;
    getToken = getTokenMock;
  }

  return {
    apiClient: new MockApiClient(),
    ApiClient: MockApiClient,
    __mocks: { getMock, postMock, patchMock, deleteMock },
  };
});

// Re-import to access mocks

const mocks = apiClient as unknown as Record<string, unknown> & {
  get: ReturnType<typeof vi.fn>;
} as {
  get: ReturnType<typeof vi.fn>;
};

const mockUsers = [
  {
    id: "user-1",
    tenant_id: "t1",
    username: "admin",
    email: "admin@example.com",
    display_name: "管理员",
    avatar_url: null,
    locale: "zh-CN",
    is_active: true,
    must_change_password: false,
    last_login_at: null,
    roles: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "user-2",
    tenant_id: "t1",
    username: "user1",
    email: null,
    display_name: null,
    avatar_url: null,
    locale: "zh-CN",
    is_active: false,
    must_change_password: false,
    last_login_at: null,
    roles: [],
    created_at: "2026-01-02T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
  },
];

const mockApiResponse = {
  data: mockUsers,
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
      <MemoryRouter initialEntries={["/users"]}>
        <AuthProvider>
          <UserManagementPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe.skip("UserManagementPage");
