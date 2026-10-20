-- Регионы (муниципалитеты), ОМСУ, отпуска и дни рождения сотрудников

-- ── Регионы ───────────────────────────────────────────────────────────────────
-- В Московской области 56 муниципалитетов, школ «№ 1» в них десятки — поэтому
-- организацию ищут через регион. Связь многие-ко-многим: организация может
-- относиться к нескольким регионам.

CREATE TABLE IF NOT EXISTS municipalities (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    -- орган управления в сфере образования, например «Управление по образованию»
    education_body TEXT,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS organization_municipalities (
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    municipality_id BIGINT NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    PRIMARY KEY (organization_id, municipality_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_municipalities_mun
    ON organization_municipalities(municipality_id);


-- ── Кадровый состав: контакты, отпуска, замы, день рождения ──────────────────
-- Отпуска и замы — свободный текст: так их удобнее всего заполнять, «с 01.07 по 14.07, с 10.11 по 17.11»

ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS contacts TEXT,
    ADD COLUMN IF NOT EXISTS vacations TEXT,
    ADD COLUMN IF NOT EXISTS deputies TEXT,
    ADD COLUMN IF NOT EXISTS birth_date DATE;

-- «Телефон» становится «Контактами» — переносим то, что уже заполнено
UPDATE employees SET contacts = phone WHERE contacts IS NULL AND phone IS NOT NULL;


-- ── ОМСУ ──────────────────────────────────────────────────────────────────────
-- Орган местного самоуправления: одна учётная запись на регион. ОМСУ сам заполняет
-- своих представителей, их отпуска и замещающих, министерство это просматривает.

INSERT INTO roles (name, code) VALUES ('ОМСУ', 'OMSU') ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS omsu_accounts (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    municipality_id BIGINT NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_omsu_accounts_mun ON omsu_accounts(municipality_id);

-- position_code: HEAD — глава, DEPUTY_HEAD — зам. главы по соц. вопросам,
-- EDU_HEAD — начальник управления, EDU_DEPUTY — зам. начальника, EDU_STAFF — сотрудник
CREATE TABLE IF NOT EXISTS omsu_representatives (
    id BIGSERIAL PRIMARY KEY,
    municipality_id BIGINT NOT NULL REFERENCES municipalities(id) ON DELETE CASCADE,
    position_code TEXT NOT NULL,
    full_name TEXT NOT NULL,
    position_title TEXT,
    contacts TEXT,
    email TEXT,
    -- кто замещает на время отсутствия
    deputy TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_omsu_representatives_mun
    ON omsu_representatives(municipality_id, position_code, sort_order);

-- Отпуска представителей — датами, а не текстом: министерству важно видеть,
-- кто в отпуске прямо сейчас и кто его замещает
CREATE TABLE IF NOT EXISTS omsu_vacations (
    id BIGSERIAL PRIMARY KEY,
    representative_id BIGINT NOT NULL REFERENCES omsu_representatives(id) ON DELETE CASCADE,
    starts_on DATE NOT NULL,
    ends_on DATE NOT NULL,
    CONSTRAINT omsu_vacations_period CHECK (ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS idx_omsu_vacations_rep ON omsu_vacations(representative_id, starts_on);


-- ── Тестовые данные ───────────────────────────────────────────────────────────

INSERT INTO municipalities (name, education_body) VALUES
    ('Балашиха', 'Управление по образованию'),
    ('Рузский', 'Управление образования')
ON CONFLICT (name) DO NOTHING;

INSERT INTO organization_municipalities (organization_id, municipality_id)
SELECT o.id, m.id
FROM organizations o
JOIN municipalities m ON m.name = CASE o.id WHEN 3 THEN 'Рузский' ELSE 'Балашиха' END
WHERE o.id IN (1, 2, 3)
ON CONFLICT DO NOTHING;

-- Учётная запись ОМСУ Балашихи (пароль как у остальных тестовых)
INSERT INTO users (email, password_hash, last_name, first_name, middle_name, phone, role_id) VALUES
    ('omsu@test.com', 'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS',
     'Соколова', 'Елена', 'Игоревна', '+7-999-100-00-07', (SELECT id FROM roles WHERE code = 'OMSU'))
ON CONFLICT (email) DO NOTHING;

INSERT INTO omsu_accounts (user_id, municipality_id)
SELECT u.id, m.id FROM users u, municipalities m
WHERE u.email = 'omsu@test.com' AND m.name = 'Балашиха'
ON CONFLICT (user_id) DO NOTHING;

-- Представители Балашихи — по образцу таблицы министерства. Только если их ещё нет,
-- чтобы повторный прогон не плодил дубли
INSERT INTO omsu_representatives (municipality_id, position_code, full_name, position_title, contacts, email, deputy, sort_order)
SELECT m.id, r.position_code, r.full_name, r.position_title, r.contacts, r.email, r.deputy, r.sort_order
FROM municipalities m
CROSS JOIN (VALUES
    ('HEAD', 'Иванов Иван Иванович', 'Глава городского округа', '+7 (495) 999-99-00', 'mail@balashiha.ru', NULL, 0),
    ('DEPUTY_HEAD', 'Петров Пётр Петрович', 'Заместитель главы по социальным вопросам', '+7 (495) 999-99-01', 'mail@balashiha.ru', NULL, 0),
    ('EDU_HEAD', 'Сидорова Анна Викторовна', 'Начальник управления по образованию', '+7 (495) 999-99-02', 'edu@balashiha.ru', 'Беззубова Татьяна Августовна', 0),
    ('EDU_DEPUTY', 'Беззубова Татьяна Августовна', 'Заместитель начальника управления', '8-916-042-80-26, 8-495-521-95-16', 'edu@balashiha.ru', NULL, 0),
    ('EDU_STAFF', 'Кузнецов Олег Сергеевич', 'Начальник отдела обеспечения безопасности', '+7 (495) 999-99-03', 'safety@balashiha.ru', NULL, 0)
) AS r(position_code, full_name, position_title, contacts, email, deputy, sort_order)
WHERE m.name = 'Балашиха'
  AND NOT EXISTS (SELECT 1 FROM omsu_representatives x WHERE x.municipality_id = m.id);

-- Начальник управления сейчас в отпуске, у заместителя отпуск скоро — чтобы было что показать
INSERT INTO omsu_vacations (representative_id, starts_on, ends_on)
SELECT r.id, CURRENT_DATE - 3, CURRENT_DATE + 10
FROM omsu_representatives r
WHERE r.position_code = 'EDU_HEAD'
  AND NOT EXISTS (SELECT 1 FROM omsu_vacations v WHERE v.representative_id = r.id);

INSERT INTO omsu_vacations (representative_id, starts_on, ends_on)
SELECT r.id, CURRENT_DATE + 20, CURRENT_DATE + 33
FROM omsu_representatives r
WHERE r.position_code = 'EDU_DEPUTY'
  AND NOT EXISTS (SELECT 1 FROM omsu_vacations v WHERE v.representative_id = r.id);

-- Дни рождения части сотрудников школы 1: пара в текущем месяце, чтобы календарь не был пустым
UPDATE employees SET birth_date = make_date((1980 + id % 15)::int, EXTRACT(MONTH FROM CURRENT_DATE)::int, (3 + id % 20)::int)
WHERE organization_id = 1 AND birth_date IS NULL AND id % 3 = 0;
UPDATE employees SET birth_date = make_date((1975 + id % 20)::int, (1 + id % 12)::int, (1 + id % 27)::int)
WHERE organization_id = 1 AND birth_date IS NULL;
