import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "../../pages/DashboardPage";
import { apiClient } from "../../api/client";

vi.mock("../../api/client", () => ({
  apiClient: {
    get: vi.fn(),
    setToken: vi.fn(),
    getToken: vi.fn(() => null),
  },
}));

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders page title", () => {
    // Arrange
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: [], meta: { count: 0, page: 1, pageSize: 1, totalPages: 0 } })
      .mockResolvedValueOnce({ data: [], meta: { count: 0, page: 1, pageSize: 1, totalPages: 0 } })
      .mockResolvedValueOnce({ status: "ok", db: true, uptime: 3600 });

    // Act
    renderDashboard();

    // Assert
    expect(screen.getByText("系统概览")).toBeDefined();
  });

  it("renders stat cards after data loads", async () => {
    // Arrange
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: [], meta: { count: 5, page: 1, pageSize: 1, totalPages: 5 } })
      .mockResolvedValueOnce({ data: [], meta: { count: 3, page: 1, pageSize: 1, totalPages: 3 } })
      .mockResolvedValueOnce({ status: "ok", db: true, uptime: 7200 });

    // Act
    renderDashboard();

    // Assert — wait for data to resolve
    await waitFor(() => {
      expect(screen.getByText("5")).toBeDefined();
    });
    expect(screen.getByText("3")).toBeDefined();
    const okTexts = screen.getAllByText("正常");
    expect(okTexts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2h 0m")).toBeDefined();
  });

  it("shows database status tag", async () => {
    // Arrange
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({ data: [], meta: { count: 0, page: 1, pageSize: 1, totalPages: 0 } })
      .mockResolvedValueOnce({ data: [], meta: { count: 0, page: 1, pageSize: 1, totalPages: 0 } })
      .mockResolvedValueOnce({ status: "ok", db: true, uptime: 60 });

    // Act
    renderDashboard();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("数据库")).toBeDefined();
    });
  });

  it("shows error state when all queries fail", async () => {
    // Arrange
    vi.mocked(apiClient.get).mockRejectedValue(new Error("网络错误"));

    // Act
    renderDashboard();

    // Assert
    await waitFor(() => {
      expect(screen.getByText("无法加载系统概览")).toBeDefined();
    });
    expect(screen.getByRole("button", { name: /^重/ })).toBeDefined();
  });

  it("clicking retry button reloads data", async () => {
    // Arrange — first call fails, retry succeeds
    vi.mocked(apiClient.get)
      .mockRejectedValueOnce(new Error("网络错误"))
      .mockResolvedValueOnce({ data: [], meta: { count: 0, page: 1, pageSize: 1, totalPages: 0 } })
      .mockResolvedValueOnce({ data: [], meta: { count: 0, page: 1, pageSize: 1, totalPages: 0 } })
      .mockResolvedValueOnce({ status: "ok", db: true, uptime: 60 });

    renderDashboard();

    // Assert — error state shown
    await waitFor(() => {
      expect(screen.getByText("无法加载系统概览")).toBeDefined();
    });

    // Act — click retry
    const retryBtn = screen.getByRole("button", { name: /^重/ });
    fireEvent.click(retryBtn);

    // Assert — data loads after retry (3 API calls on retry)
    await waitFor(() => {
      expect(screen.getByText("数据库")).toBeDefined();
    });
  });
  });
});
