import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchBuildings,
  updateBuilding,
  type Building,
} from "../../api/data";
import Layout from "../../components/Layout";
import ProfilePanel from "../../components/ProfilePanel";

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Building | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    fetchBuildings()
      .then(setBuildings)
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const openEdit = (b: Building) => {
    setEditing(b);
    setFormName(b.name ?? "");
    setFormAddress(b.address ?? "");
  };

  const closeEdit = () => {
    setEditing(null);
    setFormName("");
    setFormAddress("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await updateBuilding(editing.id, {
        name: formName || undefined,
        address: formAddress || undefined,
      });
      setBuildings((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b)),
      );
      closeEdit();
    } catch {
      alert("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("ru-RU") : "—";

  return (
    <Layout>
      <div className="row g-3">
        {/* Main table */}
        <div className="col-lg-9">
          <div className="d-flex align-items-center gap-3 mb-3">
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => navigate("/dashboard")}
            >
              <i className="fa fa-arrow-left me-1" />
              Назад
            </button>
            <div>
              <h5 className="mb-0 fw-semibold">Здания</h5>
              <small className="text-muted">Материально-техническая база</small>
            </div>
          </div>

          {loading && (
            <div className="text-center py-5">
              <div className="spinner-border text-secondary" />
            </div>
          )}
          {error && <div className="alert alert-danger">{error}</div>}

          {!loading && !error && (
            <div className="card shadow-sm">
              <div className="table-responsive">
                <table className="table table-bordered mb-0">
                  <thead style={{ background: "#efefef" }}>
                    <tr>
                      <th style={{ width: 50 }}>ID</th>
                      <th>Название</th>
                      <th>Адрес</th>
                      <th>Организация</th>
                      <th>Дата ввода</th>
                      <th style={{ width: 60 }} className="text-center">
                        <i className="fa fa-cog" />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          Данные отсутствуют
                        </td>
                      </tr>
                    ) : (
                      buildings.map((b) => (
                        <tr key={b.id}>
                          <td className="text-muted small">{b.id}</td>
                          <td>
                            <strong>{b.name ?? "—"}</strong>
                          </td>
                          <td>{b.address ?? "—"}</td>
                          <td>{b.organization}</td>
                          <td>{formatDate(b.created_at)}</td>
                          <td className="text-center">
                            <button
                              className="btn btn-sm btn-outline-secondary py-0 px-2"
                              title="Редактировать"
                              onClick={() => openEdit(b)}
                            >
                              <i className="fa fa-pencil" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Profile panel */}
        <div className="col-lg-3">
          <ProfilePanel />
        </div>
      </div>

      {/* Edit modal */}
      {editing && (
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
                  Редактировать здание
                </h6>
                <button
                  className="btn-close btn-close-white"
                  onClick={closeEdit}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Название</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">Адрес</label>
                  <input
                    type="text"
                    className="form-control"
                    value={formAddress}
                    onChange={(e) => setFormAddress(e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={closeEdit}
                >
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
