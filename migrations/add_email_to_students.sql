-- Add email column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS email VARCHAR(255);