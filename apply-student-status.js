import { sql } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function applyMigration() {
  try {
    console.log('Adding student status column...');
    
    await sql`
      ALTER TABLE public.students 
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active';
    `;
    
    console.log('Updating existing students based on their current state...');
    
    await sql`
      UPDATE public.students SET status = 'deregistered' WHERE deregistered = true;
    `;
    
    await sql`
      UPDATE public.students SET status = 'on_leave' WHERE academic_leave = true;
    `;
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();