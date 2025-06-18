-- SQL for students table
CREATE TABLE IF NOT EXISTS students (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_number VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    course VARCHAR(255) NOT NULL,
    level_of_study VARCHAR(255) NOT NULL,
    photo_url TEXT
);
