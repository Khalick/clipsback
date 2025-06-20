-- Update existing students' passwords to match their national ID or birth certificate
UPDATE public.students
SET password = 
  CASE 
    WHEN national_id IS NOT NULL THEN national_id
    WHEN birth_certificate IS NOT NULL THEN birth_certificate
    ELSE password -- Keep existing password if neither is available
  END
WHERE (national_id IS NOT NULL OR birth_certificate IS NOT NULL);

-- Also update the trigger for future inserts and updates
DROP TRIGGER IF EXISTS update_student_password_trigger ON public.students;

-- Create a trigger to update password when national_id or birth_certificate changes
CREATE FUNCTION update_student_password()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.national_id IS NOT NULL AND 
      (OLD.national_id IS NULL OR NEW.national_id != OLD.national_id)) THEN
    NEW.password := NEW.national_id;
  ELSIF (NEW.birth_certificate IS NOT NULL AND 
         (OLD.birth_certificate IS NULL OR NEW.birth_certificate != OLD.birth_certificate)) THEN
    NEW.password := NEW.birth_certificate;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_student_password_trigger
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION update_student_password();