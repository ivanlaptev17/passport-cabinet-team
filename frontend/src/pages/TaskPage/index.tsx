import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout";
import ConfirmModal from "../../components/ConfirmModal";
import ParticipantPicker from "../../components/ParticipantPicker";
import ProfileCard from "../../components/ProfileCard";
import TagPicker, { TagChips } from "../../components/TagPicker";
import TaskChat, { ImageViewer } from "./TaskChat";
import { useAuth } from "../../contexts/AuthContext";
import {
  deleteTask,
  errorText,
  fetchTask,
  fetchTaskFiles,
  messageFileUrl,
  messagePreviewUrl,
  personName,
  setTaskCategories,
  setTaskParticipants,
  setTaskStatus,
  taskCategories,
  taskParticipants,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
  TASK_STATUSES,
  type Task,
  type TaskFile,
  type TaskStatus,
} from "../../api/tasks";

type Tab = "task" | "chat";

function formatDue(due: string | null) {
  if (!due) return "не указан";
  const d = new Date(due);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function TaskPage() {
  const { taskId } = useParams();
  const id = Number(taskId);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [task, setTask] = useState<Task | null>(null);
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [tab, setTab] = useState<Tab>("task");
  const [loadError, setLoadError] = useState<{ id: number; text: string } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [viewer, setViewer] = useState<TaskFile | null>(null);

  // /tasks/abc: Number даёт NaN, а NaN !== NaN всегда — без этой проверки
  // страница крутила бы спиннер вечно вместо «не найдена»
  const validId = Number.isInteger(id) && id > 0;

  // Переход из уведомления с одной задачи на другую не пересоздаёт страницу —
  // поэтому «грузится» считаем по тому, какая задача сейчас на руках
  const loading = validId && loadError?.id !== id && task?.id !== id;

  useEffect(() => {
    if (!validId) return;
    let alive = true;
    fetchTask(id)
      .then((t) => alive && setTask(t))
      .catch((e) => {
        if (!alive) return;
        const status = (e as Error).message;
        if (status === "401") navigate("/");
        else
          setLoadError({
            id,
            text: status === "404" ? "Задача не найдена или у вас нет к ней доступа" : "Не удалось загрузить задачу",
          });
      });
    return () => {
      alive = false;
    };
  }, [id, validId, navigate]);

  // Файлы из чата — перечитываем при возврате на вкладку «Задача»: в чате могли прислать новые
  useEffect(() => {
    if (!task || tab !== "task") return;
    let alive = true;
    fetchTaskFiles(task.id)
      .then((list) => alive && setFiles(list))
      .catch(() => alive && setFiles([]));
    return () => {
      alive = false;
    };
  }, [task?.id, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Выполнить изменение задачи. true — получилось; при ошибке показывает причину. */
  const run = async (action: () => Promise<Task>, fallback: string): Promise<boolean> => {
    setBusy(true);
    setError("");
    try {
      setTask(await action());
      return true;
    } catch (e) {
      setError(errorText(e, fallback));
      return false;
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

  if (!task || task.id !== id) {
    return (
      <Layout>
        <div className="mx-auto text-center py-5" style={{ maxWidth: 760 }}>
          <div className="alert alert-warning">{loadError?.text ?? "Задача не найдена"}</div>
          <button className="btn btn-outline-secondary btn-sm" onClick={() => navigate("/tasks")}>
            <i className="fa fa-arrow-left me-1" />
            К списку задач
          </button>
        </div>
      </Layout>
    );
  }

  const perms = task.permissions;
  const participants = taskParticipants(task);
  const tags = taskCategories(task);
  const me = user?.id ?? null;
  const isAuthor = me !== null && task.created_by_user_id === me;
  const isParticipant = participants.some((p) => p.id === me);
  const isReadonly = user?.role_code === "MINOBR";
  // Правила те же, что на бэкенде: работать с задачей могут участник, автор и проверяющие
  const canWork = !isReadonly && (isAuthor || isParticipant || !!perms?.can_complete);
  const canComplete = !!perms?.can_complete;
  const canDelete = isAuthor || !!perms?.can_delete_any;
  const lockedByDone = task.status === "DONE" && !canComplete;

  const images = files.filter((f) => f.has_preview);
  const documents = files.filter((f) => !f.has_preview);

  return (
    <Layout>
      <div className="mx-auto" style={{ maxWidth: 760 }}>
        <div className="d-flex align-items-center gap-2 mb-3">
          <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/tasks")}>
            <i className="fa fa-arrow-left" />
          </button>

          <ul className="nav nav-pills gap-2 mb-0 ms-auto">
            {(["task", "chat"] as Tab[]).map((t) => (
              <li className="nav-item" key={t}>
                <button
                  className={`nav-link px-3 py-1 ${tab === t ? "active" : "text-dark bg-light"}`}
                  style={tab === t ? { background: "#37474f" } : undefined}
                  onClick={() => setTab(t)}
                >
                  {t === "chat" && <i className="fa fa-comments me-1" />}
                  {t === "task" ? "Задача" : "Чат"}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {error && <div className="alert alert-danger py-2">{error}</div>}

        {tab === "chat" ? (
          <TaskChat taskId={task.id} currentUserId={me} canWrite={canWork} />
        ) : (
          <>
            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="d-flex align-items-start gap-2 mb-3">
                  <span
                    className="rounded-circle flex-shrink-0"
                    style={{ width: 12, height: 12, marginTop: 7, background: SEVERITY_COLORS[task.severity] }}
                    title={SEVERITY_LABELS[task.severity]}
                  />
                  <h5 className="fw-semibold mb-0 flex-grow-1">{task.title}</h5>
                </div>

                <dl className="row mb-0" style={{ fontSize: 14 }}>
                  <dt className="col-4 col-sm-3 text-muted fw-normal">Автор</dt>
                  <dd className="col-8 col-sm-9">
                    {task.created_by_user_id ? (
                      <button className="btn btn-link p-0 text-dark text-decoration-none" style={{ fontSize: 14 }} onClick={() => setProfileUserId(task.created_by_user_id)}>
                        {[task.creator_last_name, task.creator_first_name].filter(Boolean).join(" ") || "—"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </dd>

                  <dt className="col-4 col-sm-3 text-muted fw-normal">Организация</dt>
                  <dd className="col-8 col-sm-9">{task.organization}</dd>

                  <dt className="col-4 col-sm-3 text-muted fw-normal">Здание</dt>
                  <dd className="col-8 col-sm-9">{task.building_name ?? "не указано"}</dd>

                  <dt className="col-4 col-sm-3 text-muted fw-normal">Дедлайн</dt>
                  <dd className="col-8 col-sm-9">{formatDue(task.due_at)}</dd>

                  <dt className="col-4 col-sm-3 text-muted fw-normal">Срочность</dt>
                  <dd className="col-8 col-sm-9">{SEVERITY_LABELS[task.severity]}</dd>

                  {task.description && (
                    <>
                      <dt className="col-4 col-sm-3 text-muted fw-normal">Описание</dt>
                      <dd className="col-8 col-sm-9" style={{ whiteSpace: "pre-wrap" }}>{task.description}</dd>
                    </>
                  )}
                </dl>
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Теги</span>
                  {canWork && !editingTags && (
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => {
                        setDraftTags(tags.map((t) => t.id));
                        setEditingTags(true);
                      }}
                    >
                      <i className="fa fa-pen me-1" />
                      Изменить
                    </button>
                  )}
                </div>

                {editingTags ? (
                  <>
                    <TagPicker organizationId={task.organization_id} selected={draftTags} onChange={setDraftTags} />
                    <div className="d-flex gap-2 mt-3">
                      <button className="btn btn-sm btn-secondary" disabled={busy} onClick={() => setEditingTags(false)}>
                        Отмена
                      </button>
                      <button
                        className="btn btn-sm text-white"
                        style={{ background: "#37474f" }}
                        disabled={busy}
                        onClick={() =>
                          // при ошибке остаёмся в редактировании, чтобы выбор не пропал
                          void run(() => setTaskCategories(task.id, draftTags), "Не удалось сохранить теги").then(
                            (ok) => ok && setEditingTags(false),
                          )
                        }
                      >
                        Сохранить
                      </button>
                    </div>
                  </>
                ) : tags.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 14 }}>Тегов нет</div>
                ) : (
                  <div className="d-flex flex-wrap gap-2">
                    <TagChips tags={tags} />
                  </div>
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="text-muted mb-2" style={{ fontSize: 13 }}>Статус</div>
                <div className="d-flex flex-wrap gap-2">
                  {TASK_STATUSES.map((s) => {
                    // «Завершена» ставит и снимает только проверяющий
                    const forbidden = !canWork || lockedByDone || (s === "DONE" && !canComplete);
                    return (
                      <button
                        key={s}
                        className={`btn btn-sm rounded-pill ${s === task.status ? "text-white" : "btn-outline-secondary"}`}
                        style={s === task.status ? { background: STATUS_COLORS[s], border: "none", opacity: 1 } : undefined}
                        disabled={busy || forbidden || s === task.status}
                        title={s === "DONE" && !canComplete ? "Завершает задачу Ответственный или Администратор ОО" : undefined}
                        onClick={() => void run(() => setTaskStatus(task.id, s as TaskStatus), "Не удалось изменить статус")}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
                {task.status === "PENDING_REVIEW" && (
                  <div className="text-muted mt-2" style={{ fontSize: 12 }}>
                    <i className="fa fa-circle-info me-1" />
                    {canComplete ? "Задача ждёт вашей проверки — закройте её, когда всё в порядке" : "Ответственный ОО получил уведомление о проверке"}
                  </div>
                )}
                {lockedByDone && (
                  <div className="text-muted mt-2" style={{ fontSize: 12 }}>
                    <i className="fa fa-lock me-1" />
                    Задача завершена. Вернуть её в работу может Ответственный или Администратор ОО
                  </div>
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Участники</span>
                  {canWork && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => setPickerOpen(true)}>
                      <i className="fa fa-user-plus me-1" />
                      Добавить
                    </button>
                  )}
                </div>

                {participants.length === 0 ? (
                  <div className="text-muted" style={{ fontSize: 14 }}>Участников пока нет</div>
                ) : (
                  participants.map((p) => {
                    // автор не убирает сам себя
                    const canRemove = canWork && !(isAuthor && p.id === me);
                    return (
                      <div key={p.id} className="d-flex align-items-center gap-2 border rounded-3 px-3 py-2 mb-2">
                        <button
                          className="btn btn-link p-0 d-flex align-items-center gap-2 flex-grow-1 text-start text-dark text-decoration-none"
                          title="Открыть профиль"
                          onClick={() => setProfileUserId(p.id)}
                        >
                          <span
                            className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 text-white"
                            style={{ width: 32, height: 32, background: "#90a4ae", fontSize: 12 }}
                          >
                            {(p.last_name?.[0] ?? "") + (p.first_name?.[0] ?? "")}
                          </span>
                          <span style={{ fontSize: 14 }}>{personName(p)}</span>
                        </button>
                        {canRemove && (
                          <button
                            className="btn btn-sm btn-link text-danger p-0"
                            title="Убрать из задачи"
                            disabled={busy}
                            onClick={() =>
                              void run(
                                () => setTaskParticipants(task.id, participants.map((x) => x.id).filter((x) => x !== p.id)),
                                "Не удалось убрать участника",
                              )
                            }
                          >
                            <i className="fa fa-xmark" />
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="card border-0 shadow-sm rounded-4 mb-3">
              <div className="card-body">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="text-muted" style={{ fontSize: 13 }}>Файлы из чата</span>
                  {files.length > 0 && <span className="text-muted" style={{ fontSize: 12 }}>{files.length}</span>}
                </div>

                {files.length === 0 && (
                  <div className="text-muted" style={{ fontSize: 14 }}>
                    Файлов нет — их можно прислать в чат задачи
                  </div>
                )}

                {images.length > 0 && (
                  <div className="d-flex flex-wrap gap-2 mb-2">
                    {images.map((f) => (
                      <button
                        key={f.message_id}
                        className="btn p-0 border rounded-3 overflow-hidden"
                        style={{ width: 88, height: 88 }}
                        title={f.file_name ?? ""}
                        onClick={() => setViewer(f)}
                      >
                        <img
                          src={messagePreviewUrl(task.id, f.message_id)}
                          alt={f.file_name ?? ""}
                          loading="lazy"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      </button>
                    ))}
                  </div>
                )}

                {documents.map((f) => (
                  <a
                    key={f.message_id}
                    href={messageFileUrl(task.id, f.message_id)}
                    className="d-flex align-items-center gap-2 border rounded-3 px-3 py-2 mb-2 text-decoration-none text-dark"
                  >
                    <i className="fa fa-file-lines text-muted" />
                    <span className="flex-grow-1 text-truncate" style={{ fontSize: 14 }}>{f.file_name}</span>
                    <span className="text-muted flex-shrink-0" style={{ fontSize: 12 }}>{formatSize(f.file_size)}</span>
                  </a>
                ))}
              </div>
            </div>

            {canDelete && (
              <button className="btn btn-outline-danger btn-sm w-100 mb-4" onClick={() => setConfirmDelete(true)}>
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
          // автор, редактируя свою задачу, не добавляет и не убирает сам себя
          hiddenIds={isAuthor && me !== null ? [me] : []}
          onClose={() => setPickerOpen(false)}
          onSave={async (ids) => setTask(await setTaskParticipants(task.id, ids))}
        />
      )}

      {profileUserId !== null && (
        <ProfileCard userId={profileUserId} organizationId={task.organization_id} onClose={() => setProfileUserId(null)} />
      )}

      {viewer && (
        <ImageViewer taskId={task.id} messageId={viewer.message_id} fileName={viewer.file_name} onClose={() => setViewer(null)} />
      )}

      {confirmDelete && (
        <ConfirmModal
          text={`Задача «${task.title}» будет удалена вместе с чатом и файлами.`}
          confirmLabel="Удалить"
          busy={busy}
          onConfirm={async () => {
            setBusy(true);
            try {
              await deleteTask(task.id);
              navigate("/tasks");
            } catch (e) {
              setError(errorText(e, "Не удалось удалить задачу"));
              setConfirmDelete(false);
            } finally {
              setBusy(false);
            }
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Layout>
  );
}
