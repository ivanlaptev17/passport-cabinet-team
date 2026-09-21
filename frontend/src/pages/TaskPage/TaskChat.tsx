import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchMessages,
  markChatRead,
  messageFileUrl,
  parseJson,
  postMessage,
  postMessageWithFile,
  personName,
  taskChatStreamUrl,
  STATUS_LABELS,
  type TaskMessage,
  type TaskStatus,
} from "../../api/tasks";

type Props = {
  taskId: number;
  currentUserId: number | null;
};

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
    case "PARTICIPANT_ADDED":
      return `${who || "Участник"} добавлен в задачу`;
    case "PARTICIPANT_REMOVED":
      return `${who || "Участник"} удалён из задачи`;
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

export default function TaskChat({ taskId, currentUserId }: Props) {
  const [messages, setMessages] = useState<TaskMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);

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
  useEffect(() => {
    const source = new EventSource(taskChatStreamUrl(taskId), { withCredentials: true });

    source.onopen = () => setLive(true);
    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as { type: string; message?: TaskMessage };
        if (payload.type === "message" && payload.message) {
          addMessages([payload.message], "end");
        }
      } catch {
        // мусор в потоке игнорируем
      }
    };
    source.onerror = () => setLive(false);

    return () => source.close();
  }, [taskId, addMessages]);

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
      setError(
        (e as Error).message === "413" ? "Файл больше 25 МБ" : "Файл не отправлен",
      );
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  let lastDay = "";

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
          const showDay = day !== lastDay;
          lastDay = day;

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

                    {message.has_file && (
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

        <div className="d-flex align-items-center gap-2">
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
    </div>
  );
}
