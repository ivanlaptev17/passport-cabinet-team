import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  fetchFinance, fetchSubsidies, fetchContracts, fetchFinanceCategories,
  type FinanceRecord, type Subsidy, type Contract, type FinanceCategory,
} from "../../api/data";
import Layout from "../../components/Layout";
import type { OrgDataFormValue } from "../../components/OrgDataEditor";
import { useOrgDataCrud } from "../../hooks/useOrgDataCrud";
import { useOrgDataPermissions } from "../../hooks/useOrgDataPermissions";

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

const financeTabFromSearch = (params: URLSearchParams): Tab =>
  FINANCE_TABS.find((value) => value === params.get("tab")) ?? "FINANCE";

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });

const optionalAmount = (value: OrgDataFormValue) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Введите корректное число");
  return parsed;
};

export default function FinancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = financeTabFromSearch(searchParams);
  const [finance, setFinance] = useState<FinanceRecord[]>([]);
  const [subsidies, setSubsidies] = useState<Subsidy[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { canWrite, organizationId } = useOrgDataPermissions();
  const selectTab = (nextTab: Tab) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("tab", nextTab);
      return next;
    });
  };

  useEffect(() => {
    Promise.all([fetchFinance(), fetchSubsidies(), fetchContracts(), fetchFinanceCategories()])
      .then(([f, s, c, fc]) => { setFinance(f); setSubsidies(s); setContracts(c); setCategories(fc); })
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

  const financeCrud = useOrgDataCrud<FinanceRecord>({
    resource: "finance",
    setRows: setFinance,
    fields: [
      { name: "section_code", label: "Раздел", type: "select", required: true, options: categories.map((c) => ({ value: c.code, label: c.name })) },
      { name: "attribute", label: "Показатель", required: true },
      { name: "value", label: "Значение", type: "number", step: "0.01" },
      { name: "is_filled", label: "Считать заполненным", type: "checkbox" },
    ],
    defaults: { section_code: categories[0]?.code ?? "", attribute: "", value: "", is_filled: false },
    toFormValues: (r) => ({ section_code: r.section_code, attribute: r.attribute, value: r.value == null ? "" : String(r.value), is_filled: r.is_filled }),
    toPayload: (v) => ({ section_code: String(v.section_code ?? ""), attribute: String(v.attribute ?? ""), value: optionalAmount(v.value ?? ""), is_filled: v.is_filled === true }),
    itemName: "показатель",
    canWrite,
    organizationId,
  });
  const subsidyCrud = useOrgDataCrud<Subsidy>({
    resource: "subsidies",
    setRows: setSubsidies,
    fields: [
      { name: "name", label: "Наименование", required: true },
      { name: "amount", label: "Сумма, руб.", type: "number", step: "0.01" },
    ],
    defaults: { name: "", amount: "" },
    toFormValues: (r) => ({ name: r.name, amount: r.amount == null ? "" : String(r.amount) }),
    toPayload: (v) => ({ name: String(v.name ?? ""), amount: optionalAmount(v.amount ?? "") }),
    itemName: "субсидию",
    canWrite,
    organizationId,
  });
  const contractCrud = useOrgDataCrud<Contract>({
    resource: "contracts",
    setRows: setContracts,
    fields: [
      { name: "name", label: "Наименование", required: true },
      { name: "link", label: "Ссылка" },
    ],
    defaults: { name: "", link: "" },
    toFormValues: (r) => ({ name: r.name, link: r.link ?? "" }),
    toPayload: (v) => ({ name: String(v.name ?? ""), link: String(v.link ?? "") || null }),
    itemName: "контракт",
    canWrite,
    organizationId,
  });
  const activeCrud = tab === "subsidies" ? subsidyCrud : tab === "contracts" ? contractCrud : financeCrud;

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
              onClick={() => selectTab(t)}
            >
              {TAB_LABELS[t]} ({tabCount(t)})
            </button>
          </li>
        ))}
      </ul>
      <div className="d-flex justify-content-end mb-3">{activeCrud.addButton}</div>

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
                      {canWrite && <th className="text-center">Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {financeByTab(tab).length === 0 ? (
                      <tr><td colSpan={canWrite ? 4 : 3} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                    ) : financeByTab(tab).map((r) => (
                      <tr key={r.id}>
                        <td>{r.attribute}</td>
                        <td className="text-end fw-semibold">{fmt(r.value)}</td>
                        <td className="text-center">
                          {r.is_filled ? <span className="badge bg-success">Да</span> : <span className="badge bg-secondary">Нет</span>}
                        </td>
                        {canWrite && <td className="text-center text-nowrap">{financeCrud.rowActions(r)}</td>}
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
                      {canWrite && <th className="text-center">Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubsidies.length === 0 ? (
                      <tr><td colSpan={canWrite ? 3 : 2} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                    ) : filteredSubsidies.map((r) => (
                      <tr key={r.id}>
                        <td>{r.name}</td>
                        <td className="text-end fw-semibold">{fmt(r.amount)}</td>
                        {canWrite && <td className="text-center text-nowrap">{subsidyCrud.rowActions(r)}</td>}
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
                      {canWrite && <th className="text-center">Действия</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContracts.length === 0 ? (
                      <tr><td colSpan={canWrite ? 3 : 2} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
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
                        {canWrite && <td className="text-center text-nowrap">{contractCrud.rowActions(r)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

            </div>
          </div>
        </>
      )}
      {financeCrud.modals}
      {subsidyCrud.modals}
      {contractCrud.modals}
    </Layout>
  );
}
