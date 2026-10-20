import { apiFetch } from "./http";

export type StaffCalendarRow = {
  id: number;
  organization_id: number;
  organization: string;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  fio: string | null;
  position: string | null;
  category_code: string | null;
  contacts: string | null;
  vacations: string | null;
  deputies: string | null;
  birth_date: string | null;
};

export type StaffCalendar = { can_edit: boolean; employees: StaffCalendarRow[] };

export type StaffCalendarUpdate = {
  vacations?: string;
  deputies?: string;
  birth_date?: string;
  clear_birth_date?: boolean;
};

export type Birthday = {
  employee_id: number;
  organization_id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  birth_date: string;
};

export const fetchStaffCalendar = () => apiFetch<StaffCalendar>("/data/staff-calendar");

export const updateStaffCalendar = (employeeId: number, body: StaffCalendarUpdate) =>
  apiFetch<StaffCalendarRow>(`/data/staff-calendar/${employeeId}`, { method: "PUT", body: JSON.stringify(body) });

export const fetchBirthdays = (month: number) => apiFetch<Birthday[]>(`/data/birthdays?month=${month}`);
