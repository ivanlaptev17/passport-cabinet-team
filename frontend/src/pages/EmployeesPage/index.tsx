import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchEmployees, fetchPositions, updateEmployee, type Employee, type Position } from "../../api/data";
import Layout from "../../components/Layout";
import { useAuth } from "../../contexts/AuthContext";

type Tab = "ALL" | "ADM" | "TEACH" | "TECH";

const TAB_LABELS: Record<Tab, string> = {
  ALL:   "Все сотрудники",
  ADM:   "АУП",
  TEACH: "Педагогические кадры + УВП",
  TECH:  "МОП",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("ALL");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [formFio, setFormFio] = useState("");
  const [formPosId, setFormPosId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role_code !== "MINOBR";

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchEmployees(), fetchPositions()])
      .then(([emps, pos]) => { setEmployees(emps); setPositions(pos); })
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const filtered = employees.filter((e) => {
    const matchTab = tab === "ALL" || e.category_code === tab;
    const q = search.toLowerCase();
    const matchSearch =
      (e.last_name ?? "").toLowerCase().includes(q) ||
      (e.first_name ?? "").toLowerCase().includes(q) ||
      (e.middle_name ?? "").toLowerCase().includes(q) ||
      (e.position ?? "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setFormFio(emp.fio ?? "");
    setFormPosId(emp.position_id ?? "");
  };

  const closeEdit = () => { setEditing(null); setFormFio(""); setFormPosId(""); };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await updateEmployee(editing.id, {
        fio: formFio || undefined,
        position_id: formPosId !== "" ? Number(formPosId) : undefined,
      });
      setEmployees((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
      closeEdit();
    } catch {
      alert("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
          <i className="fa fa-arrow-left me-1" />Назад
        </button>
        <div>
          <h5 className="mb-0 fw-semibold">Кадровый состав</h5>
          <small className="text-muted">Список сотрудников по категориям</small>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="Поиск..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ul className="nav nav-tabs mb-3">
        {(["ALL", "ADM", "TEACH", "TECH"] as Tab[]).map((t) => {
          const count = employees.filter((e) => t === "ALL" || e.category_code === t).length;
          return (
            <li key={t} className="nav-item">
              <button className={`nav-link ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                {TAB_LABELS[t]} ({count})
              </button>
            </li>
          );
        })}
      </ul>

      {loading && <div className="text-center py-5"><div className="spinner-border text-secondary" /></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <>
          <div className="text-muted small mb-2">
            <span className="fw-semibold">{filtered.length}</span> — всего
          </div>
          <div className="card shadow-sm">
            <div className="table-responsive">
              <table className="table table-bordered mb-0">
                <thead style={{ background: "#37474f", color: "white" }}>
                  <tr>
                    <th>ID школы</th>
                    <th>Фамилия</th>
                    <th>Имя</th>
                    <th>Отчество</th>
                    <th>Должность</th>
                    <th>Телефон</th>
                    {canEdit && <th style={{ width: 60 }} className="text-center"><i className="fa fa-cog" /></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={canEdit ? 7 : 6} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filtered.map((emp) => (
                    <tr key={emp.id}>
                      <td className="text-muted small">{emp.organization_id}</td>
                      <td className="fw-semibold">{emp.last_name ?? "—"}</td>
                      <td>{emp.first_name ?? "—"}</td>
                      <td>{emp.middle_name ?? "—"}</td>
                      <td>{emp.position ?? "—"}</td>
                      <td>{emp.phone ?? "—"}</td>
                      {canEdit && (
                        <td className="text-center">
                          <button
                            className="btn btn-sm btn-outline-secondary py-0 px-2"
                            title="Редактировать"
                            onClick={() => openEdit(emp)}
                          >
                            <i className="fa fa-pencil" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {canEdit && editing && (
        <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={closeEdit}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
                <h6 className="modal-title mb-0 fw-semibold"><i className="fa fa-pencil me-2" />Редактировать сотрудника</h6>
                <button className="btn-close btn-close-white" onClick={closeEdit} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">ФИО</label>
                  <input type="text" className="form-control" value={formFio}
                    onChange={(e) => setFormFio(e.target.value)} placeholder="Фамилия Имя Отчество" />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Должность</label>
                  <select className="form-select" value={formPosId}
                    onChange={(e) => setFormPosId(e.target.value ? Number(e.target.value) : "")}>
                    <option value="">— не указана —</option>
                    {positions.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.category ?? "—"})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={closeEdit}>Отмена</button>
                <button className="btn btn-sm text-white" style={{ background: "#37474f" }}
                  disabled={saving} onClick={() => void saveEdit()}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
