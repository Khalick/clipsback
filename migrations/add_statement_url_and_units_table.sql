-- Add statement_url column to finance table if it doesn't exist
ALTER TABLE public.finance 
ADD COLUMN IF NOT EXISTS statement_url text;

-- Create units table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  unit_name character varying NOT NULL,
  unit_code character varying NOT NULL UNIQUE,
  CONSTRAINT units_pkey PRIMARY KEY (id)
);