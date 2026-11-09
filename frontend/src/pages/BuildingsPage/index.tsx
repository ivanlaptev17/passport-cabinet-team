import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createOrgDataRow,
  deleteOrgDataRow,
  fetchBuildings,
  updateBuilding,
  type Building,
} from "../../api/data";
import Layout from "../../components/Layout";
import ConfirmModal from "../../components/ConfirmModal";
import OrgDataEditor, { type OrgDataField } from "../../components/OrgDataEditor";
import { useOrgDataPermissions } from "../../hooks/useOrgDataPermissions";

const BUILDING_FIELDS: OrgDataField[] = [
  { name: "name", label: "Название", required: true },
  { name: "address", label: "Адрес" },
];

export default function BuildingsPage() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Building | null>(null);
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Building | null>(null);
  const [actionError, setActionError] = useState("");
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const { canManage, organizationId } = useOrgDataPermissions();

  const q = search.toLowerCase();
  const filteredBuildings = buildings.filter(
    (b) =>
      (b.name ?? "").toLowerCase().includes(q) ||
      (b.address ?? "").toLowerCase().includes(q) ||
      b.organization.toLowerCase().includes(q),
  );

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
    if (!canManage) return;

    setEditing(b);
    setCreating(false);
    setActionError("");
    setFormName(b.name ?? "");
    setFormAddress(b.address ?? "");
  };

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setActionError("");
    setFormName("");
    setFormAddress("");
  };

  const closeEdit = () => {
    setEditing(null);
    setCreating(false);
    setFormName("");
    setFormAddress("");
    setActionError("");
  };

  const saveEdit = async () => {
    if ((!editing && !creating) || !canManage) return;

    setSaving(true);
    try {
      if (creating) {
        if (!organizationId) throw new Error("Сначала выберите организацию");
        const created = await createOrgDataRow<Building>("buildings", organizationId, {
          name: formName,
          address: formAddress || null,
        });
        setBuildings((prev) => [...prev, created]);
      } else if (editing) {
        const updated = await updateBuilding(editing.id, {
          name: formName,
          address: formAddress || null,
        });
        setBuildings((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      }
      closeEdit();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const removeBuilding = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await deleteOrgDataRow("buildings", deleteTarget.id);
      setBuildings((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setDeleteTarget(null);
      setActionError(e instanceof Error ? e.message : "Ошибка при удалении");
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("ru-RU") : "—";

  return (
    <Layout>
      <div className="row g-3">
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
            {canManage && organizationId && (
              <button className="btn btn-sm btn-outline-primary ms-auto" onClick={openCreate}>
                <i className="fa fa-plus me-1" />Добавить здание
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
                <span className="fw-semibold">{filteredBuildings.length}</span>{" "}
                — всего
              </div>

              <div className="card shadow-sm">
                <div className="table-responsive">
                  <table className="table table-bordered mb-0">
                    <thead style={{ background: "#efefef" }}>
                      <tr>
                        <th style={{ width: 50 }}>ID</th>
                        <th>Название</th>
                        <th>Адрес</th>
                        <th>Дата создания</th>
                        {canManage && (
                          <th style={{ width: 90 }} className="text-center">
                            <i className="fa fa-cog" />
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBuildings.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canManage ? 5 : 4}
                            className="text-center text-muted py-4"
                          >
                            Данные отсутствуют
                          </td>
                        </tr>
                      ) : (
                        filteredBuildings.map((b) => (
                          <tr key={b.id}>
                            <td className="text-muted small">{b.id}</td>
                            <td>
                              <strong>{b.name ?? "—"}</strong>
                            </td>
                            <td>{b.address ?? "—"}</td>
                            <td>{formatDate(b.created_at)}</td>
                            {canManage && (
                              <td className="text-center">
                                <button
                                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                                  title="Редактировать"
                                  onClick={() => openEdit(b)}
                                >
                                  <i className="fa fa-pencil" />
                                </button>
                                <button
                                  className="btn btn-sm btn-outline-danger py-0 px-2 ms-1"
                                  title="Удалить"
                                  onClick={() => { setActionError(""); setDeleteTarget(b); }}
                                >
                                  <i className="fa fa-trash" />
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

      {canManage && (editing || creating) && (
        <OrgDataEditor
          title={creating ? "Новое здание" : "Редактировать здание"}
          fields={BUILDING_FIELDS}
          values={{ name: formName, address: formAddress }}
          saving={saving}
          error={actionError}
          onChange={(name, value) => {
            if (name === "name" && typeof value === "string") setFormName(value);
            if (name === "address" && typeof value === "string") setFormAddress(value);
          }}
          onSubmit={() => void saveEdit()}
          onClose={closeEdit}
        />
      )}
      {canManage && deleteTarget && (
        <ConfirmModal
          title="Удалить здание?"
          text={`Здание «${deleteTarget.name ?? "Без названия"}» будет удалено без возможности восстановления.`}
          busy={saving}
          onConfirm={() => void removeBuilding()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {actionError && !editing && !creating && !deleteTarget && <div className="alert alert-danger mt-3">{actionError}</div>}
    </Layout>
  );
}
