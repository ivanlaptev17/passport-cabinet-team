import { ApiError } from "./tasks";
import { orgHeaders } from "../utils/activeOrg";

const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

/** Запрос к API: cookie-сессия, выбранная организация, текст ошибки бэкенда в ApiError. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...orgHeaders(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.detail === "string" ? body.detail : "";
    } catch {
      // не JSON
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}
