-- Модуль «Задачи» (приходит на смену инцидентам; инциденты пока остаются как есть)

CREATE TABLE IF NOT EXISTS tasks (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    building_id BIGINT REFERENCES buildings(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'NEW',
    severity TEXT NOT NULL DEFAULT 'MEDIUM',
    due_at TIMESTAMP,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
-- Допустимые значения status (проверяются в приложении, без CHECK — как в остальной схеме):
-- NEW, IN_PROGRESS, PENDING_REVIEW, DONE

CREATE INDEX IF NOT EXISTS idx_tasks_organization_id ON tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_tasks_building_id ON tasks(building_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

CREATE TABLE IF NOT EXISTS task_participants (
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    added_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_participants_user ON task_participants(user_id);

-- Привязка сотрудника организации к зданию (нужна для группировки списка людей по зданиям)
ALTER TABLE organization_memberships
    ADD COLUMN IF NOT EXISTS building_id BIGINT REFERENCES buildings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_memberships_building_id ON organization_memberships(building_id);


-- ── Тестовые данные для ручной проверки через Swagger ─────────────────────────

-- Новая роль внутри организации: 'RESPONSIBLE' («Ответственный ОО»).
-- Повышаем существующее членство staff@test.com в организации 1.
UPDATE organization_memberships
SET org_role_code = 'RESPONSIBLE', updated_at = NOW()
WHERE organization_id = 1
  AND user_id = (SELECT id FROM users WHERE email = 'staff@test.com');

-- Отдельный рядовой сотрудник, чтобы осталось кого проверять с ролью 'STAFF'
INSERT INTO users (email, password_hash, last_name, first_name, middle_name, phone, role_id) VALUES
    ('staff2@test.com', 'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS', 'Андреева', 'Ольга', 'Павловна', '+7-999-100-00-05', (SELECT id FROM roles WHERE code = 'SCHOOL_STAFF'))
ON CONFLICT (email) DO NOTHING;

INSERT INTO organization_memberships (user_id, organization_id, org_role_code, position_title, is_active)
SELECT id, 1, 'STAFF', NULL, TRUE FROM users WHERE email = 'staff2@test.com'
ON CONFLICT (user_id, organization_id) DO NOTHING;

-- Раскладываем часть сотрудников организации 1 по зданиям
-- (у кого building_id пуст — попадут в группу «Без здания»)
UPDATE organization_memberships
SET building_id = (SELECT id FROM buildings WHERE organization_id = 1 AND name = 'Основное здание' ORDER BY id LIMIT 1)
WHERE organization_id = 1
  AND user_id = (SELECT id FROM users WHERE email = 'director@test.com');

UPDATE organization_memberships
SET building_id = (SELECT id FROM buildings WHERE organization_id = 1 AND name = 'Спортивный зал' ORDER BY id LIMIT 1)
WHERE organization_id = 1
  AND user_id IN (SELECT id FROM users WHERE email IN ('staff@test.com', 'staff2@test.com'));
