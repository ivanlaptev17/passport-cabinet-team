import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser, registerUser } from "../../api/auth";
import { saveToken } from "../../utils/storage";
import "./AuthPage.css";

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = isLogin
        ? await loginUser(email, password)
        : await registerUser(email, password);

      saveToken(response.access_token);

      // ВОТ ЭТО НЕ ХВАТАЛО
      navigate("/profile");

    } catch (error) {
      console.error(error);
      alert("Ошибка запроса");
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>{isLogin ? "Вход" : "Регистрация"}</h1>

        <input
          type="email"
          placeholder="Email"
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
          {isLogin ? "Войти" : "Зарегистрироваться"}
        </button>

        <button
          type="button"
          className="switch-button"
          onClick={() => setIsLogin(!isLogin)}
        >
          {isLogin ? "Перейти к регистрации" : "Перейти ко входу"}
        </button>
      </form>
    </div>
  );
}
