import { sql } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function applyMigration() {
  try {
    console.log('Adding academic leave reason column...');
    
    // Add academic leave reason column
    await sql`
      ALTER TABLE public.students 
      ADD COLUMN IF NOT EXISTS academic_leave_reason text;
    `;
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();