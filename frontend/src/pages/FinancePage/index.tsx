import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchFinance, fetchSubsidies, fetchContracts,
  type FinanceRecord, type Subsidy, type Contract,
} from "../../api/data";
import Layout from "../../components/Layout";

type Tab =
  | "FINANCE" | "SALARY" | "EXPENSES" | "FUNDS" | "PRESCHOOL"
  | "subsidies" | "EXTRABUDGET" | "contracts";

const TAB_LABELS: Record<Tab, string> = {
  FINANCE:     "Финансовая деятельность",
  SALARY:      "Заработная плата",
  EXPENSES:    "Расходы",
  FUNDS:       "Финансовые средства",
  PRESCHOOL:   "Дошкольное образование",
  subsidies:   "Субсидии",
  EXTRABUDGET: "Внебюджет",
  contracts:   "Контракты",
};

const FINANCE_TABS: Tab[] = ["FINANCE", "SALARY", "EXPENSES", "FUNDS", "PRESCHOOL", "subsidies", "EXTRABUDGET", "contracts"];

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("FINANCE");
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

  const financeByTab = (section: string) =>
    finance.filter((r) =>
      r.section_code === section &&
      (r.attribute.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q))
    );

  const filteredSubsidies = subsidies.filter((r) =>
    r.name.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q)
  );
  const filteredContracts = contracts.filter((r) =>
    r.name.toLowerCase().includes(q) || r.organization.toLowerCase().includes(q)
  );

  const tabCount = (t: Tab): number => {
    if (t === "subsidies") return filteredSubsidies.length;
    if (t === "contracts") return filteredContracts.length;
    return financeByTab(t).length;
  };

  const isFinanceSection = (t: Tab): t is "FINANCE" | "SALARY" | "EXPENSES" | "FUNDS" | "PRESCHOOL" | "EXTRABUDGET" =>
    t !== "subsidies" && t !== "contracts";

  return (
    <Layout>
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
          <i className="fa fa-arrow-left me-1" />Назад
        </button>
        <div>
          <h5 className="mb-0 fw-semibold">Финансовая деятельность</h5>
          <small className="text-muted">Финансовые показатели, субсидии и контракты</small>
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

      <ul className="nav nav-tabs mb-3 flex-wrap">
        {FINANCE_TABS.map((t) => (
          <li key={t} className="nav-item">
            <button
              className={`nav-link ${tab === t ? "active" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]} ({tabCount(t)})
            </button>
          </li>
        ))}
      </ul>

      {loading && <div className="text-center py-5"><div className="spinner-border text-secondary" /></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <>
          <div className="text-muted small mb-2">
            <span className="fw-semibold">{tabCount(tab)}</span> — всего
          </div>
          <div className="card shadow-sm">
            <div className="table-responsive">

              {isFinanceSection(tab) && (
                <table className="table table-bordered mb-0">
                  <thead style={{ background: "#efefef" }}>
                    <tr>
                      <th>Атрибут</th>
                      <th className="text-end">Значение</th>
                      <th className="text-center">Считать заполненным</th>
                    </tr>
                  </thead>
                  <tbody>
                    {financeByTab(tab).length === 0 ? (
                      <tr><td colSpan={3} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                    ) : financeByTab(tab).map((r) => (
                      <tr key={r.id}>
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
                      <th>Наименование</th>
                      <th className="text-end">Сумма, руб.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubsidies.length === 0 ? (
                      <tr><td colSpan={2} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                    ) : filteredSubsidies.map((r) => (
                      <tr key={r.id}>
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
                      <th>Наименование</th>
                      <th>Ссылка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContracts.length === 0 ? (
                      <tr><td colSpan={2} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                    ) : filteredContracts.map((r) => (
                      <tr key={r.id}>
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
        </>
      )}
    </Layout>
  );
}
