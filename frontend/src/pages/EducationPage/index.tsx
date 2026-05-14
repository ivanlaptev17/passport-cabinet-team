import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchEducation, type EducationActivity } from "../../api/data";
import Layout from "../../components/Layout";

const TYPES = ["Урочная деятельность", "Внеурочная деятельность", "Дополнительное образование"];

export default function EducationPage() {
  const [rows, setRows] = useState<EducationActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeType, setActiveType] = useState(TYPES[0]);
  const navigate = useNavigate();

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
                </tr>
              </thead>
              <tbody>
                {byType(activeType).length === 0 ? (
                  <tr><td colSpan={4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                ) : (
                  byType(activeType).map((r) => (
                    <tr key={r.id} className={r.is_heading ? "table-light fw-semibold" : ""}>
                      <td className="text-muted small">{r.organization}</td>
                      <td>{r.attribute}</td>
                      <td>{r.value ?? "—"}</td>
                      <td className="text-center">
                        {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
