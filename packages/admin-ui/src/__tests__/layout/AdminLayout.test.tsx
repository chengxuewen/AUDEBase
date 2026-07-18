import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AdminLayout from "../../layout/AdminLayout";
import { AuthProvider } from "../../auth/AuthContext";
import { apiClient } from "../../api/client";

function renderWithProviders(initialRoute = "/") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Ensure a token exists so AdminLayout renders (layout checks auth
  // directly but we render inside ProtectedRoute in real app)
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
  // Re-init apiClient since it reads token in constructor
  apiClient.setToken("test-token");

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AuthProvider>
          <AdminLayout />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminLayout", () => {
  it("renders the title", () => {
    // Act
    renderWithProviders();

    // Assert
    expect(screen.getByText("AUDEBase")).toBeDefined();
  });

  it("renders menu items", async () => {
    // Act
    renderWithProviders();

    // ProLayout renders menus asynchronously; the page title "仪表盘"
    // appears in the header breadcrumb area
    expect(screen.getByText("仪表盘")).toBeDefined();
  });
  it("renders logout button", () => {
    // Act
    renderWithProviders();

    // Assert
    expect(screen.getByText("退出")).toBeDefined();
  });

  it("renders user display name", () => {
    // Act
    renderWithProviders();

    // Assert
    expect(screen.getByText("管理员")).toBeDefined();
  });
});
