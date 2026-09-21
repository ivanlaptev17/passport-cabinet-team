const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ── Типы ──────────────────────────────────────────────────────────────────────

export const TASK_STATUSES = ["NEW", "IN_PROGRESS", "PENDING_REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export type TaskSeverity = (typeof TASK_SEVERITIES)[number];

export type TaskPerson = {
  id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name?: string | null;
};

export type Task = {
  id: number;
  organization_id: number;
  organization: string;
  building_id: number | null;
  building_name: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  severity: TaskSeverity;
  due_at: string | null;
  created_by_user_id: number | null;
  creator_last_name: string | null;
  creator_first_name: string | null;
  created_at: string;
  updated_at: string;
  participants: TaskPerson[] | string;
};

export type TaskCreate = {
  organization_id: number;
  building_id?: number | null;
  title: string;
  description?: string;
  severity?: TaskSeverity;
  due_at?: string | null;
};

export type OrgUserGroup = {
  building_id: number | null;
  building_name: string | null;
  users: {
    id: number;
    last_name: string | null;
    first_name: string | null;
    middle_name: string | null;
    email: string;
  }[];
};

export type TaskMessage = {
  id: number;
  task_id: number;
  message_type: "USER" | "SYSTEM";
  author_user_id: number | null;
  author_last_name: string | null;
  author_first_name: string | null;
  author_middle_name: string | null;
  body: string | null;
  event_type: string | null;
  event_payload: Record<string, unknown> | string | null;
  file_name: string | null;
  file_size: number | null;
  file_mime: string | null;
  has_file: boolean;
  created_at: string;
};

export type MessagesPage = {
  messages: TaskMessage[];
  has_more: boolean;
  next_before_id: number | null;
};

export type TaskNotification = {
  id: number;
  recipient_user_id: number;
  task_id: number;
  task_title: string;
  message_id: number | null;
  notification_type: string;
  actor_user_id: number | null;
  actor_last_name: string | null;
  actor_first_name: string | null;
  payload: Record<string, unknown> | string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationsFeed = {
  total_unread: number;
  items: TaskNotification[];
};

/** asyncpg отдаёт jsonb строкой — приводим к объекту единообразно. */
export function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function taskParticipants(task: Task): TaskPerson[] {
  return parseJson<TaskPerson[]>(task.participants, []);
}

// ── Задачи ────────────────────────────────────────────────────────────────────

export const fetchMyTasks = () => apiFetch<Task[]>("/tasks/my");

export const fetchOrgTasks = (organizationId: number) =>
  apiFetch<Task[]>(`/tasks/org?organization_id=${organizationId}`);

export const createTask = (body: TaskCreate) =>
  apiFetch<Task>("/tasks", { method: "POST", body: JSON.stringify(body) });

export const deleteTask = (id: number) =>
  apiFetch<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" });

export const setTaskStatus = (id: number, status: TaskStatus) =>
  apiFetch<Task>(`/tasks/${id}/status`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });

export const setTaskParticipants = (id: number, userIds: number[]) =>
  apiFetch<Task>(`/tasks/${id}/participants`, {
    method: "PUT",
    body: JSON.stringify({ user_ids: userIds }),
  });

export const fetchTaskOrgUsers = (organizationId?: number) =>
  apiFetch<OrgUserGroup[]>(
    `/tasks/org-users${organizationId ? `?organization_id=${organizationId}` : ""}`,
  );

// ── Чат ───────────────────────────────────────────────────────────────────────

export const fetchMessages = (taskId: number, beforeId?: number | null, limit = 50) => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId) params.set("before_id", String(beforeId));
  return apiFetch<MessagesPage>(`/tasks/${taskId}/messages?${params}`);
};

export const postMessage = (taskId: number, body: string) =>
  apiFetch<TaskMessage>(`/tasks/${taskId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });

export const postMessageWithFile = async (taskId: number, file: File, body: string) => {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("body", body);
  const res = await fetch(`${API_URL}/tasks/${taskId}/messages/file`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as TaskMessage;
};

export const messageFileUrl = (taskId: number, messageId: number) =>
  `${API_URL}/tasks/${taskId}/messages/${messageId}/file`;

export const markChatRead = (taskId: number) =>
  apiFetch<{ ok: boolean }>(`/tasks/${taskId}/messages/read`, { method: "POST" });

// ── Уведомления ───────────────────────────────────────────────────────────────

export const fetchTaskNotifications = (onlyUnread = true, limit = 50) =>
  apiFetch<NotificationsFeed>(
    `/tasks/notifications?only_unread=${onlyUnread}&limit=${limit}`,
  );

export const markNotificationsRead = (body: { ids?: number[]; all?: boolean }) =>
  apiFetch<{ ok: boolean }>("/tasks/notifications/read", {
    method: "POST",
    body: JSON.stringify(body),
  });

// ── Realtime ──────────────────────────────────────────────────────────────────

/** Поток чата задачи: сервер присылает новые сообщения по мере появления. */
export const taskChatStreamUrl = (taskId: number) => `${API_URL}/tasks/${taskId}/stream`;

/** Личный поток уведомлений. */
export const notificationsStreamUrl = () => `${API_URL}/tasks/notifications/stream`;

// ── Подписи ───────────────────────────────────────────────────────────────────

export const STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  PENDING_REVIEW: "Ожидает проверки",
  DONE: "Завершена",
};

export const SEVERITY_LABELS: Record<TaskSeverity, string> = {
  LOW: "Обычная",
  MEDIUM: "Важная",
  HIGH: "Срочная",
};

export const SEVERITY_COLORS: Record<TaskSeverity, string> = {
  LOW: "#198754",
  MEDIUM: "#fd7e14",
  HIGH: "#dc3545",
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  NEW: "#0d6efd",
  IN_PROGRESS: "#fd7e14",
  PENDING_REVIEW: "#6f42c1",
  DONE: "#198754",
};

export function personName(p: TaskPerson | null | undefined) {
  if (!p) return "—";
  return [p.last_name, p.first_name].filter(Boolean).join(" ") || "—";
}
