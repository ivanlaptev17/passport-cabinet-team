import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import DateField from "../../components/DateField";
import { errorText } from "../../api/tasks";
import { fetchStaffCalendar, updateStaffCalendar, type StaffCalendarRow } from "../../api/staff";

function fullName(e: StaffCalendarRow) {
  return [e.last_name, e.first_name, e.middle_name].filter(Boolean).join(" ") || e.fio || "—";
}

function formatBirth(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function isBirthdayMonth(iso: string | null) {
  return !!iso && Number(iso.slice(5, 7)) === new Date().getMonth() + 1;
}

/** Отпуска, замы и дни рождения сотрудников — для Директора, Ответственного и Администратора ОО. */
export default function StaffCalendarPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StaffCalendarRow[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<StaffCalendarRow | null>(null);

  useEffect(() => {
    fetchStaffCalendar()
      .then((data) => {
        setRows(data.employees);
        setCanEdit(data.can_edit);
      })
      .catch((e) => {
        if ((e as Error).message === "401") navigate("/");
        else setError(errorText(e, "Не удалось загрузить данные"));
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [fullName(r), r.position, r.vacations, r.deputies].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <Layout>
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
          <i className="fa fa-arrow-left me-1" />
          Назад
        </button>
        <div>
          <h5 className="mb-0 fw-semibold">Отпуска и дни рождения</h5>
          <small className="text-muted">
            Отпуска и замы — в свободной форме. Дни рождения появятся в календаре
          </small>
        </div>
      </div>

      <input
        className="form-control mb-3"
        placeholder="Поиск по ФИО, должности, отпускам"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-secondary" />
        </div>
      )}
      {error && <div className="alert alert-warning">{error}</div>}

      {!loading && !error && (
        <div className="card shadow-sm border-0 rounded-4 overflow-hidden">
          <div className="table-responsive">
            <table className="table mb-0 align-middle">
              <thead style={{ background: "#37474f", color: "white" }}>
                <tr>
                  <th>Сотрудник</th>
                  <th style={{ width: 130 }}>Дата рождения</th>
                  <th>Отпуска</th>
                  <th>Замы</th>
                  {canEdit && <th style={{ width: 56 }} />}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 5 : 4} className="text-center text-muted py-4">
                      Сотрудников нет
                    </td>
                  </tr>
                ) : (
                  visible.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="fw-semibold">{fullName(r)}</div>
                        {r.position && <div className="text-muted" style={{ fontSize: 12 }}>{r.position}</div>}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {formatBirth(r.birth_date)}
                        {isBirthdayMonth(r.birth_date) && (
                          <i className="fa fa-cake-candles ms-2" style={{ color: "#e91e63" }} title="День рождения в этом месяце" />
                        )}
                      </td>
                      <td style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{r.vacations || <span className="text-muted">—</span>}</td>
                      <td style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{r.deputies || <span className="text-muted">—</span>}</td>
                      {canEdit && (
                        <td className="text-center">
                          <button className="btn btn-sm btn-outline-secondary py-0 px-2" title="Изменить" onClick={() => setEditing(r)}>
                            <i className="fa fa-pencil" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
            setEditing(null);
          }}
        />
      )}
    </Layout>
  );
}

function EditModal({
  row,
  onClose,
  onSaved,
}: {
  row: StaffCalendarRow;
  onClose: () => void;
  onSaved: (row: StaffCalendarRow) => void;
}) {
  const [vacations, setVacations] = useState(row.vacations ?? "");
  const [deputies, setDeputies] = useState(row.deputies ?? "");
  const [birthDate, setBirthDate] = useState(row.birth_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      onSaved(
        await updateStaffCalendar(row.id, {
          vacations,
          deputies,
          ...(birthDate ? { birth_date: birthDate } : { clear_birth_date: true }),
        }),
      );
    } catch (e) {
      setError(errorText(e, "Не удалось сохранить"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content rounded-4 border-0">
          <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
            <h6 className="modal-title mb-0 fw-semibold">{fullName(row)}</h6>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger py-2">{error}</div>}

            <label className="form-label small fw-semibold">Дата рождения</label>
            <div className="mb-3" style={{ maxWidth: 220 }}>
              <DateField value={birthDate} onChange={setBirthDate} />
            </div>

            <label className="form-label small fw-semibold">Отпуска</label>
            <textarea
              className="form-control mb-3"
              rows={3}
              value={vacations}
              placeholder="с 01.07 по 14.07, с 10.11 по 17.11"
              onChange={(e) => setVacations(e.target.value)}
            />

            <label className="form-label small fw-semibold">Замы</label>
            <textarea
              className="form-control"
              rows={2}
              value={deputies}
              placeholder="ФИО тех, кто замещает"
              onChange={(e) => setDeputies(e.target.value)}
            />
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-sm text-white" style={{ background: "#37474f" }} disabled={saving} onClick={() => void save()}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}
              Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
