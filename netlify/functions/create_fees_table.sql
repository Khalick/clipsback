-- SQL for fees table
CREATE TABLE IF NOT EXISTS fees (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id uuid REFERENCES students(id) ON DELETE CASCADE,
    fee_balance NUMERIC NOT NULL,
    total_paid NUMERIC NOT NULL,
    semester_fee NUMERIC NOT NULL
);
