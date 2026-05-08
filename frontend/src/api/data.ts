const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type Profile = {
  id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  email: string;
  phone: string | null;
  role_name: string | null;
  organization_name: string | null;
};

export type Position = {
  id: number;
  name: string;
  category: string | null;
  category_code: string | null;
};

export type Employee = {
  id: number;
  fio: string | null;
  position_id: number | null;
  position: string | null;
  category_id: number | null;
  category: string | null;
  category_code: string | null;
  organization: string;
};

export type Organization = {
  id: number;
  name: string;
  director_name: string | null;
  governance_body: string | null;
  founder: string | null;
  address: string | null;
};

export type Building = {
  id: number;
  name: string | null;
  address: string | null;
  created_at: string | null;
  organization: string;
};

// ── Fetchers ──────────────────────────────────────────────────────────────────

export const fetchProfile = () => apiFetch<Profile>("/data/profile");
export const fetchPositions = () => apiFetch<Position[]>("/data/positions");
export const fetchEmployees = (category?: string) =>
  apiFetch<Employee[]>(`/data/employees${category ? `?category=${category}` : ""}`);
export const fetchOrganizations = () =>
  apiFetch<Organization[]>("/data/organizations");
export const fetchBuildings = () => apiFetch<Building[]>("/data/buildings");

// ── Updaters ──────────────────────────────────────────────────────────────────

export const updateEmployee = (id: number, body: { fio?: string; position_id?: number }) =>
  apiFetch<Employee>(`/data/employees/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const updateOrganization = (
  id: number,
  body: Partial<Pick<Organization, "name" | "director_name" | "governance_body" | "founder">>,
) =>
  apiFetch<Organization>(`/data/organizations/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const updateBuilding = (
  id: number,
  body: Partial<Pick<Building, "name" | "address">>,
) =>
  apiFetch<Building>(`/data/buildings/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
