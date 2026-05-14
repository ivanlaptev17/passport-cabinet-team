import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchContingent, fetchClasses, fetchParallels,
  type Contingent, type SchoolClass, type Parallel,
} from "../../api/data";
import Layout from "../../components/Layout";

type Tab = "contingent" | "classes" | "parallels";

export default function ContingentPage() {
  const [tab, setTab] = useState<Tab>("contingent");
  const [contingent, setContingent] = useState<Contingent[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [parallels, setParallels] = useState<Parallel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

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
                  </tr>
                </thead>
                <tbody>
                  {filteredContingent.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredContingent.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td>{r.attribute}</td>
                      <td className="text-end fw-semibold">{r.value ?? "—"}</td>
                      <td className="text-center">
                        {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                      </td>
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
                  </tr>
                </thead>
                <tbody>
                  {filteredClasses.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredClasses.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td><strong>{r.name ?? "—"}</strong></td>
                      <td className="text-center">{r.grade_level ?? "—"}</td>
                      <td className="text-end">{r.student_count ?? "—"}</td>
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
                  </tr>
                </thead>
                <tbody>
                  {filteredParallels.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredParallels.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td><strong>{r.title}</strong></td>
                      <td>{r.values.join(", ")}</td>
                      <td className="text-center">
                        {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
