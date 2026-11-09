import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchStaffInfo, type StaffInfo } from "../../api/data";
import Layout from "../../components/Layout";
import type { OrgDataField } from "../../components/OrgDataEditor";
import { useOrgDataCrud } from "../../hooks/useOrgDataCrud";
import { useOrgDataPermissions } from "../../hooks/useOrgDataPermissions";

const STAFF_INFO_FIELDS: OrgDataField[] = [
  { name: "attribute", label: "Атрибут", required: true },
  { name: "value", label: "Значение" },
  { name: "real_value", label: "Реальное значение" },
  { name: "is_filled", label: "Считать заполненным", type: "checkbox" },
];

export default function StaffInfoPage() {
  const [rows, setRows] = useState<StaffInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { canWrite, organizationId } = useOrgDataPermissions();

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
  const crud = useOrgDataCrud<StaffInfo>({
    resource: "staff-info",
    setRows,
    fields: STAFF_INFO_FIELDS,
    defaults: { attribute: "", value: "", real_value: "", is_filled: false },
    toFormValues: (r) => ({ attribute: r.attribute, value: r.value ?? "", real_value: r.real_value ?? "", is_filled: r.is_filled }),
    toPayload: (v) => ({
      attribute: String(v.attribute ?? ""),
      value: String(v.value ?? "") || null,
      real_value: String(v.real_value ?? "") || null,
      is_filled: v.is_filled === true,
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
          <h5 className="mb-0 fw-semibold">Общие сведения о кадрах</h5>
          <small className="text-muted">Штатное расписание и укомплектованность</small>
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
      <div className="d-flex justify-content-end mb-3">{crud.addButton}</div>

      {loading && <div className="text-center py-5"><div className="spinner-border text-secondary" /></div>}
      {error && <div className="alert alert-danger">{error}</div>}

      {!loading && !error && (
        <>
          <div className="text-muted small mb-2">
            <span className="fw-semibold">{filtered.length}</span> — всего
          </div>
          <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-bordered mb-0">
              <thead style={{ background: "#efefef" }}>
                <tr>
                  <th>Атрибут</th>
                  <th className="text-end">Значение</th>
                  <th className="text-end">Реальное значение</th>
                  <th className="text-center">Считать заполненным</th>
                  {canWrite && <th className="text-center">Действия</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={canWrite ? 5 : 4} className="text-center text-muted py-4">Данные отсутствуют</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td>{r.attribute}</td>
                      <td className="text-end">{r.value ?? "—"}</td>
                      <td className="text-end">{r.real_value ?? "—"}</td>
                      <td className="text-center">
                        {r.is_filled
                          ? <span className="badge bg-success">Да</span>
                          : <span className="badge bg-secondary">Нет</span>}
                      </td>
                      {canWrite && <td className="text-center text-nowrap">{crud.rowActions(r)}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
      {crud.modals}
    </Layout>
  );
}
