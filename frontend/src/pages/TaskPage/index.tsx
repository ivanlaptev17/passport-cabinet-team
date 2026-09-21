import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import ConfirmModal from "../../components/ConfirmModal";
import ParticipantPicker from "../../components/ParticipantPicker";
import TaskChat from "./TaskChat";
import { useAuth } from "../../contexts/AuthContext";
import {
  deleteTask,
  fetchMyTasks,
  fetchOrgTasks,
  personName,
  setTaskParticipants,
  setTaskStatus,
  taskParticipants,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskStatus,
} from "../../api/tasks";
import { fetchOrganizations } from "../../api/data";

type Tab = "task" | "chat";

function formatDue(due: string | null) {
  if (!due) return "не указан";
  const d = new Date(due);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export default function TaskPage() {
  const { taskId } = useParams();
  const id = Number(taskId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [task, setTask] = useState<Task | null>(null);
  const [tab, setTab] = useState<Tab>("task");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [canManageOrg, setCanManageOrg] = useState(false);

  // Отдельной ручки «одна задача» на бэке нет — берём из своих задач,
  // а если задачи там нет (например, у Ответственного ОО), из списка организации
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const mine = await fetchMyTasks();
      let found = mine.find((t) => t.id === id) ?? null;
      let orgAccess = false;

      if (!found) {
        const orgs = await fetchOrganizations();
        for (const org of orgs) {
          try {
            const orgTasks = await fetchOrgTasks(org.id);
            orgAccess = true;
            found = orgTasks.find((t) => t.id === id) ?? null;
            if (found) break;
          } catch {
            // нет доступа к задачам этой организации — идём дальше
          }
        }
      } else {
        // Задача своя, но права на уровне организации всё равно нужно знать:
        // от них зависит, показывать ли удаление
        try {
          await fetchOrgTasks(found.organization_id);
          orgAccess = true;
        } catch {
          orgAccess = false;
        }
      }

      setCanManageOrg(orgAccess);
      if (!found) setError("Задача не найдена или недоступна");
      setTask(found);
    } catch (e) {
      if ((e as Error).message === "401") navigate("/");
      else setError("Не удалось загрузить задачу");
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (status: TaskStatus) => {
    if (!task) return;
    setBusy(true);
    try {
      setTask(await setTaskStatus(task.id, status));
    } catch {
      setError("Не удалось изменить статус");
    } finally {
      setBusy(false);
    }
  };

  const saveParticipants = async (userIds: number[]) => {
    if (!task) return;
    setTask(await setTaskParticipants(task.id, userIds));
  };

  const removeParticipant = async (userId: number) => {
    if (!task) return;
    const rest = taskParticipants(task)
      .map((p) => p.id)
      .filter((pid) => pid !== userId);
    setBusy(true);
    try {
      setTask(await setTaskParticipants(task.id, rest));
    } catch {
      setError("Не удалось удалить участника");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await deleteTask(task.id);
      navigate("/tasks");
    } catch {
      setError("Удалить задачу может только её автор или Ответственный ОО");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-5">
          <div className="spinner-border text-secondary" />
        </div>
      </Layout>
    );
  }

  if (!task) {
    return (
      <Layout>
        <div className="mx-auto text-center py-5" style={{ maxWidth: 760 }}>
          <div className="alert alert-warning">{error || "Задача не найдена"}</div>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/tasks")}>
            <i className="fa fa-arrow-left me-1" />
            К списку задач
          </button>
        </div>
      </Layout>
    );
  }

  const participants = taskParticipants(task);
  const isAuthor = task.created_by_user_id === user?.id;
  // Бэкенд разрешает удаление автору и Ответственному ОО. Точную роль внутри
  // организации фронт не знает, поэтому показываем кнопку и тем, у кого есть
  // доступ к задачам ОО — Администратору ОО бэкенд ответит отказом, и мы его покажем
  const canDelete = isAuthor || canManageOrg;

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="d-flex align-items-center gap-2 mb-3">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/tasks")}>
            <i className="fa fa-arrow-left" />
          </button>

          <ul className="nav nav-pills gap-2 mb-0 ms-auto">
            <li className="nav-item">
              <button
                className={`nav-link px-3 py-1 ${tab === "task" ? "active" : "text-dark bg-light"}`}
                style={tab === "task" ? { background: "#37474f" } : undefined}
                onClick={() => setTab("task")}
              >
                Задача
              </button>
            </li>
            <li className="nav-item">
              <button
                className={`nav-link px-3 py-1 ${tab === "chat" ? "active" : "text-dark bg-light"}`}
                style={tab === "chat" ? { background: "#37474f" } : undefined}
                onClick={() => setTab("chat")}
              >
                <i className="fa fa-comments me-1" />
                Чат
              </button>
            </li>
          </ul>
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}

        {tab === "chat" ? (
          <TaskChat taskId={task.id} currentUserId={user?.id ?? null} />
        ) : (
          <>
            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="d-flex align-items-start gap-2 mb-3">
                  <span
                    className="rounded-circle flex-shrink-0"
                    style={{
                      width: 12,
                      height: 12,
                      marginTop: 7,
                      background: SEVERITY_COLORS[task.severity],
                    }}
                    title={SEVERITY_LABELS[task.severity]}
                  />
                  <h5 className="fw-semibold mb-0 flex-grow-1">{task.title}</h5>
                </div>

                <dl className="row mb-0" style={{ fontSize: 14 }}>
                  <dt className="col-4 col-sm-3 text-muted fw-normal">Автор</dt>
                  <dd className="col-8 col-sm-9">
                    {[task.creator_last_name, task.creator_first_name].filter(Boolean).join(" ") || "—"}
                  </dd>

                  <dt className="col-4 col-sm-3 text-muted fw-normal">Здание</dt>
                  <dd className="col-8 col-sm-9">{task.building_name ?? "не указано"}</dd>

                  <dt className="col-4 col-sm-3 text-muted fw-normal">Дедлайн</dt>
                  <dd className="col-8 col-sm-9">{formatDue(task.due_at)}</dd>

                  <dt className="col-4 col-sm-3 text-muted fw-normal">Срочность</dt>
                  <dd className="col-8 col-sm-9">{SEVERITY_LABELS[task.severity]}</dd>

                  {task.description && (
                    <>
                      <dt className="col-4 col-sm-3 text-muted fw-normal">Описание</dt>
                      <dd className="col-8 col-sm-9" style={{ whiteSpace: "pre-wrap" }}>
                        {task.description}
                      </dd>
                    </>
                  )}
                </dl>
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="text-muted mb-2" style={{ fontSize: 13 }}>
                  Статус
                </div>
                <div className="d-flex flex-wrap gap-2">
                  {TASK_STATUSES.map((s) => (
                    <button
                      key={s}
                      className={`btn btn-sm rounded-pill ${s === task.status ? "text-white" : "btn-outline-secondary"}`}
                      style={s === task.status ? { background: STATUS_COLORS[s], border: "none" } : undefined}
                      disabled={busy}
                      onClick={() => void changeStatus(s)}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                {task.status === "PENDING_REVIEW" && (
                  <div className="text-muted mt-2" style={{ fontSize: 12 }}>
                    <i className="fa fa-circle-info me-1" />
                    Ответственный ОО получил уведомление о проверке
                  </div>
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>
                    Участники
                  </span>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setPickerOpen(true)}>
                    <i className="fa fa-user-plus me-1" />
                    Добавить
                  </button>
                </div>

                {participants.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 14 }}>
                    Участников пока нет
                  </div>
                ) : (
                  participants.map((p) => (
                    <div
                      key={p.id}
                      className="d-flex align-items-center gap-2 border rounded-3 px-3 py-2 mb-2"
                    >
                      <div
                        className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 text-white"
                        style={{ width: 32, height: 32, background: "#90a4ae", fontSize: 12 }}
                      >
                        {(p.last_name?.[0] ?? "") + (p.first_name?.[0] ?? "")}
                      </div>
                      <span className="flex-grow-1" style={{ fontSize: 14 }}>
                        {personName(p)}
                      </span>
                      <button
                        className="btn btn-sm btn-link text-danger p-0"
                        title="Убрать из задачи"
                        disabled={busy}
                        onClick={() => void removeParticipant(p.id)}
                      >
                        <i className="fa fa-xmark" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {canDelete && (
              <button
                className="btn btn-outline-danger btn-sm w-100 mb-4"
                onClick={() => setConfirmDelete(true)}
              >
                <i className="fa fa-trash me-1" />
                Удалить задачу
              </button>
            )}
          </>
        )}
      </div>

      {pickerOpen && (
        <ParticipantPicker
          organizationId={task.organization_id}
          selected={participants.map((p) => p.id)}
          onClose={() => setPickerOpen(false)}
          onSave={saveParticipants}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          text={`Задача «${task.title}» будет удалена вместе с чатом и файлами.`}
          confirmLabel="Удалить"
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Layout>
  );
}
