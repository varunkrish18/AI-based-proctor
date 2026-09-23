export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://caecally-shiftable-cammy.ngrok-free.dev";

type TokenKind = "admin" | "student";

let memoryAdminRefreshToken: string | null = null;

export function setAdminRefreshToken(token: string | null) {
  memoryAdminRefreshToken = token;
  if (token) {
    sessionStorage.setItem("aeps.adminRefreshToken", token);
  } else {
    sessionStorage.removeItem("aeps.adminRefreshToken");
  }
}

export function getAdminRefreshToken(): string | null {
  return memoryAdminRefreshToken || sessionStorage.getItem("aeps.adminRefreshToken");
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
    sessionStorage.removeItem("aeps.adminRefreshToken");
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
  const rt = getAdminRefreshToken();
  if (!rt) return false;
  if (isRefreshing && refreshPromise) return refreshPromise;

  isRefreshing = true;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (res.ok) {
        const data = await res.json();
        setToken("admin", data.accessToken);
        if (data.refreshToken) {
          setAdminRefreshToken(data.refreshToken);
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
    "ngrok-skip-browser-warning": "true",
    ...(headers as Record<string, string>),
  };

  if (auth) {
    const token = getToken(auth);
    if (token) finalHeaders["Authorization"] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { ...rest, headers: finalHeaders });
  } catch (netErr: unknown) {
    // If it's a transient network error (like "Failed to fetch") on a GET request, retry once after 800ms
    const method = options.method || "GET";
    if (!isRetry && method === "GET") {
      await new Promise((r) => setTimeout(r, 800));
      return request<T>(path, options, true);
    }
    throw netErr;
  }

  if ((res.status === 401 || res.status === 403) && auth === "admin" && !isRetry) {
    if (getAdminRefreshToken()) {
      const refreshed = await tryRefreshAdminToken();
      if (refreshed) {
        return request<T>(path, options, true);
      }
    }
    clearToken("admin");
    if (
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/admin") &&
      window.location.pathname !== "/admin/login"
    ) {
      window.location.href = "/admin/login?expired=true";
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

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const text = await res.text();
    if (text.includes("ngrok") || text.includes("Visit Site")) {
      throw new ApiError(res.status, "Tunnel warning intercepted response. Please retry.");
    }
  }

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

export async function downloadFile(
  path: string,
  filename: string,
  auth?: TokenKind
): Promise<void> {
  const headers: Record<string, string> = {
    "ngrok-skip-browser-warning": "true",
  };
  if (auth) {
    const token = getToken(auth);
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    throw new Error(`Export failed with status ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const text = await res.text();
    if (text.includes("ngrok") || text.includes("Visit Site")) {
      throw new Error("Tunnel warning intercepted download. Please retry.");
    }
  }

  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

