INSERT INTO roles (name, code) VALUES
    ('Администратор', 'ADMIN'),
    ('Пользователь', 'USER'),
    ('Руководитель', 'MANAGER')
ON CONFLICT (code) DO NOTHING;

INSERT INTO finance_categories (name, code) VALUES
    ('Зарплаты', 'SALARY'),
    ('Налоги', 'TAX'),
    ('Аренда', 'RENT'),
    ('Коммунальные услуги', 'UTILITIES'),
    ('Методическая литература', 'BOOKS'),
    ('Повышение квалификации', 'TRAINING')
ON CONFLICT (code) DO NOTHING;

INSERT INTO grade_levels (number)
SELECT generate_series(1, 11)
ON CONFLICT (number) DO NOTHING;

INSERT INTO education_activity_types (name) VALUES
    ('Урочная деятельность'),
    ('Внеурочная деятельность'),
    ('Дополнительное образование')
ON CONFLICT (name) DO NOTHING;

INSERT INTO organizations (name, director_name, governance_body, founder) VALUES
    ('Школа №1', 'Иванов Иван Иванович', 'Управляющий совет', 'Департамент образования')
ON CONFLICT DO NOTHING;

-- password: Test1234!  (PBKDF2-SHA256 + base64)
INSERT INTO users (email, password_hash, last_name, first_name, middle_name, phone, role_id) VALUES
    ('test@example.com', 'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS', 'Иванов', 'Иван', 'Иванович', '+7-999-123-45-67', (SELECT id FROM roles WHERE name = 'Администратор'))
ON CONFLICT (email) DO NOTHING;

INSERT INTO organization_users (organization_id, user_id) VALUES
    (1, 1)
ON CONFLICT DO NOTHING;

INSERT INTO buildings (organization_id, name, address, created_at) VALUES
    (1, 'Основное здание', 'ул. Ленина, 1', '2020-01-01');