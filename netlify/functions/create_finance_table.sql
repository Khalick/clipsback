-- SQL for finance table
CREATE TABLE IF NOT EXISTS finance (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid REFERENCES students(id) ON DELETE CASCADE,
    statement TEXT,
    receipt_url TEXT,
    created_at timestamp with time zone DEFAULT now()
);
