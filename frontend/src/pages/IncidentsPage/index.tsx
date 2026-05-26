import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createIncident,
  deleteIncident,
  fetchIncidents,
  fetchOrganizations,
  type Incident,
  type Organization,
  updateIncident,
} from "../../api/data";
import Layout from "../../components/Layout";
import { useAuth } from "../../contexts/AuthContext";

type IncidentForm = {
  organization_id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  incident_date: string;
};

const emptyForm: IncidentForm = {
  organization_id: "",
  title: "",
  description: "",
  status: "OPEN",
  severity: "MEDIUM",
  incident_date: new Date().toISOString().slice(0, 10),
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

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [form, setForm] = useState<IncidentForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();
  const { user } = useAuth();

  const canManage = user?.role_code !== "MINOBR";
  const canDelete = user?.role_code === "DIRECTOR" || user?.role_code === "ADMIN";

  useEffect(() => {
    Promise.all([fetchIncidents(), fetchOrganizations()])
      .then(([incidentsData, orgsData]) => {
        setIncidents(incidentsData);
        setOrganizations(orgsData);
      })
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить инциденты");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const filteredIncidents = useMemo(() => {
    const q = search.toLowerCase();
    return incidents.filter(
      (incident) =>
        incident.title.toLowerCase().includes(q) ||
        (incident.description ?? "").toLowerCase().includes(q) ||
        incident.organization.toLowerCase().includes(q) ||
        statusLabel(incident.status).toLowerCase().includes(q) ||
        severityLabel(incident.severity).toLowerCase().includes(q),
    );
  }, [incidents, search]);

  const openCreate = () => {
    if (!canManage) return;
    setEditing(null);
    setForm({
      ...emptyForm,
      organization_id: organizations[0] ? String(organizations[0].id) : "",
    });
    setModalOpen(true);
  };

  const openEdit = (incident: Incident) => {
    if (!canManage) return;
    setEditing(incident);
    setForm({
      organization_id: String(incident.organization_id),
      title: incident.title,
      description: incident.description ?? "",
      status: incident.status,
      severity: incident.severity,
      incident_date: incident.incident_date,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const saveIncident = async () => {
    if (!canManage) return;

    if (!form.organization_id || !form.title.trim()) {
      alert("Заполните организацию и заголовок");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const updated = await updateIncident(editing.id, {
          title: form.title,
          description: form.description || undefined,
          status: form.status,
          severity: form.severity,
          incident_date: form.incident_date,
        });

        setIncidents((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await createIncident({
          organization_id: Number(form.organization_id),
          title: form.title,
          description: form.description || undefined,
          status: form.status,
          severity: form.severity,
          incident_date: form.incident_date,
        });

        const orgName =
          organizations.find((o) => o.id === created.organization_id)?.name ?? "";

        setIncidents((prev) => [
          { ...created, organization: created.organization || orgName },
          ...prev,
        ]);
      }

      closeModal();
    } catch {
      alert("Ошибка при сохранении инцидента");
    } finally {
      setSaving(false);
    }
  };

  const removeIncident = async (incident: Incident) => {
    if (!canManage) return;

    const ok = window.confirm(`Удалить инцидент "${incident.title}"?`);
    if (!ok) return;

    try {
      await deleteIncident(incident.id);
      setIncidents((prev) => prev.filter((item) => item.id !== incident.id));
    } catch {
      alert("Ошибка при удалении инцидента");
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

            {canManage && (
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
                всего
              </div>

              <div className="card shadow-sm">
                <div className="table-responsive">
                  <table className="table table-bordered mb-0 align-middle">
                    <thead style={{ background: "#efefef" }}>
                      <tr>
                        <th style={{ width: 60 }}>ID</th>
                        <th>Организация</th>
                        <th>Заголовок</th>
                        <th>Описание</th>
                        <th>Статус</th>
                        <th>Важность</th>
                        <th>Дата</th>
                        {canManage && (
                          <th style={{ width: 110 }} className="text-center">
                            Действия
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIncidents.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canManage ? 8 : 7}
                            className="text-center text-muted py-4"
                          >
                            Данные отсутствуют
                          </td>
                        </tr>
                      ) : (
                        filteredIncidents.map((incident) => (
                          <tr key={incident.id}>
                            <td className="text-muted small">{incident.id}</td>
                            <td>{incident.organization}</td>
                            <td>
                              <strong>{incident.title}</strong>
                            </td>
                            <td style={{ minWidth: 260 }}>
                              {incident.description ?? "—"}
                            </td>
                            <td>
                              <span
                                className={`badge text-bg-${statusBadgeClass(
                                  incident.status,
                                )}`}
                              >
                                {statusLabel(incident.status)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`badge text-bg-${severityBadgeClass(
                                  incident.severity,
                                )}`}
                              >
                                {severityLabel(incident.severity)}
                              </span>
                            </td>
                            <td>{formatDate(incident.incident_date)}</td>

                            {canManage && (
                              <td className="text-center">
                                <div className="d-flex justify-content-center gap-2">
                                  <button
                                    className="btn btn-sm btn-outline-secondary py-0 px-2"
                                    title="Редактировать"
                                    onClick={() => openEdit(incident)}
                                  >
                                    <i className="fa fa-pencil" />
                                  </button>
                                  {canDelete && (
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
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {canManage && modalOpen && (
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
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                    />
                  </div>

                  <div className="col-md-4">
                    <label className="form-label small fw-semibold">Дата</label>
                    <input
                      type="date"
                      className="form-control"
                      value={form.incident_date}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          incident_date: e.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">
                      Описание
                    </label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={form.description}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
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
    </Layout>
  );
}
