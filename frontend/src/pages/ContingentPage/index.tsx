import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchContingent, fetchClasses, fetchParallels,
  type Contingent, type SchoolClass, type Parallel,
} from "../../api/data";
import Layout from "../../components/Layout";
import type { OrgDataField, OrgDataFormValue } from "../../components/OrgDataEditor";
import { useOrgDataCrud } from "../../hooks/useOrgDataCrud";
import { useOrgDataPermissions } from "../../hooks/useOrgDataPermissions";

type Tab = "contingent" | "classes" | "parallels";

const CONTINGENT_FIELDS: OrgDataField[] = [
  { name: "attribute", label: "Показатель", required: true },
  { name: "value", label: "Значение", type: "number", step: "1" },
  { name: "is_filled", label: "Считать заполненным", type: "checkbox" },
];
const CLASS_FIELDS: OrgDataField[] = [
  { name: "name", label: "Класс", required: true, placeholder: "Например, 1А" },
  {
    name: "grade_level",
    label: "Параллель",
    type: "select",
    options: Array.from({ length: 11 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
  },
  { name: "student_count", label: "Количество учащихся", type: "number", step: "1" },
];
const PARALLEL_FIELDS: OrgDataField[] = [
  { name: "title", label: "Параллель", required: true },
  { name: "values", label: "Численность по классам", placeholder: "Например: 25, 28, 27" },
  { name: "is_filled", label: "Считать заполненным", type: "checkbox" },
];

const optionalInteger = (value: OrgDataFormValue) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("Введите целое неотрицательное число");
  return parsed;
};

export default function ContingentPage() {
  const [tab, setTab] = useState<Tab>("contingent");
  const [contingent, setContingent] = useState<Contingent[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [parallels, setParallels] = useState<Parallel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { canWrite, organizationId } = useOrgDataPermissions();

  useEffect(() => {
    Promise.all([fetchContingent(), fetchClasses(), fetchParallels()])
      .then(([c, cl, p]) => { setContingent(c); setClasses(cl); setParallels(p); })
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const q = search.toLowerCase();

  const filteredContingent = contingent.filter((r) =>
    r.attribute.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q)
  );
  const filteredClasses = classes.filter((r) =>
    (r.name ?? "").toLowerCase().includes(q) || r.organization.toLowerCase().includes(q)
  );
  const filteredParallels = parallels.filter((r) =>
    r.title.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q)
  );

  const tabLabel: Record<Tab, string> = {
    contingent: `Контингент (${filteredContingent.length})`,
    classes: `Классы (${filteredClasses.length})`,
    parallels: `Параллели (${filteredParallels.length})`,
  };

  const contingentCrud = useOrgDataCrud<Contingent>({
    resource: "contingent",
    setRows: setContingent,
    fields: CONTINGENT_FIELDS,
    defaults: { attribute: "", value: "", is_filled: false },
    toFormValues: (r) => ({ attribute: r.attribute, value: r.value == null ? "" : String(r.value), is_filled: r.is_filled }),
    toPayload: (v) => ({ attribute: String(v.attribute ?? ""), value: optionalInteger(v.value ?? ""), is_filled: v.is_filled === true }),
    itemName: "показатель",
    canWrite,
    organizationId,
  });
  const classesCrud = useOrgDataCrud<SchoolClass>({
    resource: "classes",
    setRows: setClasses,
    fields: CLASS_FIELDS,
    defaults: { name: "", grade_level: "", student_count: "" },
    toFormValues: (r) => ({ name: r.name ?? "", grade_level: r.grade_level == null ? "" : String(r.grade_level), student_count: r.student_count == null ? "" : String(r.student_count) }),
    toPayload: (v) => ({ name: String(v.name ?? ""), grade_level: optionalInteger(v.grade_level ?? ""), student_count: optionalInteger(v.student_count ?? "") }),
    itemName: "класс",
    canWrite,
    organizationId,
  });
  const parallelsCrud = useOrgDataCrud<Parallel>({
    resource: "parallels",
    setRows: setParallels,
    fields: PARALLEL_FIELDS,
    defaults: { title: "", values: "", is_filled: false },
    toFormValues: (r) => ({ title: r.title, values: r.values.join(", "), is_filled: r.is_filled }),
    toPayload: (v) => {
      const raw = String(v.values ?? "").trim();
      const values = raw ? raw.split(/[,\s]+/).filter(Boolean).map(Number) : [];
      if (values.some((value) => !Number.isInteger(value) || value < 0)) throw new Error("Введите численность целыми неотрицательными числами");
      return { title: String(v.title ?? ""), values, is_filled: v.is_filled === true };
    },
    itemName: "параллель",
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
          <h5 className="mb-0 fw-semibold">Контингент обучающихся</h5>
          <small className="text-muted">Численность, классы и параллели</small>
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
        {(["contingent", "classes", "parallels"] as Tab[]).map((t) => (
          <li key={t} className="nav-item">
            <button className={`nav-link ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {tabLabel[t]}
            </button>
          </li>
        ))}
      </ul>
      <div className="d-flex justify-content-end mb-3">
        {tab === "contingent" ? contingentCrud.addButton : tab === "classes" ? classesCrud.addButton : parallelsCrud.addButton}
      </div>

      {loading && <div className="text-center py-5"><div className="spinner-border text-secondary" /></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <div className="card shadow-sm">
          <div className="table-responsive">
            {tab === "contingent" && (
              <table className="table table-bordered mb-0">
                <thead style={{ background: "#efefef" }}>
                  <tr>
                    <th>Организация</th>
                    <th>Показатель</th>
                    <th className="text-end">Значение</th>
                    <th className="text-center">Заполнено</th>
                    {canWrite && <th className="text-center">Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredContingent.length === 0 ? (
                    <tr><td colSpan={canWrite ? 5 : 4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredContingent.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td>{r.attribute}</td>
                      <td className="text-end fw-semibold">{r.value ?? "—"}</td>
                      <td className="text-center">
                        {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                      </td>
                      {canWrite && <td className="text-center text-nowrap">{contingentCrud.rowActions(r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "classes" && (
              <table className="table table-bordered mb-0">
                <thead style={{ background: "#efefef" }}>
                  <tr>
                    <th>Организация</th>
                    <th>Класс</th>
                    <th className="text-center">Параллель</th>
                    <th className="text-end">Кол-во учащихся</th>
                    {canWrite && <th className="text-center">Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.length === 0 ? (
                    <tr><td colSpan={canWrite ? 5 : 4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredClasses.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td><strong>{r.name ?? "—"}</strong></td>
                      <td className="text-center">{r.grade_level ?? "—"}</td>
                      <td className="text-end">{r.student_count ?? "—"}</td>
                      {canWrite && <td className="text-center text-nowrap">{classesCrud.rowActions(r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "parallels" && (
              <table className="table table-bordered mb-0">
                <thead style={{ background: "#efefef" }}>
                  <tr>
                    <th>Организация</th>
                    <th>Параллель</th>
                    <th>Численность по классам</th>
                    <th className="text-center">Заполнено</th>
                    {canWrite && <th className="text-center">Действия</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredParallels.length === 0 ? (
                    <tr><td colSpan={canWrite ? 5 : 4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredParallels.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td><strong>{r.title}</strong></td>
                      <td>{r.values.join(", ")}</td>
                      <td className="text-center">
                        {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                      </td>
                      {canWrite && <td className="text-center text-nowrap">{parallelsCrud.rowActions(r)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
      {contingentCrud.modals}
      {classesCrud.modals}
      {parallelsCrud.modals}
    </Layout>
  );
}
