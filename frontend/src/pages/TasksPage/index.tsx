import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "../../components/Layout";
import DateField from "../../components/DateField";
import {
  createTask,
  fetchMyTasks,
  fetchOrgTasks,
  taskParticipants,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_SEVERITIES,
  TASK_STATUSES,
  type Task,
  type TaskSeverity,
  type TaskStatus,
} from "../../api/tasks";
import {
  fetchBuildings,
  fetchOrganizations,
  type Building,
  type Organization,
} from "../../api/data";

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

export function TaskCard({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const participants = taskParticipants(task);
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
          style={{
            width: 10,
            height: 10,
            marginTop: 6,
            background: SEVERITY_COLORS[task.severity] ?? "#adb5bd",
          }}
          title={SEVERITY_LABELS[task.severity]}
        />
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div className="fw-semibold text-dark" style={{ fontSize: 15 }}>
            {task.title}
          </div>

          <div className="d-flex align-items-center flex-wrap gap-2 mt-2">
            <span
              className="badge rounded-pill"
              style={{ background: STATUS_COLORS[task.status], fontSize: 11, fontWeight: 500 }}
            >
              {STATUS_LABELS[task.status]}
            </span>

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

  const [scope, setScope] = useState<Scope>("my");
  const [myTasks, setMyTasks] = useState<Task[]>([]);
  const [orgTasks, setOrgTasks] = useState<Task[]>([]);
  const [canSeeOrg, setCanSeeOrg] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showDone, setShowDone] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [severityFilter, setSeverityFilter] = useState<TaskSeverity | "">("");
  const [buildingFilter, setBuildingFilter] = useState<number | "">("");
  const [search, setSearch] = useState("");

  const [createOpen, setCreateOpen] = useState(false);

  const primaryOrg = organizations[0];

  const load = async () => {
    setLoading(true);
    try {
      const [mine, orgs, blds] = await Promise.all([
        fetchMyTasks(),
        fetchOrganizations(),
        fetchBuildings(),
      ]);
      setMyTasks(mine);
      setOrganizations(orgs);
      setBuildings(blds);

      // Вкладка «Задачи ОО» есть только у Ответственного и Администратора ОО.
      // Роль внутри организации фронту не видна, поэтому просто пробуем ручку
      if (orgs[0]) {
        try {
          setOrgTasks(await fetchOrgTasks(orgs[0].id));
          setCanSeeOrg(true);
        } catch {
          setCanSeeOrg(false);
        }
      }
    } catch (e) {
      if ((e as Error).message === "401") navigate("/");
      else setError("Не удалось загрузить задачи");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tasks = scope === "my" ? myTasks : orgTasks;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (!showDone && t.status === "DONE") return false;
      if (statusFilter && t.status !== statusFilter) return false;
      if (severityFilter && t.severity !== severityFilter) return false;
      if (buildingFilter && t.building_id !== buildingFilter) return false;
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [tasks, showDone, statusFilter, severityFilter, buildingFilter, search]);

  const orgBuildings = useMemo(
    () => buildings.filter((b) => !primaryOrg || b.organization_id === primaryOrg.id),
    [buildings, primaryOrg],
  );

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 className="mb-0 fw-semibold">Журнал задач</h5>
            <small className="text-muted">Задачи организации и ваши поручения</small>
          </div>
          <button
            className="btn btn-sm text-white border-0 px-3 py-2 rounded-pill shadow-sm"
            style={{ background: "linear-gradient(135deg, #37474f, #546e7a)", fontWeight: 600 }}
            // Без организации задачу создать не в чем — кнопка не должна молча ничего не делать
            disabled={loading || !primaryOrg}
            title={!loading && !primaryOrg ? "Вы не привязаны ни к одной организации" : undefined}
            onClick={() => setCreateOpen(true)}
          >
            <i className="fa fa-plus me-2" />
            Создать задачу
          </button>
        </div>

        {canSeeOrg && (
          <ul className="nav nav-pills gap-2 mb-3">
            {(["my", "org"] as Scope[]).map((s) => (
              <li className="nav-item" key={s}>
                <button
                  className={`nav-link px-3 py-1 ${scope === s ? "active" : "text-dark bg-light"}`}
                  style={scope === s ? { background: "#37474f" } : undefined}
                  onClick={() => setScope(s)}
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

        {loading && (
          <div className="text-center py-5">
            <div className="spinner-border text-secondary" />
          </div>
        )}

        {error && <div className="alert alert-danger">{error}</div>}

        {!loading && !error && visible.length === 0 && (
          <div className="text-center text-muted py-5">
            <i className="fa fa-clipboard-check d-block mb-2" style={{ fontSize: 28, opacity: 0.4 }} />
            Задач нет
          </div>
        )}

        {!loading &&
          visible.map((task) => (
            <TaskCard key={task.id} task={task} onOpen={() => navigate(`/tasks/${task.id}`)} />
          ))}
      </div>

      {createOpen && primaryOrg && (
        <CreateTaskModal
          organizations={organizations}
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
  buildings,
  onClose,
  onCreated,
}: {
  organizations: Organization[];
  buildings: Building[];
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const [organizationId, setOrganizationId] = useState<number>(organizations[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<TaskSeverity>("MEDIUM");
  const [buildingId, setBuildingId] = useState<number | "">("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const orgBuildings = buildings.filter((b) => b.organization_id === organizationId);

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
      });
      onCreated(task);
    } catch {
      setError("Не удалось создать задачу");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal show d-block" style={{ background: "rgba(0,0,0,0.45)" }} onClick={onClose}>
      <div className="modal-dialog modal-dialog-centered" onClick={(e) => e.stopPropagation()}>
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
            <input
              className="form-control mb-3"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
            />

            {organizations.length > 1 && (
              <>
                <label className="form-label small fw-semibold">Организация</label>
                <select
                  className="form-select mb-3"
                  value={organizationId}
                  onChange={(e) => {
                    setOrganizationId(Number(e.target.value));
                    setBuildingId("");
                  }}
                >
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </>
            )}

            {orgBuildings.length > 0 && (
              <>
                <label className="form-label small fw-semibold">Здание</label>
                <select
                  className="form-select mb-3"
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
              </>
            )}

            <label className="form-label small fw-semibold">Дедлайн</label>
            <div className="row g-2 mb-3">
              <div className="col-7">
                <DateField value={dueDate} onChange={setDueDate} />
              </div>
              <div className="col-5">
                <input
                  type="time"
                  className="form-control"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </div>
            </div>

            <label className="form-label small fw-semibold">Срочность</label>
            <div className="d-flex gap-2 mb-3">
              {TASK_SEVERITIES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`btn btn-sm rounded-pill flex-grow-1 ${
                    severity === s ? "text-white" : "btn-outline-secondary"
                  }`}
                  style={severity === s ? { background: SEVERITY_COLORS[s], border: "none" } : undefined}
                  onClick={() => setSeverity(s)}
                >
                  {SEVERITY_LABELS[s]}
                </button>
              ))}
            </div>

            <label className="form-label small fw-semibold">Описание задачи</label>
            <textarea
              className="form-control"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="modal-footer">
            <button className="btn btn-sm btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button
              className="btn btn-sm text-white"
              style={{ background: "#37474f" }}
              disabled={saving}
              onClick={() => void save()}
            >
              {saving && <span className="spinner-border spinner-border-sm me-1" />}
              Создать
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
