export type AuthUser = {
  id: string;
  name: string;
  email: string;
  createdAt?: string;
};

type AuthSession = {
  token: string;
  user: AuthUser;
};

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:4000/api/v1").replace(/\/$/, "");
const TOKEN_KEY = "fairlens-auth-token";
const USER_KEY = "fairlens-auth-user";
const AUTH_EVENT = "fairlens-auth-change";

export function getAuthToken() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    window.localStorage.removeItem(USER_KEY);
    return null;
  }
}

export function setAuthSession(session: AuthSession) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, session.token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function clearAuthSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem("fairai-latest-analysis-id");
  window.localStorage.removeItem("fairai-analysis-history");
  window.dispatchEvent(new Event(AUTH_EVENT));
}

export function subscribeAuthChange(callback: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(AUTH_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(AUTH_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function authHeaders(headers?: HeadersInit): HeadersInit {
  const token = getAuthToken();
  const nextHeaders = new Headers(headers || {});
  if (token && !nextHeaders.has("Authorization")) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }
  return nextHeaders;
}

export function withAuthToken(url: string) {
  const token = getAuthToken();
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const response = await fetch(input, {
    ...init,
    headers: authHeaders(init.headers),
  });

  if (response.status === 401) {
    clearAuthSession();
  }

  return response;
}

export async function signupAccount(payload: { name: string; email: string; password: string }) {
  const session = await authRequest("/auth/signup", payload);
  setAuthSession(session);
  return session;
}

export async function loginAccount(payload: { email: string; password: string }) {
  const session = await authRequest("/auth/login", payload);
  setAuthSession(session);
  return session;
}

export async function fetchCurrentUser() {
  const response = await apiFetch(`${API_URL}/auth/me`);
  if (!response.ok) {
    throw await parseAuthError(response, "Session check failed.");
  }
  const payload = await response.json();
  if (payload.user) {
    setAuthSession({ token: getAuthToken(), user: payload.user });
  }
  return payload.user as AuthUser;
}

async function authRequest(path: string, payload: Record<string, string>): Promise<AuthSession> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw await parseAuthError(response, "Authentication failed.");
  }

  return response.json();
}

async function parseAuthError(response: Response, fallback: string) {
  const text = await response.text().catch(() => "");
  try {
    const payload = JSON.parse(text);
    return new Error(payload.message || fallback);
  } catch {
    return new Error(text || fallback);
  }
}
