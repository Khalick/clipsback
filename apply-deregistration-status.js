import { sql } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

async function applyMigration() {
  try {
    console.log('Adding deregistration status columns...');
    
    await sql`
      ALTER TABLE public.students 
      ADD COLUMN IF NOT EXISTS deregistered boolean DEFAULT false,
      ADD COLUMN IF NOT EXISTS deregistration_date date,
      ADD COLUMN IF NOT EXISTS deregistration_reason text;
    `;
    
    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();