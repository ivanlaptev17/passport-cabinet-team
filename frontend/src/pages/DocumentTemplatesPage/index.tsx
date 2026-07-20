import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchDocumentTemplates,
  generateDocumentTemplate,
  type DocumentTemplate,
} from "../../api/data";
import Layout from "../../components/Layout";
import DateField from "../../components/DateField";

type ListItem = Record<string, string>;
type FormValues = Record<string, string | ListItem[]>;

function buildInitialValues(template: DocumentTemplate): FormValues {
  const values: FormValues = {};
  for (const field of template.fields) {
    if (field.type === "list") {
      const item: ListItem = {};
      for (const f of field.item_fields ?? []) item[f.key] = "";
      values[field.key] = [item];
    } else {
      values[field.key] = "";
    }
  }
  return values;
}

function isoToRu(iso: string): string {
  if (!iso) return iso;
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function prepareValues(template: DocumentTemplate, values: FormValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of template.fields) {
    if (field.type === "date") {
      out[field.key] = isoToRu((values[field.key] as string) ?? "");
    } else {
      out[field.key] = values[field.key];
    }
  }
  return out;
}

export default function DocumentTemplatesPage() {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTemplate, setActiveTemplate] = useState<DocumentTemplate | null>(null);
  const [values, setValues] = useState<FormValues>({});
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [generating, setGenerating] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDocumentTemplates()
      .then(setTemplates)
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить шаблоны документов");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const openTemplate = (template: DocumentTemplate) => {
    setActiveTemplate(template);
    setValues(buildInitialValues(template));
    setLogoFile(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  };

  const closeTemplate = () => setActiveTemplate(null);

  const setScalarValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const setListItemValue = (key: string, index: number, itemKey: string, value: string) => {
    setValues((prev) => {
      const list = [...((prev[key] as ListItem[]) ?? [])];
      list[index] = { ...list[index], [itemKey]: value };
      return { ...prev, [key]: list };
    });
  };

  const addListItem = (field: DocumentTemplate["fields"][number]) => {
    setValues((prev) => {
      const list = [...((prev[field.key] as ListItem[]) ?? [])];
      const item: ListItem = {};
      for (const f of field.item_fields ?? []) item[f.key] = "";
      list.push(item);
      return { ...prev, [field.key]: list };
    });
  };

  const removeListItem = (key: string, index: number) => {
    setValues((prev) => {
      const list = [...((prev[key] as ListItem[]) ?? [])];
      list.splice(index, 1);
      return { ...prev, [key]: list };
    });
  };

  const handleGenerate = async () => {
    if (!activeTemplate) return;
    setGenerating(true);
    try {
      const payload = prepareValues(activeTemplate, values);
      const blob = await generateDocumentTemplate(activeTemplate.id, payload, logoFile);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${activeTemplate.name}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      closeTemplate();
    } catch {
      alert("Не удалось сформировать документ");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Layout>
      <div className="row g-3">
        <div className="col-12">
          <div className="d-flex align-items-center gap-3 mb-3">
            <button
              className="btn btn-sm btn-outline-secondary"
              onClick={() => navigate("/dashboard")}
            >
              <i className="fa fa-arrow-left me-1" />
              Назад
            </button>
            <div>
              <h5 className="mb-0 fw-semibold">Конструктор документов</h5>
              <small className="text-muted">Формирование документов по шаблону</small>
            </div>
          </div>

          {loading && (
            <div className="text-center py-5">
              <div className="spinner-border text-secondary" />
            </div>
          )}

          {error && <div className="alert alert-danger">{error}</div>}

          {!loading && !error && (
            <div className="row g-3">
              {templates.map((template) => (
                <div className="col-md-6 col-lg-4" key={template.id}>
                  <div className="card shadow-sm h-100">
                    <div className="card-body d-flex flex-column">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <i className="fa fa-file-word text-primary" style={{ fontSize: 22 }} />
                        <h6 className="mb-0 fw-semibold">{template.name}</h6>
                      </div>
                      <div className="text-muted small mb-3">
                        Полей для заполнения: {template.fields.length}
                      </div>
                      <button
                        className="btn btn-sm text-white border-0 mt-auto"
                        style={{ background: "linear-gradient(135deg, #37474f, #546e7a)", fontWeight: 600 }}
                        onClick={() => openTemplate(template)}
                      >
                        <i className="fa fa-pen-to-square me-2" />
                        Заполнить
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {activeTemplate && (
        <div
          className="modal show d-block"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={closeTemplate}
        >
          <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content">
              <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
                <h6 className="modal-title mb-0 fw-semibold">
                  <i className="fa fa-file-word me-2" />
                  {activeTemplate.name}
                </h6>
                <button type="button" className="btn-close btn-close-white" onClick={closeTemplate} />
              </div>

              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small fw-semibold">
                      Логотип школы (необязательно)
                    </label>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="form-control"
                      onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                    />
                    <div className="form-text">
                      PNG или JPG. Будет вставлен в шапку документа. Черновой вариант — пробуем на ВКС.
                    </div>
                  </div>

                  {activeTemplate.fields.map((field) => {
                    if (field.type === "text") {
                      return (
                        <div className="col-md-6" key={field.key}>
                          <label className="form-label small fw-semibold">{field.label}</label>
                          <input
                            type="text"
                            className="form-control"
                            value={(values[field.key] as string) ?? ""}
                            onChange={(e) => setScalarValue(field.key, e.target.value)}
                          />
                        </div>
                      );
                    }

                    if (field.type === "date") {
                      return (
                        <div className="col-md-6" key={field.key}>
                          <label className="form-label small fw-semibold">{field.label}</label>
                          <DateField
                            value={(values[field.key] as string) ?? ""}
                            onChange={(iso) => setScalarValue(field.key, iso)}
                          />
                        </div>
                      );
                    }

                    const list = (values[field.key] as ListItem[]) ?? [];
                    return (
                      <div className="col-12" key={field.key}>
                        <label className="form-label small fw-semibold">{field.label}</label>
                        <div className="table-responsive">
                          <table className="table table-bordered align-middle mb-2">
                            <thead style={{ background: "#efefef" }}>
                              <tr>
                                {(field.item_fields ?? []).map((f) => (
                                  <th key={f.key}>{f.label}</th>
                                ))}
                                <th style={{ width: 50 }} />
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((item, idx) => (
                                <tr key={idx}>
                                  {(field.item_fields ?? []).map((f) => (
                                    <td key={f.key}>
                                      <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={item[f.key] ?? ""}
                                        onChange={(e) =>
                                          setListItemValue(field.key, idx, f.key, e.target.value)
                                        }
                                      />
                                    </td>
                                  ))}
                                  <td className="text-center">
                                    <button
                                      className="btn btn-sm btn-outline-danger py-0 px-2"
                                      title="Удалить строку"
                                      onClick={() => removeListItem(field.key, idx)}
                                      disabled={list.length <= 1}
                                    >
                                      <i className="fa fa-trash" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => addListItem(field)}
                        >
                          <i className="fa fa-plus me-1" />
                          Добавить строку
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="modal-footer">
                <button className="btn btn-secondary btn-sm" onClick={closeTemplate}>
                  Отмена
                </button>
                <button
                  className="btn btn-sm text-white"
                  style={{ background: "#37474f" }}
                  disabled={generating}
                  onClick={() => void handleGenerate()}
                >
                  {generating && <span className="spinner-border spinner-border-sm me-1" />}
                  <i className="fa fa-download me-1" />
                  Сформировать
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
