ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS last_name TEXT,
    ADD COLUMN IF NOT EXISTS first_name TEXT,
    ADD COLUMN IF NOT EXISTS middle_name TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT;

-- Split existing fio into name parts
UPDATE employees SET
    last_name   = NULLIF(TRIM(split_part(COALESCE(fio, ''), ' ', 1)), ''),
    first_name  = NULLIF(TRIM(split_part(COALESCE(fio, ''), ' ', 2)), ''),
    middle_name = NULLIF(TRIM(split_part(COALESCE(fio, ''), ' ', 3)), '')
WHERE fio IS NOT NULL;
