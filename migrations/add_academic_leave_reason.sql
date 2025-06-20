-- Add academic_leave_reason column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS academic_leave_reason text;