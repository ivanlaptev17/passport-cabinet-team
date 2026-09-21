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

/** asyncpg возвращает jsonb-агрегаты как JSON-строку — приводим к массиву единообразно. */
export function parseJsonArray<T>(value: T[] | string | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export type Position = {
  id: number;
  name: string;
  category: string | null;
  category_code: string | null;
};

export type Employee = {
  id: number;
  organization_id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  phone: string | null;
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
};

export type Building = {
  id: number;
  organization_id: number;
  name: string | null;
  address: string | null;
  created_at: string | null;
  organization: string;
};

export type IncidentPerson = {
  id: number;
  last_name: string | null;
  first_name: string | null;
};

export type IncidentProblemType = {
  id: number;
  name: string;
  code: string;
};

export type Incident = {
  id: number;
  organization_id: number;
  organization: string;
  title: string;
  description: string | null;
  status: string;
  severity: string;
  incident_date: string;
  due_at: string | null;
  created_by_user_id: number | null;
  creator_last_name: string | null;
  creator_first_name: string | null;
  created_at: string;
  updated_at: string;
  assignees: IncidentPerson[] | string;
  problem_types: IncidentProblemType[] | string;
};

export type IncidentWidgetItem = {
  id: number;
  organization_id: number;
  organization: string;
  title: string;
  status: string;
  severity: string;
  incident_date: string;
  has_assignees: boolean;
};

export type IncidentCreate = {
  organization_id: number;
  title: string;
  description?: string;
  status?: string;
  severity?: string;
  incident_date?: string;
  due_at?: string;
  problem_type_ids?: number[];
};

export type IncidentUpdate = {
  title?: string;
  description?: string;
  status?: string;
  severity?: string;
  incident_date?: string;
  due_at?: string;
  problem_type_ids?: number[];
};

// ── Fetchers ──────────────────────────────────────────────────────────────────

export const fetchProfile = () => apiFetch<Profile>("/data/profile");
export const fetchPositions = () => apiFetch<Position[]>("/data/positions");
export const fetchEmployees = (category?: string) =>
  apiFetch<Employee[]>(`/data/employees${category ? `?category=${category}` : ""}`);
export const fetchOrganizations = () =>
  apiFetch<Organization[]>("/data/organizations");
export const fetchBuildings = () => apiFetch<Building[]>("/data/buildings");

export type StaffInfo = {
  id: number;
  organization_id: number;
  organization: string;
  attribute: string;
  value: string | null;
  real_value: string | null;
  is_filled: boolean;
};

export type FinanceRecord = {
  id: number;
  organization_id: number;
  organization: string;
  section_code: string;
  attribute: string;
  value: number | null;
  is_filled: boolean;
};

export type Subsidy = {
  id: number;
  organization_id: number;
  organization: string;
  name: string;
  amount: number | null;
};

export type Contract = {
  id: number;
  organization_id: number;
  organization: string;
  name: string;
  link: string | null;
};

export type Contingent = {
  id: number;
  organization_id: number;
  organization: string;
  attribute: string;
  value: number | null;
  is_filled: boolean;
};

export type SchoolClass = {
  id: number;
  organization_id: number;
  organization: string;
  name: string | null;
  grade_level: number | null;
  student_count: number | null;
};

export type Parallel = {
  id: number;
  organization_id: number;
  organization: string;
  title: string;
  values: number[];
  is_filled: boolean;
};

export type EducationActivity = {
  id: number;
  organization_id: number;
  organization: string;
  activity_type: string | null;
  attribute: string;
  value: string | null;
  is_filled: boolean;
  is_heading: boolean;
  item_order: number | null;
};

export type FinanceSummary = { budget: number; expenses: number; remainder: number };

export const fetchFinanceSummary = () => apiFetch<FinanceSummary>("/data/finance-summary");
export const fetchStaffInfo = () => apiFetch<StaffInfo[]>("/data/staff-info");
export const fetchFinance = () => apiFetch<FinanceRecord[]>("/data/finance");
export const fetchSubsidies = () => apiFetch<Subsidy[]>("/data/subsidies");
export const fetchContracts = () => apiFetch<Contract[]>("/data/contracts");
export const fetchContingent = () => apiFetch<Contingent[]>("/data/contingent");
export const fetchClasses = () => apiFetch<SchoolClass[]>("/data/classes");
export const fetchParallels = () => apiFetch<Parallel[]>("/data/parallels");
export const fetchEducation = () => apiFetch<EducationActivity[]>("/data/education");

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


export const fetchIncidents = () =>
  apiFetch<Incident[]>("/data/incidents");

export const fetchIncidentsWidget = () =>
  apiFetch<IncidentWidgetItem[]>("/data/incidents/widget");

export const createIncident = (body: IncidentCreate) =>
  apiFetch<Incident>("/data/incidents", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateIncident = (id: number, body: IncidentUpdate) =>
  apiFetch<Incident>(`/data/incidents/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

export const deleteIncident = (id: number) =>
  apiFetch<{ ok: boolean }>(`/data/incidents/${id}`, {
    method: "DELETE",
  });

export const fetchIncidentProblemTypes = () =>
  apiFetch<IncidentProblemType[]>("/data/incident-problem-types");

export const setIncidentAssignees = (id: number, userIds: number[]) =>
  apiFetch<Incident>(`/data/incidents/${id}/assignees`, {
    method: "PUT",
    body: JSON.stringify({ user_ids: userIds }),
  });
// ── Events / Calendar ─────────────────────────────────────────────────────────

export type EventParticipant = {
  id: number;
  last_name: string | null;
  first_name: string | null;
};

export type CalendarEvent = {
  id: number;
  organization_id: number;
  organization: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  description: string | null;
  created_by: number | null;
  created_at: string;
  participants: EventParticipant[];
};

export type OrgUser = {
  id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  email: string;
};

export type EventCreate = {
  organization_id: number;
  title: string;
  starts_at: string;
  ends_at?: string;
  description?: string;
  participant_ids?: number[];
};

export type EventUpdate = Partial<EventCreate>;

export const fetchEvents = (month?: string) =>
  apiFetch<CalendarEvent[]>(`/data/events${month ? `?month=${month}` : ""}`);

export const fetchUpcomingEvents = (limit = 3) =>
  apiFetch<CalendarEvent[]>(`/data/events/upcoming?limit=${limit}`);

export const fetchOrgUsers = () =>
  apiFetch<OrgUser[]>("/data/events/org-users");

export const createEvent = (body: EventCreate) =>
  apiFetch<CalendarEvent>("/data/events", { method: "POST", body: JSON.stringify(body) });

export const updateEvent = (id: number, body: EventUpdate) =>
  apiFetch<CalendarEvent>(`/data/events/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteEvent = (id: number) =>
  apiFetch<{ ok: boolean }>(`/data/events/${id}`, { method: "DELETE" });

// ── Documents ─────────────────────────────────────────────────────────────────

export type Document = {
  id: number;
  organization_id: number;
  organization: string;
  name: string;
  description: string | null;
  original_filename: string;
  file_size: number | null;
  uploaded_at: string;
  updated_at: string;
  uploader_last_name: string | null;
  uploader_first_name: string | null;
  uploader_email: string | null;
};

export const fetchDocuments = () =>
  apiFetch<Document[]>("/data/documents");

export const uploadDocument = (formData: FormData) => {
  const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";
  return fetch(`${API_URL}/data/documents`, {
    method: "POST",
    credentials: "include",
    body: formData,
  }).then((res) => {
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json() as Promise<Document>;
  });
};

export const updateDocument = (id: number, body: { name?: string; description?: string }) =>
  apiFetch<Document>(`/data/documents/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteDocument = (id: number) =>
  apiFetch<{ ok: boolean }>(`/data/documents/${id}`, { method: "DELETE" });

// ── Notifications ─────────────────────────────────────────────────────────────

export type Notifications = {
  total: number;
  incidents: { id: number; title: string; severity: string; status: string }[];
  assigned_incidents: { id: number; title: string; severity: string; status: string }[];
  overdue_documents: { id: number; name: string; uploaded_at: string }[];
  today_events: { id: number; title: string; starts_at: string }[];
  upcoming_events: { id: number; title: string; starts_at: string }[];
};

export const fetchNotifications = () =>
  apiFetch<Notifications>("/data/notifications");

export const markNotificationRead = (item_type: string, item_id: number) =>
  apiFetch<{ ok: boolean }>("/data/notifications/read", {
    method: "POST",
    body: JSON.stringify({ item_type, item_id }),
  });

export const markAllNotificationsRead = () =>
  apiFetch<{ ok: boolean }>("/data/notifications/read-all", { method: "POST" });

export const getDocumentDownloadUrl = (id: number) => {
  const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";
  return `${API_URL}/data/documents/${id}/download`;
};

// ── XLSX export ───────────────────────────────────────────────────────────────

export const downloadXlsx = async (path: string, filename: string): Promise<void> => {
  const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";
  const res = await fetch(`${API_URL}${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const exportEmployeesXlsx = (category?: string) =>
  downloadXlsx(
    `/data/export/employees${category ? `?category=${category}` : ""}`,
    "Сотрудники.xlsx",
  );

export const exportOrganizationsXlsx = () =>
  downloadXlsx("/data/export/organizations", "Организации.xlsx");

export const exportIncidentsXlsx = () =>
  downloadXlsx("/data/export/incidents", "Инциденты.xlsx");

// ── Document templates (constructor) ────────────────────────────────────────

export type DocumentTemplateField = {
  key: string;
  label: string;
  type: "text" | "date" | "list";
  item_fields?: { key: string; label: string }[];
};

export type DocumentTemplate = {
  id: string;
  name: string;
  fields: DocumentTemplateField[];
};

export const fetchDocumentTemplates = () =>
  apiFetch<DocumentTemplate[]>("/data/document-templates");

export const generateDocumentTemplate = async (
  id: string,
  values: Record<string, unknown>,
  logo?: File | null,
): Promise<Blob> => {
  const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";
  const fd = new FormData();
  fd.append("values", JSON.stringify(values));
  if (logo) fd.append("logo", logo);
  const res = await fetch(`${API_URL}/data/document-templates/${id}/generate`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.blob();
};
