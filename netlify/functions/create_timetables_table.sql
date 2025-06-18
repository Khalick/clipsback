-- SQL for timetables table
CREATE TABLE IF NOT EXISTS timetables (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid REFERENCES students(id) ON DELETE CASCADE,
    semester INTEGER NOT NULL CHECK (semester = ANY (ARRAY[1, 2])),
    timetable_data JSONB NOT NULL
);
