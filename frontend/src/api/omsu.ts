import { apiFetch } from "./http";

export type OmsuPosition = { code: string; label: string; primary?: boolean };

export type OmsuVacation = { id?: number; starts_on: string; ends_on: string };

export type OmsuRepresentative = {
  id: number;
  municipality_id: number;
  position_code: string;
  full_name: string;
  position_title: string | null;
  contacts: string | null;
  email: string | null;
  deputy: string | null;
  vacations: OmsuVacation[];
  on_vacation: OmsuVacation | null;
  upcoming_vacation: OmsuVacation | null;
  updated_at: string;
};

export type OmsuMunicipalitySummary = {
  id: number;
  name: string;
  education_body: string | null;
  updated_at: string;
  representatives_count: number;
  positions_filled: number;
  positions_total: number;
  missing_positions: string[];
  primary_contact: { full_name: string; contacts: string | null; email: string | null } | null;
  on_vacation: { full_name: string; position_code: string; ends_on: string; deputy: string | null }[];
  upcoming_vacations: { full_name: string; position_code: string; starts_on: string; ends_on: string }[];
};

export type OmsuMunicipality = {
  id: number;
  name: string;
  education_body: string | null;
  updated_at: string;
  updated_by_last_name: string | null;
  updated_by_first_name: string | null;
  can_edit: boolean;
  positions: OmsuPosition[];
  representatives: OmsuRepresentative[];
};

export type RepresentativeInput = {
  position_code: string;
  full_name: string;
  position_title?: string | null;
  contacts?: string | null;
  email?: string | null;
  deputy?: string | null;
  vacations: { starts_on: string; ends_on: string }[];
};

export const fetchOmsuMunicipalities = () => apiFetch<OmsuMunicipalitySummary[]>("/omsu/municipalities");

export const fetchOmsuMunicipality = (id: number) => apiFetch<OmsuMunicipality>(`/omsu/municipalities/${id}`);

export const updateOmsuMunicipality = (id: number, body: { education_body: string }) =>
  apiFetch<{ ok: boolean }>(`/omsu/municipalities/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const createRepresentative = (municipalityId: number, body: RepresentativeInput) =>
  apiFetch<OmsuRepresentative>(`/omsu/municipalities/${municipalityId}/representatives`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const updateRepresentative = (id: number, body: RepresentativeInput) =>
  apiFetch<OmsuRepresentative>(`/omsu/representatives/${id}`, { method: "PUT", body: JSON.stringify(body) });

export const deleteRepresentative = (id: number) =>
  apiFetch<{ ok: boolean }>(`/omsu/representatives/${id}`, { method: "DELETE" });
