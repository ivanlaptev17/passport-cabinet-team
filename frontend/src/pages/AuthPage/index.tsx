import { useState } from "react";
import { loginUser, registerUser } from "../../api/auth";
import { setAccessToken } from "../../utils/storage";

const AuthPage = () => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      const data =
        mode === "login"
          ? await loginUser(email, password)
          : await registerUser(email, password);

      setAccessToken(data.access_token);
      window.location.href = "/profile";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка авторизации");
    }
  };

  return (
    <div>
      <h1>{mode === "login" ? "Вход" : "Регистрация"}</h1>

      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Почта"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">
          {mode === "login" ? "Войти" : "Зарегистрироваться"}
        </button>
      </form>

      {error && <p>{error}</p>}

      <button onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login"
          ? "Нет аккаунта? Регистрация"
          : "Уже есть аккаунт? Вход"}
      </button>
    </div>
  );
};

export default AuthPage;
