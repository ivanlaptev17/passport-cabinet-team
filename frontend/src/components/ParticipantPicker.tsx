import { useEffect, useMemo, useState } from "react";
import { fetchTaskOrgUsers, type OrgUserGroup } from "../api/tasks";

type Props = {
  organizationId: number;
  selected: number[];
  onClose: () => void;
  onSave: (userIds: number[]) => Promise<void> | void;
};

function fullName(u: OrgUserGroup["users"][number]) {
  return [u.last_name, u.first_name, u.middle_name].filter(Boolean).join(" ") || u.email;
}

export default function ParticipantPicker({ organizationId, selected, onClose, onSave }: Props) {
  const [groups, setGroups] = useState<OrgUserGroup[]>([]);
  const [chosen, setChosen] = useState<number[]>(selected);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTaskOrgUsers(organizationId)
      .then(setGroups)
      .catch(() => setError("Не удалось загрузить список сотрудников"))
      .finally(() => setLoading(false));
  }, [organizationId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, users: g.users.filter((u) => fullName(u).toLowerCase().includes(q)) }))
      .filter((g) => g.users.length > 0);
  }, [groups, search]);

  const toggle = (id: number) =>
    setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(chosen);
      onClose();
    } catch {
      setError("Не удалось сохранить участников");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content rounded-4 border-0">
          <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
            <h6 className="modal-title mb-0 fw-semibold">
              <i className="fa fa-user-plus me-2" />
              Добавление участника
            </h6>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>

          <div className="modal-body">
            <input
              className="form-control mb-3"
              placeholder="Поиск по фамилии или имени"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {loading && (
              <div className="text-center py-4">
                <div className="spinner-border text-secondary" />
              </div>
            )}

            {error && <div className="alert alert-danger py-2">{error}</div>}

            {!loading && filtered.length === 0 && (
              <div className="text-muted text-center py-4">Никого не найдено</div>
            )}

            {filtered.map((group) => (
              <div key={group.building_id ?? "none"} className="mb-3">
                <div
                  className="text-uppercase text-muted fw-semibold mb-2"
                  style={{ fontSize: 11, letterSpacing: 0.4 }}
                >
                  <i className="fa fa-building me-1" />
                  {group.building_name ?? "Без здания"}
                </div>

                {group.users.map((u) => {
                  const active = chosen.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      className={`btn w-100 text-start d-flex align-items-center gap-2 mb-1 rounded-3 ${
                        active ? "btn-secondary" : "btn-outline-secondary"
                      }`}
                      style={{ padding: "10px 12px" }}
                      onClick={() => toggle(u.id)}
                    >
                      <i className={`fa ${active ? "fa-circle-check" : "fa-circle"}`} />
                      <span className="flex-grow-1" style={{ fontSize: 14 }}>
                        {fullName(u)}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="modal-footer">
            <span className="me-auto text-muted" style={{ fontSize: 12 }}>
              Выбрано: {chosen.length}
            </span>
            <button className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button
              className="btn btn-sm text-white"
              style={{ background: "#37474f" }}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving && <span className="spinner-border spinner-border-sm me-1" />}
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
