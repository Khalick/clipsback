-- Add academic_leave column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS academic_leave boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS academic_leave_start date,
ADD COLUMN IF NOT EXISTS academic_leave_end date;

-- Create index on registration_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_students_registration_number ON public.students(registration_number);