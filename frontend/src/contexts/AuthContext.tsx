import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getMe, type UserResponse } from "../api/auth";

type AuthState = {
  user: UserResponse | null;
  loading: boolean;
};

const AuthContext = createContext<AuthState>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: true });

  useEffect(() => {
    getMe()
      .then((user) => setState({ user, loading: false }))
      .catch(() => setState({ user: null, loading: false }));
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
