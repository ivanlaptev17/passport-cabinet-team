-- Чат задачи и уведомления
--
-- Одно событие (создали задачу, добавили участника, сменили статус, написали сообщение)
-- порождает запись в чате и уведомления заинтересованным людям — см. routes/tasks/events.py.

-- ── Сообщения чата ────────────────────────────────────────────────────────────
--
-- Одна таблица на оба вида сообщений:
--   message_type = 'USER'   — пишет человек: body и/или файл, author_user_id заполнен
--   message_type = 'SYSTEM' — пишет система: event_type + event_payload, автора нет.
--     Текст служебного сообщения рендерит фронт по event_type, в базе его не храним,
--     чтобы формулировки можно было менять без миграций.
-- Файл — не отдельный тип сообщения, а необязательный атрибут пользовательского.

CREATE TABLE IF NOT EXISTS task_messages (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL DEFAULT 'USER',
    author_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    body TEXT,
    event_type TEXT,
    event_payload JSONB,
    file_path TEXT,
    file_name TEXT,
    file_size BIGINT,
    file_mime TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_messages_task ON task_messages(task_id);

-- Под курсорную пагинацию истории: последние N сообщений задачи и "подгрузить ещё"
CREATE INDEX IF NOT EXISTS idx_task_messages_task_id_desc ON task_messages(task_id, id DESC);


-- ── Уведомления ───────────────────────────────────────────────────────────────
--
-- Это почтовый ящик пользователя, а не очередь доставки: строка живёт, пока человек
-- её не прочитал, чтобы уведомление не потерялось, если он был оффлайн.
-- Мгновенная доставка тем, кто сейчас онлайн, идёт через redis pub/sub.

CREATE TABLE IF NOT EXISTS task_notifications (
    id BIGSERIAL PRIMARY KEY,
    recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    message_id BIGINT REFERENCES task_messages(id) ON DELETE CASCADE,
    notification_type TEXT NOT NULL,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    read_at TIMESTAMP
);
-- notification_type: PARTICIPANT_ADDED | PARTICIPANT_REMOVED | STATUS_CHANGED
--                  | NEW_MESSAGE | TASK_PENDING_REVIEW

-- Лента колокольчика: непрочитанные конкретного пользователя, свежие сверху
CREATE INDEX IF NOT EXISTS idx_task_notifications_recipient
    ON task_notifications(recipient_user_id, read_at, id DESC);

CREATE INDEX IF NOT EXISTS idx_task_notifications_task
    ON task_notifications(task_id);

-- Уведомления о новых сообщениях схлопываем в одно на (пользователь, задача):
-- иначе пятьдесят сообщений в чате дадут пятьдесят строк в колокольчике.
-- Счётчик лежит в payload->>'unread_count'.
CREATE UNIQUE INDEX IF NOT EXISTS idx_task_notifications_unread_new_message
    ON task_notifications(recipient_user_id, task_id)
    WHERE notification_type = 'NEW_MESSAGE' AND read_at IS NULL;
