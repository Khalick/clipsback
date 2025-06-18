import { pool } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  try {
    // Run the first migration to add columns
    console.log('Running migration: add_password_to_students.sql');
    const sql1 = fs.readFileSync(path.join(__dirname, 'migrations', 'add_password_to_students.sql'), 'utf8');
    await pool.query(sql1);
    console.log('Added columns and updated data');
    
    // Run the second migration to create trigger
    console.log('Running migration: create_password_trigger.sql');
    const sql2 = fs.readFileSync(path.join(__dirname, 'migrations', 'create_password_trigger.sql'), 'utf8');
    await pool.query(sql2);
    console.log('Created trigger function');
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
}

runMigration();