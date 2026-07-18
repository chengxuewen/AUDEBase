import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import type { LoginResponse, UserBrief } from "@audebase/shared-types";
import { apiClient } from "../api/client";

interface AuthState {
  user: UserBrief | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

interface AclState {
  can: (action: string, resource: string) => boolean;
  canRoute: (route: string) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);
const AclContext = createContext<AclState | null>(null);

/** Return the stored user from a previous session (token still present) */
function getStoredUser(): UserBrief | null {
  try {
    const raw = localStorage.getItem("aude_user");
    if (raw === null) return null;
    return JSON.parse(raw) as UserBrief;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserBrief | null>(getStoredUser);
  const [isLoading, setIsLoading] = useState(false);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post<LoginResponse>("/auth/login", {
        username,
        password,
      });
      apiClient.setToken(res.access_token);
      localStorage.setItem("aude_refresh_token", res.refresh_token);
      localStorage.setItem("aude_user", JSON.stringify(res.user));
      setUser(res.user);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    apiClient.setToken(null);
    localStorage.removeItem("aude_refresh_token");
    localStorage.removeItem("aude_user");
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      isAuthenticated: user !== null && apiClient.getToken() !== null,
      isLoading,
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function AclProvider({ children }: { children: ReactNode }) {
  // ponytail: MVP stub — all access granted. Replace with ACL fetch when RBAC UI is built.
  const value = useMemo<AclState>(
    () => ({
      can: () => true,
      canRoute: () => true,
    }),
    [],
  );

  return <AclContext value={value}>{children}</AclContext>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useAcl(): AclState {
  const ctx = useContext(AclContext);
  if (ctx === null) {
    throw new Error("useAcl must be used within AclProvider");
  }
  return ctx;
}
