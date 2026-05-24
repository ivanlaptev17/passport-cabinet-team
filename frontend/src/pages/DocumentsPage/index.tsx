import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  deleteDocument,
  fetchDocuments,
  fetchOrganizations,
  getDocumentDownloadUrl,
  updateDocument,
  uploadDocument,
  type Document,
  type Organization,
} from "../../api/data";
import Layout from "../../components/Layout";
import { useAuth } from "../../contexts/AuthContext";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "На согласовании", badge: "warning" },
  { value: "APPROVED", label: "Исполнено", badge: "success" },
  { value: "OVERDUE", label: "Просрочено", badge: "danger" },
];

function statusLabel(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

function statusBadge(s: string) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.badge ?? "secondary";
}

function formatBytes(n: number | null) {
  if (!n) return "—";
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function uploaderName(doc: Document) {
  const name = [doc.uploader_last_name, doc.uploader_first_name].filter(Boolean).join(" ");
  return name || doc.uploader_email || "—";
}

type UploadForm = {
  organization_id: string;
  name: string;
  description: string;
  status: string;
  file: File | null;
};

type EditForm = {
  name: string;
  description: string;
  status: string;
};

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const canManage = user?.role_code !== "MINOBR";
  const canDelete = user?.role_code === "DIRECTOR" || user?.role_code === "ADMIN";

  const [documents, setDocuments] = useState<Document[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState<UploadForm>({
    organization_id: "",
    name: "",
    description: "",
    status: "PENDING",
    file: null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ name: "", description: "", status: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([fetchDocuments(), fetchOrganizations()])
      .then(([docs, orgs]) => {
        setDocuments(docs);
        setOrganizations(orgs);
        if (orgs[0]) setUploadForm((f) => ({ ...f, organization_id: String(orgs[0].id) }));
      })
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить документы");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return documents.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        (d.description ?? "").toLowerCase().includes(q) ||
        d.organization.toLowerCase().includes(q) ||
        d.original_filename.toLowerCase().includes(q) ||
        statusLabel(d.status).toLowerCase().includes(q),
    );
  }, [documents, search]);

  const openUpload = () => {
    setUploadForm({
      organization_id: organizations[0] ? String(organizations[0].id) : "",
      name: "",
      description: "",
      status: "PENDING",
      file: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    setUploadOpen(true);
  };

  const closeUpload = () => setUploadOpen(false);

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.name.trim() || !uploadForm.organization_id) {
      alert("Заполни организацию, название и выбери файл");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("organization_id", uploadForm.organization_id);
      fd.append("name", uploadForm.name);
      fd.append("description", uploadForm.description);
      fd.append("status", uploadForm.status);
      fd.append("file", uploadForm.file);
      const created = await uploadDocument(fd);
      setDocuments((prev) => [created, ...prev]);
      closeUpload();
    } catch {
      alert("Ошибка при загрузке документа");
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (doc: Document) => {
    setEditDoc(doc);
    setEditForm({ name: doc.name, description: doc.description ?? "", status: doc.status });
  };

  const closeEdit = () => { setEditDoc(null); };

  const handleSave = async () => {
    if (!editDoc) return;
    setSaving(true);
    try {
      const updated = await updateDocument(editDoc.id, {
        name: editForm.name,
        description: editForm.description || undefined,
        status: editForm.status,
      });
      setDocuments((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      closeEdit();
    } catch {
      alert("Ошибка при сохранении");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: Document) => {
    if (!confirm(`Удалить документ "${doc.name}"?`)) return;
    try {
      await deleteDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch {
      alert("Ошибка при удалении");
    }
  };

  const handleDownload = (doc: Document) => {
    window.open(getDocumentDownloadUrl(doc.id), "_blank");
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
                <h5 className="mb-0 fw-semibold">Документооборот</h5>
                <small className="text-muted">Загрузка, просмотр и управление документами</small>
              </div>
            </div>

            {canManage && (
              <button
                className="btn btn-sm text-white border-0 px-3 py-2 rounded-pill shadow-sm"
                style={{ background: "linear-gradient(135deg, #37474f, #546e7a)", fontWeight: 600 }}
                onClick={openUpload}
              >
                <i className="fa fa-upload me-2" />
                Загрузить документ
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
                <span className="fw-semibold">{filtered.length}</span> — всего
              </div>

              <div className="card shadow-sm">
                <div className="table-responsive">
                  <table className="table table-bordered mb-0 align-middle">
                    <thead style={{ background: "#efefef" }}>
                      <tr>
                        <th style={{ width: 50 }}>ID</th>
                        <th>Организация</th>
                        <th>Название</th>
                        <th>Описание</th>
                        <th>Статус</th>
                        <th>Файл</th>
                        <th>Размер</th>
                        <th>Загружен</th>
                        <th>Кто загрузил</th>
                        <th style={{ width: 120 }} className="text-center">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="text-center text-muted py-4">
                            Данные отсутствуют
                          </td>
                        </tr>
                      ) : (
                        filtered.map((doc) => (
                          <tr key={doc.id}>
                            <td className="text-muted small">{doc.id}</td>
                            <td>{doc.organization}</td>
                            <td><strong>{doc.name}</strong></td>
                            <td style={{ minWidth: 200 }}>{doc.description ?? "—"}</td>
                            <td>
                              <span className={`badge text-bg-${statusBadge(doc.status)}`}>
                                {statusLabel(doc.status)}
                              </span>
                            </td>
                            <td>
                              <span
                                className="text-truncate d-inline-block"
                                style={{ maxWidth: 180, fontSize: 12 }}
                                title={doc.original_filename}
                              >
                                <i className="fa fa-file me-1 text-muted" />
                                {doc.original_filename}
                              </span>
                            </td>
                            <td style={{ whiteSpace: "nowrap" }}>{formatBytes(doc.file_size)}</td>
                            <td style={{ whiteSpace: "nowrap" }}>{formatDate(doc.uploaded_at)}</td>
                            <td>{uploaderName(doc)}</td>
                            <td className="text-center">
                              <div className="d-flex justify-content-center gap-1">
                                <button
                                  className="btn btn-sm btn-outline-secondary py-0 px-2"
                                  title="Скачать"
                                  onClick={() => handleDownload(doc)}
                                >
                                  <i className="fa fa-download" />
                                </button>
                                {canManage && (
                                  <button
                                    className="btn btn-sm btn-outline-secondary py-0 px-2"
                                    title="Редактировать"
                                    onClick={() => openEdit(doc)}
                                  >
                                    <i className="fa fa-pencil" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    className="btn btn-sm btn-outline-danger py-0 px-2"
                                    title="Удалить"
                                    onClick={() => void handleDelete(doc)}
                                  >
                                    <i className="fa fa-trash" />
                                  </button>
                                )}
                              </div>
                            </td>
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

      {/* Upload modal */}
      {uploadOpen && (
        <div
          className="modal show d-block"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={closeUpload}
        >
          <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
                <h6 className="modal-title mb-0 fw-semibold">
                  <i className="fa fa-upload me-2" />
                  Загрузить документ
                </h6>
                <button type="button" className="btn-close btn-close-white" onClick={closeUpload} />
              </div>

              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Организация</label>
                    <select
                      className="form-select"
                      value={uploadForm.organization_id}
                      onChange={(e) => setUploadForm((f) => ({ ...f, organization_id: e.target.value }))}
                    >
                      <option value="">Выбери организацию</option>
                      {organizations.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Статус</label>
                    <select
                      className="form-select"
                      value={uploadForm.status}
                      onChange={(e) => setUploadForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">Название *</label>
                    <input
                      type="text"
                      className="form-control"
                      value={uploadForm.name}
                      onChange={(e) => setUploadForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Название документа"
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">Описание</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={uploadForm.description}
                      onChange={(e) => setUploadForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">Файл *</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="form-control"
                      onChange={(e) => setUploadForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))}
                    />
                    {uploadForm.file && (
                      <div className="text-muted small mt-1">
                        {uploadForm.file.name} ({formatBytes(uploadForm.file.size)})
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={closeUpload}>
                  Отмена
                </button>
                <button
                  className="btn btn-sm text-white"
                  style={{ background: "#37474f" }}
                  disabled={uploading}
                  onClick={() => void handleUpload()}
                >
                  {uploading && <span className="spinner-border spinner-border-sm me-1" />}
                  <i className="fa fa-upload me-1" />
                  Загрузить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editDoc && (
        <div
          className="modal show d-block"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={closeEdit}
        >
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
                <h6 className="modal-title mb-0 fw-semibold">
                  <i className="fa fa-pencil me-2" />
                  Редактировать документ
                </h6>
                <button type="button" className="btn-close btn-close-white" onClick={closeEdit} />
              </div>

              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Название</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">Статус</label>
                    <select
                      className="form-select"
                      value={editForm.status}
                      onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold">Описание</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={editForm.description}
                      onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    />
                  </div>

                  <div className="col-12">
                    <div className="p-2 bg-light rounded-3 small text-muted">
                      <i className="fa fa-file me-1" />
                      {editDoc.original_filename}
                      <span className="ms-2">({formatBytes(editDoc.file_size)})</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={closeEdit}>
                  Отмена
                </button>
                <button
                  className="btn btn-sm text-white"
                  style={{ background: "#37474f" }}
                  disabled={saving}
                  onClick={() => void handleSave()}
                >
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
