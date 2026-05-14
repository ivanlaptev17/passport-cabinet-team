const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type UserResponse = {
  id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  phone: string | null;
  email: string;
  role_id: number | null;
  role_code: string | null;
  role_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `${response.status}`);
  }

  return response.json();
}

export async function registerUser(email: string, password: string): Promise<UserResponse> {
  return apiRequest<UserResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function loginUser(email: string, password: string): Promise<UserResponse> {
  return apiRequest<UserResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function getMe(): Promise<UserResponse> {
  return apiRequest<UserResponse>("/auth/me");
}

export async function logoutUser(): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>("/auth/logout", { method: "POST" });
}
