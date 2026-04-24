CREATE TABLE categories (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100)
);

CREATE TABLE positions (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category_id BIGINT,
    CONSTRAINT fk_positions_category
        FOREIGN KEY (category_id)
        REFERENCES categories(id)
        ON DELETE SET NULL
);

CREATE TABLE employees (
    id BIGSERIAL PRIMARY KEY,
    organization_id BIGINT NOT NULL,
    CONSTRAINT fk_employees_organization
        FOREIGN KEY (organization_id)
        REFERENCES organizations(id)
        ON DELETE CASCADE
);

CREATE TABLE employee_positions (
    id BIGSERIAL PRIMARY KEY,
    employee_id BIGINT NOT NULL,
    position_id BIGINT NOT NULL,
    CONSTRAINT fk_emp_pos_employee
        FOREIGN KEY (employee_id)
        REFERENCES employees(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_emp_pos_position
        FOREIGN KEY (position_id)
        REFERENCES positions(id)
        ON DELETE CASCADE,
    CONSTRAINT unique_employee_position
        UNIQUE (employee_id, position_id)
);
