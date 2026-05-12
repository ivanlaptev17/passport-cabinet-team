import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { fetchProfile, type Profile } from "../../api/data";

function InfoCard({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="col-md-6">
      <div className="card border-0 shadow-sm h-100 rounded-4">
        <div className="card-body d-flex align-items-start gap-3">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle"
            style={{
              width: 44,
              height: 44,
              background: "#eef2f5",
              color: "#37474f",
              flexShrink: 0,
            }}
          >
            <i className={`fa ${icon}`} />
          </div>

          <div>
            <div className="text-muted mb-1" style={{ fontSize: 12 }}>
              {label}
            </div>
            <div className="fw-semibold" style={{ wordBreak: "break-word" }}>
              {value}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchProfile().then(setProfile).catch(() => null);
  }, []);

  const fullName = useMemo(() => {
    if (!profile) return "";
    return [profile.last_name, profile.first_name, profile.middle_name]
      .filter(Boolean)
      .join(" ");
  }, [profile]);

  const initials = useMemo(() => {
    if (!profile) return "U";

    const letters = [profile.first_name?.[0], profile.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase();

    return letters || (profile.email?.[0]?.toUpperCase() ?? "U");
  }, [profile]);

  return (
    <Layout>
      {!profile ? (
        <div className="min-vh-50 d-flex align-items-center justify-content-center">
          <div className="spinner-border text-secondary" />
        </div>
      ) : (
        <div className="row justify-content-center">
          <div className="col-xl-10">
            <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
              <div
                className="px-4 px-md-5 py-4 text-white"
                style={{
                  background: "linear-gradient(135deg, #37474f, #546e7a)",
                }}
              >
                <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-4">
                  <div className="d-flex align-items-center gap-4">
                    <div
                      className="d-flex align-items-center justify-content-center fw-bold"
                      style={{
                        width: 84,
                        height: 84,
                        borderRadius: "50%",
                        background: "rgba(255,255,255,0.18)",
                        fontSize: 28,
                        flexShrink: 0,
                      }}
                    >
                      {initials}
                    </div>

                    <div>
                      <h3 className="mb-1 fw-bold">
                        {fullName || "Пользователь без заполненного ФИО"}
                      </h3>
                      <div style={{ opacity: 0.85 }}>{profile.email}</div>
                      <div className="mt-2" style={{ fontSize: 14, opacity: 0.8 }}>
                        {profile.role_name ?? "Роль не указана"}
                      </div>
                    </div>
                  </div>

                  <div className="d-flex gap-2 flex-wrap">
                    <button
                      className="btn btn-light btn-sm px-3"
                      onClick={() => navigate("/settings")}
                    >
                      <i className="fa fa-pen me-2" />
                      Редактировать профиль
                    </button>

                    <button
                      className="btn btn-outline-light btn-sm px-3"
                      onClick={() => navigate("/dashboard")}
                    >
                      <i className="fa fa-house me-2" />
                      На главную
                    </button>
                  </div>
                </div>
              </div>

              <div className="card-body p-4 p-md-5">
                <div className="mb-4">
                  <h5 className="fw-semibold mb-1">Информация о пользователе</h5>
                  <p className="text-muted mb-0">
                    Основные данные вашей учётной записи и связанной информации.
                  </p>
                </div>

                <div className="row g-3">
                  <InfoCard
                    icon="fa-envelope"
                    label="Email"
                    value={profile.email}
                  />
                  <InfoCard
                    icon="fa-phone"
                    label="Телефон"
                    value={profile.phone ?? "Не указан"}
                  />
                  <InfoCard
                    icon="fa-user"
                    label="Фамилия"
                    value={profile.last_name ?? "Не указана"}
                  />
                  <InfoCard
                    icon="fa-user"
                    label="Имя"
                    value={profile.first_name ?? "Не указано"}
                  />
                  <InfoCard
                    icon="fa-user"
                    label="Отчество"
                    value={profile.middle_name ?? "Не указано"}
                  />
                  <InfoCard
                    icon="fa-university"
                    label="Организация"
                    value={profile.organization_name ?? "Не указана"}
                  />
                  <InfoCard
                    icon="fa-id-badge"
                    label="Роль"
                    value={profile.role_name ?? "Не указана"}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

