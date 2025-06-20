import { pool } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkColumns() {
  try {
    console.log('Checking if academic leave columns exist...');
    
    const { rows } = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'students' 
      AND column_name IN ('academic_leave', 'academic_leave_start', 'academic_leave_end')
    `);
    
    if (rows.length === 3) {
      console.log('All academic leave columns exist!');
    } else {
      console.log('Missing columns:', rows.map(r => r.column_name));
      console.log('Running migration to add missing columns...');
      
      await pool.query(`
        ALTER TABLE public.students 
        ADD COLUMN IF NOT EXISTS academic_leave boolean DEFAULT false,
        ADD COLUMN IF NOT EXISTS academic_leave_start date,
        ADD COLUMN IF NOT EXISTS academic_leave_end date;
        
        CREATE INDEX IF NOT EXISTS idx_students_registration_number 
        ON public.students(registration_number);
      `);
      
      console.log('Migration completed successfully!');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking columns:', error);
    process.exit(1);
  }
}

checkColumns();