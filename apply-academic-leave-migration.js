import { sql } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function applyMigration() {
  try {
    console.log('Adding academic leave columns and registration number index...');
    
    // Add academic leave columns
    await sql`
      ALTER TABLE public.students 
      ADD COLUMN IF NOT EXISTS academic_leave boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS academic_leave_start date,
      ADD COLUMN IF NOT EXISTS academic_leave_end date;
    `;
    
    // Create index on registration_number
    await sql`
      CREATE INDEX IF NOT EXISTS idx_students_registration_number 
      ON public.students(registration_number);
    `;
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();