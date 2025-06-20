-- Add status column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';

-- Update existing students based on their current state
UPDATE public.students SET status = 'deregistered' WHERE deregistered = true;
UPDATE public.students SET status = 'on_leave' WHERE academic_leave = true;