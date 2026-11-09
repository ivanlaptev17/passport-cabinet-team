import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchEducation, type EducationActivity } from "../../api/data";
import Layout from "../../components/Layout";
import type { OrgDataField, OrgDataFormValue } from "../../components/OrgDataEditor";
import { useOrgDataCrud } from "../../hooks/useOrgDataCrud";
import { useOrgDataPermissions } from "../../hooks/useOrgDataPermissions";

const TYPES = ["Урочная деятельность", "Внеурочная деятельность", "Дополнительное образование"];
const EDUCATION_FIELDS: OrgDataField[] = [
  {
    name: "activity_type",
    label: "Вид деятельности",
    type: "select",
    required: true,
    options: TYPES.map((type) => ({ value: type, label: type })),
  },
  { name: "attribute", label: "Показатель", required: true },
  { name: "value", label: "Значение", type: "textarea" },
  { name: "item_order", label: "Порядок", type: "number", step: "1" },
  { name: "is_filled", label: "Считать заполненным", type: "checkbox" },
  { name: "is_heading", label: "Заголовок раздела", type: "checkbox" },
];

const optionalOrder = (value: OrgDataFormValue) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error("Порядок должен быть целым числом");
  return parsed;
};

export default function EducationPage() {
  const [rows, setRows] = useState<EducationActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState(TYPES[0]);
  const navigate = useNavigate();
  const { canWrite, organizationId } = useOrgDataPermissions();

  useEffect(() => {
    fetchEducation()
      .then(setRows)
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const q = search.toLowerCase();

  const byType = (type: string) =>
    rows.filter(
      (r) =>
        r.activity_type === type &&
        (r.attribute.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q))
    );
  const crud = useOrgDataCrud<EducationActivity>({
    resource: "education",
    setRows,
    fields: EDUCATION_FIELDS,
    defaults: { activity_type: TYPES[0], attribute: "", value: "", item_order: "", is_filled: false, is_heading: false },
    toFormValues: (r) => ({
      activity_type: r.activity_type ?? "",
      attribute: r.attribute,
      value: r.value ?? "",
      item_order: r.item_order == null ? "" : String(r.item_order),
      is_filled: r.is_filled,
      is_heading: r.is_heading,
    }),
    toPayload: (v) => ({
      activity_type: String(v.activity_type ?? ""),
      attribute: String(v.attribute ?? ""),
      value: String(v.value ?? "") || null,
      item_order: optionalOrder(v.item_order ?? ""),
      is_filled: v.is_filled === true,
      is_heading: v.is_heading === true,
    }),
    itemName: "показатель",
    canWrite,
    organizationId,
  });

  return (
    <Layout>
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
          <i className="fa fa-arrow-left me-1" />Назад
        </button>
        <div>
          <h5 className="mb-0 fw-semibold">Образовательная деятельность</h5>
          <small className="text-muted">Урочная, внеурочная и дополнительное образование</small>
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
        {TYPES.map((t) => (
          <li key={t} className="nav-item">
            <button
              className={`nav-link ${activeType === t ? "active" : ""}`}
              onClick={() => setActiveType(t)}
            >
              {t} ({byType(t).length})
            </button>
          </li>
        ))}
      </ul>
      <div className="d-flex justify-content-end mb-3">{crud.addButton}</div>

      {loading && <div className="text-center py-5"><div className="spinner-border text-secondary" /></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-bordered mb-0">
              <thead style={{ background: "#efefef" }}>
                <tr>
                  <th>Организация</th>
                  <th>Показатель</th>
                  <th>Значение</th>
                  <th className="text-center">Заполнено</th>
                  {canWrite && <th className="text-center">Действия</th>}
                </tr>
              </thead>
              <tbody>
                {byType(activeType).length === 0 ? (
                  <tr><td colSpan={canWrite ? 5 : 4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                ) : (
                  byType(activeType).map((r) => (
                    <tr key={r.id} className={r.is_heading ? "table-light fw-semibold" : ""}>
                      <td className="text-muted small">{r.organization}</td>
                      <td>{r.attribute}</td>
                      <td>{r.value ?? "—"}</td>
                      <td className="text-center">
                        {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                      </td>
                      {canWrite && <td className="text-center text-nowrap">{crud.rowActions(r)}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {crud.modals}
    </Layout>
  );
}
