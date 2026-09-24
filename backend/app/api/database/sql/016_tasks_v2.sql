-- Задачи v2: теги организации, превью картинок в чате, web push, роль Администратор ОО

-- ── Теги (категории) задач ────────────────────────────────────────────────────
-- Ничего не хардкодим: каждая организация заводит свои теги сама.

CREATE TABLE IF NOT EXISTS org_categories (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#607d8b',
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- «IT» и «it» внутри одной организации — один и тот же тег
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_categories_org_name
    ON org_categories(organization_id, lower(name));

CREATE TABLE IF NOT EXISTS task_categories (
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES org_categories(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_task_categories_category ON task_categories(category_id);


-- ── Превью картинок ───────────────────────────────────────────────────────────
-- Уменьшенная копия, которую сервер сам делает при загрузке изображения:
-- чтобы в чат на телефоне не грузились фотографии по 10 МБ

ALTER TABLE task_messages ADD COLUMN IF NOT EXISTS file_thumb_path TEXT;


-- ── Web push ──────────────────────────────────────────────────────────────────
-- Одна строка на устройство/браузер, в котором пользователь разрешил уведомления

CREATE TABLE IF NOT EXISTS push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_success_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);


-- ── Тестовые данные для ручной проверки ───────────────────────────────────────

-- Роль внутри организации 'ORG_ADMIN' — «Администратор ОО» (пароль как у остальных)
INSERT INTO users (email, password_hash, last_name, first_name, middle_name, phone, role_id) VALUES
    ('orgadmin@test.com', 'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS',
     'Орлова', 'Анна', 'Викторовна', '+7-999-100-00-06', (SELECT id FROM roles WHERE code = 'SCHOOL_STAFF'))
ON CONFLICT (email) DO NOTHING;

INSERT INTO organization_memberships (user_id, organization_id, org_role_code, position_title, is_active)
SELECT id, 1, 'ORG_ADMIN', 'Заместитель директора по АХР', TRUE
FROM users WHERE email = 'orgadmin@test.com'
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Ответственный ОО из школы 1 заодно работает в лицее — чтобы было на ком
-- проверять фильтр по организациям
INSERT INTO organization_memberships (user_id, organization_id, org_role_code, position_title, is_active)
SELECT id, 2, 'STAFF', 'Совместитель', TRUE
FROM users WHERE email = 'staff@test.com'
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Должности для карточки профиля
UPDATE organization_memberships SET position_title = 'Директор'
WHERE position_title IS NULL AND user_id = (SELECT id FROM users WHERE email = 'director@test.com');
UPDATE organization_memberships SET position_title = 'Заместитель директора по УВР'
WHERE position_title IS NULL AND organization_id = 1 AND user_id = (SELECT id FROM users WHERE email = 'staff@test.com');
UPDATE organization_memberships SET position_title = 'Учитель математики'
WHERE position_title IS NULL AND user_id = (SELECT id FROM users WHERE email = 'staff2@test.com');

-- Стартовые теги школы 1
INSERT INTO org_categories (organization_id, name, color) VALUES
    (1, 'Хозяйственная', '#8d6e63'),
    (1, 'IT', '#1e88e5'),
    (1, 'Учебная', '#43a047')
ON CONFLICT DO NOTHING;
