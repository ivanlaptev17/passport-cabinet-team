export interface User {
    id: number;
    first_name: string;
    last_name: string;
    middle_name: string;
    phone: string;
    email: string;
    role_id: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface AuthResponse {
    user: User;
    access_token: string;
    token_type: string;
}