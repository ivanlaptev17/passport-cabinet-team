INSERT INTO roles (name, code)
VALUES
    ('Администратор', 'admin'),
    ('Пользователь', 'user')
ON CONFLICT DO NOTHING;

INSERT INTO categories (name, code)
VALUES
    ('Административный персонал', 'ADM'),
    ('Педагогический персонал', 'TEACH'),
    ('Технический персонал', 'TECH')
ON CONFLICT DO NOTHING;

INSERT INTO positions (name, category_id)
VALUES
    ('Директор', (SELECT id FROM categories WHERE code = 'ADM')),
    ('Учитель', (SELECT id FROM categories WHERE code = 'TEACH')),
    ('Уборщик', (SELECT id FROM categories WHERE code = 'TECH'))
ON CONFLICT DO NOTHING;

INSERT INTO employees (organization_id)
SELECT id
FROM organizations
ORDER BY id
LIMIT 2;

WITH ranked_employees AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
    FROM employees
),
ranked_positions AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            ORDER BY CASE
                WHEN name = 'Директор' THEN 1
                WHEN name = 'Учитель' THEN 2
                ELSE 999
            END
        ) AS rn
    FROM positions
    WHERE name IN ('Директор', 'Учитель')
)
INSERT INTO employee_positions (employee_id, position_id)
SELECT e.id, p.id
FROM ranked_employees e
JOIN ranked_positions p
    ON e.rn = p.rn
WHERE e.rn <= 2
ON CONFLICT (employee_id, position_id) DO NOTHING;
