import { sql } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function updateStudentPasswords() {
  try {
    console.log('Updating student passwords...');
    
    // Update existing students' passwords to match their national ID or birth certificate
    await sql`
      UPDATE students
      SET password = 
        CASE 
          WHEN national_id IS NOT NULL THEN national_id
          WHEN birth_certificate IS NOT NULL THEN birth_certificate
          ELSE password -- Keep existing password if neither is available
        END
      WHERE (national_id IS NOT NULL OR birth_certificate IS NOT NULL);
    `;
    
    console.log('Student passwords updated successfully!');
    
    // Drop existing functions and triggers
    await sql`DROP FUNCTION IF EXISTS set_default_student_password() CASCADE;`;
    await sql`DROP FUNCTION IF EXISTS update_student_password() CASCADE;`;
    
    // Create the default password function
    await sql`
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
    `;
    
    // Create the insert trigger
    await sql`
      CREATE TRIGGER set_student_password_trigger
      BEFORE INSERT ON students
      FOR EACH ROW
      EXECUTE FUNCTION set_default_student_password();
    `;
    
    // Create the update password function
    await sql`
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
    `;
    
    // Create the update trigger
    await sql`
      CREATE TRIGGER update_student_password_trigger
      BEFORE UPDATE ON students
      FOR EACH ROW
      EXECUTE FUNCTION update_student_password();
    `;
    
    console.log('Database triggers created successfully!');
  } catch (error) {
    console.error('Error updating student passwords:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Run the update
updateStudentPasswords();