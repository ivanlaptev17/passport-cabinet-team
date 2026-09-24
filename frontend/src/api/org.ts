import { ApiError } from "./tasks";

const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
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

export type OrgMember = {
  user_id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  email: string;
  phone: string | null;
  org_role_code: string;
  org_role_label: string | null;
  position_title: string | null;
  building_id: number | null;
  building_name: string | null;
  is_active: boolean;
};

export type AssignableRole = { code: string; label: string };

export type MembersResponse = {
  members: OrgMember[];
  assignable_roles: AssignableRole[];
};

export type MemberUpdate = {
  org_role_code?: string;
  position_title?: string;
  building_id?: number;
  clear_building?: boolean;
};

export const fetchOrgMembers = (organizationId: number) =>
  apiFetch<MembersResponse>(`/org/${organizationId}/members`);

export const updateOrgMember = (organizationId: number, userId: number, body: MemberUpdate) =>
  apiFetch<OrgMember>(`/org/${organizationId}/members/${userId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
