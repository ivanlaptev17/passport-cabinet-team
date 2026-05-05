const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type AuthResponse = {
  user: {
    id: number;
    last_name: string | null;
    first_name: string | null;
    middle_name: string | null;
    phone: string | null;
    email: string;
    role_id: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  access_token: string;
  token_type: string;
};

export type UserResponse = AuthResponse["user"];

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

export async function registerUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function loginUser(
  email: string,
  password: string,
): Promise<AuthResponse> {
  return apiRequest<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<UserResponse> {
  return apiRequest<UserResponse>(
    "/auth/me",
    {
      method: "GET",
    },
    true,
  );
}

export async function logoutUser(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    "/auth/logout",
    {
      method: "POST",
    },
    true,
  );
}
