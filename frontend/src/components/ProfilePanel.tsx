import { useEffect, useState } from "react";
import { fetchProfile, type Profile } from "../api/data";

export default function ProfilePanel() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    fetchProfile().then(setProfile).catch(() => null);
  }, []);

  const fio =
    profile &&
    [profile.last_name, profile.first_name, profile.middle_name]
      .filter(Boolean)
      .join(" ");

  return (
    <div className="card shadow-sm" style={{ position: "sticky", top: 20 }}>
      <div
        className="card-header text-white text-center py-3"
        style={{ background: "#37474f" }}
      >
        <div
          className="rounded-circle mx-auto d-flex align-items-center justify-content-center mb-2"
          style={{
            width: 56,
            height: 56,
            background: "rgba(255,255,255,0.15)",
            fontSize: 24,
          }}
        >
          <i className="fa fa-user" />
        </div>
        <div className="fw-semibold" style={{ fontSize: 14 }}>
          {fio || profile?.email || "—"}
        </div>
        {profile?.role_name && (
          <div style={{ fontSize: 12, opacity: 0.75 }}>{profile.role_name}</div>
        )}
      </div>

      <div className="card-body p-3">
        {!profile ? (
          <div className="text-center py-2">
            <div className="spinner-border spinner-border-sm text-secondary" />
          </div>
        ) : (
          <ul className="list-unstyled mb-0" style={{ fontSize: 13 }}>
            <ProfileRow icon="fa-envelope" label="Email" value={profile.email} />
            <ProfileRow
              icon="fa-phone"
              label="Телефон"
              value={profile.phone ?? "—"}
            />
            <ProfileRow
              icon="fa-university"
              label="Организация"
              value={profile.organization_name ?? "—"}
            />
            <ProfileRow
              icon="fa-id-badge"
              label="Роль"
              value={profile.role_name ?? "—"}
            />
          </ul>
        )}
      </div>
    </div>
  );
}

function ProfileRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <li className="d-flex gap-2 align-items-start py-2 border-bottom">
      <i
        className={`fa ${icon} mt-1 text-secondary`}
        style={{ width: 16, flexShrink: 0 }}
      />
      <div>
        <div className="text-muted" style={{ fontSize: 11, lineHeight: 1.2 }}>
          {label}
        </div>
        <div className="fw-semibold" style={{ wordBreak: "break-word" }}>
          {value}
        </div>
      </div>
    </li>
  );
}
