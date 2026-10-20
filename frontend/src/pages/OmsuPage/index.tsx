import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Layout from "../../components/Layout";
import ConfirmModal from "../../components/ConfirmModal";
import DateField from "../../components/DateField";
import { errorText } from "../../api/tasks";
import { useOrgScope } from "../../hooks/useOrgScope";
import {
  createRepresentative,
  deleteRepresentative,
  fetchOmsuMunicipalities,
  fetchOmsuMunicipality,
  updateOmsuMunicipality,
  updateRepresentative,
  type OmsuMunicipality,
  type OmsuMunicipalitySummary,
  type OmsuPosition,
  type OmsuRepresentative,
} from "../../api/omsu";

const fmt = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
};
const fmtShort = (iso: string) => fmt(iso).slice(0, 5);
const shortName = (full: string) => {
  const [last, ...rest] = full.split(/\s+/);
  return [last, ...rest.map((p) => `${p[0]}.`)].join(" ");
};

/**
 * ОМСУ. Министерство видит сводку по регионам и открывает любой регион.
 * ОМСУ попадает сразу в свой регион и заполняет представителей, их отпуска и замещающих.
 */
export default function OmsuPage() {
  const { isOmsu } = useOrgScope();
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("m")) || null;
  const [own, setOwn] = useState<number | null>(null);
  const [ownError, setOwnError] = useState("");

  useEffect(() => {
    if (!isOmsu) return;
    let alive = true;
    fetchOmsuMunicipalities()
      .then((list) => {
        if (!alive) return;
        if (list[0]) setOwn(list[0].id);
        else setOwnError("Учётная запись ОМСУ не привязана к региону — обратитесь к администратору");
      })
      .catch((e) => alive && setOwnError(errorText(e, "Не удалось загрузить регион")));
    return () => {
      alive = false;
    };
  }, [isOmsu]);

  if (isOmsu) {
    return (
      <Layout>
        {ownError ? (
          <div className="alert alert-warning">{ownError}</div>
        ) : own ? (
          <RegionView municipalityId={own} />
        ) : (
          <div className="text-center py-5">
            <div className="spinner-border text-secondary" />
          </div>
        )}
      </Layout>
    );
  }

  return (
    <Layout>
      {selected ? (
        <RegionView municipalityId={selected} onBack={() => setParams({})} />
      ) : (
        <Overview onOpen={(id) => setParams({ m: String(id) })} />
      )}
    </Layout>
  );
}

// ── Сводка для министерства ──────────────────────────────────────────────────

function Overview({ onOpen }: { onOpen: (id: number) => void }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState<OmsuMunicipalitySummary[] | null>(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchOmsuMunicipalities()
      .then(setRows)
      .catch((e) => setError(errorText(e, "Не удалось загрузить регионы")));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const onVacation = (rows ?? []).reduce((n, r) => n + r.on_vacation.length, 0);
  const incomplete = (rows ?? []).filter((r) => r.positions_filled < r.positions_total).length;

  return (
    <div className="mx-auto" style={{ maxWidth: 1000 }}>
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
          <i className="fa fa-arrow-left me-1" />
          Назад
        </button>
        <div>
          <h5 className="mb-0 fw-semibold">ОМСУ — перечень представителей</h5>
          <small className="text-muted">Данные заполняет ОМСУ каждого региона</small>
        </div>
      </div>

      {rows && (
        <div className="d-flex flex-wrap gap-2 mb-3">
          <span className="badge rounded-pill text-bg-light border px-3 py-2">Регионов: {rows.length}</span>
          <span className={`badge rounded-pill px-3 py-2 ${onVacation ? "text-bg-warning" : "text-bg-light border"}`}>
            Сейчас в отпуске: {onVacation}
          </span>
          <span className={`badge rounded-pill px-3 py-2 ${incomplete ? "text-bg-danger" : "text-bg-light border"}`}>
            Заполнено не полностью: {incomplete}
          </span>
        </div>
      )}

      <input className="form-control mb-3" placeholder="Поиск региона" value={search} onChange={(e) => setSearch(e.target.value)} />

      {error && <div className="alert alert-danger">{error}</div>}
      {!rows && !error && (
        <div className="text-center py-5">
          <div className="spinner-border text-secondary" />
        </div>
      )}

      {visible.map((r) => (
        <button
          key={r.id}
          type="button"
          className="btn text-start w-100 bg-white border rounded-4 p-3 mb-2 shadow-sm omsu-card"
          onClick={() => onOpen(r.id)}
        >
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div style={{ minWidth: 0 }}>
              <div className="fw-semibold" style={{ fontSize: 16 }}>{r.name}</div>
              <div className="text-muted" style={{ fontSize: 13 }}>{r.education_body ?? "Орган управления образованием не указан"}</div>
            </div>
            <div className="text-end text-muted" style={{ fontSize: 12 }}>
              <div className={r.positions_filled < r.positions_total ? "text-danger fw-semibold" : ""}>
                Заполнено {r.positions_filled} из {r.positions_total}
              </div>
              <div>обновлено {fmt(r.updated_at)}</div>
            </div>
          </div>

          {r.primary_contact && (
            <div className="mt-2" style={{ fontSize: 13 }}>
              <span className="text-muted">Начальник управления: </span>
              <span className="fw-semibold">{r.primary_contact.full_name}</span>
              {r.primary_contact.contacts && <span className="text-muted"> · {r.primary_contact.contacts.split("\n")[0]}</span>}
            </div>
          )}

          {(r.on_vacation.length > 0 || r.upcoming_vacations.length > 0) && (
            <div className="d-flex flex-column gap-1 mt-2">
              {r.on_vacation.map((v, i) => (
                <div key={`now-${i}`} className="omsu-vacation omsu-vacation-now">
                  <i className="fa fa-umbrella-beach me-1" />
                  {shortName(v.full_name)} в отпуске до {fmtShort(v.ends_on)}
                  {v.deputy ? <> — замещает <b>{shortName(v.deputy)}</b></> : <> — замещающий не указан</>}
                </div>
              ))}
              {r.upcoming_vacations.map((v, i) => (
                <div key={`soon-${i}`} className="omsu-vacation">
                  <i className="fa fa-calendar me-1" />
                  {shortName(v.full_name)}: отпуск с {fmtShort(v.starts_on)} по {fmtShort(v.ends_on)}
                </div>
              ))}
            </div>
          )}

          {r.missing_positions.length > 0 && (
            <div className="text-danger mt-2" style={{ fontSize: 12 }}>
              Не заполнено: {r.missing_positions.join(", ").toLowerCase()}
            </div>
          )}
        </button>
      ))}

      <OmsuStyles />
    </div>
  );
}

// ── Регион: просмотр и заполнение ────────────────────────────────────────────

function RegionView({ municipalityId, onBack }: { municipalityId: number; onBack?: () => void }) {
  const [data, setData] = useState<OmsuMunicipality | null>(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<{ rep: OmsuRepresentative | null; position: string } | null>(null);
  const [deleting, setDeleting] = useState<OmsuRepresentative | null>(null);
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () =>
    fetchOmsuMunicipality(municipalityId)
      .then(setData)
      .catch((e) => setError(errorText(e, "Не удалось загрузить регион")));

  useEffect(() => {
    let alive = true;
    fetchOmsuMunicipality(municipalityId)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(errorText(e, "Не удалось загрузить регион")));
    return () => {
      alive = false;
    };
  }, [municipalityId]);

  if (error && !data) return <div className="alert alert-warning">{error}</div>;
  if (!data) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-secondary" />
      </div>
    );
  }

  const saveBody = async () => {
    if (bodyDraft === null) return;
    setBusy(true);
    try {
      await updateOmsuMunicipality(data.id, { education_body: bodyDraft });
      setBodyDraft(null);
      await reload();
    } catch (e) {
      setError(errorText(e, "Не удалось сохранить"));
    } finally {
      setBusy(false);
    }
  };

  const updatedBy = [data.updated_by_last_name, data.updated_by_first_name].filter(Boolean).join(" ");

  return (
    <div className="mx-auto" style={{ maxWidth: 1000 }}>
      <div className="d-flex align-items-start gap-3 mb-3">
        {onBack && (
          <button className="btn btn-sm btn-outline-secondary" onClick={onBack}>
            <i className="fa fa-arrow-left" />
          </button>
        )}
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <h5 className="mb-1 fw-semibold">{data.name}</h5>
          {bodyDraft === null ? (
            <div className="text-muted d-flex align-items-center gap-2" style={{ fontSize: 14 }}>
              <span>{data.education_body ?? "Орган управления образованием не указан"}</span>
              {data.can_edit && (
                <button className="btn btn-link btn-sm p-0 text-muted" title="Изменить" onClick={() => setBodyDraft(data.education_body ?? "")}>
                  <i className="fa fa-pen" />
                </button>
              )}
            </div>
          ) : (
            <div className="d-flex gap-2" style={{ maxWidth: 480 }}>
              <input className="form-control form-control-sm" value={bodyDraft} autoFocus onChange={(e) => setBodyDraft(e.target.value)} />
              <button className="btn btn-sm text-white" style={{ background: "#37474f" }} disabled={busy} onClick={() => void saveBody()}>
                Сохранить
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={() => setBodyDraft(null)}>
                Отмена
              </button>
            </div>
          )}
          <div className="text-muted mt-1" style={{ fontSize: 12 }}>
            Обновлено {fmt(data.updated_at)}{updatedBy ? ` · ${updatedBy}` : ""}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {data.can_edit && (
        <div className="alert alert-light border small mb-3">
          <i className="fa fa-circle-info me-1" />
          Заполните представителей по каждой должности, их отпуска и кто замещает на время отсутствия.
          Министерство видит эти данные сразу после сохранения.
        </div>
      )}

      {data.positions.map((position) => (
        <PositionSection
          key={position.code}
          position={position}
          reps={data.representatives.filter((r) => r.position_code === position.code)}
          canEdit={data.can_edit}
          onAdd={() => setEditing({ rep: null, position: position.code })}
          onEdit={(rep) => setEditing({ rep, position: rep.position_code })}
          onDelete={setDeleting}
        />
      ))}

      {editing && (
        <RepresentativeModal
          municipalityId={data.id}
          positions={data.positions}
          rep={editing.rep}
          defaultPosition={editing.position}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void reload();
          }}
        />
      )}

      {deleting && (
        <ConfirmModal
          text={`${deleting.full_name} будет удалён из перечня вместе с отпусками.`}
          confirmLabel="Удалить"
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await deleteRepresentative(deleting.id);
              setDeleting(null);
              await reload();
            } catch (e) {
              setError(errorText(e, "Не удалось удалить"));
              setDeleting(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}

      <OmsuStyles />
    </div>
  );
}

function PositionSection({
  position,
  reps,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  position: OmsuPosition;
  reps: OmsuRepresentative[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (rep: OmsuRepresentative) => void;
  onDelete: (rep: OmsuRepresentative) => void;
}) {
  return (
    <div className={`card border-0 shadow-sm rounded-4 mb-3 ${position.primary ? "omsu-primary" : ""}`}>
      <div className="card-body">
        <div className="d-flex justify-content-between align-items-center mb-2 gap-2">
          <div className="fw-semibold" style={{ fontSize: 14 }}>
            {position.label}
            {position.primary && <span className="badge rounded-pill ms-2 omsu-primary-badge">главный контакт</span>}
          </div>
          {canEdit && (
            <button className="btn btn-sm btn-outline-secondary" onClick={onAdd}>
              <i className="fa fa-plus me-1" />
              Добавить
            </button>
          )}
        </div>

        {reps.length === 0 ? (
          <div className={canEdit ? "text-muted" : "text-danger"} style={{ fontSize: 13 }}>
            {canEdit ? "Пока никого — добавьте представителя" : "Не заполнено"}
          </div>
        ) : (
          reps.map((rep) => {
            const now = new Date();
            const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
            const future = rep.vacations.filter((v) => v.ends_on >= today);
            return (
              <div key={rep.id} className="border rounded-3 p-3 mb-2">
                <div className="d-flex justify-content-between gap-2">
                  <div style={{ minWidth: 0 }}>
                    <div className="fw-semibold">{rep.full_name}</div>
                    {rep.position_title && <div className="text-muted" style={{ fontSize: 13 }}>{rep.position_title}</div>}
                  </div>
                  {canEdit && (
                    <div className="d-flex gap-1 flex-shrink-0">
                      <button className="btn btn-sm btn-outline-secondary py-0 px-2" title="Изменить" onClick={() => onEdit(rep)}>
                        <i className="fa fa-pencil" />
                      </button>
                      <button className="btn btn-sm btn-outline-danger py-0 px-2" title="Удалить" onClick={() => onDelete(rep)}>
                        <i className="fa fa-trash" />
                      </button>
                    </div>
                  )}
                </div>

                {rep.on_vacation && (
                  <div className="omsu-vacation omsu-vacation-now mt-2">
                    <i className="fa fa-umbrella-beach me-1" />
                    В отпуске до {fmt(rep.on_vacation.ends_on)}
                    {rep.deputy ? <> — замещает <b>{rep.deputy}</b></> : <> — замещающий не указан</>}
                  </div>
                )}

                <div className="mt-2 d-flex flex-column gap-1" style={{ fontSize: 13 }}>
                  {rep.contacts && (
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      <i className="fa fa-phone text-muted me-2" />
                      {rep.contacts}
                    </div>
                  )}
                  {rep.email && (
                    <div>
                      <i className="fa fa-envelope text-muted me-2" />
                      <a href={`mailto:${rep.email}`}>{rep.email}</a>
                    </div>
                  )}
                  {rep.deputy && !rep.on_vacation && (
                    <div>
                      <i className="fa fa-user-group text-muted me-2" />
                      Замещает на время отсутствия: {rep.deputy}
                    </div>
                  )}
                  {future.length > 0 && (
                    <div className="text-muted">
                      <i className="fa fa-calendar me-2" />
                      Отпуска: {future.map((v) => `${fmt(v.starts_on)} – ${fmt(v.ends_on)}`).join(", ")}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RepresentativeModal({
  municipalityId,
  positions,
  rep,
  defaultPosition,
  onClose,
  onSaved,
}: {
  municipalityId: number;
  positions: OmsuPosition[];
  rep: OmsuRepresentative | null;
  defaultPosition: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [position, setPosition] = useState(rep?.position_code ?? defaultPosition);
  const [fullName, setFullName] = useState(rep?.full_name ?? "");
  const [title, setTitle] = useState(rep?.position_title ?? "");
  const [contacts, setContacts] = useState(rep?.contacts ?? "");
  const [email, setEmail] = useState(rep?.email ?? "");
  const [deputy, setDeputy] = useState(rep?.deputy ?? "");
  const [vacations, setVacations] = useState(
    (rep?.vacations ?? []).map((v) => ({ starts_on: v.starts_on, ends_on: v.ends_on })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const setVacation = (i: number, field: "starts_on" | "ends_on", value: string) =>
    setVacations((prev) => prev.map((v, idx) => (idx === i ? { ...v, [field]: value } : v)));

  const save = async () => {
    if (!fullName.trim()) {
      setError("Укажите ФИО");
      return;
    }
    const filled = vacations.filter((v) => v.starts_on || v.ends_on);
    if (filled.some((v) => !v.starts_on || !v.ends_on)) {
      setError("У каждого отпуска нужны обе даты");
      return;
    }
    if (filled.some((v) => v.ends_on < v.starts_on)) {
      setError("Отпуск заканчивается раньше, чем начинается");
      return;
    }
    setSaving(true);
    setError("");
    const body = {
      position_code: position,
      full_name: fullName,
      position_title: title,
      contacts,
      email,
      deputy,
      vacations: filled,
    };
    try {
      if (rep) await updateRepresentative(rep.id, body);
      else await createRepresentative(municipalityId, body);
      onSaved();
    } catch (e) {
      setError(errorText(e, "Не удалось сохранить"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-content rounded-4 border-0">
          <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
            <h6 className="modal-title mb-0 fw-semibold">{rep ? "Представитель" : "Новый представитель"}</h6>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger py-2">{error}</div>}

            <label className="form-label small fw-semibold">Должность в перечне</label>
            <select className="form-select mb-3" value={position} onChange={(e) => setPosition(e.target.value)}>
              {positions.map((p) => (
                <option key={p.code} value={p.code}>{p.label}</option>
              ))}
            </select>

            <div className="row g-3 mb-3">
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold">ФИО</label>
                <input className="form-control" value={fullName} autoFocus onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold">Должность полностью</label>
                <input className="form-control" value={title} placeholder="Начальник отдела ..." onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold">Телефоны</label>
                <textarea className="form-control" rows={2} value={contacts} placeholder="+7 (495) 999-99-00" onChange={(e) => setContacts(e.target.value)} />
              </div>
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold">Почта</label>
                <input className="form-control" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>

            <label className="form-label small fw-semibold">Кто замещает на время отсутствия</label>
            <input className="form-control mb-3" value={deputy} placeholder="ФИО замещающего" onChange={(e) => setDeputy(e.target.value)} />

            <div className="d-flex justify-content-between align-items-center mb-2">
              <label className="form-label small fw-semibold mb-0">Отпуска</label>
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setVacations((prev) => [...prev, { starts_on: "", ends_on: "" }])}>
                <i className="fa fa-plus me-1" />
                Добавить отпуск
              </button>
            </div>
            {vacations.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>Отпусков не указано</div>}
            {vacations.map((v, i) => (
              <div key={i} className="d-flex align-items-center gap-2 mb-2">
                <span className="text-muted" style={{ fontSize: 13 }}>с</span>
                <div style={{ flex: 1 }}>
                  <DateField value={v.starts_on} onChange={(iso) => setVacation(i, "starts_on", iso)} />
                </div>
                <span className="text-muted" style={{ fontSize: 13 }}>по</span>
                <div style={{ flex: 1 }}>
                  <DateField value={v.ends_on} onChange={(iso) => setVacation(i, "ends_on", iso)} />
                </div>
                <button type="button" className="btn btn-sm btn-link text-danger" title="Убрать" onClick={() => setVacations((prev) => prev.filter((_, idx) => idx !== i))}>
                  <i className="fa fa-xmark" />
                </button>
              </div>
            ))}
          </div>
          <div className="modal-footer">
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Отмена</button>
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

function OmsuStyles() {
  return (
    <style>{`
      .omsu-card:hover { background: #f8f9fa !important; }
      .omsu-vacation { font-size: 12px; color: #5f6b73; }
      .omsu-vacation-now { color: #b45309; background: #fff7e6; border-radius: 8px; padding: 4px 8px; }
      .omsu-primary { border-left: 4px solid #f2c94c !important; }
      .omsu-primary-badge { background: #fff4c2; color: #8a6d00; font-weight: 500; }
    `}</style>
  );
}
