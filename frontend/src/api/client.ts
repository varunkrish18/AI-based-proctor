export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

type TokenKind = "admin" | "student";

let memoryAdminRefreshToken: string | null = null;

export function setAdminRefreshToken(token: string | null) {
  memoryAdminRefreshToken = token;
}

export function getAdminRefreshToken(): string | null {
  return memoryAdminRefreshToken;
}

function tokenKey(kind: TokenKind) {
  return kind === "admin" ? "aeps.adminToken" : "aeps.studentToken";
}

export function getToken(kind: TokenKind): string | null {
  return sessionStorage.getItem(tokenKey(kind));
}

export function setToken(kind: TokenKind, token: string) {
  sessionStorage.setItem(tokenKey(kind), token);
}

export function clearToken(kind: TokenKind) {
  sessionStorage.removeItem(tokenKey(kind));
  if (kind === "admin") {
    memoryAdminRefreshToken = null;
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshAdminToken(): Promise<boolean> {
  if (!memoryAdminRefreshToken) return false;
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: memoryAdminRefreshToken }),
      });
      if (res.ok) {
        const data = await res.json();
        setToken("admin", data.accessToken);
        if (data.refreshToken) {
          memoryAdminRefreshToken = data.refreshToken;
        }
        return true;
      } else {
        clearToken("admin");
        return false;
      }
    } catch {
      clearToken("admin");
      return false;
    } finally {
      isRefreshing = false;
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function request<T>(
  path: string,
  options: RequestInit & { auth?: TokenKind } = {},
  isRetry = false
): Promise<T> {
  const { auth, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken(auth);
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers: finalHeaders });

  if (res.status === 401 && auth === "admin" && !isRetry && memoryAdminRefreshToken) {
    const refreshed = await tryRefreshAdminToken();
    if (refreshed) {
      return request<T>(path, options, true);
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message || message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export const api = {
  get: <T>(path: string, auth?: TokenKind) => request<T>(path, { method: "GET", auth }),
  post: <T>(path: string, body?: unknown, auth?: TokenKind) =>
    request<T>(path, { method: "POST", auth, body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown, auth?: TokenKind) =>
    request<T>(path, { method: "PUT", auth, body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, auth?: TokenKind) =>
    request<T>(path, { method: "PATCH", auth, body: body ? JSON.stringify(body) : undefined }),
  delete: <T = void>(path: string, auth?: TokenKind) =>
    request<T>(path, { method: "DELETE", auth }),
};
