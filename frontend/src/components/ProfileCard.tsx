import { useEffect, useState } from "react";
import { errorText, fetchUserProfile, type UserProfile } from "../api/tasks";

type Props = {
  userId: number;
  organizationId: number;
  onClose: () => void;
};

/** Карточка сотрудника: открывается по нажатию на участника задачи. */
export default function ProfileCard({ userId, organizationId, onClose }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetchUserProfile(userId, organizationId)
      .then((p) => alive && setProfile(p))
      .catch((e) => alive && setError(errorText(e, "Не удалось загрузить профиль")));
    return () => {
      alive = false;
    };
  }, [userId, organizationId]);

  const fullName = profile
    ? [profile.last_name, profile.first_name, profile.middle_name].filter(Boolean).join(" ") || profile.email
    : "";
  const initials = profile ? `${profile.last_name?.[0] ?? ""}${profile.first_name?.[0] ?? ""}` : "";

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content rounded-4 border-0">
          <div className="modal-body p-4">
            <div className="d-flex justify-content-end">
              <button type="button" className="btn-close" onClick={onClose} />
            </div>

            {!profile && !error && (
              <div className="text-center py-4">
                <div className="spinner-border text-secondary" />
              </div>
            )}
            {error && <div className="alert alert-warning mb-0">{error}</div>}

            {profile && (
              <>
                <div className="text-center mb-3">
                  <div
                    className="rounded-circle d-inline-flex align-items-center justify-content-center text-white mb-2"
                    style={{ width: 64, height: 64, background: "#90a4ae", fontSize: 22 }}
                  >
                    {initials || <i className="fa fa-user" />}
                  </div>
                  {profile.org_role_label && (
                    <div className="text-muted text-uppercase" style={{ fontSize: 11, letterSpacing: 0.4 }}>
                      {profile.org_role_label}
                    </div>
                  )}
                  <h6 className="fw-semibold mb-0 mt-1">{fullName}</h6>
                  {profile.position_title && (
                    <div className="text-muted" style={{ fontSize: 13 }}>{profile.position_title}</div>
                  )}
                </div>

                <div className="d-flex flex-column gap-2" style={{ fontSize: 14 }}>
                  {profile.phone && (
                    <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`} className="d-flex align-items-center gap-2 text-decoration-none text-dark border rounded-3 px-3 py-2">
                      <i className="fa fa-phone text-muted" />
                      {profile.phone}
                    </a>
                  )}
                  <a href={`mailto:${profile.email}`} className="d-flex align-items-center gap-2 text-decoration-none text-dark border rounded-3 px-3 py-2">
                    <i className="fa fa-envelope text-muted" />
                    {profile.email}
                  </a>
                  {profile.building_name && (
                    <div className="d-flex align-items-center gap-2 border rounded-3 px-3 py-2">
                      <i className="fa fa-building text-muted" />
                      {profile.building_name}
                    </div>
                  )}
                  <div className="text-muted text-center mt-1" style={{ fontSize: 12 }}>{profile.organization}</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
