import { useEffect, useState } from "react";
import { getMe, logoutUser } from "../../api/auth";
import type { User } from "../../types/auth";
import { removeAccessToken } from "../../utils/storage";

const ProfilePage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await getMe();
        setUser(data);
      } catch (err) {
        removeAccessToken();
        window.location.href = "/";
      }
    };

    void loadProfile();
  }, []);

  const handleLogout = async () => {
    try {
      await logoutUser();
    } catch {
    } finally {
      removeAccessToken();
      window.location.href = "/";
    }
  };

  if (error) {
    return <p>{error}</p>;
  }

  if (!user) {
    return <p>Загрузка...</p>;
  }

  return (
    <div>
      <h1>Профиль</h1>
      <p>Email: {user.email}</p>
      <p>Фамилия: {user.last_name ?? "—"}</p>
      <p>Имя: {user.first_name ?? "—"}</p>
      <p>Отчество: {user.middle_name ?? "—"}</p>
      <p>Телефон: {user.phone ?? "—"}</p>

      <button onClick={handleLogout}>Выйти</button>
    </div>
  );
};

export default ProfilePage;
