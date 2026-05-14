INSERT INTO roles (name, code) VALUES
    ('Администратор', 'ADMIN'),
    ('Директор', 'DIRECTOR'),
    ('Минобр', 'MINOBR'),
    ('Сотрудник школы', 'SCHOOL_STAFF')
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
    ('admin@test.com',    'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS', 'Иванов',   'Иван',    'Иванович',  '+7-999-100-00-01', (SELECT id FROM roles WHERE code = 'ADMIN')),
    ('director@test.com', 'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS', 'Петров',   'Пётр',    'Петрович',  '+7-999-100-00-02', (SELECT id FROM roles WHERE code = 'DIRECTOR')),
    ('minobr@test.com',   'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS', 'Сидоров',  'Сидор',   'Сидорович', '+7-999-100-00-03', (SELECT id FROM roles WHERE code = 'MINOBR')),
    ('staff@test.com',    'xNxT2rUzVukiOCVvX8qeKPvp8iWsxnvp2znPj667u+hWsx4Qh3e8pIjrIoaoTAyS', 'Кузнецова','Мария',   'Алексеевна','+7-999-100-00-04', (SELECT id FROM roles WHERE code = 'SCHOOL_STAFF'))
ON CONFLICT (email) DO NOTHING;


INSERT INTO organization_users (organization_id, user_id)
SELECT 1, id FROM users WHERE email IN ('admin@test.com', 'director@test.com', 'staff@test.com')
ON CONFLICT DO NOTHING;

INSERT INTO buildings (organization_id, name, address, created_at) VALUES
    (1, 'Основное здание', 'ул. Ленина, 1', '2020-01-01');