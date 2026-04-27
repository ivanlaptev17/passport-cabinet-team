CREATE TABLE buildings (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT,
    address TEXT,
    created_at DATE
);

CREATE TABLE staff_general_infos (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    attribute TEXT,
    value TEXT,
    real_value TEXT,
    is_filled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE finance_categories (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL
);

CREATE TABLE finance_records (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    category_id BIGINT REFERENCES finance_categories(id) ON DELETE SET NULL,
    attribute TEXT,
    value NUMERIC(14,2),
    is_filled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE subsidies (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT,
    amount NUMERIC(14,2)
);

CREATE TABLE contracts (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT,
    link TEXT
);

CREATE TABLE grade_levels (
    id SMALLSERIAL PRIMARY KEY,
    number SMALLINT UNIQUE NOT NULL
);

CREATE TABLE school_classes (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT,
    grade_level_id SMALLINT REFERENCES grade_levels(id) ON DELETE SET NULL,
    student_count INTEGER
);

CREATE TABLE student_contingents (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    attribute TEXT,
    value INTEGER,
    is_filled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE grade_parallel_counts (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT,
    values INTEGER[],
    is_filled BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE education_activity_types (
    id BIGSERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE education_activities (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    type_id BIGINT REFERENCES education_activity_types(id) ON DELETE SET NULL,
    attribute TEXT,
    value TEXT,
    is_filled BOOLEAN NOT NULL DEFAULT FALSE,
    is_heading BOOLEAN NOT NULL DEFAULT FALSE,
    item_order INTEGER
);
