import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createOrgDataRow,
  deleteOrgDataRow,
  fetchEmployees,
  fetchPositions,
  updateEmployee,
  exportEmployeesXlsx,
  type Employee,
  type Position,
} from "../../api/data";
import Layout from "../../components/Layout";
import ConfirmModal from "../../components/ConfirmModal";
import OrgDataEditor, { type OrgDataField } from "../../components/OrgDataEditor";
import { useOrgDataPermissions } from "../../hooks/useOrgDataPermissions";

const EMPLOYEE_FIELDS = (positions: Position[]): OrgDataField[] => [
  { name: "fio", label: "ФИО", required: true, placeholder: "Фамилия Имя Отчество" },
  {
    name: "position_id",
    label: "Должность",
    type: "select",
    options: positions.map((position) => ({
      value: String(position.id),
      label: `${position.name} (${position.category ?? "—"})`,
    })),
  },
  { name: "contacts", label: "Контакты", type: "textarea" },
];

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
  const [formContacts, setFormContacts] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [actionError, setActionError] = useState("");

  const navigate = useNavigate();
  const { canWrite, organizationId } = useOrgDataPermissions();

  useEffect(() => {
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
      (e.position ?? "").toLowerCase().includes(q) ||
      (e.contacts ?? "").toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setCreating(false);
    setActionError("");
    setFormFio(emp.fio ?? "");
    setFormPosId(emp.position_id ?? "");
    setFormContacts(emp.contacts ?? "");
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setActionError("");
    setFormFio("");
    setFormPosId("");
    setFormContacts("");
  };

  const closeEdit = () => {
    setEditing(null);
    setCreating(false);
    setFormFio("");
    setFormPosId("");
    setFormContacts("");
    setActionError("");
  };

  const saveEdit = async () => {
    if ((!editing && !creating) || !canWrite) return;
    setSaving(true);
    try {
      const body = {
        fio: formFio,
        position_id: formPosId !== "" ? Number(formPosId) : null,
        contacts: formContacts || null,
      };
      if (creating) {
        if (!organizationId) throw new Error("Сначала выберите организацию");
        const created = await createOrgDataRow<Employee>("employees", organizationId, body);
        setEmployees((prev) => [...prev, created]);
      } else if (editing) {
        const updated = await updateEmployee(editing.id, body);
        setEmployees((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
      }
      closeEdit();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const removeEmployee = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteOrgDataRow("employees", deleteTarget.id);
      setEmployees((prev) => prev.filter((employee) => employee.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteTarget(null);
      setActionError(e instanceof Error ? e.message : "Ошибка при удалении");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
            <i className="fa fa-arrow-left me-1" />Назад
          </button>
          <div>
            <h5 className="mb-0 fw-semibold">Кадровый состав</h5>
            <small className="text-muted">Список сотрудников по категориям</small>
          </div>
        </div>
        <div className="d-flex gap-2">
          {canWrite && organizationId && (
            <button className="btn btn-sm btn-outline-primary" onClick={openCreate}>
              <i className="fa fa-plus me-1" />Добавить сотрудника
            </button>
          )}
          <button
            className="btn btn-sm btn-outline-success"
            onClick={() => void exportEmployeesXlsx(tab === "ALL" ? undefined : tab)}
          >
            <i className="fa fa-file-excel me-1" />
            Скачать xlsx
          </button>
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
                    <th>Фамилия</th>
                    <th>Имя</th>
                    <th>Отчество</th>
                    <th>Должность</th>
                    <th>Контакты</th>
                    {canWrite && <th style={{ width: 90 }} className="text-center"><i className="fa fa-cog" /></th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={canWrite ? 6 : 5} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filtered.map((emp) => (
                    <tr key={emp.id}>
                      <td className="fw-semibold">{emp.last_name ?? "—"}</td>
                      <td>{emp.first_name ?? "—"}</td>
                      <td>{emp.middle_name ?? "—"}</td>
                      <td>{emp.position ?? "—"}</td>
                      <td style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{emp.contacts ?? "—"}</td>
                      {canWrite && (
                        <td className="text-center">
                          <button
                            className="btn btn-sm btn-outline-secondary py-0 px-2"
                            title="Редактировать"
                            onClick={() => openEdit(emp)}
                          >
                            <i className="fa fa-pencil" />
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger py-0 px-2 ms-1"
                            title="Удалить"
                            onClick={() => { setActionError(""); setDeleteTarget(emp); }}
                          >
                            <i className="fa fa-trash" />
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

      {canWrite && (editing || creating) && (
        <OrgDataEditor
          title={creating ? "Новый сотрудник" : "Редактировать сотрудника"}
          fields={EMPLOYEE_FIELDS(positions)}
          values={{
            fio: formFio,
            position_id: formPosId === "" ? "" : String(formPosId),
            contacts: formContacts,
          }}
          saving={saving}
          error={actionError}
          onChange={(name, value) => {
            if (name === "fio" && typeof value === "string") setFormFio(value);
            if (name === "position_id" && typeof value === "string") setFormPosId(value ? Number(value) : "");
            if (name === "contacts" && typeof value === "string") setFormContacts(value);
          }}
          onSubmit={() => void saveEdit()}
          onClose={closeEdit}
        />
      )}
      {canWrite && deleteTarget && (
        <ConfirmModal
          title="Удалить сотрудника?"
          text={`Сотрудник «${deleteTarget.fio ?? ([deleteTarget.last_name, deleteTarget.first_name].filter(Boolean).join(" ") || "Без имени")}» будет удалён без возможности восстановления.`}
          busy={saving}
          onConfirm={() => void removeEmployee()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {actionError && !editing && !creating && !deleteTarget && <div className="alert alert-danger mt-3">{actionError}</div>}
    </Layout>
  );
}
