import { describe, it, expect } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PluginManagementPage from "../../pages/PluginManagementPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <PluginManagementPage />
    </MemoryRouter>,
  );
}

describe("PluginManagementPage", () => {
  it("renders table with mock data", async () => {
    // Act
    renderPage();

    // Assert — ProTable renders asynchronously
    await waitFor(() => {
      expect(screen.getByText("内核插件")).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByText("RBAC 权限引擎")).toBeDefined();
    });
    expect(screen.getByText("审计日志")).toBeDefined();
    expect(screen.getByText("健康检查")).toBeDefined();
    expect(screen.getByText("国际化")).toBeDefined();
  });

  it("shows version column", async () => {
    // Act
    renderPage();

    // Assert
    await waitFor(() => {
      const versionCells = screen.getAllByText("0.1.0");
      expect(versionCells.length).toBeGreaterThanOrEqual(5);
    });
  });

  it("shows category tags", async () => {
    // Act
    renderPage();

    // Assert
    await waitFor(() => {
      const systemTags = screen.getAllByText("SYSTEM");
      expect(systemTags.length).toBeGreaterThanOrEqual(5);
    });
  });

  it("shows status badges", async () => {
    // Act
    renderPage();

    // Assert
    await waitFor(() => {
      const badges = screen.getAllByText("运行中");
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText("已禁用")).toBeDefined();
  });

  it("opens detail modal when clicking view button", async () => {
    // Act
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("内核插件")).toBeDefined();
    });

    const detailButtons = screen.getAllByText("详情");
    fireEvent.click(detailButtons[0]!);

    // Assert
    await waitFor(() => {
      expect(screen.getByText("插件详情")).toBeDefined();
    });
    const pkgNameEls = screen.getAllByText("plugin-core");
    expect(pkgNameEls.length).toBeGreaterThanOrEqual(1);
  });
});
