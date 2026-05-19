CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    starts_at TIMESTAMP NOT NULL,
    ends_at TIMESTAMP,
    description TEXT,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE event_participants (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (event_id, user_id)
);

CREATE INDEX idx_events_org ON events(organization_id);
CREATE INDEX idx_events_starts_at ON events(starts_at);
CREATE INDEX idx_event_participants_user ON event_participants(user_id);

-- Тестовые мероприятия
INSERT INTO events (organization_id, title, starts_at, ends_at, description, created_by) VALUES
    (1, 'Педагогический совет', NOW() + INTERVAL '2 days' + TIME '10:00', NOW() + INTERVAL '2 days' + TIME '12:00', 'Итоги четверти', (SELECT id FROM users WHERE email = 'director@test.com')),
    (1, 'Родительское собрание 5А', NOW() + INTERVAL '5 days' + TIME '18:00', NOW() + INTERVAL '5 days' + TIME '19:30', NULL, (SELECT id FROM users WHERE email = 'director@test.com')),
    (1, 'Совещание АУП', NOW() + INTERVAL '1 day' + TIME '09:00', NOW() + INTERVAL '1 day' + TIME '10:00', 'Еженедельное планирование', (SELECT id FROM users WHERE email = 'director@test.com')),
    (1, 'День открытых дверей', NOW() + INTERVAL '14 days' + TIME '11:00', NOW() + INTERVAL '14 days' + TIME '15:00', 'Для абитуриентов и родителей', (SELECT id FROM users WHERE email = 'director@test.com'));

-- Участники
INSERT INTO event_participants (event_id, user_id)
SELECT e.id, u.id
FROM events e, users u
WHERE u.email IN ('director@test.com', 'staff@test.com')
  AND e.organization_id = 1
ON CONFLICT DO NOTHING;
