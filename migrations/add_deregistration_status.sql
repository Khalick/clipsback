-- Add deregistration status columns to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS deregistered boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS deregistration_date date,
ADD COLUMN IF NOT EXISTS deregistration_reason text;