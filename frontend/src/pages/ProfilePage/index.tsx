import { useEffect, useState } from "react";
import { getMe } from "../../api/auth";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const data = await getMe();
        setUser(data);
      } catch (error) {
        console.error(error);
      }
    };

    fetchUser();
  }, []);

  if (!user) {
    return <div>Загрузка...</div>;
  }

  return (
    <div>
      <h1>Профиль</h1>
      <p>ID: {user.id}</p>
      <p>Email: {user.email}</p>
      <p>Имя: {user.first_name}</p>
      <p>Фамилия: {user.last_name}</p>
      <p>Телефон: {user.phone}</p>
    </div>
  );
}