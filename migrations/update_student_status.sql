-- Add status column if it doesn't exist
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Update existing students based on their current state
UPDATE public.students SET status = 'deregistered' WHERE deregistered = true;
UPDATE public.students SET status = 'on_leave' WHERE academic_leave = true;

-- Create index on status for faster queries
CREATE INDEX IF NOT EXISTS idx_students_status ON public.students(status);

-- Add comment to explain status values
COMMENT ON COLUMN public.students.status IS 'Student status: active, deregistered, on_leave';