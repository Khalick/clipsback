-- SQL for results table
CREATE TABLE IF NOT EXISTS results (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid REFERENCES students(id) ON DELETE CASCADE,
    semester INTEGER NOT NULL,
    result_data JSONB NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
