import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  fetchEvents, fetchOrgUsers, createEvent, updateEvent, deleteEvent,
  type CalendarEvent, type OrgUser, type EventCreate,
} from "../../api/data";
import { useAuth } from "../../contexts/AuthContext";
import Layout from "../../components/Layout";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];

const fmt = (d: string) => new Date(d).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
const toInputDT = (d: string) => new Date(d).toISOString().slice(0, 16);
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

type Modal = { mode: "create"; date: Date } | { mode: "edit"; event: CalendarEvent } | { mode: "day"; date: Date; events: CalendarEvent[] };

const emptyForm = (date?: Date): EventCreate & { ends_at: string; description: string } => ({
  organization_id: 0,
  title: "",
  starts_at: date ? `${date.toISOString().slice(0, 10)}T09:00` : new Date().toISOString().slice(0, 16),
  ends_at: date ? `${date.toISOString().slice(0, 10)}T10:00` : "",
  description: "",
  participant_ids: [],
});

export default function CalendarPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role_code !== "MINOBR";

  const today = new Date();
  const [cur, setCur] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = (month: Date) => {
    setLoading(true);
    fetchEvents(monthKey(month))
      .then((evs) => setEvents(evs.map((e) => ({
        ...e,
        participants: Array.isArray(e.participants)
          ? e.participants
          : typeof e.participants === "string"
            ? JSON.parse(e.participants)
            : [],
      }))))
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(cur); }, [cur]);
  useEffect(() => { fetchOrgUsers().then(setOrgUsers).catch(() => null); }, []);

  const prevMonth = () => setCur(new Date(cur.getFullYear(), cur.getMonth() - 1, 1));
  const nextMonth = () => setCur(new Date(cur.getFullYear(), cur.getMonth() + 1, 1));

  // Build calendar grid
  const days = useMemo(() => {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
    // Monday-first: (getDay()+6)%7
    const startOffset = (first.getDay() + 6) % 7;
    const grid: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) grid.push(null);
    for (let d = 1; d <= last.getDate(); d++) grid.push(new Date(cur.getFullYear(), cur.getMonth(), d));
    while (grid.length % 7 !== 0) grid.push(null);
    return grid;
  }, [cur]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = new Date(e.starts_at).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const openCreate = (date: Date) => {
    setForm({ ...emptyForm(date), organization_id: events[0]?.organization_id ?? 0 });
    setModal({ mode: "create", date });
  };

  const openEdit = (e: CalendarEvent) => {
    setForm({
      organization_id: e.organization_id,
      title: e.title,
      starts_at: toInputDT(e.starts_at),
      ends_at: e.ends_at ? toInputDT(e.ends_at) : "",
      description: e.description ?? "",
      participant_ids: e.participants.map((p) => p.id),
    });
    setModal({ mode: "edit", event: e });
  };

  const openDay = (date: Date, dayEvents: CalendarEvent[]) => {
    if (dayEvents.length === 0 && canEdit) { openCreate(date); return; }
    setModal({ mode: "day", date, events: dayEvents });
  };

  const closeModal = () => setModal(null);

  const handleSave = async () => {
    if (!form.title || !form.starts_at) return;
    setSaving(true);
    try {
      const body: EventCreate = {
        organization_id: form.organization_id,
        title: form.title,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
        description: form.description || undefined,
        participant_ids: form.participant_ids,
      };
      if (modal?.mode === "create") {
        const created = await createEvent(body);
        setEvents((prev) => [...prev, created]);
      } else if (modal?.mode === "edit") {
        const updated = await updateEvent(modal.event.id, body);
        setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      }
      closeModal();
    } catch { alert("Ошибка при сохранении"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Удалить мероприятие?")) return;
    await deleteEvent(id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    closeModal();
  };

  const toggleParticipant = (uid: number) => {
    setForm((f) => ({
      ...f,
      participant_ids: f.participant_ids?.includes(uid)
        ? f.participant_ids.filter((id) => id !== uid)
        : [...(f.participant_ids ?? []), uid],
    }));
  };

  const isToday = (d: Date | null) => d?.toDateString() === today.toDateString();

  const participantName = (p: OrgUser) =>
    [p.last_name, p.first_name].filter(Boolean).join(" ") || p.email;

  return (
    <Layout>
      {/* Header */}
      <div className="d-flex align-items-center justify-content-between mb-4">
        <div className="d-flex align-items-center gap-3">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard")}>
            <i className="fa fa-arrow-left me-1" />Назад
          </button>
          <div>
            <h5 className="mb-0 fw-semibold">Календарь мероприятий</h5>
            <small className="text-muted">{events.length} мероприятий в {MONTHS[cur.getMonth()].toLowerCase()}</small>
          </div>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={prevMonth}><i className="fa fa-chevron-left" /></button>
          <span className="fw-semibold px-2" style={{ minWidth: 160, textAlign: "center" }}>
            {MONTHS[cur.getMonth()]} {cur.getFullYear()}
          </span>
          <button className="btn btn-sm btn-outline-secondary" onClick={nextMonth}><i className="fa fa-chevron-right" /></button>
          <button className="btn btn-sm btn-outline-secondary ms-2" onClick={() => { const t = new Date(); setCur(new Date(t.getFullYear(), t.getMonth(), 1)); }}>
            Сегодня
          </button>
          {canEdit && (
            <button className="btn btn-sm text-white ms-2" style={{ background: "#37474f" }}
              onClick={() => openCreate(today)}>
              <i className="fa fa-plus me-1" />Мероприятие
            </button>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card shadow-sm border-0 rounded-4 overflow-hidden">
        {/* Weekday headers */}
        <div className="d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", background: "#37474f" }}>
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-white py-2 fw-semibold" style={{ fontSize: 13 }}>{d}</div>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-5"><div className="spinner-border text-secondary" /></div>
        ) : (
          <div className="d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
            {days.map((day, i) => {
              const dayEvents = day ? (eventsByDay.get(day.toDateString()) ?? []) : [];
              return (
                <div
                  key={i}
                  onClick={() => day && openDay(day, dayEvents)}
                  style={{
                    minHeight: 90,
                    borderRight: "1px solid #eee",
                    borderBottom: "1px solid #eee",
                    padding: "6px 8px",
                    cursor: day ? "pointer" : "default",
                    background: isToday(day) ? "#e8f4fd" : day ? "#fff" : "#fafafa",
                    transition: "background 0.12s",
                  }}
                  className={day ? "calendar-day" : ""}
                >
                  {day && (
                    <>
                      <div
                        className="fw-semibold mb-1"
                        style={{
                          fontSize: 13,
                          width: 24, height: 24,
                          borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: isToday(day) ? "#37474f" : "transparent",
                          color: isToday(day) ? "#fff" : "#333",
                        }}
                      >{day.getDate()}</div>
                      {dayEvents.slice(0, 3).map((e) => (
                        <div
                          key={e.id}
                          onClick={(ev) => { ev.stopPropagation(); openEdit(e); }}
                          className="text-truncate rounded px-1 mb-1"
                          style={{ fontSize: 11, background: "#37474f18", color: "#37474f", cursor: "pointer" }}
                          title={e.title}
                        >
                          <span style={{ opacity: 0.6 }}>{fmtTime(e.starts_at)}</span> {e.title}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div style={{ fontSize: 11, color: "#888" }}>+{dayEvents.length - 3} ещё</div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Day modal */}
      {modal?.mode === "day" && (
        <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={closeModal}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-4 overflow-hidden">
              <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
                <h6 className="modal-title mb-0 fw-semibold">
                  {modal.date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}
                  <span className="ms-2 fw-normal opacity-75" style={{ fontSize: 13 }}>
                    {modal.events.length} мероприятий
                  </span>
                </h6>
                <button className="btn-close btn-close-white" onClick={closeModal} />
              </div>
              <div className="modal-body p-0">
                {modal.events.map((e) => (
                  <div key={e.id} className="d-flex align-items-start gap-3 p-3 border-bottom">
                    <div className="text-center" style={{ minWidth: 44 }}>
                      <div style={{ fontSize: 12, color: "#888" }}>{fmtTime(e.starts_at)}</div>
                      {e.ends_at && <div style={{ fontSize: 11, color: "#bbb" }}>{fmtTime(e.ends_at)}</div>}
                    </div>
                    <div className="flex-grow-1">
                      <div className="fw-semibold" style={{ fontSize: 14 }}>{e.title}</div>
                      {e.description && <div className="text-muted" style={{ fontSize: 12 }}>{e.description}</div>}
                      {e.participants.length > 0 && (
                        <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                          <i className="fa fa-users me-1" />
                          {e.participants.map((p) => [p.last_name, p.first_name].filter(Boolean).join(" ")).join(", ")}
                        </div>
                      )}
                    </div>
                    {canEdit && (
                      <button className="btn btn-sm btn-outline-secondary py-0 px-2" onClick={() => openEdit(e)}>
                        <i className="fa fa-pencil" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="modal-footer">
                  <button className="btn btn-sm text-white" style={{ background: "#37474f" }}
                    onClick={() => { closeModal(); openCreate(modal.date); }}>
                    <i className="fa fa-plus me-1" />Добавить
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit modal */}
      {(modal?.mode === "create" || modal?.mode === "edit") && (
        <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={closeModal}>
          <div className="modal-dialog modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-4 overflow-hidden">
              <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
                <h6 className="modal-title mb-0 fw-semibold">
                  <i className={`fa ${modal.mode === "create" ? "fa-plus" : "fa-pencil"} me-2`} />
                  {modal.mode === "create" ? "Новое мероприятие" : "Редактировать"}
                </h6>
                <button className="btn-close btn-close-white" onClick={closeModal} />
              </div>

              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Название *</label>
                    <input className="form-control" value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      placeholder="Название мероприятия" />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Начало *</label>
                    <input type="datetime-local" className="form-control" value={form.starts_at}
                      onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label small fw-semibold">Конец</label>
                    <input type="datetime-local" className="form-control" value={form.ends_at}
                      onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
                  </div>
                  <div className="col-12">
                    <label className="form-label small fw-semibold">Описание</label>
                    <textarea className="form-control" rows={2} value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                  </div>
                  {orgUsers.length > 0 && (
                    <div className="col-12">
                      <label className="form-label small fw-semibold">Участники</label>
                      <div className="border rounded-3 p-2" style={{ maxHeight: 160, overflowY: "auto" }}>
                        {orgUsers.map((u) => (
                          <div key={u.id} className="form-check mb-1">
                            <input type="checkbox" className="form-check-input"
                              id={`u${u.id}`}
                              checked={form.participant_ids?.includes(u.id) ?? false}
                              onChange={() => toggleParticipant(u.id)} />
                            <label className="form-check-label" htmlFor={`u${u.id}`} style={{ fontSize: 13 }}>
                              {participantName(u)}
                              <span className="text-muted ms-1" style={{ fontSize: 11 }}>{u.email}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                {modal.mode === "edit" && (
                  <button className="btn btn-sm btn-outline-danger me-auto"
                    onClick={() => void handleDelete(modal.event.id)}>
                    <i className="fa fa-trash me-1" />Удалить
                  </button>
                )}
                <button className="btn btn-sm btn-secondary" onClick={closeModal}>Отмена</button>
                <button className="btn btn-sm text-white" style={{ background: "#37474f" }}
                  disabled={saving || !form.title} onClick={() => void handleSave()}>
                  {saving && <span className="spinner-border spinner-border-sm me-1" />}
                  Сохранить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .calendar-day:hover { background: #f4f6f8 !important; }
      `}</style>
    </Layout>
  );
}
