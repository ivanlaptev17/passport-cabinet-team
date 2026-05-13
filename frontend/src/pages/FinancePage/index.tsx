import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchFinance, fetchSubsidies, fetchContracts,
  type FinanceRecord, type Subsidy, type Contract,
} from "../../api/data";
import Layout from "../../components/Layout";

type Tab = "finance" | "subsidies" | "contracts";

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("finance");
  const [finance, setFinance] = useState<FinanceRecord[]>([]);
  const [subsidies, setSubsidies] = useState<Subsidy[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([fetchFinance(), fetchSubsidies(), fetchContracts()])
      .then(([f, s, c]) => { setFinance(f); setSubsidies(s); setContracts(c); })
      .catch((e: Error) => {
        if (e.message === "401") navigate("/");
        else setError("Не удалось загрузить данные");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const q = search.toLowerCase();

  const filteredFinance = finance.filter((r) =>
    r.attribute.toLowerCase().includes(q) ||
    (r.category ?? "").toLowerCase().includes(q) ||
    r.organization.toLowerCase().includes(q)
  );
  const filteredSubsidies = subsidies.filter((r) =>
    r.name.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q)
  );
  const filteredContracts = contracts.filter((r) =>
    r.name.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q)
  );

  const tabLabel: Record<Tab, string> = {
    finance: `Финансовые записи (${filteredFinance.length})`,
    subsidies: `Субсидии (${filteredSubsidies.length})`,
    contracts: `Договоры (${filteredContracts.length})`,
  };

  return (
    <Layout>
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
          <i className="fa fa-arrow-left me-1" />Назад
        </button>
        <div>
          <h5 className="mb-0 fw-semibold">Финансовая деятельность</h5>
          <small className="text-muted">Финансовые записи, субсидии и договоры</small>
        </div>
      </div>

      <div className="mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="Поиск..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); }}
        />
      </div>

      <ul className="nav nav-tabs mb-3">
        {(["finance", "subsidies", "contracts"] as Tab[]).map((t) => (
          <li key={t} className="nav-item">
            <button
              className={`nav-link ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
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
            {tab === "finance" && (
              <table className="table table-bordered mb-0">
                <thead style={{ background: "#efefef" }}>
                  <tr>
                    <th>Организация</th>
                    <th>Категория</th>
                    <th>Показатель</th>
                    <th className="text-end">Сумма, руб.</th>
                    <th className="text-center">Заполнено</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFinance.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredFinance.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td><span className="badge bg-info text-dark">{r.category ?? "—"}</span></td>
                      <td>{r.attribute}</td>
                      <td className="text-end fw-semibold">{fmt(r.value)}</td>
                      <td className="text-center">
                        {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "subsidies" && (
              <table className="table table-bordered mb-0">
                <thead style={{ background: "#efefef" }}>
                  <tr>
                    <th>Организация</th>
                    <th>Название субсидии</th>
                    <th className="text-end">Сумма, руб.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubsidies.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredSubsidies.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td>{r.name}</td>
                      <td className="text-end fw-semibold">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {tab === "contracts" && (
              <table className="table table-bordered mb-0">
                <thead style={{ background: "#efefef" }}>
                  <tr>
                    <th>Организация</th>
                    <th>Название договора</th>
                    <th>Ссылка</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredContracts.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                  ) : filteredContracts.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small">{r.organization}</td>
                      <td>{r.name}</td>
                      <td>
                        {r.link
                          ? <a href={r.link} target="_blank" rel="noreferrer" className="text-primary">
                              <i className="fa fa-external-link me-1" />Открыть
                            </a>
                          : "—"}
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
