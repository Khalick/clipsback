-- Drop existing function and trigger if they exist
DROP TRIGGER IF EXISTS set_student_password_trigger ON public.students;
DROP FUNCTION IF EXISTS set_default_student_password();

-- Create a trigger to set default password for new students
CREATE FUNCTION set_default_student_password()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.password IS NULL THEN
    IF NEW.national_id IS NOT NULL THEN
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