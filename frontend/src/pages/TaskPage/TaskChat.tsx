import { useCallback, useEffect, useRef, useState } from "react";
import {
  errorText,
  fetchMessages,
  markChatRead,
  messageFileUrl,
  messageInlineUrl,
  messagePreviewUrl,
  parseJson,
  postMessage,
  postMessageWithFile,
  personName,
  taskChatStreamUrl,
  STATUS_LABELS,
  type TaskMessage,
  type TaskStatus,
} from "../../api/tasks";
import { useEventSource } from "../../hooks/useEventSource";

type Props = {
  taskId: number;
  currentUserId: number | null;
  /** Минобр и посторонние читают чат, но не пишут */
  canWrite: boolean;
};

/** Картинка во весь экран: открывается по нажатию на превью в чате или в файлах задачи. */
export function ImageViewer({
  taskId,
  messageId,
  fileName,
  onClose,
}: {
  taskId: number;
  messageId: number;
  fileName: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column"
      style={{ background: "rgba(0,0,0,0.88)", zIndex: 2000 }}
      onClick={onClose}
    >
      <div className="d-flex align-items-center gap-2 p-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="text-truncate flex-grow-1" style={{ fontSize: 14 }}>{fileName}</span>
        <a href={messageFileUrl(taskId, messageId)} className="btn btn-sm btn-outline-light" title="Скачать">
          <i className="fa fa-download" />
        </a>
        <button className="btn btn-sm btn-outline-light" title="Закрыть" onClick={onClose}>
          <i className="fa fa-xmark" />
        </button>
      </div>
      <div className="flex-grow-1 d-flex align-items-center justify-content-center p-3" style={{ minHeight: 0 }}>
        <img
          src={messageInlineUrl(taskId, messageId)}
          alt={fileName ?? ""}
          style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

type SystemPayload = {
  user_id?: number;
  last_name?: string | null;
  first_name?: string | null;
  from?: string;
  to?: string;
};

/** Текст служебных сообщений собирается здесь, а не в базе — чтобы менять формулировки без миграций. */
function systemText(message: TaskMessage): string {
  const payload = parseJson<SystemPayload>(message.event_payload as SystemPayload | string, {});
  const who = [payload.last_name, payload.first_name].filter(Boolean).join(" ");

  switch (message.event_type) {
    case "TASK_CREATED":
      return "Задача создана";
    // подлежащее — «участник», тогда род не зависит от того, кого добавили
    case "PARTICIPANT_ADDED":
      return who ? `В задачу добавлен участник: ${who}` : "В задачу добавлен участник";
    case "PARTICIPANT_REMOVED":
      return who ? `Из задачи убран участник: ${who}` : "Из задачи убран участник";
    case "STATUS_CHANGED": {
      const from = STATUS_LABELS[payload.from as TaskStatus] ?? payload.from ?? "";
      const to = STATUS_LABELS[payload.to as TaskStatus] ?? payload.to ?? "";
      return `Статус изменён: ${from} → ${to}`;
    }
    default:
      return message.event_type ?? "Событие";
  }
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function TaskChat({ taskId, currentUserId, canWrite }: Props) {
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [viewer, setViewer] = useState<TaskMessage | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addMessages = useCallback((incoming: TaskMessage[], position: "start" | "end") => {
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = incoming.filter((m) => !seen.has(m.id));
      if (fresh.length === 0) return prev;
      const merged = position === "start" ? [...fresh, ...prev] : [...prev, ...fresh];
      return merged.sort((a, b) => a.id - b.id);
    });
  }, []);

  // История
  useEffect(() => {
    let cancelled = false;
    fetchMessages(taskId)
      .then((page) => {
        if (cancelled) return;
        setMessages(page.messages);
        setHasMore(page.has_more);
        setCursor(page.next_before_id);
      })
      .catch(() => !cancelled && setError("Не удалось загрузить переписку"))
      .finally(() => !cancelled && setLoading(false));
    void markChatRead(taskId).catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Живой поток: сервер присылает новые сообщения сам, опрашивать не нужно
  useEventSource(taskChatStreamUrl(taskId), {
    onOpen: (reconnect) => {
      setLive(true);
      // пока потока не было (вкладка в фоне, обрыв связи), могли написать — дотягиваем
      if (reconnect) {
        void fetchMessages(taskId)
          .then((page) => addMessages(page.messages, "end"))
          .catch(() => null);
      }
    },
    onMessage: (data) => {
      try {
        const payload = JSON.parse(data) as { type: string; message?: TaskMessage };
        if (payload.type === "message" && payload.message) {
          addMessages([payload.message], "end");
        }
      } catch {
        // мусор в потоке игнорируем
      }
    },
    onError: () => setLive(false),
  });

  // Вниз мотаем только когда пришло новое сообщение в конец.
  // По длине списка ориентироваться нельзя: подгрузка старых тоже её увеличивает
  // и утаскивала бы экран от истории, которую пользователь только что открыл
  const lastMessageId = messages.length ? messages[messages.length - 1].id : null;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lastMessageId]);

  const loadOlder = async () => {
    if (!cursor) return;
    try {
      const page = await fetchMessages(taskId, cursor);
      addMessages(page.messages, "start");
      setHasMore(page.has_more);
      setCursor(page.next_before_id);
    } catch {
      setError("Не удалось загрузить историю");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const message = await postMessage(taskId, text);
      addMessages([message], "end"); // на случай, если realtime недоступен
      setDraft("");
    } catch {
      setError("Сообщение не отправлено");
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file: File) => {
    setSending(true);
    setError("");
    try {
      const message = await postMessageWithFile(taskId, file, draft.trim());
      addMessages([message], "end");
      setDraft("");
    } catch (e) {
      setError(errorText(e, "Файл не отправлен"));
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Первое сообщение каждого дня — над ним рисуем дату
  const dayStarts = new Set(
    messages
      .filter((m, i) => i === 0 || formatDay(m.created_at) !== formatDay(messages[i - 1].created_at))
      .map((m) => m.id),
  );

  return (
    <div className="card border-0 shadow-sm rounded-4">
      <div
        className="card-body d-flex flex-column"
        style={{ height: "min(65vh, 560px)", overflowY: "auto" }}
      >
        {loading && (
          <div className="text-center my-auto">
            <div className="spinner-border text-secondary" />
          </div>
        )}

        {hasMore && (
          <button className="btn btn-sm btn-link text-muted mb-2" onClick={() => void loadOlder()}>
            Показать более ранние
          </button>
        )}

        {messages.map((message) => {
          const day = formatDay(message.created_at);
          const showDay = dayStarts.has(message.id);

          const isSystem = message.message_type === "SYSTEM";
          const isOwn = !isSystem && message.author_user_id === currentUserId;

          return (
            <div key={message.id}>
              {showDay && (
                <div className="text-center my-3">
                  <span
                    className="badge rounded-pill text-muted"
                    style={{ background: "#eceff1", fontWeight: 500 }}
                  >
                    {day}
                  </span>
                </div>
              )}

              {isSystem ? (
                <div className="text-center my-2">
                  <span
                    className="d-inline-block px-3 py-1 rounded-pill"
                    style={{ background: "#e8eef5", color: "#546e7a", fontSize: 12 }}
                  >
                    {systemText(message)}
                    <span className="ms-2" style={{ opacity: 0.6 }}>
                      {formatTime(message.created_at)}
                    </span>
                  </span>
                </div>
              ) : (
                <div className={`d-flex mb-2 ${isOwn ? "justify-content-end" : "justify-content-start"}`}>
                  <div
                    className="rounded-4 px-3 py-2"
                    style={{
                      maxWidth: "80%",
                      background: isOwn ? "#37474f" : "#f1f3f5",
                      color: isOwn ? "white" : "#212529",
                    }}
                  >
                    {!isOwn && (
                      <div className="fw-semibold mb-1" style={{ fontSize: 12, opacity: 0.75 }}>
                        {personName({
                          id: message.author_user_id ?? 0,
                          last_name: message.author_last_name,
                          first_name: message.author_first_name,
                        })}
                      </div>
                    )}

                    {message.body && (
                      <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{message.body}</div>
                    )}

                    {message.has_preview && (
                      <button
                        type="button"
                        className="btn p-0 border-0 d-block mt-1"
                        title="Открыть"
                        onClick={() => setViewer(message)}
                      >
                        <img
                          src={messagePreviewUrl(taskId, message.id)}
                          alt={message.file_name ?? ""}
                          loading="lazy"
                          className="rounded-3"
                          style={{ maxWidth: "min(260px, 60vw)", maxHeight: 260, display: "block", objectFit: "cover" }}
                          // картинка догрузилась и выросла в высоту — докручиваем, но только
                          // у последнего сообщения: старые при подгрузке истории экран не дёргают
                          onLoad={() => message.id === lastMessageId && bottomRef.current?.scrollIntoView({ block: "end" })}
                        />
                      </button>
                    )}

                    {message.has_file && !message.has_preview && (
                      <a
                        href={messageFileUrl(taskId, message.id)}
                        target="_blank"
                        rel="noreferrer"
                        className={`d-flex align-items-center gap-2 mt-1 text-decoration-none ${
                          isOwn ? "text-white" : "text-dark"
                        }`}
                        style={{ fontSize: 13 }}
                      >
                        <i className="fa fa-paperclip" />
                        <span className="text-truncate">{message.file_name}</span>
                        <span style={{ opacity: 0.6, fontSize: 11 }}>{formatSize(message.file_size)}</span>
                      </a>
                    )}

                    <div className="text-end" style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>
                      {formatTime(message.created_at)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="card-footer bg-white border-top rounded-bottom-4">
        {error && <div className="text-danger mb-2" style={{ fontSize: 12 }}>{error}</div>}

        {!canWrite && (
          <div className="text-muted text-center" style={{ fontSize: 13 }}>
            <i className="fa fa-eye me-1" />
            Переписка доступна только для чтения
          </div>
        )}

        <div className={`align-items-center gap-2 ${canWrite ? "d-flex" : "d-none"}`}>
          <button
            className="btn btn-sm btn-outline-secondary rounded-circle flex-shrink-0"
            style={{ width: 36, height: 36 }}
            title="Прикрепить файл"
            disabled={sending}
            onClick={() => fileInputRef.current?.click()}
          >
            <i className="fa fa-paperclip" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="d-none"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void sendFile(file);
            }}
          />

          <input
            className="form-control form-control-sm"
            placeholder="Напишите сообщение"
            value={draft}
            disabled={sending}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />

          <button
            className="btn btn-sm text-white rounded-circle flex-shrink-0"
            style={{ width: 36, height: 36, background: "#37474f" }}
            disabled={sending || !draft.trim()}
            onClick={() => void send()}
          >
            {sending ? (
              <span className="spinner-border spinner-border-sm" style={{ width: 12, height: 12 }} />
            ) : (
              <i className="fa fa-paper-plane" />
            )}
          </button>
        </div>

        {!live && (
          <div className="text-muted mt-2" style={{ fontSize: 11 }}>
            <i className="fa fa-rotate me-1" />
            Живое обновление недоступно — новые сообщения появятся после обновления страницы
          </div>
        )}
      </div>

      {viewer && (
        <ImageViewer
          taskId={taskId}
          messageId={viewer.id}
          fileName={viewer.file_name}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}
