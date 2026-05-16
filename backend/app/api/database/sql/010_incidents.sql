CREATE TABLE IF NOT EXISTS incidents (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN',
    severity TEXT NOT NULL DEFAULT 'MEDIUM',
    incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_organization_id
    ON incidents(organization_id);

CREATE INDEX IF NOT EXISTS idx_incidents_status
    ON incidents(status);

CREATE INDEX IF NOT EXISTS idx_incidents_incident_date
    ON incidents(incident_date);

INSERT INTO incidents (
    organization_id,
    title,
    description,
    status,
    severity,
    incident_date,
    created_by_user_id
)
VALUES
    (
        1,
        'Конфликт между учениками',
        'На перемене произошёл конфликт между двумя учениками, проводится разбор ситуации.',
        'OPEN',
        'MEDIUM',
        CURRENT_DATE,
        2
    ),
    (
        1,
        'Жалоба от родителя',
        'Поступила жалоба от родителя по поводу поведения учащегося на уроке.',
        'IN_PROGRESS',
        'HIGH',
        CURRENT_DATE - INTERVAL '1 day',
        4
    ),
    (
        1,
        'Инцидент в коридоре',
        'Зафиксирована конфликтная ситуация в коридоре второго этажа.',
        'RESOLVED',
        'LOW',
        CURRENT_DATE - INTERVAL '2 day',
        2
    );
    