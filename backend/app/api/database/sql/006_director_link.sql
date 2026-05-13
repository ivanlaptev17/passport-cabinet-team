ALTER TABLE organizations
    ADD COLUMN director_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

UPDATE organizations
SET director_user_id = (SELECT id FROM users WHERE email = 'director@test.com')
WHERE name = 'Школа №1';
