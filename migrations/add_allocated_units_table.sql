-- Migration: Add allocated_units table for admin unit allocation
-- This table stores units that admins have allocated to specific students
-- Students can then register these allocated units in their portal

CREATE TABLE public.allocated_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  unit_id integer NOT NULL,
  allocated_by uuid, -- admin who allocated the unit
  semester integer NOT NULL DEFAULT 1 CHECK (semester = ANY (ARRAY[1, 2])),
  academic_year character varying NOT NULL DEFAULT '2024/2025',
  status character varying NOT NULL DEFAULT 'allocated' CHECK (status = ANY (ARRAY['allocated', 'registered', 'cancelled'])),
  allocated_at timestamp with time zone DEFAULT now(),
  notes text,
  CONSTRAINT allocated_units_pkey PRIMARY KEY (id),
  CONSTRAINT allocated_units_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE,
  CONSTRAINT allocated_units_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE,
  CONSTRAINT allocated_units_allocated_by_fkey FOREIGN KEY (allocated_by) REFERENCES public.admins(id),
  CONSTRAINT unique_student_unit_semester UNIQUE (student_id, unit_id, semester, academic_year)
);

-- Create indexes for better performance
CREATE INDEX idx_allocated_units_student_id ON public.allocated_units(student_id);
CREATE INDEX idx_allocated_units_unit_id ON public.allocated_units(unit_id);
CREATE INDEX idx_allocated_units_semester ON public.allocated_units(semester);
CREATE INDEX idx_allocated_units_status ON public.allocated_units(status);
CREATE INDEX idx_allocated_units_academic_year ON public.allocated_units(academic_year);

-- Add unit_name and unit_code columns to units table if they don't exist
-- (checking the schema, they should already exist)

COMMENT ON TABLE public.allocated_units IS 'Units allocated by admins to students for registration';
COMMENT ON COLUMN public.allocated_units.status IS 'allocated: available for registration, registered: student has registered, cancelled: allocation cancelled';
