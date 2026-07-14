import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchOrganizations,
  updateOrganization,
  exportOrganizationsXlsx,
  type Organization,
} from "../../api/data";
import Layout from "../../components/Layout";
import { useAuth } from "../../contexts/AuthContext";

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Organization | null>(null);
  const [form, setForm] = useState<Partial<Organization>>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const { user } = useAuth();

  const canEdit =
    user?.role_code === "ADMIN" || user?.role_code === "DIRECTOR";

  const q = search.toLowerCase();
  const filteredOrgs = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(q) ||
      (o.director_name ?? "").toLowerCase().includes(q) ||
      (o.founder ?? "").toLowerCase().includes(q),
  );

  useEffect(() => {
    fetchOrganizations()
      .then(setOrgs)
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const openEdit = (org: Organization) => {
    if (!canEdit) return;

    setEditing(org);
    setForm({
      name: org.name,
      director_name: org.director_name ?? "",
      governance_body: org.governance_body ?? "",
      founder: org.founder ?? "",
    });
  };

  const closeEdit = () => {
    setEditing(null);
    setForm({});
  };

  const saveEdit = async () => {
    if (!editing || !canEdit) return;

    setSaving(true);
    try {
      const updated = await updateOrganization(editing.id, {
        name: form.name || undefined,
        director_name: form.director_name || undefined,
        governance_body: form.governance_body || undefined,
        founder: form.founder || undefined,
      });
      setOrgs((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      closeEdit();
    } catch {
      alert("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const field = (key: keyof typeof form, label: string) => (
    <div className="mb-3">
      <label className="form-label small fw-semibold">{label}</label>
      <input
        type="text"
        className="form-control"
        value={form[key] ?? ""}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Layout>
      <div className="row g-3">
        <div className="col-lg-9">
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
                <h5 className="mb-0 fw-semibold">Организации</h5>
                <small className="text-muted">Материально-техническая база</small>
              </div>
            </div>
            <button
              className="btn btn-sm btn-outline-success"
              onClick={() => void exportOrganizationsXlsx()}
            >
              <i className="fa fa-file-excel me-1" />
              Скачать xlsx
            </button>
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
                <span className="fw-semibold">{filteredOrgs.length}</span> —
                всего
              </div>

              <div className="card shadow-sm">
                <div className="table-responsive">
                  <table className="table table-bordered mb-0">
                    <thead style={{ background: "#efefef" }}>
                      <tr>
                        <th>Название школы</th>
                        <th>ФИО директора</th>
                        <th>Орган самоуправления</th>
                        <th>Учредитель</th>
                        {canEdit && (
                          <th style={{ width: 60 }} className="text-center">
                            <i className="fa fa-cog" />
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOrgs.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canEdit ? 5 : 4}
                            className="text-center text-muted py-4"
                          >
                            Данные отсутствуют
                          </td>
                        </tr>
                      ) : (
                        filteredOrgs.map((org) => (
                          <tr key={org.id}>
                            <td>
                              <strong>{org.name}</strong>
                            </td>
                            <td>{org.director_name ?? "—"}</td>
                            <td>{org.governance_body ?? "—"}</td>
                            <td>{org.founder ?? "—"}</td>
                            {canEdit && (
                              <td className="text-center">
                                <button
                                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                                  title="Редактировать"
                                  onClick={() => openEdit(org)}
                                >
                                  <i className="fa fa-pencil" />
                                </button>
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

      {canEdit && editing && (
        <div
          className="modal show d-block"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={closeEdit}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div
                className="modal-header"
                style={{ background: "#37474f", color: "white" }}
              >
                <h6 className="modal-title mb-0 fw-semibold">
                  <i className="fa fa-pencil me-2" />
                  Редактировать организацию
                </h6>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={closeEdit}
                />
              </div>
              <div className="modal-body">
                {field("name", "Название учреждения")}
                {field("director_name", "ФИО директора")}
                {field("governance_body", "Управляющий орган")}
                {field("founder", "Учредитель")}
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={closeEdit}>
                  Отмена
                </button>
                <button
                  className="btn btn-sm text-white"
                  style={{ background: "#37474f" }}
                  disabled={saving}
                  onClick={() => void saveEdit()}
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
