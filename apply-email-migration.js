import { pool } from './db.js';
import fs from 'fs';
import path from 'path';

async function applyMigration() {
  try {
    console.log('Adding email field to students table...');
    
    const migrationFile = path.join(process.cwd(), 'migrations', 'add_email_to_students.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    await pool.query(sql);
    
    console.log('Email field added successfully!');
    
    // Verify the changes
    const { rows } = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'students' AND column_name = 'email'
    `);
    
    if (rows.length > 0) {
      console.log('Email column details:', rows[0]);
    } else {
      console.log('Warning: Email column was not found after migration');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error applying migration:', error);
    process.exit(1);
  }
}

applyMigration();