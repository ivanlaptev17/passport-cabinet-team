import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import DateField from "../../components/DateField";
import ParticipantPicker from "../../components/ParticipantPicker";
import TagPicker, { TagChips } from "../../components/TagPicker";
import { useTaskContext } from "../../hooks/useTaskContext";
import {
  createTask,
  errorText,
  fetchMyTasks,
  fetchOrgTasks,
  fetchTaskOrgUsers,
  taskCategories,
  taskParticipants,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_SEVERITIES,
  TASK_STATUSES,
  type ContextOrganization,
  type Task,
  type TaskSeverity,
  type TaskStatus,
} from "../../api/tasks";
import { fetchBuildings, type Building } from "../../api/data";

type Scope = "my" | "org";

function dueLabel(due: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return `сегодня ${time}`;
  return `${d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })} ${time}`;
}

function isOverdue(task: Task) {
  return !!task.due_at && task.status !== "DONE" && new Date(task.due_at) < new Date();
}

export function TaskCard({ task, showOrganization, onOpen }: { task: Task; showOrganization: boolean; onOpen: () => void }) {
  const participants = taskParticipants(task);
  const tags = taskCategories(task);
  const overdue = isOverdue(task);
  const due = dueLabel(task.due_at);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="btn text-start w-100 bg-white border rounded-4 p-3 mb-2 shadow-sm task-card"
    >
      <div className="d-flex align-items-start gap-2">
        <span
          className="rounded-circle flex-shrink-0"
          style={{ width: 10, height: 10, marginTop: 6, background: SEVERITY_COLORS[task.severity] ?? "#adb5bd" }}
          title={SEVERITY_LABELS[task.severity]}
        />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="fw-semibold text-dark" style={{ fontSize: 15 }}>
            {task.title}
          </div>

          <div className="d-flex align-items-center flex-wrap gap-2 mt-2">
            <span className="badge rounded-pill" style={{ background: STATUS_COLORS[task.status], fontSize: 11, fontWeight: 500 }}>
              {STATUS_LABELS[task.status]}
            </span>
            <TagChips tags={tags} />
            {showOrganization && (
              <span className="text-muted" style={{ fontSize: 12 }}>
                <i className="fa fa-school me-1" />
                {task.organization}
              </span>
            )}
            {task.building_name && (
              <span className="text-muted" style={{ fontSize: 12 }}>
                <i className="fa fa-building me-1" />
                {task.building_name}
              </span>
            )}
            {participants.length > 0 && (
              <span className="text-muted" style={{ fontSize: 12 }}>
                <i className="fa fa-user me-1" />
                {participants.length}
              </span>
            )}
          </div>
        </div>

        {due && (
          <div
            className="text-end flex-shrink-0"
            style={{ fontSize: 12, color: overdue ? "#dc3545" : "#6c757d", fontWeight: overdue ? 600 : 400 }}
          >
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.3 }}>дедлайн</div>
            {due}
          </div>
        )}
      </div>
    </button>
  );
}

export default function TasksPage() {
  const navigate = useNavigate();
  const ctx = useTaskContext();

  const [scope, setScope] = useState<Scope | null>(null);
  const [orgId, setOrgId] = useState<number | "">("");
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [orgTasks, setOrgTasks] = useState<Task[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  // для какой организации уже загружены «Задачи ОО» — по нему понимаем, идёт ли загрузка
  const [orgTasksFor, setOrgTasksFor] = useState<number | null>(null);
  const [error, setError] = useState("");

  const [showDone, setShowDone] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [severityFilter, setSeverityFilter] = useState<TaskSeverity | "">("");
  const [categoryFilter, setCategoryFilter] = useState<number | "">("");
  const [buildingFilter, setBuildingFilter] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const organizations = useMemo(() => ctx?.organizations ?? [], [ctx]);
  const supervised = useMemo(() => organizations.filter((o) => o.can_view_all), [organizations]);
  const writable = useMemo(() => organizations.filter((o) => o.can_write), [organizations]);
  const multiOrg = organizations.length > 1;

  // Вкладка по умолчанию, пока пользователь её не выбрал: у глобального администратора
  // и Минобра своих задач нет вовсе — им сразу показываем задачи организации
  const defaultScope: Scope | null = !ctx
    ? null
    : !ctx.organizations.some((o) => o.org_role_code) && supervised.length > 0
      ? "org"
      : "my";
  const activeScope = scope ?? defaultScope;

  useEffect(() => {
    Promise.all([fetchMyTasks(), fetchBuildings()])
      .then(([mine, blds]) => {
        setMyTasks(mine);
        setBuildings(blds);
      })
      .catch((e) => {
        if ((e as Error).message === "401") navigate("/");
        else setError("Не удалось загрузить задачи");
      })
      .finally(() => setLoading(false));
  }, [navigate]);

  // Задачи ОО всегда показываются по одной конкретной организации
  const orgScopeId = activeScope === "org" ? (orgId === "" ? supervised[0]?.id : orgId) : undefined;
  const orgLoading = orgScopeId !== undefined && orgTasksFor !== orgScopeId;
  useEffect(() => {
    if (orgScopeId === undefined) return;
    let alive = true;
    fetchOrgTasks(orgScopeId)
      .catch(() => [] as Task[])
      .then((list) => {
        if (!alive) return;
        setOrgTasks(list);
        setOrgTasksFor(orgScopeId);
      });
    return () => {
      alive = false;
    };
  }, [orgScopeId]);

  const switchScope = (next: Scope) => {
    setScope(next);
    setBuildingFilter("");
    setCategoryFilter("");
    // в «Задачах ОО» пункта «все организации» нет — подставляем доступную
    if (next === "org" && (orgId === "" || !supervised.some((o) => o.id === orgId))) {
      setOrgId(supervised[0]?.id ?? "");
    }
  };

  const tasks = activeScope === "org" ? orgTasks : myTasks;
  const selectedOrg = activeScope === "org" ? orgScopeId : orgId === "" ? undefined : orgId;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (selectedOrg !== undefined && t.organization_id !== selectedOrg) return false;
      if (!showDone && t.status === "DONE") return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (severityFilter && t.severity !== severityFilter) return false;
      if (categoryFilter && !taskCategories(t).some((c) => c.id === categoryFilter)) return false;
      if (buildingFilter && t.building_id !== buildingFilter) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tasks, selectedOrg, showDone, statusFilter, severityFilter, categoryFilter, buildingFilter, search]);

  // Категории для фильтра — те, что реально есть у задач в журнале: без пустых вариантов
  // и без отдельного запроса. Одинаковые названия из разных школ различаем по организации
  const categoryOptions = useMemo(() => {
    const byId = new Map<number, { id: number; name: string; org: string }>();
    for (const t of tasks) {
      if (selectedOrg !== undefined && t.organization_id !== selectedOrg) continue;
      for (const c of taskCategories(t)) byId.set(c.id, { id: c.id, name: c.name, org: t.organization });
    }
    const options = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
    const repeated = new Set(options.filter((o, i) => options.findIndex((x) => x.name === o.name) !== i).map((o) => o.name));
    return options.map((o) => ({ id: o.id, label: repeated.has(o.name) ? `${o.name} (${o.org})` : o.name }));
  }, [tasks, selectedOrg]);

  const orgBuildings = useMemo(
    () => (selectedOrg === undefined ? [] : buildings.filter((b) => b.organization_id === selectedOrg)),
    [buildings, selectedOrg],
  );

  const orgOptions: ContextOrganization[] = activeScope === "org" ? supervised : organizations;

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="mb-0 fw-semibold">Журнал задач</h5>
            <small className="text-muted">Задачи организации и ваши поручения</small>
          </div>
          <button
            className="btn btn-sm text-white border-0 px-3 py-2 rounded-pill shadow-sm text-nowrap flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #37474f, #546e7a)", fontWeight: 600 }}
            // Без организации, где можно работать, задачу создать негде — кнопка не должна молча ничего не делать
            disabled={!ctx || writable.length === 0}
            title={ctx && writable.length === 0 ? "Создавать задачи могут сотрудники организации" : undefined}
            onClick={() => setCreateOpen(true)}
          >
            <i className="fa fa-plus me-2" />
            Создать задачу
          </button>
        </div>

        {supervised.length > 0 && (
          <ul className="nav nav-pills gap-2 mb-3">
            {(["my", "org"] as Scope[]).map((s) => (
              <li className="nav-item" key={s}>
                <button
                  className={`nav-link px-3 py-1 ${activeScope === s ? "active" : "text-dark bg-light"}`}
                  style={activeScope === s ? { background: "#37474f" } : undefined}
                  onClick={() => switchScope(s)}
                >
                  {s === "my" ? "Мои задачи" : "Задачи ОО"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="card border-0 shadow-sm rounded-4 mb-3">
          <div className="card-body py-3">
            <input
              className="form-control form-control-sm mb-2"
              placeholder="Поиск по названию"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="d-flex flex-wrap gap-2">
              {(multiOrg || activeScope === "org") && orgOptions.length > 0 && (
                <select
                  className="form-select form-select-sm"
                  style={{ maxWidth: 220 }}
                  value={activeScope === "org" ? (orgScopeId ?? "") : orgId}
                  onChange={(e) => {
                    setOrgId(e.target.value ? Number(e.target.value) : "");
                    setBuildingFilter("");
                    setCategoryFilter("");
                  }}
                >
                  {activeScope !== "org" && <option value="">Все организации</option>}
                  {orgOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}

              <select
                className="form-select form-select-sm"
                style={{ maxWidth: 180 }}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as TaskStatus | "")}
              >
                <option value="">Все статусы</option>
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>

              <select
                className="form-select form-select-sm"
                style={{ maxWidth: 170 }}
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value as TaskSeverity | "")}
              >
                <option value="">Любая срочность</option>
                {TASK_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {SEVERITY_LABELS[s]}
                  </option>
                ))}
              </select>

              {categoryOptions.length > 0 && (
                <select
                  className="form-select form-select-sm"
                  style={{ maxWidth: 200 }}
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Все категории</option>
                  {categoryOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}

              {orgBuildings.length > 0 && (
                <select
                  className="form-select form-select-sm"
                  style={{ maxWidth: 200 }}
                  value={buildingFilter}
                  onChange={(e) => setBuildingFilter(e.target.value ? Number(e.target.value) : "")}
                >
                  <option value="">Все здания</option>
                  {orgBuildings.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name ?? `Здание №${b.id}`}
                    </option>
                  ))}
                </select>
              )}

              <div className="form-check d-flex align-items-center gap-1 ms-1">
                <input
                  className="form-check-input mt-0"
                  type="checkbox"
                  id="show-done"
                  checked={showDone}
                  onChange={(e) => setShowDone(e.target.checked)}
                />
                <label className="form-check-label text-muted" htmlFor="show-done" style={{ fontSize: 13 }}>
                  Показывать завершённые
                </label>
              </div>
            </div>
          </div>
        </div>

        {(loading || orgLoading || activeScope === null) && (
          <div className="text-center py-5">
            <div className="spinner-border text-secondary" />
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !orgLoading && activeScope !== null && !error && visible.length === 0 && (
          <div className="text-center text-muted py-5">
            <i className="fa fa-clipboard-check d-block mb-2" style={{ fontSize: 28, opacity: 0.4 }} />
            Задач нет
          </div>
        )}

        {!loading &&
          !orgLoading &&
          visible.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              showOrganization={multiOrg && selectedOrg === undefined}
              onOpen={() => navigate(`/tasks/${task.id}`)}
            />
          ))}
      </div>

      {createOpen && ctx && writable.length > 0 && (
        <CreateTaskModal
          organizations={writable}
          defaultOrganizationId={typeof selectedOrg === "number" && writable.some((o) => o.id === selectedOrg) ? selectedOrg : writable[0].id}
          currentUserId={ctx.user_id}
          buildings={buildings}
          onClose={() => setCreateOpen(false)}
          onCreated={(task) => {
            setMyTasks((prev) => [task, ...prev]);
            setCreateOpen(false);
            navigate(`/tasks/${task.id}`);
          }}
        />
      )}

      <style>{`
        .task-card:hover { background: #f8f9fa !important; }
      `}</style>
    </Layout>
  );
}

function CreateTaskModal({
  organizations,
  defaultOrganizationId,
  currentUserId,
  buildings,
  onClose,
  onCreated,
}: {
  organizations: ContextOrganization[];
  defaultOrganizationId: number;
  currentUserId: number;
  buildings: Building[];
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [organizationId, setOrganizationId] = useState<number>(defaultOrganizationId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<TaskSeverity>("MEDIUM");
  const [buildingId, setBuildingId] = useState<number | "">("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [participantIds, setParticipantIds] = useState<number[]>([]);
  const [participantNames, setParticipantNames] = useState<Record<number, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const orgBuildings = buildings.filter((b) => b.organization_id === organizationId);

  // Имена для чипов выбранных участников — берём из того же списка, что и выбор
  useEffect(() => {
    let alive = true;
    fetchTaskOrgUsers(organizationId)
      .then((groups) => {
        if (!alive) return;
        const names: Record<number, string> = {};
        for (const g of groups) {
          for (const u of g.users) names[u.id] = [u.last_name, u.first_name].filter(Boolean).join(" ") || u.email;
        }
        setParticipantNames(names);
      })
      .catch(() => null);
    return () => {
      alive = false;
    };
  }, [organizationId]);

  const changeOrganization = (id: number) => {
    // здания, категории и люди у каждой организации свои
    setOrganizationId(id);
    setBuildingId("");
    setCategoryIds([]);
    setParticipantIds([]);
  };

  const save = async () => {
    if (!title.trim()) {
      setError("Укажите название задачи");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const task = await createTask({
        organization_id: organizationId,
        title: title.trim(),
        description: description.trim() || undefined,
        severity,
        building_id: buildingId === "" ? null : buildingId,
        due_at: dueDate ? `${dueDate}T${dueTime || "18:00"}:00` : null,
        participant_user_ids: participantIds,
        category_ids: categoryIds,
      });
      onCreated(task);
    } catch (e) {
      setError(errorText(e, "Не удалось создать задачу"));
    } finally {
      setSaving(false);
    }
  };

  // Окно выбора участников — соседом, а не внутри подложки: иначе клик по его
  // подложке всплыл бы до подложки формы и закрыл её вместе с введёнными данными
  return (
    <>
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div
        className="modal-dialog modal-dialog-centered modal-dialog-scrollable"
        // стандартные 500px тесны для формы; на телефоне окно и так во всю ширину
        style={{ maxWidth: 680 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content rounded-4 border-0">
          <div className="modal-header" style={{ background: "#37474f", color: "white" }}>
            <h6 className="modal-title mb-0 fw-semibold">
              <i className="fa fa-clipboard-list me-2" />
              Создание задачи
            </h6>
            <button type="button" className="btn-close btn-close-white" onClick={onClose} />
          </div>

          <div className="modal-body">
            {error && <div className="alert alert-danger py-2">{error}</div>}

            <label className="form-label small fw-semibold">Название задачи</label>
            <input className="form-control mb-3" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} />

            {organizations.length > 1 && (
              <>
                <label className="form-label small fw-semibold">Организация</label>
                <select
                  className="form-select mb-3"
                  value={organizationId}
                  onChange={(e) => changeOrganization(Number(e.target.value))}
                >
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* На широком экране здание и дедлайн — в одну строку, на телефоне друг под другом */}
            <div className="row g-3 mb-3">
              {orgBuildings.length > 0 && (
                <div className="col-12 col-md-6">
                  <label className="form-label small fw-semibold">Здание</label>
                  <select
                    className="form-select"
                    value={buildingId}
                    onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : "")}
                  >
                    <option value="">Не указано</option>
                    {orgBuildings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name ?? `Здание №${b.id}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={orgBuildings.length > 0 ? "col-12 col-md-6" : "col-12"}>
                <label className="form-label small fw-semibold">Дедлайн</label>
                <div className="row g-2">
                  <div className="col-7">
                    <DateField value={dueDate} onChange={setDueDate} />
                  </div>
                  <div className="col-5">
                    <input type="time" className="form-control" value={dueTime} onChange={(e) => setDueTime(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            <label className="form-label small fw-semibold">Срочность</label>
            <div className="d-flex gap-2 mb-3">
              {TASK_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn btn-sm rounded-pill flex-grow-1 ${severity === s ? "text-white" : "btn-outline-secondary"}`}
                  style={severity === s ? { background: SEVERITY_COLORS[s], border: "none" } : undefined}
                  onClick={() => setSeverity(s)}
                >
                  {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>

            <label className="form-label small fw-semibold">Категории</label>
            <div className="mb-3">
              <TagPicker key={organizationId} organizationId={organizationId} selected={categoryIds} onChange={setCategoryIds} />
            </div>

            <div className="mb-3">
              <div className={`d-flex justify-content-between align-items-center ${participantIds.length > 0 ? "mb-2" : ""}`}>
                <label className="form-label small fw-semibold mb-0">Участники</label>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setPickerOpen(true)}>
                  <i className="fa fa-user-plus me-1" />
                  Добавить участника
                </button>
              </div>
              {participantIds.length > 0 && (
                <div className="d-flex flex-wrap gap-2">
                  {participantIds.map((id) => (
                    <span key={id} className="badge rounded-pill text-dark border d-inline-flex align-items-center gap-1" style={{ background: "#eceff1", fontWeight: 500 }}>
                      {participantNames[id] ?? `#${id}`}
                      <button
                        type="button"
                        className="btn btn-link p-0 text-muted"
                        style={{ fontSize: 11, lineHeight: 1 }}
                        title="Убрать"
                        onClick={() => setParticipantIds((prev) => prev.filter((x) => x !== id))}
                      >
                        <i className="fa fa-xmark" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <label className="form-label small fw-semibold">Описание задачи</label>
            <textarea className="form-control" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="modal-footer">
            <button className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button className="btn btn-sm text-white" style={{ background: "#37474f" }} disabled={saving} onClick={() => void save()}>
              {saving && <span className="spinner-border spinner-border-sm me-1" />}
              Создать
            </button>
          </div>
        </div>
      </div>
    </div>

    {pickerOpen && (
      <ParticipantPicker
        organizationId={organizationId}
        selected={participantIds}
        // автор — это вы: себя в участники не добавляют
        hiddenIds={[currentUserId]}
        onClose={() => setPickerOpen(false)}
        onSave={(ids) => setParticipantIds(ids.filter((id) => id !== currentUserId))}
      />
    )}
    </>
  );
}
