import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "../../pages/LoginPage";
import { AuthProvider } from "../../auth/AuthContext";

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("renders login form with username and password fields", () => {
    // Act
    renderLoginPage();

    // Assert
    expect(screen.getByPlaceholderText("用户名")).toBeDefined();
    expect(screen.getByPlaceholderText("密码")).toBeDefined();
  });

  it("renders submit button", () => {
    // Act
    renderLoginPage();

    // Assert — antd Button inserts spaces between Chinese characters: "登 录"
    const button = screen.getByRole("button", { name: /^登/ });
    expect(button).toBeDefined();
    expect(button).toBeDefined();
  });

  it("renders AUDEBase title", () => {
    // Act
    renderLoginPage();

    // Assert
    expect(screen.getByText("AUDEBase")).toBeDefined();
    expect(screen.getByText("企业应用开发平台")).toBeDefined();
  });
});
