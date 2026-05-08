-- Add FIO field to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS fio TEXT;

-- New positions
INSERT INTO positions (name, category_id) VALUES
    ('Заместитель директора',         (SELECT id FROM categories WHERE code = 'ADM')),
    ('Учитель математики',             (SELECT id FROM categories WHERE code = 'TEACH')),
    ('Учитель русского языка',         (SELECT id FROM categories WHERE code = 'TEACH')),
    ('Учитель физкультуры',            (SELECT id FROM categories WHERE code = 'TEACH')),
    ('Педагог-психолог',               (SELECT id FROM categories WHERE code = 'TEACH')),
    ('Социальный педагог',             (SELECT id FROM categories WHERE code = 'TEACH')),
    ('Охранник',                       (SELECT id FROM categories WHERE code = 'TECH')),
    ('Уборщик служебных помещений',    (SELECT id FROM categories WHERE code = 'TECH')),
    ('Завхоз',                         (SELECT id FROM categories WHERE code = 'ADM')),
    ('Библиотекарь',                   (SELECT id FROM categories WHERE code = 'TECH'))
ON CONFLICT DO NOTHING;

-- Update existing employee
UPDATE employees SET fio = 'Иванов Иван Иванович' WHERE id = 1;

-- Add more employees and immediately link to positions
WITH new_emp AS (
    INSERT INTO employees (organization_id, fio) VALUES
        (1, 'Петрова Анна Сергеевна'),
        (1, 'Сидоров Алексей Николаевич'),
        (1, 'Козлова Мария Дмитриевна'),
        (1, 'Новиков Владимир Павлович'),
        (1, 'Смирнова Елена Юрьевна'),
        (1, 'Попов Дмитрий Иванович'),
        (1, 'Захарова Ольга Михайловна'),
        (1, 'Морозов Сергей Андреевич')
    RETURNING id, fio
),
mapping (fio, pos_name) AS (
    VALUES
        ('Петрова Анна Сергеевна',       'Учитель математики'),
        ('Сидоров Алексей Николаевич',   'Учитель русского языка'),
        ('Козлова Мария Дмитриевна',     'Заместитель директора'),
        ('Новиков Владимир Павлович',    'Учитель физкультуры'),
        ('Смирнова Елена Юрьевна',       'Педагог-психолог'),
        ('Попов Дмитрий Иванович',       'Охранник'),
        ('Захарова Ольга Михайловна',    'Уборщик служебных помещений'),
        ('Морозов Сергей Андреевич',     'Завхоз')
)
INSERT INTO employee_positions (employee_id, position_id)
SELECT ne.id, p.id
FROM new_emp ne
JOIN mapping m ON m.fio = ne.fio
JOIN positions p ON p.name = m.pos_name
ON CONFLICT (employee_id, position_id) DO NOTHING;

-- More organizations
INSERT INTO organizations (name, director_name, governance_body, founder) VALUES
    ('Лицей №5',    'Петрова Светлана Ивановна',   'Попечительский совет',  'Департамент образования'),
    ('МБОУ СОШ №3', 'Сидоров Константин Петрович', 'Управляющий совет',     'Министерство образования')
ON CONFLICT DO NOTHING;

-- Buildings
INSERT INTO buildings (organization_id, name, address, created_at) VALUES
    (1, 'Спортивный зал',    'ул. Ленина, 1а',     '2005-09-01'),
    (1, 'Стадион',           'ул. Ленина, 1б',     '2010-06-15'),
    (2, 'Основное здание',   'пр. Мира, 5',        '2000-09-01'),
    (3, 'Основное здание',   'ул. Советская, 15',  '1985-09-01');

-- School classes
INSERT INTO school_classes (organization_id, name, grade_level_id, student_count) VALUES
    (1, '1А', 1, 25), (1, '1Б', 1, 27),
    (1, '2А', 2, 26), (1, '2Б', 2, 28),
    (1, '5А', 5, 30), (1, '5Б', 5, 28),
    (1, '9А', 9, 25), (1, '9Б', 9, 27),
    (1, '11А', 11, 20), (1, '11Б', 11, 22);

-- Student contingents
INSERT INTO student_contingents (organization_id, attribute, value, is_filled) VALUES
    (1, 'Всего обучающихся',                          600, TRUE),
    (1, 'В том числе девочек',                        295, TRUE),
    (1, 'Обучаются по адаптированным программам',      12, TRUE),
    (1, 'Обучаются в первую смену',                   400, TRUE),
    (1, 'Обучаются во вторую смену',                  200, TRUE);

-- Staff general info
INSERT INTO staff_general_infos (organization_id, attribute, value, real_value, is_filled) VALUES
    (1, 'Всего единиц по штатному расписанию',           '45',  '45',  TRUE),
    (1, 'Количество вакансий',                            '3',   '3',   FALSE),
    (1, 'Укомплектованность педагогами, %',               '95',  '95',  TRUE),
    (1, 'Педагоги с высшей квалификационной категорией',  '12',  '12',  TRUE),
    (1, 'Молодых специалистов (до 35 лет)',               '5',   '5',   TRUE);

-- Finance records
INSERT INTO finance_records (organization_id, category_id, attribute, value, is_filled) VALUES
    (1, (SELECT id FROM finance_categories WHERE code = 'SALARY'),   'Фонд оплаты труда',         3500000.00, TRUE),
    (1, (SELECT id FROM finance_categories WHERE code = 'TAX'),      'Страховые взносы',          1050000.00, TRUE),
    (1, (SELECT id FROM finance_categories WHERE code = 'UTILITIES'),'Коммунальные услуги',        450000.00, TRUE),
    (1, (SELECT id FROM finance_categories WHERE code = 'BOOKS'),    'Методические материалы',    120000.00, TRUE),
    (1, (SELECT id FROM finance_categories WHERE code = 'TRAINING'), 'Повышение квалификации',     80000.00, TRUE);

-- Subsidies
INSERT INTO subsidies (organization_id, name, amount) VALUES
    (1, 'Субсидия на выполнение муниципального задания', 15000000.00),
    (1, 'Целевая субсидия на ремонт',                     2500000.00);

-- Contracts
INSERT INTO contracts (organization_id, name, link) VALUES
    (1, 'Договор на поставку учебной литературы №23', 'https://example.com/contract1'),
    (1, 'Договор аренды спортивного зала №5',         'https://example.com/contract2');

-- Grade parallel counts
INSERT INTO grade_parallel_counts (organization_id, title, values, is_filled) VALUES
    (1, '1 класс',  ARRAY[25, 27], TRUE),
    (1, '2 класс',  ARRAY[26, 28], TRUE),
    (1, '5 класс',  ARRAY[30, 28], TRUE),
    (1, '9 класс',  ARRAY[25, 27], TRUE),
    (1, '11 класс', ARRAY[20, 22], TRUE);

-- Education activities
INSERT INTO education_activities (organization_id, type_id, attribute, value, is_filled, is_heading, item_order) VALUES
    (1, (SELECT id FROM education_activity_types WHERE name = 'Урочная деятельность'),
        'Основная общеобразовательная программа', 'да', TRUE, FALSE, 1),
    (1, (SELECT id FROM education_activity_types WHERE name = 'Внеурочная деятельность'),
        'Техническое творчество', 'да', TRUE, FALSE, 1),
    (1, (SELECT id FROM education_activity_types WHERE name = 'Внеурочная деятельность'),
        'Спортивные секции', 'да', TRUE, FALSE, 2),
    (1, (SELECT id FROM education_activity_types WHERE name = 'Дополнительное образование'),
        'Кружок робототехники', 'да', TRUE, FALSE, 1);
