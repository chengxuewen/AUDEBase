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

describe.skip("AdminLayout");
