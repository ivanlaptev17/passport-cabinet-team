import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  createIncident,
  deleteIncident,
  exportIncidentsXlsx,
  fetchIncidentProblemTypes,
  fetchIncidents,
  fetchOrganizations,
  fetchOrgUsers,
  parseJsonArray,
  setIncidentAssignees,
  updateIncident,
  type Incident,
  type IncidentPerson,
  type IncidentProblemType,
  type Organization,
  type OrgUser,
} from "../../api/data";
import Layout from "../../components/Layout";
import DateField from "../../components/DateField";
import { useAuth } from "../../contexts/AuthContext";

type IncidentForm = {
  organization_id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  incident_date: string;
  due_date: string;
  due_time: string;
  problem_type_ids: number[];
};

const emptyForm: IncidentForm = {
  organization_id: "",
  title: "",
  description: "",
  status: "OPEN",
  severity: "MEDIUM",
  incident_date: new Date().toISOString().slice(0, 10),
  due_date: "",
  due_time: "",
  problem_type_ids: [],
};

function statusLabel(status: string) {
  switch (status) {
    case "OPEN":
      return "Открыт";
    case "IN_PROGRESS":
      return "В работе";
    case "RESOLVED":
      return "Решён";
    default:
      return status;
  }
}

function severityLabel(severity: string) {
  switch (severity) {
    case "LOW":
      return "Низкий";
    case "MEDIUM":
      return "Средний";
    case "HIGH":
      return "Высокий";
    default:
      return severity;
  }
}

function severityBadgeClass(severity: string) {
  switch (severity) {
    case "HIGH":
      return "danger";
    case "MEDIUM":
      return "warning";
    case "LOW":
      return "success";
    default:
      return "secondary";
  }
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "OPEN":
      return "danger";
    case "IN_PROGRESS":
      return "warning";
    case "RESOLVED":
      return "success";
    default:
      return "secondary";
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("ru-RU");
}

function formatDueAt(value: string) {
  const d = new Date(value);
  const datePart = d.toLocaleDateString("ru-RU");
  const timePart = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${datePart} ${timePart}`;
}

function personName(p: IncidentPerson | OrgUser) {
  return [p.last_name, p.first_name].filter(Boolean).join(" ") || "—";
}

function isoDateTimeToParts(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function normalizeIncident(incident: Incident): Incident {
  return {
    ...incident,
    assignees: parseJsonArray<IncidentPerson>(incident.assignees),
    problem_types: parseJsonArray<IncidentProblemType>(incident.problem_types),
  };
}

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [problemTypes, setProblemTypes] = useState<IncidentProblemType[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [form, setForm] = useState<IncidentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [assigneesFor, setAssigneesFor] = useState<Incident | null>(null);
  const [assigneeSelection, setAssigneeSelection] = useState<number[]>([]);
  const [savingAssignees, setSavingAssignees] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = Number(searchParams.get("highlight")) || null;
  const highlightRowRef = useRef<HTMLTableRowElement>(null);
  const { user } = useAuth();

  const isDirector = user?.role_code === "DIRECTOR" || user?.role_code === "ADMIN";
  const canCreate = user?.role_code !== "MINOBR";

  useEffect(() => {
    if (highlightId && highlightRowRef.current) {
      highlightRowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightId, incidents]);

  useEffect(() => {
    Promise.all([
      fetchIncidents(),
      fetchOrganizations(),
      fetchIncidentProblemTypes(),
      fetchOrgUsers(),
    ])
      .then(([incidentsData, orgsData, typesData, usersData]) => {
        setIncidents(incidentsData.map(normalizeIncident));
        setOrganizations(orgsData);
        setProblemTypes(typesData);
        setOrgUsers(usersData);
      })
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить инциденты");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const incidentFlags = (incident: Incident) => {
    const isCreator = incident.created_by_user_id === user?.id;
    const assignees = parseJsonArray<IncidentPerson>(incident.assignees);
    const isAssignee = assignees.some((a) => a.id === user?.id);
    return {
      canEditMeta: isDirector || isCreator,
      canEditStatus: isDirector || isCreator || isAssignee,
      canEditDueAt: isDirector,
      canAssign: isDirector || isCreator,
      canDelete: isDirector,
      assignees,
    };
  };

  const filteredIncidents = useMemo(() => {
    const q = search.toLowerCase();
    return incidents.filter((incident) => {
      const types = parseJsonArray<IncidentProblemType>(incident.problem_types);
      return (
        incident.title.toLowerCase().includes(q) ||
        (incident.description ?? "").toLowerCase().includes(q) ||
        incident.organization.toLowerCase().includes(q) ||
        statusLabel(incident.status).toLowerCase().includes(q) ||
        severityLabel(incident.severity).toLowerCase().includes(q) ||
        types.some((t) => t.name.toLowerCase().includes(q))
      );
    });
  }, [incidents, search]);

  const openCreate = () => {
    if (!canCreate) return;
    setEditing(null);
    setForm({
      ...emptyForm,
      organization_id: organizations[0] ? String(organizations[0].id) : "",
    });
    setModalOpen(true);
  };

  const openEdit = (incident: Incident) => {
    const { date, time } = isoDateTimeToParts(incident.due_at);
    setEditing(incident);
    setForm({
      organization_id: String(incident.organization_id),
      title: incident.title,
      description: incident.description ?? "",
      status: incident.status,
      severity: incident.severity,
      incident_date: incident.incident_date,
      due_date: date,
      due_time: time,
      problem_type_ids: parseJsonArray<IncidentProblemType>(incident.problem_types).map((t) => t.id),
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const toggleProblemType = (id: number) => {
    setForm((prev) => ({
      ...prev,
      problem_type_ids: prev.problem_type_ids.includes(id)
        ? prev.problem_type_ids.filter((t) => t !== id)
        : [...prev.problem_type_ids, id],
    }));
  };

  const saveIncident = async () => {
    if (!form.organization_id || !form.title.trim()) {
      alert("Заполните организацию и заголовок");
      return;
    }

    const due_at = form.due_date ? `${form.due_date}T${form.due_time || "00:00"}:00` : undefined;

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateIncident(editing.id, {
          title: form.title,
          description: form.description || undefined,
          status: form.status,
          severity: form.severity,
          incident_date: form.incident_date,
          due_at,
          problem_type_ids: form.problem_type_ids,
        });

        const normalized = normalizeIncident(updated);
        setIncidents((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)));
      } else {
        const created = await createIncident({
          organization_id: Number(form.organization_id),
          title: form.title,
          description: form.description || undefined,
          status: form.status,
          severity: form.severity,
          incident_date: form.incident_date,
          due_at,
          problem_type_ids: form.problem_type_ids,
        });

        const orgName =
          organizations.find((o) => o.id === created.organization_id)?.name ?? "";

        const normalized = normalizeIncident({ ...created, organization: created.organization || orgName });
        setIncidents((prev) => [normalized, ...prev]);
      }

      closeModal();
    } catch {
      alert("Ошибка при сохранении инцидента");
    } finally {
      setSaving(false);
    }
  };

  const removeIncident = async (incident: Incident) => {
    const ok = window.confirm(`Удалить инцидент "${incident.title}"?`);
    if (!ok) return;

    try {
      await deleteIncident(incident.id);
      setIncidents((prev) => prev.filter((item) => item.id !== incident.id));
    } catch {
      alert("Ошибка при удалении инцидента");
    }
  };

  const openAssignees = (incident: Incident) => {
    setAssigneesFor(incident);
    setAssigneeSelection(parseJsonArray<IncidentPerson>(incident.assignees).map((a) => a.id));
  };

  const closeAssignees = () => setAssigneesFor(null);

  const toggleAssignee = (uid: number) => {
    setAssigneeSelection((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid],
    );
  };

  const saveAssignees = async () => {
    if (!assigneesFor) return;
    setSavingAssignees(true);
    try {
      const updated = await setIncidentAssignees(assigneesFor.id, assigneeSelection);
      const normalized = normalizeIncident(updated);
      setIncidents((prev) => prev.map((item) => (item.id === normalized.id ? normalized : item)));
      closeAssignees();
    } catch {
      alert("Ошибка при назначении исполнителей");
    } finally {
      setSavingAssignees(false);
    }
  };

  return (
    <Layout>
      <div className="row g-3">
        <div className="col-12">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-3">
            <div className="d-flex align-items-center gap-3">
              <button
                className="btn btn-sm btn-outline-secondary"
                onClick={() => navigate("/dashboard")}
              >
                <i className="fa fa-arrow-left me-1" />
                Назад
              </button>
              <div>
                <h5 className="mb-0 fw-semibold">Инциденты</h5>
                <small className="text-muted">
                  Конфликтные и проблемные ситуации по организациям
                </small>
              </div>
            </div>

            <div className="d-flex gap-2">
              <button
                className="btn btn-sm btn-outline-success"
                onClick={() => void exportIncidentsXlsx()}
              >
                <i className="fa fa-file-excel me-1" />
                Скачать xlsx
              </button>
              {canCreate && (
                <button
                  className="btn btn-sm text-white border-0 px-3 py-2 rounded-pill shadow-sm"
                  style={{
                    background: "linear-gradient(135deg, #dc3545, #c82333)",
                    fontWeight: 600,
                  }}
                  onClick={openCreate}
                >
                  <i className="fa fa-plus me-2" />
                  Добавить инцидент
                </button>
              )}
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

          {loading && (
            <div className="text-center py-5">
              <div className="spinner-border text-secondary" />
            </div>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          {!loading && !error && (
            <>
              <div className="text-muted small mb-2">
                <span className="fw-semibold">{filteredIncidents.length}</span> —
                всего · отсортированы по статусу и важности
              </div>

              <div className="card shadow-sm">
                <div className="table-responsive">
                  <table className="table table-bordered mb-0 align-middle">
                    <thead style={{ background: "#efefef" }}>
                      <tr>
                        <th style={{ width: 60 }}>ID</th>
                        <th>Организация</th>
                        <th>Заголовок</th>
                        <th>Типы</th>
                        <th>Статус</th>
                        <th>Важность</th>
                        <th>Дата</th>
                        <th>Срок</th>
                        <th>Исполнители</th>
                        <th style={{ width: 130 }} className="text-center">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncidents.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center text-muted py-4">
                            Данные отсутствуют
                          </td>
                        </tr>
                      ) : (
                        filteredIncidents.map((incident) => {
                          const flags = incidentFlags(incident);
                          const types = parseJsonArray<IncidentProblemType>(incident.problem_types);
                          const unassigned = incident.status !== "RESOLVED" && flags.assignees.length === 0;

                          return (
                            <tr
                              key={incident.id}
                              ref={incident.id === highlightId ? highlightRowRef : null}
                              style={{
                                background:
                                  incident.id === highlightId
                                    ? "#fff3cd"
                                    : unassigned
                                      ? "#fff5f5"
                                      : undefined,
                                borderLeft: unassigned ? "3px solid #dc3545" : undefined,
                                transition: "background 0.5s",
                              }}
                            >
                              <td className="text-muted small">{incident.id}</td>
                              <td>{incident.organization}</td>
                              <td style={{ minWidth: 200 }}>
                                <strong>{incident.title}</strong>
                                <div className="text-muted" style={{ fontSize: 11 }}>
                                  {incident.description ?? ""}
                                </div>
                              </td>
                              <td>
                                {types.length === 0 ? (
                                  <span className="text-muted">—</span>
                                ) : (
                                  types.map((t) => (
                                    <span
                                      key={t.id}
                                      className="badge text-bg-light border me-1 mb-1"
                                      style={{ fontSize: 11 }}
                                    >
                                      {t.name}
                                    </span>
                                  ))
                                )}
                              </td>
                              <td>
                                <span className={`badge text-bg-${statusBadgeClass(incident.status)}`}>
                                  {statusLabel(incident.status)}
                                </span>
                              </td>
                              <td>
                                <span className={`badge text-bg-${severityBadgeClass(incident.severity)}`}>
                                  {severityLabel(incident.severity)}
                                </span>
                              </td>
                              <td style={{ whiteSpace: "nowrap" }}>{formatDate(incident.incident_date)}</td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                {incident.due_at ? formatDueAt(incident.due_at) : "—"}
                              </td>
                              <td style={{ minWidth: 140 }}>
                                {flags.assignees.length === 0 ? (
                                  <span className="badge text-bg-danger-subtle text-danger border border-danger-subtle">
                                    Не назначен
                                  </span>
                                ) : (
                                  flags.assignees.map((a) => (
                                    <div key={a.id} style={{ fontSize: 12 }}>
                                      {personName(a)}
                                    </div>
                                  ))
                                )}
                              </td>

                              <td className="text-center">
                                <div className="d-flex justify-content-center gap-2">
                                  {(flags.canEditMeta || flags.canEditStatus) && (
                                    <button
                                      className="btn btn-sm btn-outline-secondary py-0 px-2"
                                      title="Редактировать"
                                      onClick={() => openEdit(incident)}
                                    >
                                      <i className="fa fa-pencil" />
                                    </button>
                                  )}
                                  {flags.canAssign && (
                                    <button
                                      className="btn btn-sm btn-outline-primary py-0 px-2"
                                      title="Назначить исполнителей"
                                      onClick={() => openAssignees(incident)}
                                    >
                                      <i className="fa fa-user-check" />
                                    </button>
                                  )}
                                  {flags.canDelete && (
                                    <button
                                      className="btn btn-sm btn-outline-danger py-0 px-2"
                                      title="Удалить"
                                      onClick={() => void removeIncident(incident)}
                                    >
                                      <i className="fa fa-trash" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create / edit modal */}
      {modalOpen && (
        <div
          className="modal show d-block"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={closeModal}
        >
          <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div
                className="modal-header"
                style={{ background: "#37474f", color: "white" }}
              >
                <h6 className="modal-title mb-0 fw-semibold">
                  <i className="fa fa-triangle-exclamation me-2" />
                  {editing ? "Редактировать инцидент" : "Новый инцидент"}
                </h6>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeModal}
                />
              </div>

              <div className="modal-body">
                {(() => {
                  const flags = editing ? incidentFlags(editing) : {
                    canEditMeta: true,
                    canEditStatus: true,
                    canEditDueAt: isDirector,
                  };
                  return (
                    <div className="row g-3">
                      <div className="col-md-4">
                        <label className="form-label small fw-semibold">
                          Организация
                        </label>
                        <select
                          className="form-select"
                          value={form.organization_id}
                          disabled={!!editing}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              organization_id: e.target.value,
                            }))
                          }
                        >
                          <option value="">Выберите организацию</option>
                          {organizations.map((org) => (
                            <option key={org.id} value={org.id}>
                              {org.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-md-4">
                        <label className="form-label small fw-semibold">Статус</label>
                        <select
                          className="form-select"
                          value={form.status}
                          disabled={!flags.canEditStatus}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, status: e.target.value }))
                          }
                        >
                          <option value="OPEN">Открыт</option>
                          <option value="IN_PROGRESS">В работе</option>
                          <option value="RESOLVED">Решён</option>
                        </select>
                      </div>

                      <div className="col-md-4">
                        <label className="form-label small fw-semibold">
                          Важность
                        </label>
                        <select
                          className="form-select"
                          value={form.severity}
                          disabled={!flags.canEditMeta}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, severity: e.target.value }))
                          }
                        >
                          <option value="LOW">Низкий</option>
                          <option value="MEDIUM">Средний</option>
                          <option value="HIGH">Высокий</option>
                        </select>
                      </div>

                      <div className="col-md-8">
                        <label className="form-label small fw-semibold">
                          Заголовок
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={form.title}
                          disabled={!flags.canEditMeta}
                          onChange={(e) =>
                            setForm((prev) => ({ ...prev, title: e.target.value }))
                          }
                        />
                      </div>

                      <div className="col-md-4">
                        <label className="form-label small fw-semibold">Дата</label>
                        <DateField
                          value={form.incident_date}
                          disabled={!flags.canEditMeta}
                          onChange={(iso) =>
                            setForm((prev) => ({ ...prev, incident_date: iso }))
                          }
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label small fw-semibold">
                          Описание
                        </label>
                        <textarea
                          className="form-control"
                          rows={3}
                          value={form.description}
                          disabled={!flags.canEditMeta}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              description: e.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label small fw-semibold">
                          Тип проблемы
                        </label>
                        <div className="d-flex flex-wrap gap-2">
                          {problemTypes.map((t) => {
                            const checked = form.problem_type_ids.includes(t.id);
                            return (
                              <button
                                type="button"
                                key={t.id}
                                disabled={!flags.canEditMeta}
                                className={`btn btn-sm rounded-pill ${
                                  checked ? "btn-secondary" : "btn-outline-secondary"
                                }`}
                                onClick={() => toggleProblemType(t.id)}
                              >
                                {checked && <i className="fa fa-check me-1" />}
                                {t.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="col-12">
                        <label className="form-label small fw-semibold">
                          Срок исполнения
                          {!flags.canEditDueAt && (
                            <span className="text-muted fw-normal"> (устанавливает директор)</span>
                          )}
                        </label>
                        <div className="row g-2">
                          <div className="col-6">
                            <DateField
                              value={form.due_date}
                              disabled={!flags.canEditDueAt}
                              onChange={(iso) => setForm((prev) => ({ ...prev, due_date: iso }))}
                            />
                          </div>
                          <div className="col-6">
                            <input
                              type="time"
                              className="form-control"
                              value={form.due_time}
                              disabled={!flags.canEditDueAt}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, due_time: e.target.value }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={closeModal}>
                  Отмена
                </button>
                <button
                  className="btn btn-sm text-white"
                  style={{ background: "#37474f" }}
                  disabled={saving}
                  onClick={() => void saveIncident()}
                >
                  {saving && (
                    <span className="spinner-border spinner-border-sm me-1" />
                  )}
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assignees modal */}
      {assigneesFor && (
        <div
          className="modal show d-block"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={closeAssignees}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
                <h6 className="modal-title mb-0 fw-semibold">
                  <i className="fa fa-user-check me-2" />
                  Исполнители: {assigneesFor.title}
                </h6>
                <button type="button" className="btn-close btn-close-white" onClick={closeAssignees} />
              </div>

              <div className="modal-body">
                {orgUsers.length === 0 ? (
                  <div className="text-muted text-center py-3">Нет доступных сотрудников</div>
                ) : (
                  <div className="border rounded-3 p-2" style={{ maxHeight: 260, overflowY: "auto" }}>
                    {orgUsers.map((u) => (
                      <div key={u.id} className="form-check mb-1">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id={`assignee-${u.id}`}
                          checked={assigneeSelection.includes(u.id)}
                          onChange={() => toggleAssignee(u.id)}
                        />
                        <label className="form-check-label" htmlFor={`assignee-${u.id}`} style={{ fontSize: 13 }}>
                          {personName(u)}
                          <span className="text-muted ms-1" style={{ fontSize: 11 }}>{u.email}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={closeAssignees}>
                  Отмена
                </button>
                <button
                  className="btn btn-sm text-white"
                  style={{ background: "#37474f" }}
                  disabled={savingAssignees}
                  onClick={() => void saveAssignees()}
                >
                  {savingAssignees && <span className="spinner-border spinner-border-sm me-1" />}
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
