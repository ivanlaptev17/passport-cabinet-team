import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { disablePush, enablePush, getPushState, syncPushSubscription, type PushState } from "../utils/push";
import { useEventSource } from "../hooks/useEventSource";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notifications,
} from "../api/data";
import {
  fetchTaskNotifications,
  markNotificationsRead,
  notificationsStreamUrl,
  parseJson,
  STATUS_LABELS,
  type TaskNotification,
  type TaskStatus,
} from "../api/tasks";

const API_URL = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

function fmtTime(s: string) {
  return new Date(s).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

/** Подпись уведомления собирается на фронте по типу события. */
function taskNotificationText(n: TaskNotification): string {
  const payload = parseJson<{ from?: string; to?: string; unread_count?: number }>(
    n.payload as { from?: string; to?: string; unread_count?: number } | string,
    {},
  );
  switch (n.notification_type) {
    case "PARTICIPANT_ADDED":
      return "Вас добавили в задачу";
    case "PARTICIPANT_REMOVED":
      return "Вас убрали из задачи";
    case "STATUS_CHANGED": {
      const from = STATUS_LABELS[payload.from as TaskStatus] ?? payload.from ?? "";
      const to = STATUS_LABELS[payload.to as TaskStatus] ?? payload.to ?? "";
      return `Статус: ${from} → ${to}`;
    }
    case "NEW_MESSAGE": {
      const count = payload.unread_count ?? 1;
      return count > 1 ? `Новых сообщений: ${count}` : "Новое сообщение в чате";
    }
    case "TASK_PENDING_REVIEW":
      return "Задача ждёт вашей проверки";
    default:
      return n.notification_type;
  }
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState<Notifications | null>(null);
  const [taskNotifications, setTaskNotifications] = useState<TaskNotification[]>([]);
  const [open, setOpen] = useState(false);
  // на узком экране окно показываем листом во всю ширину сразу под колокольчиком
  const [sheetTop, setSheetTop] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [pushBusy, setPushBusy] = useState(false);

  // Разрешение уже дано — тихо пересылаем подписку: в браузере мог смениться
  // пользователь или на сервере пересоздаться база
  useEffect(() => {
    void syncPushSubscription().finally(() => {
      void getPushState().then(setPushState);
    });
  }, []);

  const togglePush = async () => {
    setPushBusy(true);
    try {
      setPushState(pushState === "on" ? await disablePush() : await enablePush());
    } catch {
      setPushState(await getPushState());
    } finally {
      setPushBusy(false);
    }
  };
  const ref = useRef<HTMLDivElement>(null);

  // Уведомления по задачам: стартовая загрузка + живой поток
  const reloadTaskNotifications = () =>
    fetchTaskNotifications()
      .then((feed) => setTaskNotifications(feed.items))
      .catch(() => null);

  useEffect(() => {
    void reloadTaskNotifications();
  }, []);

  useEventSource(notificationsStreamUrl(), {
    // поток переоткрылся после фона — за это время могли прийти уведомления
    onOpen: (reconnect) => reconnect && void reloadTaskNotifications(),
    onMessage: (data) => {
      try {
        const payload = JSON.parse(data) as {
          type: string;
          notification?: TaskNotification;
        };
        if (payload.type === "notification" && payload.notification) {
          const incoming = payload.notification;
          setTaskNotifications((prev) => [
            incoming,
            // одно уведомление на задачу — обновление заменяет прежнее
            ...prev.filter((n) => n.id !== incoming.id),
          ]);
        }
      } catch {
        // мусор в потоке игнорируем
      }
    },
  });

  useEventSource(`${API_URL}/data/notifications/stream`, {
    onMessage: (data) => {
      try { setData(JSON.parse(data) as Notifications); }
      catch { /* ignore */ }
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try { setData(await fetchNotifications()); }
    finally { setRefreshing(false); }
  };

  const dismiss = async (itemType: string, itemId: number) => {
    await markNotificationRead(itemType, itemId);
    setData((prev) => {
      if (!prev) return prev;
      const incidents = itemType === "incident" ? prev.incidents.filter((x) => x.id !== itemId) : prev.incidents;
      const assigned_incidents = itemType === "incident_assignment" ? prev.assigned_incidents.filter((x) => x.id !== itemId) : prev.assigned_incidents;
      const overdue_documents = itemType === "document" ? prev.overdue_documents.filter((x) => x.id !== itemId) : prev.overdue_documents;
      const today_events = itemType === "event" ? prev.today_events.filter((x) => x.id !== itemId) : prev.today_events;
      const upcoming_events = itemType === "event" ? prev.upcoming_events.filter((x) => x.id !== itemId) : prev.upcoming_events;
      return {
        incidents, assigned_incidents, overdue_documents, today_events, upcoming_events,
        total: incidents.length + assigned_incidents.length + overdue_documents.length + today_events.length + upcoming_events.length,
      };
    });
  };

  const dismissAll = async () => {
    await Promise.all([
      markAllNotificationsRead(),
      markNotificationsRead({ all: true }).catch(() => null),
    ]);
    setData({ total: 0, incidents: [], assigned_incidents: [], overdue_documents: [], today_events: [], upcoming_events: [] });
    setTaskNotifications([]);
  };

  const dismissTask = async (id: number) => {
    await markNotificationsRead({ ids: [id] });
    setTaskNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Считаем по тем секциям, которые реально показываем: инциденты из выдачи
  // бэка ещё приходят, но в интерфейсе их больше нет — иначе бейдж показывал бы
  // число, которому в списке ничего не соответствует
  const total =
    (data?.overdue_documents.length ?? 0) +
    (data?.today_events.length ?? 0) +
    (data?.upcoming_events.length ?? 0) +
    taskNotifications.length;

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  return (
    <div className="position-relative" ref={ref}>
      <button
        className="border-0 d-flex align-items-center justify-content-center position-relative"
        style={{
          background: "transparent",
          color: "rgba(255,255,255,0.82)",
          width: 38,
          height: 38,
          borderRadius: "50%",
          transition: "background 0.18s",
        }}
        onClick={() => {
          setSheetTop((ref.current?.getBoundingClientRect().bottom ?? 0) + 6);
          setOpen((p) => !p);
        }}
        title="Уведомления"
      >
        <i className="fa fa-bell" style={{ fontSize: 17 }} />
        {total > 0 && (
          <span
            className="position-absolute top-0 end-0 badge rounded-pill"
            style={{
              background: "#dc3545",
              fontSize: 10,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              lineHeight: "16px",
            }}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          className="position-absolute end-0 mt-2 bg-white rounded-4 shadow border overflow-hidden notif-dropdown"
          style={{ minWidth: 340, maxWidth: 380, zIndex: 1100, ["--sheet-top" as string]: `${sheetTop}px` }}
        >
          <div
            className="px-3 py-2 d-flex align-items-center justify-content-between"
            style={{ background: "linear-gradient(135deg, #37474f, #546e7a)", color: "white" }}
          >
            <span className="fw-semibold" style={{ fontSize: 14 }}>
              <i className="fa fa-bell me-2" />
              Уведомления
            </span>
            {total > 0 && <span className="badge bg-danger">{total}</span>}
          </div>

          <PushSettings state={pushState} busy={pushBusy} onToggle={() => void togglePush()} />

          <div style={{ maxHeight: 440, overflowY: "auto" }}>
            {total === 0 && (
              <div className="text-center text-muted py-4" style={{ fontSize: 13 }}>
                <i className="fa fa-circle-check text-success d-block mb-2" style={{ fontSize: 22 }} />
                Всё в порядке
              </div>
            )}

            {/* Задачи */}
            {taskNotifications.length > 0 && (
              <>
                <SectionHeader icon="fa-clipboard-list" label="Задачи" color="#37474f" />
                {taskNotifications.map((n) => (
                  <NotifRow
                    key={`task-${n.id}`}
                    onClick={() => go(`/tasks/${n.task_id}`)}
                    onDismiss={() => void dismissTask(n.id)}
                  >
                    <i className="fa fa-clipboard-list flex-shrink-0" style={{ marginTop: 2, fontSize: 13, color: "#37474f" }} />
                    <div>
                      <div className="fw-semibold text-dark" style={{ fontSize: 13 }}>{n.task_title}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        {taskNotificationText(n)}
                      </div>
                    </div>
                  </NotifRow>
                ))}
              </>
            )}

            {/* Инциденты переехали в задачи: их секции убраны,
                ссылки вели на страницу, которой больше нет */}

            {/* Overdue documents */}
            {(data?.overdue_documents?.length ?? 0) > 0 && (
              <>
                <SectionHeader icon="fa-file-circle-exclamation" label="Просроченные документы" color="#dc3545" />
                {data!.overdue_documents.map((doc) => (
                  <NotifRow key={`doc-${doc.id}`} onClick={() => go("/documents")}
                    onDismiss={() => void dismiss("document", doc.id)}>
                    <i className="fa fa-file text-danger flex-shrink-0" style={{ marginTop: 2, fontSize: 13 }} />
                    <div>
                      <div className="fw-semibold text-dark" style={{ fontSize: 13 }}>{doc.name}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        Загружен {fmtDate(doc.uploaded_at)}
                      </div>
                    </div>
                  </NotifRow>
                ))}
              </>
            )}

            {/* Today events */}
            {(data?.today_events?.length ?? 0) > 0 && (
              <>
                <SectionHeader icon="fa-calendar-day" label="Сегодня" color="#0d6efd" />
                {data!.today_events.map((ev) => (
                  <NotifRow key={`today-${ev.id}`} onClick={() => go(`/calendar?event=${ev.id}`)}
                    onDismiss={() => void dismiss("event", ev.id)}>
                    <i className="fa fa-clock text-primary flex-shrink-0" style={{ marginTop: 2, fontSize: 13 }} />
                    <div>
                      <div className="fw-semibold text-dark" style={{ fontSize: 13 }}>{ev.title}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>{fmtTime(ev.starts_at)}</div>
                    </div>
                  </NotifRow>
                ))}
              </>
            )}

            {/* Upcoming events */}
            {(data?.upcoming_events?.length ?? 0) > 0 && (
              <>
                <SectionHeader icon="fa-calendar" label="Ближайшие мероприятия" color="#6c757d" />
                {data!.upcoming_events.map((ev) => (
                  <NotifRow key={`ev-${ev.id}`} onClick={() => go(`/calendar?event=${ev.id}`)}
                    onDismiss={() => void dismiss("event", ev.id)}>
                    <i className="fa fa-calendar text-secondary flex-shrink-0" style={{ marginTop: 2, fontSize: 13 }} />
                    <div>
                      <div className="fw-semibold text-dark" style={{ fontSize: 13 }}>{ev.title}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        {fmtDate(ev.starts_at)} · {fmtTime(ev.starts_at)}
                      </div>
                    </div>
                  </NotifRow>
                ))}
              </>
            )}
          </div>

          <div className="px-3 py-2 border-top d-flex align-items-center justify-content-between gap-2">
            {total > 0 ? (
              <button
                className="btn btn-sm btn-outline-secondary py-0 px-2"
                style={{ fontSize: 11 }}
                onClick={() => void dismissAll()}
              >
                <i className="fa fa-check-double me-1" />
                Отметить все прочитанными
              </button>
            ) : (
              <span className="text-muted" style={{ fontSize: 11 }}>
                <i className="fa fa-rotate me-1" />
                Авто-обновление каждые 30 с
              </span>
            )}
            <button
              className="btn btn-sm btn-outline-secondary py-0 px-2"
              style={{ fontSize: 11 }}
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing
                ? <span className="spinner-border spinner-border-sm" style={{ width: 10, height: 10 }} />
                : <i className="fa fa-rotate" />
              }
            </button>
          </div>
        </div>
      )}

      <style>{`
        .notif-row:hover { background-color: #f4f6f8 !important; }
        /* 340px от колокольчика влево на телефоне уезжали за край экрана */
        @media (max-width: 575.98px) {
          .notif-dropdown {
            position: fixed !important;
            top: var(--sheet-top) !important;
            left: 8px !important;
            right: 8px !important;
            margin-top: 0 !important;
            min-width: 0 !important;
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function SectionHeader({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <div className="px-3 pt-3 pb-1 d-flex align-items-center gap-2 border-top" style={{ fontSize: 11 }}>
      <i className={`fa ${icon}`} style={{ color, fontSize: 12 }} />
      <span className="text-uppercase text-muted fw-semibold">{label}</span>
    </div>
  );
}

function NotifRow({ children, onClick, onDismiss }: {
  children: React.ReactNode;
  onClick: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="notif-row d-flex align-items-start" style={{ background: "white" }}>
      <button
        className="flex-grow-1 text-start border-0 bg-transparent d-flex align-items-start gap-2 px-3 py-2"
        style={{ minWidth: 0 }}
        onClick={onClick}
      >
        {children}
      </button>
      <button
        className="border-0 bg-transparent text-muted px-2 py-2 flex-shrink-0"
        style={{ fontSize: 12, opacity: 0.5, lineHeight: 1 }}
        title="Отметить прочитанным"
        onClick={(e) => { e.stopPropagation(); onDismiss(); }}
      >
        <i className="fa fa-xmark" />
      </button>
    </div>
  );
}

/** Включение системных уведомлений на этом устройстве. */
function PushSettings({ state, busy, onToggle }: { state: PushState | null; busy: boolean; onToggle: () => void }) {
  if (state === null || state === "unsupported") return null;

  const box = "px-3 py-2 border-bottom d-flex align-items-center gap-2";
  const text = { fontSize: 12 };

  if (state === "needs-install") {
    return (
      <div className={box} style={{ background: "#f8f9fa" }}>
        <i className="fa fa-mobile-screen text-muted" />
        <span className="text-muted" style={text}>
          Чтобы получать уведомления на iPhone, добавьте сайт на экран «Домой»: «Поделиться» → «На экран Домой»
        </span>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className={box} style={{ background: "#f8f9fa" }}>
        <i className="fa fa-bell-slash text-muted" />
        <span className="text-muted" style={text}>
          Уведомления запрещены в настройках браузера — разрешите их для этого сайта
        </span>
      </div>
    );
  }

  return (
    <div className={box} style={{ background: state === "on" ? "#f1f8f4" : "#f8f9fa" }}>
      <i className={`fa ${state === "on" ? "fa-circle-check text-success" : "fa-desktop text-muted"}`} />
      <span className="flex-grow-1" style={text}>
        {state === "on" ? "Уведомления на этом устройстве включены" : "Получайте уведомления, даже когда вкладка закрыта"}
      </span>
      <button className="btn btn-sm btn-outline-secondary py-0 px-2" style={{ fontSize: 11 }} disabled={busy} onClick={onToggle}>
        {busy ? <span className="spinner-border spinner-border-sm" style={{ width: 10, height: 10 }} /> : state === "on" ? "Выключить" : "Включить"}
      </button>
    </div>
  );
}
