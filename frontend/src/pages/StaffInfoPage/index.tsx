import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStaffInfo, type StaffInfo } from "../../api/data";
import Layout from "../../components/Layout";

export default function StaffInfoPage() {
  const [rows, setRows] = useState<StaffInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    fetchStaffInfo()
      .then(setRows)
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const filtered = rows.filter((r) =>
    r.attribute.toLowerCase().includes(search.toLowerCase()) ||
    r.organization.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
          <i className="fa fa-arrow-left me-1" />Назад
        </button>
        <div>
          <h5 className="mb-0 fw-semibold">Общие сведения о кадрах</h5>
          <small className="text-muted">Штатное расписание и укомплектованность</small>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="Поиск по показателю или организации..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

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
                  <th className="text-end">Плановое</th>
                  <th className="text-end">Фактическое</th>
                  <th className="text-center">Заполнено</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td>{r.attribute}</td>
                      <td className="text-end">{r.value ?? "—"}</td>
                      <td className="text-end">{r.real_value ?? "—"}</td>
                      <td className="text-center">
                        {r.is_filled
                          ? <span className="badge bg-success">Да</span>
                          : <span className="badge bg-secondary">Нет</span>}
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
