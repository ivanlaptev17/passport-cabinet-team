export type RoleCode = 'ADMIN' | 'DIRECTOR' | 'MINOBR' | 'SCHOOL_STAFF';

export interface User {
  id: number;
  last_name: string | null;
  first_name: string | null;
  middle_name: string | null;
  phone: string | null;
  email: string;
  role_id: number | null;
  role_code: RoleCode | null;
  role_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  token_type: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
}

export interface LogoutResponse {
  ok: boolean;
}
