-- SQL for units table
CREATE TABLE IF NOT EXISTS units (
    id SERIAL PRIMARY KEY,
    unit_name VARCHAR(100) NOT NULL,
    unit_code VARCHAR(20) NOT NULL UNIQUE
);
