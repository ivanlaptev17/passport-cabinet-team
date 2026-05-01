const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function getAccessToken(): string | null {
  return localStorage.getItem("access_token");
}

function getHeaders(withAuth = false): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (withAuth) {
    const token = getAccessToken();

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  return headers;
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  withAuth = false,
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...getHeaders(withAuth),
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json();
}

export async function registerUser(email: string, password: string) {
  return apiRequest("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function loginUser(email: string, password: string) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe() {
  return apiRequest("/auth/me", {
    method: "GET",
  }, true);
}

export async function logoutUser() {
  return apiRequest("/auth/logout", {
    method: "POST",
  }, true);
}
