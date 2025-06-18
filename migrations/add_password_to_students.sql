-- Add new columns to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS national_id character varying,
ADD COLUMN IF NOT EXISTS birth_certificate character varying,
ADD COLUMN IF NOT EXISTS date_of_birth date,
ADD COLUMN IF NOT EXISTS password text;

-- Update password based on age (using date_of_birth)
-- For students 18 and older, use national_id as password
-- For students under 18, use birth_certificate as password
UPDATE public.students
SET password = 
  CASE 
    WHEN date_of_birth IS NOT NULL AND 
         (EXTRACT(YEAR FROM AGE(CURRENT_DATE, date_of_birth)) >= 18) 
    THEN national_id
    ELSE birth_certificate
  END
WHERE (national_id IS NOT NULL OR birth_certificate IS NOT NULL) AND password IS NULL;

-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS set_student_password_trigger ON public.students;
DROP FUNCTION IF EXISTS set_default_student_password();

-- Create a trigger to set default password for new students
CREATE OR REPLACE FUNCTION set_default_student_password()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.password IS NULL THEN
    IF NEW.date_of_birth IS NOT NULL AND 
       (EXTRACT(YEAR FROM AGE(CURRENT_DATE, NEW.date_of_birth)) >= 18) AND
       NEW.national_id IS NOT NULL THEN
      NEW.password := NEW.national_id;
    ELSIF NEW.birth_certificate IS NOT NULL THEN
      NEW.password := NEW.birth_certificate;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_student_password_trigger
BEFORE INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION set_default_student_password();