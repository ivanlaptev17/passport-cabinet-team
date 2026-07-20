-- Расширение модуля инцидентов: срок исполнения, типы проблем (теги), исполнители

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS due_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS incident_problem_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE
);

INSERT INTO incident_problem_types (name, code) VALUES
    ('Дисциплинарная', 'DISCIPLINARY'),
    ('Техническая', 'TECHNICAL'),
    ('Хозяйственная', 'HOUSEHOLD'),
    ('Прочее', 'OTHER')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS incident_type_links (
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    problem_type_id BIGINT NOT NULL REFERENCES incident_problem_types(id) ON DELETE CASCADE,
    PRIMARY KEY (incident_id, problem_type_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_type_links_type
    ON incident_type_links(problem_type_id);

CREATE TABLE IF NOT EXISTS incident_assignees (
    incident_id BIGINT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (incident_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_incident_assignees_user
    ON incident_assignees(user_id);
