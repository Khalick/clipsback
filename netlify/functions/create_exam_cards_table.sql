-- SQL for exam_cards table
CREATE TABLE IF NOT EXISTS exam_cards (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid REFERENCES students(id) ON DELETE CASCADE,
    file_url text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);
