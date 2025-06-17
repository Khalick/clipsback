-- SQL for registered_units table
CREATE TABLE IF NOT EXISTS registered_units (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid REFERENCES students(id) ON DELETE CASCADE,
    unit_name VARCHAR(255) NOT NULL,
    unit_code VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL
);
