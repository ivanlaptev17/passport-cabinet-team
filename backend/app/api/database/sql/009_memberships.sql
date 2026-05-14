-- 1. Членство пользователя в организации
CREATE TABLE IF NOT EXISTS organization_memberships (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    org_role_code TEXT NOT NULL,
    position_title TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_memberships_user_id
    ON organization_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_org_memberships_organization_id
    ON organization_memberships(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_memberships_org_role_code
    ON organization_memberships(org_role_code);


-- 2. Справочник категорий сотрудников
CREATE TABLE IF NOT EXISTS employee_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_employee_categories_code
    ON employee_categories(code);


-- 3. Категории пользователя внутри конкретной организации
CREATE TABLE IF NOT EXISTS membership_employee_categories (
    id BIGSERIAL PRIMARY KEY,
    membership_id BIGINT NOT NULL REFERENCES organization_memberships(id) ON DELETE CASCADE,
    category_id BIGINT NOT NULL REFERENCES employee_categories(id) ON DELETE CASCADE,
    UNIQUE (membership_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_employee_categories_membership_id
    ON membership_employee_categories(membership_id);

CREATE INDEX IF NOT EXISTS idx_membership_employee_categories_category_id
    ON membership_employee_categories(category_id);


-- Базовые категории
INSERT INTO employee_categories (name, code)
VALUES
    ('АУП', 'ADM'),
    ('Педагогические кадры', 'TEACH'),
    ('МОП', 'TECH')
ON CONFLICT (code) DO NOTHING;


-- Первичная миграция из текущей схемы:
-- переносим связки user <-> organization из organization_users
-- и пытаемся определить роль внутри организации
INSERT INTO organization_memberships (
    user_id,
    organization_id,
    org_role_code,
    position_title,
    is_active
)
SELECT DISTINCT
    ou.user_id,
    ou.organization_id,
    CASE
        WHEN o.director_user_id = ou.user_id THEN 'DIRECTOR'
        WHEN r.code = 'DIRECTOR' THEN 'DIRECTOR'
        ELSE 'STAFF'
    END AS org_role_code,
    NULL AS position_title,
    TRUE AS is_active
FROM organization_users ou
JOIN users u ON u.id = ou.user_id
LEFT JOIN roles r ON r.id = u.role_id
LEFT JOIN organizations o ON o.id = ou.organization_id
ON CONFLICT (user_id, organization_id) DO NOTHING;