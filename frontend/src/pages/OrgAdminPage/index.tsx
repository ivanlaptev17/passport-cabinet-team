import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import { invalidateTaskContext, useTaskContext } from "../../hooks/useTaskContext";
import { errorText } from "../../api/tasks";
import { fetchBuildings, type Building } from "../../api/data";
import {
  fetchOrgMembers,
  updateOrgMember,
  type AssignableRole,
  type MemberUpdate,
  type OrgMember,
} from "../../api/org";

/** Управление организацией: роли сотрудников и их здания. */
export default function OrgAdminPage() {
  const navigate = useNavigate();
  const ctx = useTaskContext();
  const managed = useMemo(() => (ctx?.organizations ?? []).filter((o) => o.can_manage), [ctx]);

  const [orgId, setOrgId] = useState<number | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // пока организацию не выбрали вручную — первая из доступных
  const activeOrgId = orgId ?? managed[0]?.id ?? null;
  const loading = activeOrgId !== null && loadedFor !== activeOrgId;

  useEffect(() => {
    fetchBuildings().then(setBuildings).catch(() => setBuildings([]));
  }, []);

  useEffect(() => {
    if (activeOrgId === null) return;
    let alive = true;
    fetchOrgMembers(activeOrgId)
      .then((data) => {
        if (!alive) return;
        setMembers(data.members);
        setRoles(data.assignable_roles);
      })
      .catch((e) => alive && setError(errorText(e, "Не удалось загрузить сотрудников")))
      .finally(() => alive && setLoadedFor(activeOrgId));
    return () => {
      alive = false;
    };
  }, [activeOrgId]);

  const orgBuildings = buildings.filter((b) => b.organization_id === activeOrgId);
  const assignable = new Set(roles.map((r) => r.code));

  const visible = members.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return [m.last_name, m.first_name, m.middle_name, m.email, m.position_title]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(q);
  });

  const save = async (member: OrgMember, body: MemberUpdate) => {
    if (activeOrgId === null) return;
    setSavingId(member.user_id);
    setError("");
    try {
      const updated = await updateOrgMember(activeOrgId, member.user_id, body);
      setMembers((prev) => prev.map((m) => (m.user_id === updated.user_id ? updated : m)));
      // права поменялись — шапка и журнал должны перечитать их
      invalidateTaskContext();
    } catch (e) {
      setError(errorText(e, "Не удалось сохранить изменения"));
    } finally {
      setSavingId(null);
    }
  };

  if (ctx && managed.length === 0) {
    return (
      <Layout>
        <div className="mx-auto text-center py-5" style={{ maxWidth: 760 }}>
          <div className="alert alert-warning">Раздел доступен Администратору и Директору ОО</div>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/dashboard")}>
            На главную
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 900 }}>
        <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
          <div>
            <h5 className="mb-0 fw-semibold">Сотрудники организации</h5>
            <small className="text-muted">Роли и здания — от них зависят права в задачах и список участников</small>
          </div>
          {managed.length > 1 && (
            <select className="form-select form-select-sm" style={{ maxWidth: 260 }} value={activeOrgId ?? ""} onChange={(e) => setOrgId(Number(e.target.value))}>
              {managed.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <input
          className="form-control form-control-sm mb-3"
          placeholder="Поиск по имени, почте или должности"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {error && <div className="alert alert-danger py-2">{error}</div>}

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-secondary" />
          </div>
        ) : (
          visible.map((m) => {
            const isMe = m.user_id === ctx?.user_id;
            // Директора и Администратора ОО меняет только администратор системы,
            // а свою роль не меняет никто — бэкенд проверяет то же самое
            const roleLocked = (isMe && !ctx?.is_global_admin) || !assignable.has(m.org_role_code);
            const busy = savingId === m.user_id;
            const name = [m.last_name, m.first_name, m.middle_name].filter(Boolean).join(" ") || m.email;

            return (
              <div key={m.user_id} className="card border-0 shadow-sm rounded-4 mb-2" style={{ opacity: m.is_active ? 1 : 0.55 }}>
                <div className="card-body py-3">
                  <div className="d-flex justify-content-between align-items-start gap-2 mb-2">
                    <div style={{ minWidth: 0 }}>
                      <div className="fw-semibold text-truncate">
                        {name}
                        {isMe && <span className="text-muted fw-normal ms-1" style={{ fontSize: 12 }}>(вы)</span>}
                        {!m.is_active && <span className="badge text-bg-secondary ms-2" style={{ fontSize: 10 }}>неактивен</span>}
                      </div>
                      <div className="text-muted text-truncate" style={{ fontSize: 12 }}>
                        {m.email}
                        {m.phone && ` · ${m.phone}`}
                      </div>
                    </div>
                    {busy && <span className="spinner-border spinner-border-sm text-secondary flex-shrink-0" />}
                  </div>

                  <div className="row g-2">
                    <div className="col-12 col-md-4">
                      <label className="form-label text-muted mb-1" style={{ fontSize: 11 }}>Роль</label>
                      {roleLocked ? (
                        <div className="form-control form-control-sm bg-light" title={isMe ? "Свою роль изменить нельзя" : "Меняет администратор системы"}>
                          {m.org_role_label ?? m.org_role_code}
                          <i className="fa fa-lock text-muted ms-2" style={{ fontSize: 10 }} />
                        </div>
                      ) : (
                        <select
                          className="form-select form-select-sm"
                          value={m.org_role_code}
                          disabled={busy}
                          onChange={(e) => void save(m, { org_role_code: e.target.value })}
                        >
                          {roles.map((r) => (
                            <option key={r.code} value={r.code}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label text-muted mb-1" style={{ fontSize: 11 }}>Здание</label>
                      <select
                        className="form-select form-select-sm"
                        value={m.building_id ?? ""}
                        disabled={busy}
                        onChange={(e) =>
                          void save(m, e.target.value ? { building_id: Number(e.target.value) } : { clear_building: true })
                        }
                      >
                        <option value="">Без здания</option>
                        {orgBuildings.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name ?? `Здание №${b.id}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-12 col-md-4">
                      <label className="form-label text-muted mb-1" style={{ fontSize: 11 }}>Должность</label>
                      <input
                        className="form-control form-control-sm"
                        defaultValue={m.position_title ?? ""}
                        disabled={busy}
                        placeholder="Не указана"
                        // сохраняем по уходу с поля, а не на каждую букву
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          if (value !== (m.position_title ?? "")) void save(m, { position_title: value });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Layout>
  );
}
