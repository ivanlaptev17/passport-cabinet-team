import { useState } from "react";
import { loginUser, registerUser } from "../../api/auth";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (mode === "login") {
        await loginUser(email, password);
      } else {
        await registerUser(email, password);
      }
      // Полная перезагрузка: AuthProvider перечитает /auth/me с новой cookie
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-vh-100 d-flex align-items-center justify-content-center"
      style={{ background: "#eceff1" }}
    >
      <div className="card shadow-sm" style={{ width: 380, border: "none" }}>
        <div
          className="card-header text-white text-center py-3"
          style={{ background: "#37474f" }}
        >
          <i className="fa fa-graduation-cap fa-lg me-2" />
          <span className="fw-semibold fs-6">Кабинет директора</span>
        </div>

        <div className="card-body p-4">
          <h6 className="fw-semibold mb-3 text-center">
            {mode === "login" ? "Вход в систему" : "Регистрация"}
          </h6>

          <form onSubmit={(e) => void handleSubmit(e)}>
            <div className="mb-3">
              <label className="form-label small">Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="example@mail.ru"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="mb-3">
              <label className="form-label small">Пароль</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="alert alert-danger py-2 small">{error}</div>
            )}

            <button
              type="submit"
              className="btn w-100 text-white"
              style={{ background: "#37474f" }}
              disabled={loading}
            >
              {loading && (
                <span className="spinner-border spinner-border-sm me-2" />
              )}
              {mode === "login" ? "Войти" : "Зарегистрироваться"}
            </button>
          </form>

          <div className="text-center mt-3">
            <button
              className="btn btn-link btn-sm text-muted p-0"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError("");
              }}
            >
              {mode === "login"
                ? "Нет аккаунта? Зарегистрироваться"
                : "Уже есть аккаунт? Войти"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
