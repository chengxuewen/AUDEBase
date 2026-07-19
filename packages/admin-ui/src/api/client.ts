import type { ApiErrorResponse } from "@audebase/shared-types";
import { ErrorCode } from "@audebase/shared-types";

const TOKEN_KEY = "aude_access_token";
const BASE_URL = "/api";

/** Map ErrorCode to user-friendly Chinese messages */
const errorMessages: Record<string, string> = {
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: "用户名或密码错误",
  [ErrorCode.AUTH_TOKEN_EXPIRED]: "登录已过期，请重新登录",
  [ErrorCode.AUTH_TOKEN_INVALID]: "登录已过期，请重新登录",
  [ErrorCode.AUTH_MUST_CHANGE_PASSWORD]: "请先修改密码",
  [ErrorCode.FORBIDDEN]: "没有访问权限",
  [ErrorCode.VALIDATION_ERROR]: "输入参数有误",
  [ErrorCode.CONFLICT]: "数据冲突",
  [ErrorCode.NOT_FOUND]: "资源不存在",
  [ErrorCode.RATE_LIMIT_EXCEEDED]: "请求过于频繁，请稍后再试",
  [ErrorCode.GENERAL_INTERNAL_ERROR]: "服务器内部错误",
  [ErrorCode.GENERAL_DB_UNAVAILABLE]: "数据库不可用",
  [ErrorCode.GENERAL_TIMEOUT]: "请求超时",
};

function getErrorMessage(code: string): string {
  return errorMessages[code] ?? "未知错误";
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    // ponytail: guard for non-browser envs (SSR, happy-dom import race)
    this.token = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  }

  setToken(token: string | null): void {
    this.token = token;
    if (token === null) {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.setItem(TOKEN_KEY, token);
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.token !== null) {
      h["Authorization"] = `Bearer ${this.token}`;
    }
    return h;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number | undefined>,
  ): Promise<T> {
    let url = `${BASE_URL}${path}`;
    if (params !== undefined) {
      const search = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) {
          search.set(k, String(v));
        }
      }
      const qs = search.toString();
      if (qs.length > 0) {
        url += `?${qs}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    // 401 → clear token, redirect to login
    if (response.status === 401) {
      this.setToken(null);
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      throw new Error("登录已过期，请重新登录");
    }

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const err = (await response.json()) as ApiErrorResponse;
        if (err?.error?.code !== undefined) {
          errorMsg = getErrorMessage(err.error.code);
        }
      } catch {
        // ignore parse errors — use HTTP status message
      }
      throw new Error(errorMsg);
    }

    return (await response.json()) as T;
  }

  async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    return this.request<T>("GET", path, undefined, params);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("PATCH", path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }
}

export const apiClient = new ApiClient();
export { ApiClient };
